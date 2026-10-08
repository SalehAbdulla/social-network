'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage, request, upload } from '../../../api/social';
import { useDialogFocus } from '../../../lib/useDialogFocus';
import ImagePicker from '../../ImagePicker';
import Button from '../../ui/Button';
import { type GroupItem } from './groupContent';

export default function GroupContentSheet({ groupId, kind, item, onClose, onSaved }: {
  groupId: string;
  kind: 'posts' | 'events';
  item?: GroupItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const events = kind === 'events';
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [existing, setExisting] = useState(item?.mediaUrl || '');
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useDialogFocus<HTMLFormElement>(onClose, { initialFocus: closeButton });
  const localStart = item?.startsAt
    ? (() => { const date = new Date(item.startsAt); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })()
    : '';
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const mediaUrl = files.length ? (await upload(files[0])).url : existing;
      await request(`/groups/${groupId}/content/${kind}${item ? `/${item.id}` : ''}?parentId=0`, item ? 'PUT' : 'POST', {
        title: String(data.get('title') || ''),
        content: String(data.get('content') || ''),
        mediaUrl,
        startsAt: data.get('startsAt') ? new Date(String(data.get('startsAt'))).toISOString() : '',
      });
      onSaved();
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="dm-modal" onClick={onClose}>
    <form
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="grp-sheet-title"
      tabIndex={-1}
      onSubmit={submit}
      onClick={event => event.stopPropagation()}
      className="dm-modal-card"
    >
      <div className="dm-modal-head">
        <h2 id="grp-sheet-title">{item ? 'Edit' : 'New'} {events ? 'event' : 'post'}</h2>
        <button ref={closeButton} type="button" aria-label="Close" className="dm-icon" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      <fieldset disabled={busy} className="contents">
        <div className="grp-sheet-body">
          {events && <>
            <label className="grp-field">
              Event name
              <input name="title" defaultValue={item?.title} required minLength={3} maxLength={100} placeholder="What's the occasion?" />
            </label>
            <label className="grp-field">
              Date and time
              <input name="startsAt" type="datetime-local" defaultValue={localStart} required />
            </label>
          </>}
          <label className="grp-field">
            {events ? 'Description' : 'Your message'}
            <textarea
              name="content"
              defaultValue={item?.content}
              required={events || (!files.length && !existing)}
              maxLength={5000}
              rows={4}
              placeholder={events ? 'Add the place and details for your group.' : 'Share something with the group...'}
            />
          </label>
          <ImagePicker max={1} files={files} onChange={setFiles} existing={existing ? [existing] : []} onRemoveExisting={() => setExisting('')} disabled={busy} />
        </div>
        <div className="dm-modal-foot">
          <Button type="submit" loading={busy} className="w-full">{item ? 'Save changes' : events ? 'Create event' : 'Publish'}</Button>
        </div>
      </fieldset>
    </form>
  </div>;
}
