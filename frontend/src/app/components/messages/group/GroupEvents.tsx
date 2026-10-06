'use client';

import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import { type GroupMember, errorMessage, request } from '../../../api/social';
import { usePagedList } from '../../../lib/usePagedList';
import { useResource } from '../../../lib/useResource';
import { useLiveRefresh } from '../../../lib/useLiveRefresh';
import Avatar from '../../Avatar';
import Button from '../../ui/Button';
import Menu, { MenuItem } from '../../ui/Menu';
import { GroupEventsSkeleton } from '../../Skeletons';
import LoadMore from '../../LoadMore';
import { GROUP_PAGE_SIZE, itemName, rsvpTally, type GroupItem } from './groupContent';
import { eventDay, eventMonth, eventWhen, groupExactTime } from './groupTime';
import GroupRsvp from './GroupRsvp';

/** A past event's answer, in words, in place of the two buttons it can no longer offer. */
function responseLabel(status: string): string {
  if (status === 'going') return 'You went';
  if (status === 'not_going') return "You didn't go";
  return 'No response';
}

/** The instant an event starts, or `0` for a row whose date cannot be read. */
function startOf(item: GroupItem): number {
  const time = new Date(item.startsAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** One event: a date tile, the details, and the going/not-going choice. */
function GroupEventCard({ item, meId, isOwner, busy, avatarOf, onEdit, onDelete, onRsvp }: {
  item: GroupItem;
  meId: string;
  isOwner: boolean;
  busy: boolean;
  avatarOf: (userId: string) => string;
  onEdit: (item: GroupItem) => void;
  onDelete: (item: GroupItem) => void;
  onRsvp: (item: GroupItem, status: string) => void;
}) {
  const past = !item.upcoming;
  // The payload carries the tallies but not the attendee rows, so the stack shows the one
  // attendee the client can be sure of — the viewer, when their own answer is "going" — rather
  // than inventing faces the server never sent.
  const attendees = item.rsvp === 'going' ? [meId] : [];
  return <article className="grp-event" data-past={past}>
    <div className="grp-event-body">
      <div className="grp-event-tile" aria-hidden="true">
        <span className="grp-event-month">{eventMonth(item.startsAt)}</span>
        <span className="grp-event-day">{eventDay(item.startsAt)}</span>
      </div>
      <div className="grp-event-main">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="grp-event-title truncate" dir="auto" title={item.title}>{item.title}</h3>
            <time className="grp-event-when" dateTime={item.startsAt} title={groupExactTime(item.startsAt)}>{eventWhen(item.startsAt)}</time>
          </div>
          {(item.userId === meId || isOwner) && <Menu label="Event actions">
            {item.userId === meId && <MenuItem onClick={() => onEdit(item)}>Edit</MenuItem>}
            <MenuItem tone="danger" onClick={() => onDelete(item)}>Delete</MenuItem>
          </Menu>}
        </div>
        {!!item.content && <p className="grp-event-text" dir="auto">{item.content}</p>}
        <p className="grp-event-by">Created by {item.userId === meId ? 'you' : itemName(item)}</p>
      </div>
    </div>
    <div className="grp-event-foot">
      <span className="grp-event-count">
        {attendees.length > 0 && <span className="grp-avatars" aria-hidden="true">
          {attendees.slice(0, 3).map(userId => <Avatar key={userId} name="You" avatarUrl={avatarOf(userId)} size={20} />)}
        </span>}
        <span>{rsvpTally(item)}</span>
      </span>
      {/* An upcoming event asks; a past one only reports, in a muted line rather than two
          controls that are greyed out to the point of being invisible. */}
      {past
        ? <span className="grp-event-response">{responseLabel(item.rsvp)}</span>
        : <GroupRsvp item={item} busy={busy} onRsvp={onRsvp} />}
    </div>
  </article>;
}


/**
 * The Events tab.
 *
 * The server decides which events are still to come, so the split into the two sections follows
 * its own flag rather than the reader's clock; the order inside each is fixed here — soonest
 * first for the ones ahead, latest first for the ones behind. An answer is written optimistically
 * and rolled back if the request fails, and both buttons are disabled while it is in flight.
 */
export default function GroupEvents({ groupId, meId, isOwner, onCreate, onEdit }: {
  groupId: string;
  meId: string;
  isOwner: boolean;
  onCreate: () => void;
  onEdit: (item: GroupItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const resource = usePagedList<GroupItem, GroupItem[]>({
    key: `/groups/${groupId}/content/events?parentId=0`,
    pageQuery: page => `&offset=${(page - 1) * GROUP_PAGE_SIZE}`,
    pageSize: GROUP_PAGE_SIZE,
    normalize: raw => ({ items: raw }),
    keyOf: item => item.id,
  });
  // The attendee stack is drawn from the roster, so the members are read alongside the events.
  const members = useResource<GroupMember[]>(`/groups/${groupId}/members`);
  const roster = useMemo(() => new Map((members.data ?? []).map(member => [member.userId, member.avatar])), [members.data]);
  useLiveRefresh(resource.refresh, groupId);
  useLiveRefresh(members.reload, groupId);

  // The answer is optimistic: the tally and the pressed state move at once, and both come back
  // if the write fails. The list is refreshed behind them so the counts stay the server's.
  async function answer(item: GroupItem, status: string) {
    if (busy) return;
    const previous = { rsvp: item.rsvp, going: item.going, notGoing: item.notGoing };
    const patch = (entry: GroupItem): GroupItem => entry.id !== item.id ? entry : {
      ...entry,
      rsvp: status,
      going: entry.going + (status === 'going' ? 1 : 0) - (previous.rsvp === 'going' ? 1 : 0),
      notGoing: entry.notGoing + (status === 'not_going' ? 1 : 0) - (previous.rsvp === 'not_going' ? 1 : 0),
    };
    setBusy(true);
    resource.update(items => items.map(patch));
    try {
      await request(`/groups/${groupId}/events/${item.id}/rsvp`, 'PUT', { status });
      resource.refresh();
    } catch (error) {
      resource.update(items => items.map(entry => entry.id === item.id ? { ...entry, ...previous } : entry));
      toast.error(errorMessage(error));
    } finally { setBusy(false); }
  }

  async function remove(item: GroupItem) {
    if (busy) return;
    const previous = resource.items;
    setBusy(true);
    resource.update(items => items.filter(entry => entry.id !== item.id));
    try {
      await request(`/groups/${groupId}/content/events/${item.id}?parentId=0`, 'DELETE');
      toast.success('Event deleted');
    } catch (error) {
      resource.update(() => previous);
      toast.error(errorMessage(error));
    } finally { setBusy(false); }
  }

  const sections = [
    { heading: 'Upcoming', rows: resource.items.filter(item => item.upcoming).sort((a, b) => startOf(a) - startOf(b)) },
    { heading: 'Past', rows: resource.items.filter(item => !item.upcoming).sort((a, b) => startOf(b) - startOf(a)) },
  ];
  return <div className="grp-body">
    <div className="grp-column">
      {resource.loading && <GroupEventsSkeleton />}
      {!!resource.error && <div className="grp-error" role="alert">
        <span>{resource.error}</span>
        <Button variant="secondary" onClick={resource.reload}>Retry</Button>
      </div>}
      {resource.settled && !resource.error && resource.items.length === 0 && <div className="grp-empty">
        <CalendarDays aria-hidden="true" />
        <p className="grp-empty-title">No events yet</p>
        <p className="grp-empty-text">Create an event to make plans together.</p>
        <Button onClick={onCreate}>New event</Button>
      </div>}
      {sections.map(section => section.rows.length > 0 && <section key={section.heading} className="grp-section">
        <h4 className="grp-section-title">{section.heading}</h4>
        <div className="mt-3">
          {section.rows.map(item => <GroupEventCard
            key={item.id}
            item={item}
            meId={meId}
            isOwner={isOwner}
            busy={busy}
            avatarOf={userId => roster.get(userId) ?? ''}
            onEdit={onEdit}
            onDelete={entry => void remove(entry)}
            onRsvp={(entry, status) => void answer(entry, status)}
          />)}
        </div>
      </section>)}
      <LoadMore loading={resource.loadingMore} hasMore={resource.hasMore} onLoadMore={resource.loadMore} endLabel={null} />
    </div>
  </div>;
}
