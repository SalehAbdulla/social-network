'use client';

import { useState } from 'react';
import Link from 'next/link';
import { type Page, type Post } from './api/social';
import { useResource } from './lib/useResource';
import StoriesBar from './components/StoriesBar';
import PostCard from './components/PostCard';
import RequestState from './components/RequestState';
import Loading from './components/Loading';

export default function Feed() {
  const [page, setPage] = useState(1);
  const feed = useResource<Page<Post>>(`/posts?page=${page}&size=10&sortBy=createdat&sortOrder=desc`);
  return <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-8">
    <h1 className="text-2xl font-bold text-slate-900">Your feed</h1>
    <StoriesBar />
    {feed.loading && <Loading />}
    {feed.data?.posts.map(post => <PostCard key={post.postId} post={post} fetchPosts={feed.reload} />)}
    {feed.data?.posts.length === 0 && <RequestState empty="No posts yet. Share your first post to get started." />}
    {feed.data?.posts.length === 0 && <Link href="/create-post" className="block text-center text-blue-600">Create a post</Link>}
    <div className="flex items-center justify-between text-sm"><button disabled={page === 1} className="rounded-lg border px-4 py-2 disabled:opacity-40" onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={!feed.data || feed.data.lastPage} className="rounded-lg border px-4 py-2 disabled:opacity-40" onClick={() => setPage(page + 1)}>Next</button></div>
  </div>;
}
