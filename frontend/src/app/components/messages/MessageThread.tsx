'use client';

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { isoTimestamp, type ChatMessage } from '../../api/social';
import Avatar from '../Avatar';
import Button from '../ui/Button';
import MessageBubble from './MessageBubble';
import { exactTime, needsSeparator, separatorLabel } from './time';

function ThreadSkeleton() {
  const rows = [
    { mine: false, width: 'w-40' },
    { mine: false, width: 'w-28' },
    { mine: true, width: 'w-52' },
    { mine: false, width: 'w-32' },
    { mine: true, width: 'w-40' },
    { mine: true, width: 'w-24' },
  ];
  return <div aria-hidden="true" className="flex flex-col gap-2">
    {rows.map((row, index) => (
      <span key={index} className={`grp-skeleton block h-9 ${row.width} ${row.mine ? 'self-end' : 'self-start'}`} />
    ))}
  </div>;
}

interface Cluster {
  separator: boolean;
  at: string;
  rows: { message: ChatMessage; first: boolean; last: boolean; rich: boolean }[];
}

function justMedia(message: ChatMessage) {
  return !!message.mediaUrl;
}

export default function MessageThread({ items, meId, partnerId, partnerName, partnerHandle, partnerAvatar, loading, error, onRetry, hasMore, loadingMore, onLoadMore, typing, isGroup = false, showIntro = true, allowReact = true, senderOf, richOf, embedOf, onReact, onDelete, onEdit, onReply, onOpenMedia }: {
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
  showIntro?: boolean;
  allowReact?: boolean;
  senderOf?: (userId: string) => { name: string; avatar: string };
  richOf?: (message: ChatMessage) => boolean;
  embedOf?: (message: ChatMessage) => ReactNode;
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
  const richOfMessage = richOf ?? justMedia;

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
      result[result.length - 1].rows.push({
        message,
        first: result[result.length - 1].rows.length === 0,
        last: false,
        rich: richOfMessage(message),
      });
    });
    for (const cluster of result) if (cluster.rows.length) cluster.rows[cluster.rows.length - 1].last = true;
    return result;
  }, [ordered, richOfMessage]);

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
    const newest = ordered[ordered.length - 1];
    if (nearBottom.current || newest?.senderId === meId) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || pendingPrepend.current === null) return;
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
    {showIntro && !hasMore && !loading && <div className="dm-intro">
      <Avatar name={partnerName} avatarUrl={partnerAvatar} size={96} />
      <span className="dm-intro-name">{partnerName}</span>
      <span className="dm-intro-handle">{partnerHandle || partnerName} · Social Network</span>
      <Link href={`/profile/${partnerId}`} className="dm-secondary">View profile</Link>
    </div>}
    {loading && <ThreadSkeleton />}
    {!!error && <div className="py-4"><div className="grp-error" role="alert">
      <span>{error}</span>
      <Button variant="secondary" onClick={onRetry}>Retry</Button>
    </div></div>}
    {loadingMore && <p className="dm-sep">Loading…</p>}
    {clusters.map(cluster => <Fragment key={cluster.rows[0].message.messageId}>
      {cluster.separator && <time className="dm-sep" dateTime={isoTimestamp(cluster.at)} title={exactTime(cluster.at)}>{separatorLabel(cluster.at)}</time>}
      <div className="dm-cluster">
        {cluster.rows.map(({ message, first, last, rich }) => {
          const mine = message.senderId === meId;
          const sender = senderOf?.(message.senderId);
          return <MessageBubble
            key={message.messageId}
            message={message}
            meId={meId}
            first={first}
            last={last}
            rich={rich}
            lastSent={message.messageId === lastSentId}
            isGroup={isGroup}
            embed={embedOf?.(message)}
            allowReact={allowReact}
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
