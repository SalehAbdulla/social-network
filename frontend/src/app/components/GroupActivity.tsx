'use client';
import { useEffect, useState } from 'react';
import { dateLabel, errorMessage, request, upload, type SocketEvent } from '../api/social';
import { useResource } from '../lib/useResource';
import RequestState from './RequestState';
import Loading from './Loading';

interface Content { id:number; nickname:string; title:string; content:string; mediaUrl:string; startsAt:string; createdAt:string; rsvp:string; going:number; notGoing:number }
const field='mt-1 block w-full rounded-lg border border-slate-300 p-2';
const button='rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-50';

function Composer({ path, kind, saved }: { path:string; kind:string; saved:()=>void }) {
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function submit(event:React.FormEvent<HTMLFormElement>) {
  event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setBusy(true);setError('');
  try {const file=data.get('media') as File|null;const mediaUrl=file?.size?(await upload(file)).url:'';
   await request(path,'POST',{title:String(data.get('title')||''),content:String(data.get('content')||''),mediaUrl,startsAt:data.get('startsAt')?new Date(String(data.get('startsAt'))).toISOString():''});form.reset();saved();
  } catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="space-y-3 rounded-lg bg-slate-50 p-4"><fieldset disabled={busy} className="space-y-3">{kind==='events'&&<><label className="block">Event title<input name="title" required minLength={3} maxLength={100} className={field}/></label><label className="block">Event date and time<input name="startsAt" type="datetime-local" required className={field}/></label></>}<label className="block">{kind==='messages'?'Message':kind==='comments'?'Comment':kind==='events'?'Event description':'Post text'}<textarea name="content" required maxLength={5000} rows={kind==='messages'?2:3} className={field}/></label>{kind!=='events'&&<label className="block text-sm">Attach an image<input name="media" type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="mt-2 block w-full text-sm"/></label>}<button className={button}>{busy?'Sending…':kind==='events'?'Create event':kind==='messages'?'Send message':kind==='comments'?'Add comment':'Publish post'}</button></fieldset>{error&&<RequestState error={error}/>}</form>;
}

function ContentList({ groupId,kind,parentId=0 }: {groupId:string;kind:string;parentId?:number}) {
 const [offset,setOffset]=useState(0);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const path=`/groups/${groupId}/content/${kind}?parentId=${parentId}`;
 const resource=useResource<Content[]>(`${path}&offset=${offset}`);const reload=resource.reload;
 useEffect(()=>{const changed=(event:Event)=>{const message=(event as CustomEvent<SocketEvent>).detail;if(message.type==='connected'||(message.type==='group_changed'&&String(message.payload.groupId)===groupId))reload();};window.addEventListener('social:socket',changed);const timer=setInterval(reload,15000);return()=>{window.removeEventListener('social:socket',changed);clearInterval(timer);};},[groupId,reload]);
 async function rsvp(id:number,status:string){setBusy(true);setError('');try{await request(`/groups/${groupId}/events/${id}/rsvp`,'PUT',{status});reload();}catch(error){setError(errorMessage(error));}finally{setBusy(false);}}
 return <div className="space-y-4"><Composer path={path} kind={kind} saved={()=>{setOffset(0);reload();}}/>{resource.loading&&<Loading height={80}/>} {(error||resource.error)&&<RequestState error={error||resource.error} retry={reload}/>}{resource.data?.length===0&&<p className="text-sm text-slate-500">No {kind} yet.</p>}<div className="space-y-4" aria-live={kind==='messages'?'polite':'off'}>{resource.data?.map(item=><article key={item.id} className="space-y-3 rounded-lg border border-slate-200 p-4"><p className="text-sm text-slate-500">@{item.nickname} · {dateLabel(item.createdAt)}</p>{item.title&&<h3 className="text-lg font-semibold">{item.title}</h3>}<p className="whitespace-pre-wrap break-words">{item.content}</p>{item.mediaUrl&&<img src={item.mediaUrl} alt="Group attachment" className="max-h-96 max-w-full rounded-lg"/>}{kind==='events'&&<><p>{dateLabel(item.startsAt)}</p><p className="text-sm">{item.going} going · {item.notGoing} not going</p><div className="flex flex-wrap gap-3">{['going','not_going'].map(status=><button key={status} disabled={busy} aria-pressed={item.rsvp===status} className={item.rsvp===status?button:'rounded-lg border px-4 py-2'} onClick={()=>void rsvp(item.id,status)}>{status==='going'?'Going':'Not going'}</button>)}</div></>}{kind==='posts'&&<details><summary className="cursor-pointer py-2 font-medium">Comments</summary><ContentList groupId={groupId} kind="comments" parentId={item.id}/></details>}</article>)}</div><div className="flex justify-between"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-30))} className="disabled:opacity-40">Newer</button><button disabled={resource.data?.length!==30} onClick={()=>setOffset(offset+30)} className="disabled:opacity-40">Older</button></div></div>;
}

export default function GroupActivity({groupId}:{groupId:string}) {
 const [tab,setTab]=useState('posts');
 return <section className="space-y-4 rounded-xl border bg-white p-4 sm:p-6"><nav aria-label="Group activity" className="flex flex-wrap gap-2">{['posts','events','messages'].map(kind=><button key={kind} aria-pressed={tab===kind} onClick={()=>setTab(kind)} className={tab===kind?button:'rounded-lg border px-4 py-2'}>{kind==='messages'?'Group chat':kind==='events'?'Events':'Posts'}</button>)}</nav><ContentList key={tab} groupId={groupId} kind={tab}/></section>;
}
