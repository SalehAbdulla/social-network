'use client';

/**
 * The shape one create-post draft is in, shared by the shell and its three steps.
 *
 * The dialog is a single component tree (see CreatePostModal) and this module holds the types
 * those pieces pass around, so the steps do not import each other just to name a field.
 */

/** Which target a draft is for. A group post reuses the same flow and changes only the writer. */
export type CreateContext = 'feed' | 'group';

/** The four crop shapes. `original` is the photo's own aspect, clamped into the allowed range. */
export type CropRatio = 'original' | '1:1' | '4:5' | '16:9';

/** How one photo is framed: the chosen shape, the zoom (1×–3×) and the pan offset in px. */
export interface CropState {
  ratio: CropRatio;
  zoom: number;
  /** Pan, in display pixels, of the image within the crop box. Clamped to the image's edges. */
  x: number;
  y: number;
}

/** One selected photo, before it is uploaded. `url` is an object URL for previews. */
export interface SelectedImage {
  /** Stable across re-renders; a File is a fresh object after every state update. */
  id: string;
  file: File;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: CropState;
}

export const DEFAULT_CROP: CropState = { ratio: 'original', zoom: 1, x: 0, y: 0 };

/** The backend's caption ceiling, mirrored from `ErrContentLength`. */
export const CAPTION_MAX = 2200;

/** Instagram's crop shapes, as width ÷ height. `original` is resolved per photo. */
export const RATIO_VALUE: Record<Exclude<CropRatio, 'original'>, number> = { '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 };

/** The allowed window for an `original` crop, the same 1:2–2:1 the picker accepts. */
export const MIN_ASPECT = 0.5;
export const MAX_ASPECT = 2;

export function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** The aspect a photo's `original` crop resolves to, clamped into the allowed window. */
export function originalAspect(image: SelectedImage): number {
  const ratio = image.naturalWidth / image.naturalHeight;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, ratio));
}

/** Whether a photo's true shape had to be clamped, which is what the crop menu words as a note. */
export function originalClamped(image: SelectedImage): boolean {
  const ratio = image.naturalWidth / image.naturalHeight;
  return ratio < MIN_ASPECT || ratio > MAX_ASPECT;
}

/** The aspect one crop actually uses, resolving `original` to the photo's clamped aspect. */
export function aspectFor(image: SelectedImage, ratio: CropRatio = image.crop.ratio): number {
  return ratio === 'original' ? originalAspect(image) : RATIO_VALUE[ratio];
}
