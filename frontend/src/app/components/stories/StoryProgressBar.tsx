'use client';

import type { RefObject } from 'react';

/**
 * The segmented bar at the top of the story card: one segment per story of the current
 * author, equal width, the seen ones filled, the current one growing.
 *
 * Only the current segment animates, and it is painted by the player's rAF loop writing a
 * `scaleX` through `fillRef` — this component never re-renders to move it. The seen and
 * upcoming segments are static, so a frame of progress costs one style write and no React
 * work at all.
 */
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
