import { LARGE_WIDTH, isImageType } from './mediaLimits';

/**
 * Shrinking a photo in the browser before it is uploaded.
 *
 * The cap is the server's `large` derivative rather than a new number: that is the
 * version a viewer actually asks for (`mediaVariants`), so an original larger than it
 * is bytes nobody requests — they cost the phone's uplink and the disk and buy
 * nothing. Reusing `LARGE_WIDTH` also means the figure is already held to `pkg/media`
 * by `media_limits_test.go`, so this file adds nothing to keep in step.
 *
 * Nothing here is required for an upload to work. A file at or under the cap, a GIF,
 * a format the browser cannot decode, a canvas that will not give up a blob — every
 * one of them is returned or falls back to the original, because the worst case of a
 * missing optimisation is a bigger upload, while the worst case of a broken one is a
 * post that cannot be published.
 */

/** JPEG at this quality, which is the usual invisible-loss compromise. */
const JPEG_QUALITY = 0.85;

/**
 * The file to upload: the original, or a re-encoded copy no larger than the cap.
 *
 * The encoding mirrors `pkg/media`: a JPEG source becomes a JPEG, because photographs
 * are what JPEG is for, and everything else becomes a PNG so an alpha channel
 * survives. The server made the same choice for its derivatives, and a transparent
 * avatar run through a JPEG encoder comes out as a black box.
 */
export async function prepareUpload(file: File): Promise<File> {
  if (!isImageType(file.type)) return file;
  // A GIF may be animated, and a still frame of an animation is a different picture
  // rather than a smaller one — the reason `pkg/media` writes no derivative of one.
  if (file.type === 'image/gif') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // An image this browser cannot decode is still worth sending: the server sniffs
    // the bytes itself and is the authority on what it will accept.
    return file;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= LARGE_WIDTH) return file;

    const scale = LARGE_WIDTH / longest;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, JPEG_QUALITY));
    if (!blob) return file;
    // The extension follows the encoding, so the name does not claim a format the
    // bytes are not — which is also what the server would report from sniffing them.
    const stem = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${stem}${type === 'image/jpeg' ? '.jpg' : '.png'}`, { type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
