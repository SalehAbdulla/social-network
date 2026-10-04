'use client';

import { useEffect, useState } from 'react';

/**
 * Reports when an element has first come near the viewport.
 *
 * A wide screen renders a post's comments open, but the feed holds ten posts: if every
 * one of them reads its thread on mount, opening the feed fires ten comment requests
 * before the reader has looked at a single one. This is the gate that keeps those reads
 * lazy — a section stays mounted, so its form and its place in the layout never jump,
 * while its request waits until the section is about to be seen.
 *
 * `rootMargin` starts the load slightly before the element scrolls in, so the rows are
 * usually already there by the time it does. The observer is disconnected on the first
 * hit, because "has been seen" is a one-way answer. Without an observer there is
 * nothing to wait for, so the answer is "seen" from the first render and the element
 * simply loads as it did before the gate existed — read at init, not in the effect,
 * because an effect must not set state synchronously.
 *
 * Returns a callback ref to attach to the element, plus the flag. The ref is state
 * rather than a ref object so the effect can re-run once React has attached the node;
 * a plain ref would be read before it had been written.
 */
export function useInView<T extends Element>(rootMargin = '300px 0px') {
  const [node, setNode] = useState<T | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (!node || inView) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setInView(true);
    }, { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, inView, rootMargin]);
  return [setNode, inView] as const;
}
