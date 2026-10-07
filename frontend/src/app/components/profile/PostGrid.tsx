'use client';

import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import { type MediaItem, type Post } from '../../api/social';
import { mediaImageProps } from '../../lib/mediaVariants';
import Button from '../ui/Button';
import LoadMore from '../LoadMore';
import PostTile, { isVideo } from './PostTile';

const TILE_COUNT = 12;

/** The pulsing placeholder the first paint of any grid shows, in the tiles' own aspect ratio. */
export function GridSkeleton({ count = TILE_COUNT }: { count?: number }) {
  return <div className="profile-grid" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <span key={index} className="profile-tile-skeleton" />)}
  </div>;
}

function GridError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div className="profile-error" role="alert"><span>{error}</span><Button variant="secondary" onClick={onRetry}>Retry</Button></div>;
}

/**
 * The Posts, Likes and Saved grid: three columns of tiles that open the post's overlay. Loading,
 * an inline failure with a retry, the tab's empty state and the end-of-list sentinel are all drawn
 * here so every tab reads the same.
 */
export default function PostGrid({ posts, loading, error, settled, hasMore, loadingMore, onLoadMore, onRetry, onOpen, empty }: {
  posts: Post[];
  loading: boolean;
  error: string;
  settled: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onOpen: (post: Post) => void;
  empty: ReactNode;
}) {
  if (error) return <GridError error={error} onRetry={onRetry} />;
  if (loading) return <GridSkeleton />;
  if (settled && posts.length === 0) return <>{empty}</>;
  return <>
    <div className="profile-grid">{posts.map(post => <PostTile key={post.postId} post={post} onOpen={() => onOpen(post)} />)}</div>
    <LoadMore loading={loadingMore} hasMore={hasMore} onLoadMore={onLoadMore} endLabel={null} />
  </>;
}

/**
 * The Media tab's grid. It reads the profile's own media projection rather than the post list, so
 * a photo attached to a comment is here too, and a tile is the link to the post it belongs to.
 */
export function MediaGrid({ items, loading, error, settled, hasMore, loadingMore, onLoadMore, onRetry, empty }: {
  items: MediaItem[];
  loading: boolean;
  error: string;
  settled: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  empty: ReactNode;
}) {
  if (error) return <GridError error={error} onRetry={onRetry} />;
  if (loading) return <GridSkeleton />;
  if (settled && items.length === 0) return <>{empty}</>;
  return <>
    <div className="profile-grid" data-media-grid>
      {items.map(item => <a key={`${item.postId}-${item.url}`} href={`/post/${item.postId}`} className="profile-tile" aria-label={item.title || 'Post media'}>
        {isVideo(item.url)
          ? <video src={item.url} muted preload="metadata" />
          : <img {...mediaImageProps(item.url, '(max-width: 640px) 33vw, 320px')} alt={item.title || 'Post media'} />}
        {isVideo(item.url) && <span className="profile-tile-badge" aria-hidden="true"><Play /></span>}
      </a>)}
    </div>
    <LoadMore loading={loadingMore} hasMore={hasMore} onLoadMore={onLoadMore} endLabel={null} />
  </>;
}
