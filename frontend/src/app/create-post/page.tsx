'use client';

import { useRouter } from 'next/navigation';
import CreatePostModal from '../components/create-post/CreatePostModal';

/**
 * The deep link for creating a post. The sidebar, the phone's Create tab, the feed row and the
 * profile's empty state all open the dialog in place; this route is what a bookmark or an old link
 * lands on, and it shows the very same dialog over an otherwise empty page.
 */
export default function CreatePost() {
  const router = useRouter();
  return <CreatePostModal context="feed" onClose={() => router.push('/')} onShared={() => {}} />;
}
