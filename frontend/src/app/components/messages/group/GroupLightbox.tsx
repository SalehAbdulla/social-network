'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { isoTimestamp, relativeLabel } from '../../../api/social';
import { useDialogFocus } from '../../../lib/useDialogFocus';
import { mediaVariant } from '../../../lib/mediaVariants';
import Avatar from '../../Avatar';
import IconButton from '../../ui/IconButton';
import Menu, { MenuItem } from '../../ui/Menu';
import { isVideo, itemName, type GroupItem } from './groupContent';
import { groupExactTime } from './groupTime';

export default function GroupLightbox({ items, index, meId, isOwner, avatarOf, onClose, onIndex, onDelete }: {
  items: GroupItem[];
  index: number;
  meId: string;
  isOwner: boolean;
  avatarOf?: (userId: string) => string;
  onClose: () => void;
  onIndex: (next: number) => void;
  onDelete: (item: GroupItem) => void;
}) {
  const item = items[index];
  const many = items.length > 1;
  const dialog = useDialogFocus<HTMLDivElement>(onClose);
  const [failedId, setFailedId] = useState<number | null>(null);
  const failed = failedId === item?.id;
  useEffect(() => {
    if (!many) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); onIndex((index - 1 + items.length) % items.length); }
      if (event.key === 'ArrowRight') { event.preventDefault(); onIndex((index + 1) % items.length); }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [index, items.length, many, onIndex]);
  if (!item) return null;
  return <div ref={dialog} className="grp-lightbox" role="dialog" aria-modal="true" aria-label="Attachment viewer" tabIndex={-1} onClick={onClose}>
    <IconButton label="Close image viewer" className="grp-lightbox-close" onClick={onClose}><X aria-hidden="true" /></IconButton>
    {many && <>
      <IconButton label="Previous image" className="grp-lightbox-nav left-3" onClick={event => { event.stopPropagation(); onIndex((index - 1 + items.length) % items.length); }}><ChevronLeft aria-hidden="true" /></IconButton>
      <IconButton label="Next image" className="grp-lightbox-nav right-3" onClick={event => { event.stopPropagation(); onIndex((index + 1) % items.length); }}><ChevronRight aria-hidden="true" /></IconButton>
    </>}
    {isVideo(item.mediaUrl)
      ? <video src={item.mediaUrl} controls className="grp-lightbox-image" onClick={event => event.stopPropagation()} />
      : failed
        ? <span className="grp-lightbox-image grid place-items-center bg-surface-2 text-muted" role="img" aria-label="Attachment">Image unavailable</span>
        : <img
            src={mediaVariant(item.mediaUrl, 'large')}
            alt={`Attachment from ${itemName(item)}`}
            onError={() => setFailedId(item.id)}
            className="grp-lightbox-image"
            onClick={event => event.stopPropagation()}
          />}
    <div className="grp-lightbox-caption" onClick={event => event.stopPropagation()}>
      <Avatar name={itemName(item)} avatarUrl={avatarOf?.(item.userId) ?? ''} size={32} />
      <div className="min-w-0 flex-1">
        <p className="grp-lightbox-name" dir="auto">
          {item.userId === meId ? 'You' : itemName(item)}
          <time className="grp-lightbox-time" dateTime={isoTimestamp(item.createdAt)} title={groupExactTime(item.createdAt)}> · {relativeLabel(item.createdAt)}</time>
        </p>
        {!!item.content && <p className="grp-lightbox-text" dir="auto">{item.content}</p>}
      </div>
      {(item.userId === meId || isOwner) && <Menu label="Photo actions">
        <MenuItem tone="danger" onClick={() => onDelete(item)}>Delete</MenuItem>
      </Menu>}
    </div>
  </div>;
}
