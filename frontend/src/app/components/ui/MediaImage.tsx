'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { mediaImageProps } from '../../lib/mediaVariants';

export default function MediaImage({ url, alt, sizes, className = '' }: {
  url: string;
  alt: string;
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
