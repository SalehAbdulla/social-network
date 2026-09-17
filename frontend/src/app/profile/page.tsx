'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { type Post, type SocialUser, type SocketEvent, dateLabel, displayName, errorMessage, request, upload } from '../api/social';
import { useBackend } from '../components/BackendProvider';
import { useResource } from '../lib/useResource';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import RequestState from '../components/RequestState';
import Loading from '../components/Loading';

export function EditProfile({ profile, close, saved }: { profile: SocialUser; close: () => void; saved: () => void }) {
  const { refreshUser } = useBackend();
  const [form, setForm] = useState(profile);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const updated = { ...form, avatar: avatar ? (await upload(avatar)).url : form.avatar, coverPhoto: cover ? (await upload(cover)).url : form.coverPhoto };
      await request('/users/me', 'PUT', updated); await refreshUser(); saved(); close(); toast.success('Profile saved');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Edit profile"><form onSubmit={save} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 space-y-4"><h2 className="text-xl font-bold">Edit profile</h2>
    {(['firstName', 'lastName', 'nickname', 'location'] as const).map(field => <label key={field} className="block text-sm font-medium">{{ firstName: 'First name', lastName: 'Last name', nickname: 'Username', location: 'Location' }[field]}<input required={field !== 'location'} minLength={field === 'nickname' ? 2 : 1} maxLength={field === 'location' ? 100 : field === 'nickname' ? 33 : 50} pattern={field === 'nickname' ? '[a-zA-Z0-9_]{2,33}' : undefined} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>)}
    <label className="block text-sm font-medium">Bio<textarea maxLength={1000} rows={3} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>
    <label className="block text-sm font-medium">Profile photo<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={event => setAvatar(event.target.files?.[0] || null)} className="mt-1 block w-full" /></label>
    <label className="block text-sm font-medium">Cover photo<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={event => setCover(event.target.files?.[0] || null)} className="mt-1 block w-full" /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={event => setForm({ ...form, isPublic: event.target.checked })} />Public profile</label>
    <div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={busy}>Cancel</button><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Saving?' : 'Save changes'}</button></div>
  </form></div>;
}
export default function Profile() {
  const { user, refreshUser } = useBackend();
  const params = useParams<{ profileId?: string }>();
  const id = params.profileId || user.userId;
  const profile = useResource<SocialUser>(`/users/${id}`);
  const [tab, setTab] = useState('posts');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState(false);
  const [followingBusy, setFollowingBusy] = useState(false);
  const own = id === user.userId;
  const following = user.following.includes(id);
  const visible = own || !!profile.data?.isPublic || following;
  const posts = useResource<Post[]>(`/users/${id}/posts?liked=${tab === 'likes'}&offset=${offset}`, !!profile.data && visible);
  const reloadProfile = profile.reload;
  const reloadPosts = posts.reload;
  useEffect(() => {
    const listener = (event: Event) => {
      if (['social_changed', 'connected'].includes((event as CustomEvent<SocketEvent>).detail.type)) {
        reloadProfile();
        reloadPosts();
      }
    };
    window.addEventListener('social:socket', listener);
    return () => window.removeEventListener('social:socket', listener);
  }, [reloadProfile, reloadPosts]);
  async function toggleFollow() {
    if (followingBusy) return;
    setFollowingBusy(true);
    try {
      await request(`/users/${id}/follow`, following ? 'DELETE' : 'PUT');
      await refreshUser();
      reloadProfile();
      reloadPosts();
    } catch (error) { toast.error(errorMessage(error)); } finally { setFollowingBusy(false); }
  }
  return <div className="mx-auto max-w-3xl p-6 space-y-6">{profile.loading && <Loading />}{profile.error && <RequestState error={profile.error} retry={profile.reload} />}{profile.data && <>
    <section className="overflow-hidden rounded-xl bg-white shadow-sm"><div className="h-44 bg-linear-to-r from-blue-200 to-teal-100">{profile.data.coverPhoto && <img src={profile.data.coverPhoto} alt="Cover photo" className="h-full w-full object-cover" />}</div><div className="p-6 space-y-4"><div className="flex items-center justify-between"><Avatar name={displayName(profile.data)} avatarUrl={profile.data.avatar} size={80} />{own ? <button onClick={() => setEditing(true)} className="rounded-lg border border-slate-200 px-4 py-2">Edit profile</button> : <div className="flex flex-wrap gap-2"><button type="button" disabled={followingBusy} onClick={() => void toggleFollow()} className="rounded-lg border border-blue-200 px-4 py-2 text-blue-700 disabled:opacity-50">{followingBusy ? 'Updating...' : following ? 'Unfollow' : 'Follow'}</button><Link href={`/messages/${id}`} className="rounded-lg bg-blue-600 px-4 py-2 text-white">Message</Link></div>}</div><div><h1 className="text-2xl font-bold">{displayName(profile.data)}</h1><p className="text-slate-500">@{profile.data.nickname}</p></div><p className="whitespace-pre-wrap wrap-break-word">{profile.data.bio}</p><p className="text-sm text-slate-400">{profile.data.location}{profile.data.location && ' ? '}Joined {dateLabel(profile.data.createdAt)}</p>{visible && <div aria-label="Profile statistics" className="flex flex-wrap gap-5 text-sm"><span><b>{(own ? user : profile.data).followers.length}</b> followers</span><span><b>{(own ? user : profile.data).following.length}</b> following</span></div>}</div></section>
    {!visible ? <RequestState empty="This profile is private. Follow this person to see their posts and activity." /> : <><div className="flex gap-2">{['posts', 'media', 'likes'].map(item => <button key={item} onClick={() => { setTab(item); setOffset(0); }} className={`rounded-lg px-5 py-2 capitalize ${tab === item ? 'bg-blue-600 text-white' : 'bg-white'}`}>{item}</button>)}</div>
    {posts.error && <RequestState error={posts.error} retry={posts.reload} />}{posts.loading && <Loading />}
    {tab === 'media' ? <div className="grid grid-cols-2 gap-3">{posts.data?.flatMap(post => (post.imageUrls || []).map(url => <Link key={url} href={`/post/${post.postId}`}><img src={url} alt={post.title} className="h-48 w-full rounded-lg object-cover" /></Link>))}</div> : posts.data?.map(post => <PostCard key={post.postId} post={post} fetchPosts={posts.reload} />)}
    {posts.data?.length === 0 && <RequestState empty={tab === 'likes' ? 'No liked posts yet.' : 'No posts yet.'} />}
    <div className="flex justify-between text-sm"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))} className="disabled:opacity-40">Previous</button><button disabled={!posts.data || posts.data.length < 20} onClick={() => setOffset(offset + 20)} className="disabled:opacity-40">Next</button></div></>}
    {editing && <EditProfile profile={profile.data} close={() => setEditing(false)} saved={profile.reload} />}
  </>}</div>;
}
