'use client';

import Link from 'next/link';
import { FileText, X } from 'lucide-react';
import { type ConversationMedia } from '../../api/social';
import { mediaImageProps } from '../../lib/mediaVariants';
import Avatar from '../Avatar';
import Loading from '../Loading';

export default function DetailsPanel({ name, avatar, href, handle, media, mediaLoading, mediaError, mediaHasMore, onLoadMoreMedia, onRetryMedia, onOpenMedia, onClose }: {
  name: string;
  avatar: string;
  href: string;
  handle: string;
  media: ConversationMedia[];
  mediaLoading: boolean;
  mediaError: string;
  mediaHasMore: boolean;
  onLoadMoreMedia: () => void;
  onRetryMedia: () => void;
  onOpenMedia: (images: string[], index: number) => void;
  onClose: () => void;
}) {
  const images = media.map(item => item.mediaUrl);
  const files = media.filter(item => item.mediaType !== 'image' && item.mediaType !== 'video');
  return <aside className="dm-details" aria-label="Conversation details">
    <div className="dm-details-head">
      <Link href={href} className="flex min-w-0 items-center gap-3">
        <Avatar name={name} avatarUrl={avatar} size={44} />
        <span className="min-w-0">
          <span className="dm-header-name truncate">{name}</span>
          <span className="dm-header-sub truncate">{handle || 'Direct message'}</span>
        </span>
      </Link>
      <button type="button" aria-label="Close details" className="dm-icon ml-auto" onClick={onClose}><X aria-hidden="true" /></button>
    </div>
    <div className="dm-details-body">
      <span className="dm-details-label">Media</span>
      {mediaLoading && <Loading height={60} />}
      {!!mediaError && <button type="button" className="dm-secondary" onClick={onRetryMedia}>Retry</button>}
      {!mediaLoading && !mediaError && media.length === 0 && <p className="dm-empty-note">No media yet.</p>}
      {media.length > 0 && <div className="dm-media-grid">
        {media.map((item, index) => <button key={item.messageId} type="button" aria-label={`Open attachment ${index + 1}`} onClick={() => onOpenMedia(images, index)}>
          {item.mediaType === 'video'
            ? <video src={item.mediaUrl} />
            : <img {...mediaImageProps(item.mediaUrl, '(max-width: 1200px) 33vw, 110px')} alt="Conversation attachment" />}
        </button>)}
      </div>}
      {mediaHasMore && <button type="button" className="dm-secondary mt-4" onClick={onLoadMoreMedia}>Load more</button>}
      {files.length > 0 && <>
        <span className="dm-details-label mt-6">Files</span>
        {files.map((item, index) => <button key={item.messageId} type="button" className="dm-file-row" onClick={() => onOpenMedia([item.mediaUrl], 0)}>
          <FileText aria-hidden="true" />
          <span className="truncate">Attachment {index + 1}</span>
        </button>)}
      </>}
    </div>
  </aside>;
}
