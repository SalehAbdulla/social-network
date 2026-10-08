'use client';

import type { RefObject } from 'react';

export default function StoryProgressBar({ count, current, fillRef }: {
  count: number; current: number; fillRef: RefObject<HTMLSpanElement | null>;
}) {
  return <div className="story-progress" role="group" aria-label="Story progress">
    {Array.from({ length: count }, (_, index) => {
      const done = index < current;
      const isCurrent = index === current;
      return <span
        key={index}
        role="progressbar"
        aria-label={`Story ${index + 1} of ${count}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done ? 100 : 0}
        className="story-progress-track"
      >
        {isCurrent
          ? <span ref={fillRef} className="story-progress-fill" />
          : <span className="story-progress-fill" style={{ transform: done ? 'scaleX(1)' : 'scaleX(0)' }} />}
      </span>;
    })}
  </div>;
}
