import { LARGE_WIDTH, isImageType } from './mediaLimits';

const JPEG_QUALITY = 0.85;

export const CROP_PRESETS = [
  { id: 'square', label: '1:1', ratio: 1 },
  { id: 'portrait', label: '4:5', ratio: 4 / 5 },
  { id: 'landscape', label: '16:9', ratio: 16 / 9 },
  { id: 'original', label: 'Original', ratio: null },
] as const;

export async function cropToAspect(file: File, ratio?: number | null): Promise<File> {
  if (!ratio || !isImageType(file.type) || file.type === 'image/gif') return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }

  try {
    const { width, height } = bitmap;
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
