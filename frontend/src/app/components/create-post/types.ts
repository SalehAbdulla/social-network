'use client';


export type CreateContext = 'feed' | 'group';

export type CropRatio = 'original' | '1:1' | '4:5' | '16:9';

export interface CropState {
  ratio: CropRatio;
  zoom: number;
  x: number;
  y: number;
}

export interface SelectedImage {
  id: string;
  file: File;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: CropState;
}

export const DEFAULT_CROP: CropState = { ratio: 'original', zoom: 1, x: 0, y: 0 };

// The caption is stored as the post's content, so it shares the backend's
// ceiling (ErrContentLength: 10-500 characters). A larger counter here would let
// the user type a caption the server then refuses on submit.
export const CAPTION_MAX = 500;

export const RATIO_VALUE: Record<Exclude<CropRatio, 'original'>, number> = { '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 };

export const MIN_ASPECT = 0.5;
export const MAX_ASPECT = 2;

export function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function originalAspect(image: SelectedImage): number {
  const ratio = image.naturalWidth / image.naturalHeight;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, ratio));
}

export function originalClamped(image: SelectedImage): boolean {
  const ratio = image.naturalWidth / image.naturalHeight;
  return ratio < MIN_ASPECT || ratio > MAX_ASPECT;
}

export function aspectFor(image: SelectedImage, ratio: CropRatio = image.crop.ratio): number {
  return ratio === 'original' ? originalAspect(image) : RATIO_VALUE[ratio];
}
