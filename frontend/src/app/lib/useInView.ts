'use client';

import { useEffect, useState } from 'react';

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
