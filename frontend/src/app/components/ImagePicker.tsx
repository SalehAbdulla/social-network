'use client';

import { useEffect, useState } from 'react';
import { Crop, ImagePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage } from '../api/social';
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_VIDEO_BYTES, MEDIA_ACCEPT, formatBytes, isImageType, isVideoType, oversizeMessage } from '../lib/mediaLimits';
import ImageCropper from './ImageCropper';

type Dimensions = { width: number; height: number };

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export async function validateImage(file: File): Promise<Dimensions> {
  if (!isImageType(file.type)) throw new Error('Choose a JPEG, PNG, GIF or WebP image. PDFs are not supported.');
  if (!file.size) throw new Error('The selected file is empty.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error(oversizeMessage(file));
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) throw new Error(`Choose an image smaller than ${MAX_IMAGE_PIXELS / 1000000} megapixels.`);
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    throw new Error(error instanceof Error && error.message.includes('megapixels') ? error.message : 'This file could not be opened as an image.');
  } finally { URL.revokeObjectURL(url); }
}

export type MediaPurpose = 'image' | 'avatar' | 'cover' | 'post';

export function checkPurpose(dimensions: Dimensions, purpose: MediaPurpose) {
  if (purpose === 'avatar' && (dimensions.width < 200 || dimensions.height < 200)) {
    throw new Error('Profile photos must be at least 200×200. Choose a larger photo.');
  }
  if (purpose === 'cover' && (dimensions.width < 800 || dimensions.height < 300)) {
    throw new Error('Cover photos must be at least 800×300. Choose a larger photo.');
  }
  if (purpose === 'post' && (dimensions.width / dimensions.height < 0.5 || dimensions.width / dimensions.height > 2)) {
    throw new Error('Photos must be between 1:2 and 2:1. Crop it closer to square.');
  }
}

function FileDetails({ dimensions, size }: { dimensions?: Dimensions; size: number }) {
  return <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-slate-950/60 px-2 py-1 text-center text-[11px] font-medium text-white">
    {dimensions ? `${dimensions.width} × ${dimensions.height} · ` : ''}{formatBytes(size)}
  </span>;
}

function Preview({ file, onDimensions }: { file: File; onDimensions?: (dimensions: Dimensions) => void }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => setSrc(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file]);
  if (!src) return null;
  return file.type.startsWith('video/')
    ? <video src={src} controls onLoadedMetadata={event => onDimensions?.({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })} className="aspect-square w-full bg-slate-100 object-contain" />
    : <img src={src} alt={`Preview of ${file.name}`} className="aspect-square w-full bg-slate-100 object-contain" />;
}

export default function ImagePicker({ files, onChange, existing = [], onRemoveExisting, max = 4, disabled = false, allowVideo = false, purpose = 'image' }: {
  files: File[]; onChange: (files: File[]) => void; existing?: string[]; onRemoveExisting?: (url: string) => void; max?: number; disabled?: boolean; allowVideo?: boolean; purpose?: MediaPurpose;
}) {
  const [checking, setChecking] = useState(false);
  const [cropping, setCropping] = useState<number | null>(null);
  const purposeHint = purpose === 'avatar' ? 'at least 200×200' : purpose === 'cover' ? 'at least 800×300' : purpose === 'post' ? 'between 1:2 and 2:1' : '';
  const [details, setDetails] = useState<Record<string, Dimensions>>({});
  return <div className="space-y-3">
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
      <ImagePlus size={22} className="shrink-0 text-teal-700" />
      <span className="min-w-0"><span className="block font-medium">{checking ? 'Checking files…' : allowVideo ? 'Add a photo or video' : 'Add photos'}</span><span className="text-xs text-slate-500">JPEG, PNG, GIF or WebP · {formatBytes(MAX_IMAGE_BYTES)} each{purposeHint && ` · ${purposeHint}`} · up to {max}{allowVideo && ` · MP4 / WebM up to ${formatBytes(MAX_VIDEO_BYTES)}`}</span></span>
      <input aria-label={allowVideo ? 'Add photo or video' : 'Add photos'} className="sr-only" type="file" accept={allowVideo ? MEDIA_ACCEPT : IMAGE_ACCEPT} multiple={max > 1} disabled={disabled || checking} onChange={async event => {
        const selected = Array.from(event.target.files || []); event.target.value = '';
        if (selected.length + files.length + existing.length > max) { toast.error(`Choose up to ${max} photo${max === 1 ? '' : 's'} in total.`); return; }
        setChecking(true);
        const measured: Record<string, Dimensions> = {};
        try {
          await Promise.all(selected.map(async file => {
            if (allowVideo && isVideoType(file.type)) {
              if (!file.size) throw new Error('The selected file is empty.');
              if (file.size > MAX_VIDEO_BYTES) throw new Error(oversizeMessage(file));
              return;
            }
            const dimensions = await validateImage(file);
            checkPurpose(dimensions, purpose);
            measured[fileKey(file)] = dimensions;
          }));
          setDetails(current => ({ ...current, ...measured }));
          onChange([...files, ...selected]);
        } catch (error) { toast.error(errorMessage(error)); } finally { setChecking(false); }
      }} />
    </label>
    {!!(files.length + existing.length) && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {existing.map((url, index) => <div key={url} className="relative overflow-hidden rounded-xl border border-slate-200"><img src={url} alt={`Photo ${index + 1}`} className="aspect-square w-full bg-slate-100 object-contain" /><button type="button" disabled={disabled} aria-label={`Remove photo ${index + 1}`} onClick={() => onRemoveExisting?.(url)} className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-slate-700"><X size={16} /></button></div>)}
      {files.map((file, index) => <div key={`${file.name}-${index}`} className="relative overflow-hidden rounded-xl border border-slate-200"><Preview file={file} onDimensions={dimensions => setDetails(current => ({ ...current, [fileKey(file)]: dimensions }))} /><FileDetails dimensions={details[fileKey(file)]} size={file.size} />{isImageType(file.type) && file.type !== 'image/gif' && <button type="button" disabled={disabled} aria-label={`Crop ${file.name}`} onClick={() => setCropping(index)} className="absolute left-1 top-1 rounded-full bg-white/95 p-1 text-slate-700"><Crop size={16} /></button>}<button type="button" disabled={disabled} aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))} className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-slate-700"><X size={16} /></button></div>)}
    </div>}
    {cropping !== null && files[cropping] && <ImageCropper file={files[cropping]} onClose={() => setCropping(null)} onApply={cropped => {
      const index = cropping;
      void validateImage(cropped).then(dimensions => setDetails(current => ({ ...current, [fileKey(cropped)]: dimensions }))).catch(() => {});
      onChange(files.map((item, position) => position === index ? cropped : item));
      setCropping(null);
    }} />}
  </div>;
}
