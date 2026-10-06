'use client';

import { Heart, Reply } from 'lucide-react';
import toast from 'react-hot-toast';
import { type ChatMessage } from '../../api/social';
import { linkify } from '../../lib/linkify';
import { mediaImageProps } from '../../lib/mediaVariants';
import Avatar from '../Avatar';
import DmMessageMenu from './DmMessageMenu';
import { exactTime } from './time';

/**
 * One message: the bubble, its grouping corners, the received sender's avatar (beside the
 * last bubble of a run only), the reaction pill, the hover row and — under the newest sent
 * message — the Sent/Seen line.
 *
 * The hover controls are absolutely placed by CSS on the side facing the thread's center,
 * so they never widen a bubble, and they stay in the DOM at zero opacity, so a keyboard
 * can reach them and the automation suite can click them.
 */
export default function MessageBubble({ message, meId, first, last, lastSent, isGroup, senderName, senderAvatar, onReact, onDelete, onEdit, onReply, onOpenMedia }: {
  message: ChatMessage;
  meId: string;
  first: boolean;
  last: boolean;
  lastSent: boolean;
  isGroup: boolean;
  senderName: string;
  senderAvatar: string;
  onReact: (message: ChatMessage) => void;
  onDelete: (messageId: number, scope: string) => void;
  onEdit: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
  onOpenMedia: (images: string[], index: number) => void;
}) {
  const mine = message.senderId === meId;
  const hasMedia = !!message.mediaUrl;
  const hasText = !!message.textMessage?.trim();
  function copy() {
    if (!message.textMessage) return;
    void navigator.clipboard?.writeText(message.textMessage)
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Could not copy this message.'));
  }
  return <div className={`dm-msg ${mine ? 'dm-msg-sent' : 'dm-msg-received'}`}>
    {!mine && <span className="dm-msg-avatar" aria-hidden={!last}>
      {last && <Avatar name={senderName} avatarUrl={senderAvatar} size={28} />}
    </span>}
    <div className="dm-bubble-wrap">
      {isGroup && !mine && first && <span className="dm-msg-sender">{senderName}</span>}
      <article
          className="dm-bubble"
          data-adj-top={!first}
          data-adj-bottom={!last}
          data-flush={hasMedia && !hasText}
          title={exactTime(message.timeStamp)}
          onDoubleClick={() => { if (message.userScore !== 1) onReact(message); }}
        >
          {hasMedia && (message.mediaType === 'video'
            ? <video src={message.mediaUrl} controls className="dm-bubble-media" />
            : <button type="button" aria-label="Open this attachment" onClick={() => onOpenMedia([message.mediaUrl], 0)} className="dm-bubble-media cursor-zoom-in"><img {...mediaImageProps(message.mediaUrl, '320px')} alt="Message attachment" /></button>)}
          {hasText && <span>{linkify(message.textMessage)}</span>}
          {message.score > 0 && <span className="dm-reaction" title={`${message.score} reaction${message.score === 1 ? '' : 's'}`}>
            <span aria-hidden="true">❤️</span>{message.score}
          </span>}
          <div className="dm-actions">
            <button type="button" className="dm-action" aria-pressed={message.userScore === 1} aria-label={message.userScore === 1 ? 'Remove your reaction to this message' : 'React to this message'} onClick={() => onReact(message)}>
              <Heart fill={message.userScore === 1 ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            <button type="button" className="dm-action" aria-label="Reply to this message" onClick={() => onReply(message)}><Reply aria-hidden="true" /></button>
            <DmMessageMenu>
              <button type="button" className="chat-menu" onClick={copy}>Copy</button>
              {mine && <button type="button" className="chat-menu" onClick={() => onEdit(message)}>Edit message</button>}
              {mine && <button type="button" className="chat-menu" onClick={() => onDelete(message.messageId, 'everyone')}>Delete for everyone</button>}
              <button type="button" className="chat-menu" onClick={() => onDelete(message.messageId, 'me')}>Delete for me</button>
              {!mine && <button type="button" className="chat-menu text-danger" onClick={() => toast.success('Thanks — this message has been reported.')}>Report</button>}
            </DmMessageMenu>
          </div>
      </article>
      {lastSent && <span className="dm-status" aria-label={message.isRead ? 'Read' : 'Sent'}>{message.isRead ? 'Seen' : 'Sent'}</span>}
    </div>
  </div>;
}
