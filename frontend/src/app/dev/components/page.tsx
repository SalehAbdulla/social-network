'use client';

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { type SocialUser } from '../../api/social';
import Avatar from '../../components/Avatar';
import PostPreview from '../../components/PostPreview';
import RequestState from '../../components/RequestState';
import Loading from '../../components/Loading';
import { PostListSkeleton, CardGridSkeleton, RowsSkeleton } from '../../components/Skeletons';
import ThemeToggle from '../../components/ThemeToggle';

/**
 * A gallery of the Instagram-style pieces, on one page and outside any flow, so the redesign
 * can be reviewed without clicking through whole features — which is what the item that asked
 * for this route wanted, and the reason it lives here rather than in an interactive tour.
 *
 * Everything shown is presentational: it takes props and fetches nothing, so the page is honest
 * about what each piece looks like without a session, a socket or an API behind it. The one
 * interactive control is the theme switch, because it is wired to the same provider the app is.
 *
 * It is a **development** tool, not a feature: a production build answers `notFound()`, so the
 * route never reaches a visitor. `NODE_ENV` is inlined at build time, so the branch is decided
 * once and the deployed bundle carries a 404.
 */
const SAMPLE_USER: SocialUser = {
  userId: 'sample-user', nickname: 'sample', firstName: 'Sample', lastName: 'User',
  bio: '', avatar: '', coverPhoto: '', location: '', isPublic: true, createdAt: '',
  followers: [], following: [], postCount: 0, pendingIncoming: false, pendingOutgoing: false,
};

export default function ComponentGallery() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <div className="mx-auto max-w-3xl space-y-10 p-4 py-8 sm:p-8">
    <header>
      <h1 className="text-2xl font-bold text-text">Component gallery</h1>
      <p className="text-sm text-muted">The Instagram-style pieces on their own. Development only — a production build answers 404 here.</p>
    </header>

    <Section title="Post card" note="The composer's preview, with the audience banner it draws above the card.">
      <PostPreview user={SAMPLE_USER} content="The draft renders exactly as the feed card does, linkified — try #travel or @sample." privacy="public" imageUrls={[]} />
    </Section>

    <Section title="Avatars" note="Initials when there is no photo, the photo when there is, at the sizes the app uses.">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name="Alex Rivera" size={28} />
        <Avatar name="Alex Rivera" size={32} />
        <Avatar name="Alex Rivera" size={40} />
        <Avatar name="Alex Rivera" size={64} />
      </div>
    </Section>

    <Section title="Unread badges" note="The bell is everything but private messages; the Messages entry is only those.">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-label="3 unread notifications" className="rounded-lg bg-red-600 px-1.5 text-xs text-white">3</span>
        <span aria-label="2 unread messages" className="flex items-center gap-1 rounded-lg bg-teal-700 px-1.5 text-xs text-white"><MessageSquare size={11} aria-hidden="true" />2</span>
      </div>
    </Section>

    <Section title="Loading" note="A spinner for a request with nothing cached to show yet.">
      <Loading height={56} label="Loading" />
    </Section>

    <Section title="Skeletons" note="Shimmer placeholders that mirror the real cards, so a list does not jump when it loads.">
      <PostListSkeleton count={1} />
      <RowsSkeleton count={2} />
      <CardGridSkeleton count={2} />
    </Section>

    <Section title="Empty states" note="One illustration per surface, so the four do not read alike.">
      <div className="grid gap-4 sm:grid-cols-2">
        <RequestState variant="feed" empty="No posts yet." />
        <RequestState variant="notifications" empty="Nothing new." />
        <RequestState variant="messages" empty="No conversations." />
        <RequestState variant="groups" empty="No groups." />
      </div>
    </Section>

    <Section title="Theme" note="The one switch, wired to the same provider the app uses.">
      <ThemeToggle label />
    </Section>
  </div>;
}

/** One titled block of the gallery, so every section reads the same way. */
function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <section className="space-y-3">
    <div>
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      <p className="text-sm text-muted">{note}</p>
    </div>
    {children}
  </section>;
}
