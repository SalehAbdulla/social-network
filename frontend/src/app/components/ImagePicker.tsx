'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage } from '../api/social';

export const imageTypes = 'image/jpeg,image/png,image/gif,image/webp';

export async function validateImage(file: File) {
  if (!imageTypes.split(',').includes(file.type)) throw new Error('Choose a JPEG, PNG, GIF or WebP image. PDFs are not supported.');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Each image must be between 1 byte and 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Choose an image smaller than 40 megapixels.');
  } catch (error) {
    throw new Error(error instanceof Error && error.message.includes('megapixels') ? error.message : 'This file could not be opened as an image.');
  } finally { URL.revokeObjectURL(url); }
}

function Preview({ file }: { file: File }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => setSrc(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file]);
  return src ? file.type.startsWith('video/') ? <video src={src} controls className="aspect-square w-full bg-slate-100 object-contain" /> : <img src={src} alt={`Preview of ${file.name}`} className="aspect-square w-full bg-slate-100 object-contain" /> : null;
}

export default function ImagePicker({ files, onChange, existing = [], onRemoveExisting, max = 4, disabled = false, allowVideo = false }: {
  files: File[]; onChange: (files: File[]) => void; existing?: string[]; onRemoveExisting?: (url: string) => void; max?: number; disabled?: boolean; allowVideo?: boolean;
}) {
  const [checking, setChecking] = useState(false);
  return <div className="space-y-3">
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
      <ImagePlus size={22} className="shrink-0 text-teal-700" />
      <span className="min-w-0"><span className="block font-medium">{checking ? 'Checking files…' : allowVideo ? 'Add a photo or video' : 'Add photos'}</span><span className="text-xs text-slate-500">JPEG, PNG, GIF or WebP · 10 MB each · up to {max}{allowVideo && ' · MP4 / WebM up to 50 MB'}</span></span>
      <input aria-label={allowVideo ? 'Add photo or video' : 'Add photos'} className="sr-only" type="file" accept={imageTypes + (allowVideo ? ',video/mp4,video/webm' : '')} multiple={max > 1} disabled={disabled || checking} onChange={async event => {
        const selected = Array.from(event.target.files || []); event.target.value = '';
        if (selected.length + files.length + existing.length > max) { toast.error(`Choose up to ${max} photo${max === 1 ? '' : 's'} in total.`); return; }
        setChecking(true);
        try { await Promise.all(selected.map(file => {
          if (allowVideo && ['video/mp4', 'video/webm'].includes(file.type)) {
            if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('Videos must be between 1 byte and 50 MB.');
            return Promise.resolve();
          }
          return validateImage(file);
        })); onChange([...files, ...selected]); }
        catch (error) { toast.error(errorMessage(error)); } finally { setChecking(false); }
      }} />
    </label>
    {!!(files.length + existing.length) && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {existing.map((url, index) => <div key={url} className="relative overflow-hidden rounded-xl border border-slate-200"><img src={url} alt={`Photo ${index + 1}`} className="aspect-square w-full bg-slate-100 object-contain" /><button type="button" disabled={disabled} aria-label={`Remove photo ${index + 1}`} onClick={() => onRemoveExisting?.(url)} className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-slate-700"><X size={16} /></button></div>)}
      {files.map((file, index) => <div key={`${file.name}-${index}`} className="relative overflow-hidden rounded-xl border border-slate-200"><Preview file={file} /><button type="button" disabled={disabled} aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))} className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-slate-700"><X size={16} /></button></div>)}
    </div>}
  </div>;
}
