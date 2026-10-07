'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Info, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { type Group, type GroupInvitation, errorMessage, request } from '../api/social';
import { useBackend } from './BackendProvider';
import { useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { useCreatePost } from '../lib/useCreatePost';
import Avatar from './Avatar';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import Tabs from './ui/Tabs';
import GroupJoinButton from './GroupJoinButton';
import GroupChat from './messages/group/GroupChat';
import GroupPosts from './messages/group/GroupPosts';
import GroupEvents from './messages/group/GroupEvents';
import GroupMedia from './messages/group/GroupMedia';
import GroupDetails from './messages/group/GroupDetails';
import GroupContentSheet from './messages/group/GroupContentSheet';
import { memberCount, type GroupItem } from './messages/group/groupContent';

/**
 * The group's four folders. Each carries the one action that belongs to it: the Chat
 * folder has none, because there is nothing to create in a conversation.
 */
const TABS = [
  { value: 'timeline', label: 'Chat', action: null },
  { value: 'posts', label: 'Posts', action: 'New post' },
  { value: 'events', label: 'Events', action: 'New event' },
  { value: 'media', label: 'Media', action: 'Add photo' },
] as const;
type TabValue = typeof TABS[number]['value'];
const TAB_VALUES: string[] = TABS.map(entry => entry.value);

/** The first paint of the whole shell: header, tab row and body, in the real geometry. */
function ShellSkeleton() {
  return <section className="dm-panel" aria-busy="true" aria-label="Loading group">
    <div className="dm-header">
      <span className="grp-skeleton size-11 shrink-0" style={{ borderRadius: '9999px' }} />
      <span className="min-w-0 flex-1 space-y-2">
        <span className="grp-skeleton grp-skel-line block w-40" />
        <span className="grp-skeleton grp-skel-line block w-24" />
      </span>
    </div>
    <div className="grp-tabbar"><span className="grp-skeleton grp-skel-line block w-56" /></div>
    <div className="grp-body">
      <div className="grp-column">
        <div className="flex flex-col gap-3 py-3">
          <span className="grp-skeleton block h-16 w-full" />
          <span className="grp-skeleton block h-40 w-full" />
        </div>
      </div>
    </div>
  </section>;
}

/**
 * A group conversation.
 *
 * It uses the direct-message shell: the chat panel is the thread, the composer and the
 * details column, the header is the same 68px header, and only the content under the tab
 * bar scrolls. The tab bar is left-aligned and content-width with one ghost action on the
 * right; on a phone that action becomes a floating button. `?tab=info`, which a join
 * request's notification links to, opens the details panel instead of a tab.
 */
export default function GroupConversation({ groupId }: { groupId: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useBackend();
  const requested = searchParams.get('tab') ?? 'timeline';
  // A share link names one post: `/messages/groups/{id}?tab=posts&post={id}`. The id is read
  // once here and handed to the Posts tab, which scrolls to the card and flashes it; the flash
  // is cleared a moment later, so the card settles back rather than staying lit.
  const sharedPost = Number.parseInt(searchParams.get('post') ?? '', 10);
  const sharedPostId = Number.isFinite(sharedPost) && sharedPost > 0 ? sharedPost : null;
  const [tab, setTab] = useState<TabValue>(() => {
    if (requested === 'info') return 'timeline';
    // A link that names a post is a link to the Posts tab, whichever tab the URL happens to
    // name — that is what makes the deep link work even when it is copied without `tab`.
    if (sharedPostId) return 'posts';
    return TAB_VALUES.includes(requested) ? requested as TabValue : 'timeline';
  });
  const [details, setDetails] = useState(requested === 'info');
  const [lastRequested, setLastRequested] = useState(requested);
  // The flash is a moment, not a state: the id stays live until its own timer has run, and
  // that timer is what turns it off. Deriving it this way means a second share link arriving
  // while the view is mounted re-arms the flash without a state write during render.
  const [flashedId, setFlashedId] = useState<number | null>(null);
  const flashId = sharedPostId !== null && sharedPostId !== flashedId ? sharedPostId : null;
  const [creating, setCreating] = useState<'posts' | 'events' | null>(null);
  const [editing, setEditing] = useState<GroupItem | null>(null);
  const [deciding, setDeciding] = useState(false);
  useEffect(() => {
    if (sharedPostId === null) return;
    const timer = setTimeout(() => setFlashedId(sharedPostId), 1800);
    return () => clearTimeout(timer);
  }, [sharedPostId]);
  // Each tab remembers where it was scrolled to, so switching away and back does not throw
  // the reader to the top. The scroll container is the tab's own `.grp-body` (or the chat's
  // thread), found through the panel the tab renders into.
  const panels = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollPositions = useRef<Record<string, number>>({});
  function scrollerOf(value: string) {
    const panel = panels.current[value];
    return panel?.querySelector<HTMLElement>('.grp-body, .dm-thread') ?? null;
  }
  function selectTab(next: TabValue) {
    if (next === tab) return;
    const current = scrollerOf(tab);
    if (current) scrollPositions.current[tab] = current.scrollTop;
    setTab(next);
    // The tab is in the URL, so a refresh and the browser's back/forward buttons land where
    // the reader left off rather than resetting to the chat.
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const group = useResource<Group>(`/groups/${groupId}`);
  // An invitee who opens the group straight from a notification never sees the invitation
  // card in the sidebar, so the gate has to know about it too.
  const invitations = useResource<GroupInvitation[]>('/groups/invitations');
  useLiveRefresh(group.reload, groupId);
  useLiveRefresh(invitations.reload);
  // The group's own Create-post entry — the top bar's action and the Posts/Media empty states. It
  // is the same dialog as the feed's, told it is writing a group post, so it names the group where
  // the audience picker would be, and refetches the Posts tab once one is shared.
  const createPost = useCreatePost({
    context: 'group',
    groupId,
    groupName: group.data?.title ?? '',
    groupAvatar: group.data?.imageUrl ?? '',
    onShared: () => group.reload(),
  });
  // A notification that points at a tab is the entry point; a second one arriving while
  // this view is still mounted resets which surface is open, which React documents as the
  // way to adjust state when an input changes.
  if (requested !== lastRequested) {
    setLastRequested(requested);
    if (requested === 'info') setDetails(true);
    else if (TAB_VALUES.includes(requested)) setTab(requested as TabValue);
  }
  // Restore the tab's place once it has rendered.
  useEffect(() => {
    const element = scrollerOf(tab);
    if (element) element.scrollTop = scrollPositions.current[tab] ?? 0;
  }, [tab]);
  if (group.loading) return <ShellSkeleton />;
  if (!group.data) {
    if (group.error) return <section className="dm-panel"><div className="grp-gate">
      <p className="grp-gate-title">This group could not be loaded</p>
      <p className="grp-gate-desc">{group.error}</p>
      <Button onClick={group.reload} className="grp-gate-action">Retry</Button>
    </div></section>;
    return <section className="dm-panel"><div className="grp-gate">
      <p className="grp-gate-title">This group is unavailable</p>
      <p className="grp-gate-desc">It may have been deleted, or you may no longer be a member.</p>
      <Link href="/messages/groups" className="dm-secondary grp-gate-action">Back to groups</Link>
    </div></section>;
  }
  const data = group.data;
  const invitation = invitations.data?.find(entry => String(entry.groupId) === groupId) ?? null;
  const active = TABS.find(entry => entry.value === tab) ?? TABS[0];
  // Posts and Media open the shared Create-post dialog; an Event is its own sheet.
  function startCreate() {
    if (active.value === 'events') setCreating('events');
    else createPost.open();
  }
  async function answerInvitation(status: 'accepted' | 'declined') {
    if (!invitation || deciding) return;
    setDeciding(true);
    try {
      await request(`/groups/${invitation.groupId}/invitations/${invitation.invitationId}`, 'PUT', { status });
      invitations.reload();
      group.reload();
      window.dispatchEvent(new Event('social:notifications'));
      toast.success(status === 'accepted' ? `You joined ${invitation.groupTitle}` : 'Invitation declined');
    } catch (error) { toast.error(errorMessage(error)); } finally { setDeciding(false); }
  }
  async function remove(item: GroupItem) {
    try {
      await request(`/groups/${groupId}/content/${item.kind}/${item.id}?parentId=${item.parentId}`, 'DELETE');
      setEditing(null);
    } catch (error) { toast.error(errorMessage(error)); }
  }

  return <>
    <section className="dm-panel" aria-label={`Group conversation: ${data.title}`}>
      <header className="dm-header" data-connected="true">
        <Link href="/messages/groups" aria-label="Back to groups" className="dm-icon dm-back"><ChevronLeft aria-hidden="true" /></Link>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setDetails(true)}>
          <Avatar name={data.title} avatarUrl={data.imageUrl} size={44} />
          <span className="min-w-0">
            <span className="dm-header-name truncate" dir="auto">{data.title}</span>
            <span className="dm-header-sub truncate">{data.isMember ? memberCount(data.memberCount) : invitation ? `${memberCount(data.memberCount)} · Invited you to join` : data.joinRequested ? 'Request pending' : `${memberCount(data.memberCount)} · Request to join`}</span>
          </span>
        </button>
        <IconButton label="Group details" aria-expanded={details} aria-controls="group-details" onClick={() => setDetails(value => !value)}><Info aria-hidden="true" /></IconButton>
      </header>
      {data.isMember ? <>
        <div className="grp-tabbar">
          <Tabs
            label="Group conversation tabs"
            value={tab}
            onChange={value => selectTab(value as TabValue)}
            tabs={TABS.map(entry => ({ value: entry.value, label: entry.label }))}
          />
          {active.action && <div className="grp-tabbar-action">
            <button type="button" className="grp-action" onClick={startCreate}>
              <Plus aria-hidden="true" />{active.action}
            </button>
          </div>}
        </div>
        {/* `display: contents` keeps the shell's one flex column while still giving each tab a
            panel a screen reader can point at from its `aria-controls`. */}
        {tab === 'timeline' && <div id="panel-timeline" role="tabpanel" aria-labelledby="tab-timeline" className="contents" ref={element => { panels.current.timeline = element; }}>
          <GroupChat groupId={groupId} meId={user.userId} isOwner={data.isOwner} onOpenEvents={() => selectTab('events')} onEdit={setEditing} onDelete={item => void remove(item)} />
        </div>}
        {tab === 'posts' && <div id="panel-posts" role="tabpanel" aria-labelledby="tab-posts" className="contents" ref={element => { panels.current.posts = element; }}>
          <GroupPosts groupId={groupId} meId={user.userId} isOwner={data.isOwner} highlightId={flashId} onCreate={createPost.open} onEdit={setEditing} />
        </div>}
        {tab === 'events' && <div id="panel-events" role="tabpanel" aria-labelledby="tab-events" className="contents" ref={element => { panels.current.events = element; }}>
          <GroupEvents groupId={groupId} meId={user.userId} isOwner={data.isOwner} onCreate={() => setCreating('events')} onEdit={setEditing} />
        </div>}
        {tab === 'media' && <div id="panel-media" role="tabpanel" aria-labelledby="tab-media" className="contents" ref={element => { panels.current.media = element; }}>
          <GroupMedia groupId={groupId} meId={user.userId} isOwner={data.isOwner} onCreate={createPost.open} />
        </div>}
        {active.action && <button type="button" aria-label={active.action} className="grp-fab" onClick={startCreate}><Plus aria-hidden="true" /></button>}
      </> : <div className="grp-gate">
        <Avatar name={data.title} avatarUrl={data.imageUrl} size={96} />
        <h3 className="grp-gate-title" dir="auto">Join {data.title}</h3>
        <p className="grp-gate-meta">{memberCount(data.memberCount)}</p>
        {!!data.description && <p className="grp-gate-desc" dir="auto">{data.description}</p>}
        {invitation ? <div className="grp-gate-actions">
          <Button loading={deciding} className="grp-gate-action" onClick={() => void answerInvitation('accepted')}>Accept invitation</Button>
          <Button variant="secondary" disabled={deciding} className="grp-gate-action" onClick={() => void answerInvitation('declined')}>Decline</Button>
        </div> : <GroupJoinButton group={data} onRequested={() => { group.update(value => ({ ...value, joinRequested: true })); group.reload(); }} />}
        <p className="grp-gate-note">{invitation
          ? 'You were invited to this group. Accept and its conversations, posts, events and media open up.'
          : 'Conversations, posts, events and media stay private until an admin accepts your request.'}</p>
      </div>}
    </section>
    {details && <GroupDetails group={data} meId={user.userId} changed={group.reload} onClose={() => setDetails(false)} />}
    {(editing || creating === 'events') && <GroupContentSheet
      groupId={groupId}
      kind={editing ? (editing.kind === 'events' ? 'events' : 'posts') : 'events'}
      item={editing ?? undefined}
      onClose={() => { setCreating(null); setEditing(null); }}
      onSaved={() => { setCreating(null); setEditing(null); group.reload(); }}
    />}
    {createPost.modal}
  </>;
}
