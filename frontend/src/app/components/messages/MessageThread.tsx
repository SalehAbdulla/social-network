'use client';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { type ChatMessage } from '../../api/social';
import Avatar from '../Avatar';
import Loading from '../Loading';
import MessageBubble from './MessageBubble';
import { exactTime, needsSeparator, separatorLabel } from './time';

/** One run of same-sender messages between two separators, with the stamps the row needs. */
interface Cluster {
  /** Whether a time/day separator belongs above this run. */
  separator: boolean;
  at: string;
  rows: { message: ChatMessage; first: boolean; last: boolean }[];
}

/**
 * The message thread.
 *
 * It groups consecutive messages from one sender into a run (a 2px gap inside, 8px
 * between), stamps a separator where the day changes or an hour passes, hangs the sender
 * avatar beside the last bubble of a received run, and keeps the reader's place when an
 * older page is folded in at the top. The reader's own reaction reuses the app's message
 * reaction endpoint through `onReact`; the hover row's "more" opens the same menu the rest
 * of the chat surfaces use.
 */
export default function MessageThread({ items, meId, partnerId, partnerName, partnerHandle, partnerAvatar, loading, error, onRetry, hasMore, loadingMore, onLoadMore, typing, isGroup = false, senderOf, onReact, onDelete, onEdit, onReply, onOpenMedia }: {
  items: ChatMessage[];
  meId: string;
  partnerId: string;
  partnerName: string;
  partnerHandle: string;
  partnerAvatar: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  typing: boolean;
  isGroup?: boolean;
  /** Names and avatars for a group's other senders; a one-to-one chat falls back to the partner. */
  senderOf?: (userId: string) => { name: string; avatar: string };
  onReact: (message: ChatMessage) => void;
  onDelete: (messageId: number, scope: string) => void;
  onEdit: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
  onOpenMedia: (images: string[], index: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const pendingPrepend = useRef<number | null>(null);
  const [showPill, setShowPill] = useState(false);

  // Newest first from the paged list; the thread reads oldest to newest.
  const ordered = useMemo(() => [...items].reverse(), [items]);
  const lastSentId = useMemo(() => {
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      if (ordered[index].senderId === meId) return ordered[index].messageId;
    }
    return null;
  }, [ordered, meId]);

  const clusters = useMemo<Cluster[]>(() => {
    const result: Cluster[] = [];
    ordered.forEach((message, index) => {
      const previous = index > 0 ? ordered[index - 1] : null;
      const timed = !!previous && needsSeparator(previous.timeStamp, message.timeStamp);
      if (!previous || previous.senderId !== message.senderId || timed) {
        result.push({ separator: timed, at: message.timeStamp, rows: [] });
      }
      result[result.length - 1].rows.push({ message, first: result[result.length - 1].rows.length === 0, last: false });
    });
    for (const cluster of result) if (cluster.rows.length) cluster.rows[cluster.rows.length - 1].last = true;
    return result;
  }, [ordered]);

  function scrollToBottom() {
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    nearBottom.current = true;
    setShowPill(false);
  }

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    // A new message of the reader's own always wins: sending should follow the bubble down.
    const newest = ordered[ordered.length - 1];
    if (nearBottom.current || newest?.senderId === meId) scrollToBottom();
    // `ordered` is a fresh array whenever the rows change, which is the signal to re-anchor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || pendingPrepend.current === null) return;
    // An older page is prepended visually, so the content above the view grew: push the
    // scroll down by exactly that much and the reading position does not move.
    element.scrollTop += element.scrollHeight - pendingPrepend.current;
    pendingPrepend.current = null;
  }, [items.length]);

  function handleScroll() {
    const element = scroller.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    nearBottom.current = atBottom;
    setShowPill(!atBottom);
    if (element.scrollTop < 40 && hasMore && !loadingMore) {
      pendingPrepend.current = element.scrollHeight;
      onLoadMore();
    }
  }

  return <div
    ref={scroller}
    onScroll={handleScroll}
    role="log"
    aria-live="polite"
    aria-label={`Conversation with ${partnerName}`}
    className="dm-thread"
  >
    {!hasMore && !loading && <div className="dm-intro">
      <Avatar name={partnerName} avatarUrl={partnerAvatar} size={96} />
      <span className="dm-intro-name">{partnerName}</span>
      <span className="dm-intro-handle">{partnerHandle || partnerName} · Social Network</span>
      <Link href={`/profile/${partnerId}`} className="dm-secondary">View profile</Link>
    </div>}
    {loading && <Loading height={80} />}
    {!!error && <div className="py-4 text-center"><button type="button" className="dm-secondary" onClick={onRetry}>Retry loading messages</button></div>}
    {loadingMore && <p className="dm-sep">Loading…</p>}
    {clusters.map(cluster => <Fragment key={cluster.rows[0].message.messageId}>
      {cluster.separator && <div className="dm-sep" title={exactTime(cluster.at)}>{separatorLabel(cluster.at)}</div>}
      <div className="dm-cluster">
        {cluster.rows.map(({ message, first, last }) => {
          const mine = message.senderId === meId;
          const sender = senderOf?.(message.senderId);
          return <MessageBubble
            key={message.messageId}
            message={message}
            meId={meId}
            first={first}
            last={last}
            lastSent={message.messageId === lastSentId}
            isGroup={isGroup}
            senderName={mine ? 'You' : sender?.name ?? partnerName}
            senderAvatar={mine ? '' : sender?.avatar ?? partnerAvatar}
            onReact={onReact}
            onDelete={onDelete}
            onEdit={onEdit}
            onReply={onReply}
            onOpenMedia={onOpenMedia}
          />;
        })}
      </div>
    </Fragment>)}
    {typing && <div className="dm-msg dm-msg-received mt-2">
      <span className="dm-msg-avatar"><Avatar name={partnerName} avatarUrl={partnerAvatar} size={28} /></span>
      <div className="dm-bubble-wrap">
        <div className="dm-bubble">
          <span className="dm-typing" aria-hidden="true"><span /><span /><span /></span>
          <span className="sr-only">Typing</span>
        </div>
      </div>
    </div>}
    <div className="h-1" />
    {showPill && <div className="sticky bottom-2 flex justify-center">
      <button type="button" className="dm-newpill" onClick={scrollToBottom}>New messages</button>
    </div>}
  </div>;
}
