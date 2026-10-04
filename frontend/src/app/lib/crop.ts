import { LARGE_WIDTH, isImageType } from './mediaLimits';

/** JPEG at this quality, matching `downscale`'s choice for the capped upload. */
const JPEG_QUALITY = 0.85;

/**
 * The crop the picker offers, and the shape each one produces. `ratio` is width ÷ height;
 * `null` means "leave it alone", so the Original preset is the same file the reader chose.
 */
export const CROP_PRESETS = [
  { id: 'square', label: '1:1', ratio: 1 },
  { id: 'portrait', label: '4:5', ratio: 4 / 5 },
  { id: 'landscape', label: '16:9', ratio: 16 / 9 },
  { id: 'original', label: 'Original', ratio: null },
] as const;

/**
 * Crops a photo to `ratio` (width ÷ height), centred, in the browser.
 *
 * A centre crop rather than a draggable window: the rectangle is the largest of that shape
 * that fits inside the picture, so a square avatar keeps the middle of a landscape photo and
 * loses the sides — which is what a viewer already sees under `object-cover`. Nothing is ever
 * enlarged (a 400×300 file cropped to 16:9 is 400×225, not an upscaled lie), and the long edge
 * is capped at the server's `large` width for the same reason `downscale` caps it: a bigger
 * file is bytes nobody asks for.
 *
 * The failure contract is `downscale`'s, deliberately: an undecodable file, a canvas that will
 * not surrender a blob, a GIF (a still frame of an animation is a different picture), or
 * `ratio === null` all return the original, because a crop that cannot be done must not cost
 * the upload.
 */
export async function cropToAspect(file: File, ratio?: number | null): Promise<File> {
  if (!ratio || !isImageType(file.type) || file.type === 'image/gif') return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }

  try {
    const { width, height } = bitmap;
    // The largest rectangle of this aspect that fits, centred in the source.
    let cropWidth = width;
    let cropHeight = Math.round(width / ratio);
    if (cropHeight > height) {
      cropHeight = height;
      cropWidth = Math.round(height * ratio);
    }
    const sourceX = Math.round((width - cropWidth) / 2);
    const sourceY = Math.round((height - cropHeight) / 2);
    const scale = Math.min(1, LARGE_WIDTH / Math.max(cropWidth, cropHeight));
    const outWidth = Math.max(1, Math.round(cropWidth * scale));
    const outHeight = Math.max(1, Math.round(cropHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, sourceX, sourceY, cropWidth, cropHeight, 0, 0, outWidth, outHeight);

    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, JPEG_QUALITY));
    if (!blob) return file;
    const stem = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${stem}${type === 'image/jpeg' ? '.jpg' : '.png'}`, { type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
