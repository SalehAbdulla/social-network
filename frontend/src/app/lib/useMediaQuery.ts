'use client';

import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query currently matches.
 *
 * Almost everything in this app is responsive in CSS alone, and it should stay that
 * way. This exists for the rare component whose *behaviour* — not just its looks —
 * has to change with the viewport: a post's comments are an inline list on a wide
 * screen and a bottom drawer on a phone, and a drawer that has not been opened
 * cannot be expressed as a class on an element that must not be in the DOM yet.
 *
 * The first render is always `false`, which is the value a server would render, so
 * the markup cannot mismatch when the page hydrates; the real answer arrives in an
 * effect, the way `ThemeProvider` reads storage and `SideBar` reads its own
 * breakpoint. Responding to `change` means a resize is picked up without a reload.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const sync = () => setMatches(list.matches);
    sync();
    list.addEventListener('change', sync);
    return () => list.removeEventListener('change', sync);
  }, [query]);
  return matches;
}