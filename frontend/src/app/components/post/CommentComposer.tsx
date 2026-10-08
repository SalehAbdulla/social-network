'use client';

import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';

export default function CommentComposer({ postId, value, onChange, onSubmit, busy, canAddPhoto, onPickFiles }: {
  postId: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  canAddPhoto: boolean;
  onPickFiles: (files: File[]) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const hasText = !!value.trim();
  return <form className="pv-composer" onSubmit={event => { event.preventDefault(); if (value.trim()) onSubmit(); }}>
    <textarea
      id={`comment-${postId}`}
      value={value}
      rows={1}
      maxLength={300}
      placeholder="Add a comment..."
      aria-label="Add a comment"
      onChange={event => {
        onChange(event.target.value);
        const node = event.currentTarget;
        node.style.height = 'auto';
        node.style.height = `${Math.min(node.scrollHeight, 72)}px`;
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (value.trim()) onSubmit(); }
      }}
    />
    {canAddPhoto && <>
      <button type="button" className="pv-action" style={{ display: hasText ? 'none' : undefined }} aria-label="Add photos" title="JPEG, PNG, GIF or WebP · 10 MB each · between 1:2 and 2:1 · up to 4" disabled={busy} onClick={() => file.current?.click()}><ImagePlus aria-hidden="true" /></button>
      <input ref={file} type="file" aria-label="Add photos" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="sr-only" onChange={event => { onPickFiles([...(event.target.files ?? [])]); event.currentTarget.value = ''; }} />
    </>}
    {hasText && <button type="submit" className="pv-post" disabled={busy}>Post</button>}
  </form>;
}
