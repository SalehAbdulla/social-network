'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import { type Post, displayName } from '../../api/social';
import { mediaImageProps } from '../../lib/mediaVariants';

/** Attachments carry no type, so the file name decides whether a slot is a clip or a photo. */
export function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/**
 * The media pane of the post view: one photo, a carousel of several, or a muted autoplaying clip.
 * It is the black pane on the left of the dialog (the block above the panel below 900px), and the
 * picture is `object-fit: contain`, so a portrait stays portrait and a landscape stays wide while
 * the pane's own width follows the picture rather than forcing a grey letterbox.
 */
export default function PostMedia({ post, onOpen, onRatio }: { post: Post; onOpen?: (index: number) => void; onRatio?: (ratio: number) => void }) {
  const urls = post.imageUrls;
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  if (!urls.length) return null;
  const url = urls[index];
  const clip = isVideo(url);
  const many = urls.length > 1;
  const alt = `Photo by ${displayName(post)}`;
  const step = (delta: number) => { setIndex(current => (current + delta + urls.length) % urls.length); setPlaying(true); };
  return <div className="pv-media">
    {clip
      ? <>
        <video ref={video} src={url} autoPlay={playing} muted={muted} loop playsInline onLoadedMetadata={event => onRatio?.((event.currentTarget.videoWidth || 1) / (event.currentTarget.videoHeight || 1))} onClick={() => {
          const node = video.current;
          if (!node) return;
          if (node.paused) { void node.play(); setPlaying(true); } else { node.pause(); setPlaying(false); }
        }} />
        <button type="button" className="pv-mute" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}</button>
      </>
      : <button type="button" className="flex h-full w-full cursor-zoom-in items-center justify-center" aria-label={`Open image ${index + 1} of ${urls.length}`} onClick={() => onOpen?.(index)}>
        <img {...mediaImageProps(url, '(max-width: 900px) 100vw, 640px')} alt={alt} onLoad={event => onRatio?.((event.currentTarget.naturalWidth || 1) / (event.currentTarget.naturalHeight || 1))} />
      </button>}
    {many && <>
      <button type="button" className="pv-media-btn" data-side="prev" aria-label="Previous image" onClick={() => step(-1)}><ChevronLeft aria-hidden="true" /></button>
      <button type="button" className="pv-media-btn" data-side="next" aria-label="Next image" onClick={() => step(1)}><ChevronRight aria-hidden="true" /></button>
      <div className="pv-dots">{urls.map((item, position) => <span key={item} className="pv-dot" data-active={position === index} aria-hidden="true" />)}</div>
    </>}
  </div>;
}
