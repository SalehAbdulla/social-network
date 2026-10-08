'use client';

import { useRouter } from 'next/navigation';
import CreatePostModal from '../components/create-post/CreatePostModal';

export default function CreatePost() {
  const router = useRouter();
  return <CreatePostModal context="feed" onClose={() => router.push('/')} onShared={() => {}} />;
}
