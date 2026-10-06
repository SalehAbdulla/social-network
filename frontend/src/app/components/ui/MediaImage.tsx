'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { mediaImageProps } from '../../lib/mediaVariants';

/**
 * An image from the media store, drawn consistently everywhere.
 *
 * It asks for the right derivative through `mediaImageProps`, decodes lazily, and — when the
 * file is gone or the request fails — swaps itself for a token-coloured placeholder instead of
 * leaving the browser's broken-image glyph. The `className` is the caller's, because only the
 * caller knows whether this is a 3:4 grid cell, a full-width post or a bubble.
 */
export default function MediaImage({ url, alt, sizes, className = '' }: {
  url: string;
  alt: string;
  /** The `sizes` the browser uses to choose between the derivatives. */
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span role="img" aria-label={alt} className={`grid place-items-center bg-surface-2 text-muted ${className}`}>
      <ImageOff aria-hidden="true" className="size-6" />
    </span>;
  }
  return <img
    {...mediaImageProps(url, sizes)}
    alt={alt}
    loading="lazy"
    decoding="async"
    onError={() => setFailed(true)}
    className={className}
  />;
}
