'use client';

import { useEffect, useState } from 'react';
import { Crop, ImagePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage } from '../api/social';
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_VIDEO_BYTES, MEDIA_ACCEPT, formatBytes, isImageType, isVideoType, oversizeMessage } from '../lib/mediaLimits';
import ImageCropper from './ImageCropper';

/** The dimensions the picker has measured for one selected file. */
type Dimensions = { width: number; height: number };

/**
 * Identifies a selected file across re-renders. A `File` is a fresh object after
 * any state update, so the measured details are keyed by what the file *is* rather
 * than by identity; two files with the same name, size and modification time hold
 * the same bytes and report the same dimensions anyway.
 */
function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Checks one image the way the server will, before the upload is spent: type, size
 * and the decoded canvas. It returns the measured dimensions so the picker can show
 * them — a file's size or shape should never be first mentioned in a rejection.
 */
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

/**
 * The caption over a tile. An overlay rather than a line under the preview, so the
 * square frame keeps its size and the grid cannot grow a row it did not have.
 */
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
  // A video reports its own dimensions once its metadata arrives; an image's are
  // already known from the check above, so only the video needs the callback.
  return file.type.startsWith('video/')
    ? <video src={src} controls onLoadedMetadata={event => onDimensions?.({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })} className="aspect-square w-full bg-slate-100 object-contain" />
    : <img src={src} alt={`Preview of ${file.name}`} className="aspect-square w-full bg-slate-100 object-contain" />;
}

export default function ImagePicker({ files, onChange, existing = [], onRemoveExisting, max = 4, disabled = false, allowVideo = false }: {
  files: File[]; onChange: (files: File[]) => void; existing?: string[]; onRemoveExisting?: (url: string) => void; max?: number; disabled?: boolean; allowVideo?: boolean;
}) {
  const [checking, setChecking] = useState(false);
  // The index of the selected file whose crop step is open, if any.
  const [cropping, setCropping] = useState<number | null>(null);
  // Measured per selected file, keyed by `fileKey`. An entry for a file the parent
  // has removed is harmless: nothing renders it, and the next selection overwrites it.
  const [details, setDetails] = useState<Record<string, Dimensions>>({});
  return <div className="space-y-3">
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
      <ImagePlus size={22} className="shrink-0 text-teal-700" />
      <span className="min-w-0"><span className="block font-medium">{checking ? 'Checking files…' : allowVideo ? 'Add a photo or video' : 'Add photos'}</span><span className="text-xs text-slate-500">JPEG, PNG, GIF or WebP · {formatBytes(MAX_IMAGE_BYTES)} each · up to {max}{allowVideo && ` · MP4 / WebM up to ${formatBytes(MAX_VIDEO_BYTES)}`}</span></span>
      <input aria-label={allowVideo ? 'Add photo or video' : 'Add photos'} className="sr-only" type="file" accept={allowVideo ? MEDIA_ACCEPT : IMAGE_ACCEPT} multiple={max > 1} disabled={disabled || checking} onChange={async event => {
        const selected = Array.from(event.target.files || []); event.target.value = '';
        if (selected.length + files.length + existing.length > max) { toast.error(`Choose up to ${max} photo${max === 1 ? '' : 's'} in total.`); return; }
        setChecking(true);
        // Every file is checked before any of them is accepted, so a rejected
        // selection adds nothing; the measurements are kept for the captions.
        const measured: Record<string, Dimensions> = {};
        try {
          await Promise.all(selected.map(async file => {
            if (allowVideo && isVideoType(file.type)) {
              if (!file.size) throw new Error('The selected file is empty.');
              if (file.size > MAX_VIDEO_BYTES) throw new Error(oversizeMessage(file));
              return;
            }
            measured[fileKey(file)] = await validateImage(file);
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
      // The caption for the new file must be measured again: its key (name, size, time) changed,
      // so the number the previous file reported does not name this one.
      void validateImage(cropped).then(dimensions => setDetails(current => ({ ...current, [fileKey(cropped)]: dimensions }))).catch(() => {});
      onChange(files.map((item, position) => position === index ? cropped : item));
      setCropping(null);
    }} />}
  </div>;
}
