'use client';

import { useCallback, useRef, useState } from 'react';
import { aspectFor, originalAspect, type CropRatio, type CropState, type SelectedImage } from './types';

/**
 * The crop geometry and the interaction behind the crop step, in one place.
 *
 * The media area is a square. Inside it, the chosen shape is the largest rectangle of that aspect
 * that fits — the *crop box* — and the photo is scaled to cover that box at zoom 1, then panned and
 * zoomed within it. Whatever the square shows outside the box is the letterbox, painted the dialog
 * surface rather than black. The same functions drive the on-screen transform and the canvas
 * render, so what the reader frames is what the upload contains.
 */

export interface Box { w: number; h: number }

export interface CropGeometry {
  box: Box;
  /** Display pixels per source pixel, after cover and zoom. */
  scale: number;
  display: Box;
  /** The pan, clamped so the photo always covers the box. */
  x: number;
  y: number;
}

/** Two source pixels the `original` crop may never exceed — the picker's own 1:2–2:1 window. */
const MAX_SIDE = 2;

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The crop frame: the largest rectangle of this aspect inside a `square × square` area. */
export function cropBox(aspect: number, square: number): Box {
  return aspect >= 1 ? { w: square, h: square / aspect } : { w: square * aspect, h: square };
}

/** Where the photo sits inside the box for a given crop state. */
export function geometry(image: SelectedImage, square: number): CropGeometry {
  const box = cropBox(aspectFor(image), square);
  const cover = Math.max(box.w / image.naturalWidth, box.h / image.naturalHeight);
  const scale = cover * clamp(image.crop.zoom, 1, 3);
  const display = { w: image.naturalWidth * scale, h: image.naturalHeight * scale };
  const maxX = Math.max(0, (display.w - box.w) / 2);
  const maxY = Math.max(0, (display.h - box.h) / 2);
  return { box, scale, display, x: clamp(image.crop.x, -maxX, maxX), y: clamp(image.crop.y, -maxY, maxY) };
}

/** The nominal side of the media square the crop maths is expressed against, in px. */
export const MEDIA_SQUARE = 520;

/** The crop frame as a percentage of the media square, so the layout needs no measurement. */
export function boxStyle(view: CropGeometry): { width: string; height: string } {
  return { width: `${(view.box.w / MEDIA_SQUARE) * 100}%`, height: `${(view.box.h / MEDIA_SQUARE) * 100}%` };
}

/** The photo's placement inside the crop frame, as a percentage of that frame. */
export function imageStyle(view: CropGeometry): { width: string; height: string; left: string; top: string } {
  return {
    width: `${(view.display.w / view.box.w) * 100}%`,
    height: `${(view.display.h / view.box.h) * 100}%`,
    left: `${(((view.box.w - view.display.w) / 2 + view.x) / view.box.w) * 100}%`,
    top: `${(((view.box.h - view.display.h) / 2 + view.y) / view.box.h) * 100}%`,
  };
}

/** The human name of a clamped panorama, e.g. "2:1". */
export function ratioName(aspect: number): string {
  if (Math.abs(aspect - MAX_SIDE) < 0.001) return '2:1';
  if (Math.abs(aspect - 1 / MAX_SIDE) < 0.001) return '1:2';
  return `${Math.round(aspect * 100) / 100}:1`;
}

/** The same crop state with a new shape, its pan re-clamped to the new frame's edges. */
export function withRatio(image: SelectedImage, ratio: CropRatio, square = MEDIA_SQUARE): CropState {
  const aspect = ratio === 'original' ? originalAspect(image) : ratio === '1:1' ? 1 : ratio === '4:5' ? 4 / 5 : 16 / 9;
  const box = cropBox(aspect, square);
  const cover = Math.max(box.w / image.naturalWidth, box.h / image.naturalHeight);
  const scale = cover * image.crop.zoom;
  const maxX = Math.max(0, (image.naturalWidth * scale - box.w) / 2);
  const maxY = Math.max(0, (image.naturalHeight * scale - box.h) / 2);
  return { ...image.crop, ratio, x: clamp(image.crop.x, -maxX, maxX), y: clamp(image.crop.y, -maxY, maxY) };
}

/**
 * Renders one framed photo to a file, in the browser, at the crop's own aspect.
 *
 * GIFs are returned untouched, so an animation is not reduced to its first frame. Everything else
 * goes through a canvas at the original format, 0.92 quality and a 2048px longest side, and is
 * never upscaled past its source — a small photo stays small rather than becoming a soft large one.
 */
export async function renderCroppedFile(image: SelectedImage, maxSide = 2048, quality = 0.92): Promise<File> {
  if (image.file.type === 'image/gif') return image.file;
  const view = geometry(image, 1000);
  const srcW = view.box.w / view.scale;
  const srcH = view.box.h / view.scale;
  const srcX = image.naturalWidth / 2 - srcW / 2 - view.x / view.scale;
  const srcY = image.naturalHeight / 2 - srcH / 2 - view.y / view.scale;
  const aspect = view.box.w / view.box.h;
  let outW = Math.round(aspect >= 1 ? maxSide : maxSide * aspect);
  let outH = Math.round(aspect >= 1 ? maxSide / aspect : maxSide);
  outW = Math.max(1, Math.min(outW, Math.round(srcW)));
  outH = Math.max(1, Math.min(outH, Math.round(srcH)));

  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(image.file); } catch { return image.file; }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const context = canvas.getContext('2d');
    if (!context) return image.file;
    context.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    const type = image.file.type === 'image/jpeg' ? 'image/jpeg' : image.file.type === 'image/webp' ? 'image/webp' : 'image/png';
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
    if (!blob) return image.file;
    const ext = type === 'image/jpeg' ? '.jpg' : type === 'image/webp' ? '.webp' : '.png';
    const stem = image.file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${stem}${ext}`, { type, lastModified: image.file.lastModified });
  } finally {
    bitmap.close?.();
  }
}

/**
 * The crop step's interaction: drag to pan, wheel and pinch to zoom, arrow keys to nudge four
 * pixels, and the slider or `+`/`-` to zoom. Every change is reported through `onChange`, so the
 * shell keeps the crop state and a photo keeps its framing as the reader moves between steps.
 */
export function useCropper(image: SelectedImage, square: number, onChange: (crop: SelectedImage['crop']) => void) {
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clampPan = useCallback((nextX: number, nextY: number, zoom = image.crop.zoom) => {
    const box = cropBox(aspectFor(image), square);
    const cover = Math.max(box.w / image.naturalWidth, box.h / image.naturalHeight);
    const scale = cover * clamp(zoom, 1, 3);
    const maxX = Math.max(0, (image.naturalWidth * scale - box.w) / 2);
    const maxY = Math.max(0, (image.naturalHeight * scale - box.h) / 2);
    return { x: clamp(nextX, -maxX, maxX), y: clamp(nextY, -maxY, maxY) };
  }, [image, square]);

  const pan = useCallback((dx: number, dy: number) => {
    onChange({ ...image.crop, ...clampPan(image.crop.x + dx, image.crop.y + dy) });
  }, [clampPan, image.crop, onChange]);

  const nudge = useCallback((dx: number, dy: number) => pan(dx, dy), [pan]);

  const zoomTo = useCallback((zoom: number) => {
    const next = clamp(zoom, 1, 3);
    onChange({ ...image.crop, zoom: next, ...clampPan(image.crop.x, image.crop.y, next) });
  }, [clampPan, image.crop, onChange]);

  const setRatio = useCallback((ratio: CropRatio) => onChange(withRatio(image, ratio, square)), [image, square, onChange]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: image.crop.x, panY: image.crop.y };
    setDragging(true);
  }, [image.crop.x, image.crop.y]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!drag.current) return;
    const next = clampPan(drag.current.panX + (event.clientX - drag.current.x), drag.current.panY + (event.clientY - drag.current.y));
    onChange({ ...image.crop, ...next });
  }, [clampPan, image.crop, onChange]);

  const onPointerUp = useCallback(() => { drag.current = null; setDragging(false); }, []);

  // A wheel (or a trackpad pinch, which arrives as a wheel with `ctrlKey`) steps the zoom.
  const onWheel = useCallback((event: React.WheelEvent) => { zoomTo(image.crop.zoom + (event.deltaY < 0 ? 0.1 : -0.1)); }, [image.crop.zoom, zoomTo]);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    pinch.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: image.crop.zoom };
    drag.current = null;
    setDragging(false);
  }, [image.crop.zoom]);

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (!pinch.current || event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    zoomTo(pinch.current.zoom * (distance / pinch.current.distance));
  }, [zoomTo]);

  const onTouchEnd = useCallback(() => { pinch.current = null; }, []);

  // The keyboard contract the media area advertises: four pixels an arrow, `+`/`-` to zoom.
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); nudge(-4, 0); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); nudge(4, 0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); nudge(0, -4); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); nudge(0, 4); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTo(image.crop.zoom + 0.1); }
    else if (event.key === '-') { event.preventDefault(); zoomTo(image.crop.zoom - 0.1); }
  }, [image.crop.zoom, nudge, zoomTo]);

  return { dragging, pan, nudge, zoomTo, setRatio, onPointerDown, onPointerMove, onPointerUp, onWheel, onTouchStart, onTouchMove, onTouchEnd, onKeyDown };
}

