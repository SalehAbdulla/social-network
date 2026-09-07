'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { type Story, errorMessage, request, upload } from '../api/social';
import { useResource } from '../lib/useResource';
import { useBackend } from './BackendProvider';
import RequestState from './RequestState';

function CreateStory({ close, saved }: { close: () => void; saved: () => void }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState('#4f46e5');
  const [media, setMedia] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (media) URL.revokeObjectURL(media.preview); }, [media]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const attachment = media ? await upload(media.file) : null;
      await request('/stories', 'POST', { content: text, backgroundColor: color, mediaUrl: attachment?.url || '', mediaType: attachment?.mediaType || 'text' });
      saved(); close(); toast.success('Story shared for 24 hours');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Create story"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5"><div className="flex justify-between"><h2 className="text-xl font-bold">Create story</h2><button type="button" onClick={close} aria-label="Close story composer">Close</button></div>
    <div className="flex h-72 items-center justify-center overflow-hidden rounded-lg p-3" style={{ backgroundColor: color }}>{media ? media.file.type.startsWith('video/') ? <video src={media.preview} controls className="max-h-full" /> : <img src={media.preview} alt="Story preview" className="max-h-full object-contain" /> : <textarea required={!media} maxLength={1000} value={text} onChange={event => setText(event.target.value)} placeholder="Share a moment?" className="h-full w-full resize-none bg-transparent p-3 text-xl text-white placeholder:text-white/70 outline-none" />}</div>
    <label className="flex items-center gap-3 text-sm">Background<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
    <label className="block text-sm">Photo or video<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" onChange={event => { const file = event.target.files?.[0]; setMedia(file ? { file, preview: URL.createObjectURL(file) } : null); }} className="mt-2 block w-full" /></label>
    {media && <button type="button" onClick={() => setMedia(null)} className="text-sm text-blue-600">Use text instead</button>}
    <button disabled={busy} className="w-full rounded-lg bg-blue-600 py-3 text-white disabled:opacity-50">{busy ? 'Sharing?' : 'Share story'}</button>
  </form></div>;
}
export default function StoriesBar() {
  const { user } = useBackend();
  const [offset, setOffset] = useState(0);
  const stories = useResource<Story[]>(`/stories?offset=${offset}`);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Story | null>(null);
  const [deleting, setDeleting] = useState(false);
  const reload = stories.reload;
  useEffect(() => { const timer = setInterval(reload, 60000); return () => clearInterval(timer); }, [reload]);
  return <section className="space-y-3"><div className="flex gap-3 overflow-x-auto pb-2"><button onClick={() => setCreating(true)} className="flex h-36 w-28 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 text-sm text-blue-700"><span className="text-3xl">+</span>Create story</button>{stories.data?.map(story => <button key={story.storyId} onClick={() => setViewing(story)} className="relative h-36 w-28 shrink-0 overflow-hidden rounded-xl text-white" style={{ backgroundColor: story.backgroundColor }}>
    {story.mediaType === 'image' && <img src={story.mediaUrl} alt="Story preview" className="h-full w-full object-cover" />}{story.mediaType === 'video' && <span className="text-3xl">?</span>}{story.mediaType === 'text' && <p className="line-clamp-4 p-3 text-sm">{story.content}</p>}<span className="absolute inset-x-0 bottom-0 truncate bg-black/40 p-2 text-xs">@{story.nickname}</span>
  </button>)}</div>{stories.error && <RequestState error={stories.error} retry={reload} />}{(offset > 0 || stories.data?.length === 30) && <div className="flex justify-between text-sm"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}>Previous stories</button><button disabled={stories.data?.length !== 30} onClick={() => setOffset(offset + 30)}>More stories</button></div>}
    {creating && <CreateStory close={() => setCreating(false)} saved={reload} />}
    {viewing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Story"><div className="w-full max-w-md space-y-3"><div className="flex justify-between text-white"><span>@{viewing.nickname}</span><button onClick={() => setViewing(null)}>Close</button></div><div className="flex h-[65vh] items-center justify-center overflow-hidden rounded-xl" style={{ backgroundColor: viewing.backgroundColor }}>{viewing.mediaType === 'image' ? <img src={viewing.mediaUrl} alt="Story" className="h-full w-full object-contain" /> : viewing.mediaType === 'video' ? <video src={viewing.mediaUrl} controls autoPlay playsInline className="h-full w-full" /> : <p className="whitespace-pre-wrap break-words p-8 text-center text-2xl text-white">{viewing.content}</p>}</div>{viewing.userId === user.userId && <button disabled={deleting} className="text-white" onClick={async () => { setDeleting(true); try { await request(`/stories/${viewing.storyId}`, 'DELETE'); setViewing(null); reload(); } catch (error) { toast.error(errorMessage(error)); } finally { setDeleting(false); } }}>Delete story</button>}</div></div>}
  </section>;
}
