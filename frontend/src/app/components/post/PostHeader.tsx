'use client';

import Link from 'next/link';
import { ExternalLink, Link2, Pencil, Share2, Trash2 } from 'lucide-react';
import { PRIVACY_LABEL, type Post, displayName } from '../../api/social';
import { POST_AVATAR_SIZE } from '../../lib/sizing';
import AudienceIcon from '../AudienceIcon';
import Avatar from '../Avatar';
import Menu, { MenuItem } from '../ui/Menu';

/**
 * The post view's header: the author's 32px avatar, their name, and a muted second line carrying
 * the audience mark — and, on the right, the shared "…" menu (Edit, Delete, Copy link, Go to post,
 * Share). The close control is not here: the X lives in the viewport's own corner.
 */
export default function PostHeader({ post, group, isOwner, avatarUrl, onEdit, onDelete, onCopyLink, onGoToPost, onShare }: {
  post: Post;
  group: boolean;
  isOwner: boolean;
  /** The group roster's avatar for the author, when the surface holds one. */
  avatarUrl?: string;
  onEdit?: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  /** Absent for a group post, which has no `/post/{id}` row of its own. */
  onGoToPost?: () => void;
  onShare: () => void;
}) {
  const name = displayName(post);
  return <div className="pv-header">
    <Link href={group ? '/messages/groups' : `/profile/${post.userId}`} className="flex min-w-0 items-center gap-3">
      <Avatar name={name} avatarUrl={avatarUrl} size={POST_AVATAR_SIZE} />
      <span className="pv-head-text">
        <span className="pv-name block truncate" dir="auto">{name}</span>
        <span className="pv-meta">
          <AudienceIcon privacy={post.privacy} context={group ? 'group' : 'feed'} />
          <span>{group ? 'Group' : PRIVACY_LABEL[post.privacy]}</span>
        </span>
      </span>
    </Link>
    <Menu label="Post options" align="end">
      {isOwner && onEdit && <MenuItem onClick={onEdit}><Pencil aria-hidden="true" />Edit</MenuItem>}
      {isOwner && <MenuItem tone="danger" onClick={onDelete}><Trash2 aria-hidden="true" />Delete</MenuItem>}
      <MenuItem onClick={onCopyLink}><Link2 aria-hidden="true" />Copy link</MenuItem>
      {onGoToPost && <MenuItem onClick={onGoToPost}><ExternalLink aria-hidden="true" />Go to post</MenuItem>}
      <MenuItem onClick={onShare}><Share2 aria-hidden="true" />Share</MenuItem>
    </Menu>
  </div>;
}
