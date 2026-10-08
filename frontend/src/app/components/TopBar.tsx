'use client';

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { useBackend } from './BackendProvider';
import ThemeToggle from './ThemeToggle';

export default function TopBar() {
  const { badges } = useBackend();

  return <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-3 backdrop-blur-xl sm:px-4 md:hidden">
    <Link href="/" className="flex shrink-0 items-center"><img src="/logo.svg" alt="Social Network" className="h-8 w-auto object-contain dark:brightness-125" /></Link>
    <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Link href="/messages" aria-label="Messages" title="Messages" className="relative flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2"><MessageSquare size={20} />{!!badges?.messages && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-teal-700" />}</Link>
      <span className="hidden sm:inline"><ThemeToggle /></span>
    </div>
  </header>;
}
