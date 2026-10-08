import { LARGE_WIDTH, isImageType } from './mediaLimits';


const JPEG_QUALITY = 0.85;

export async function prepareUpload(file: File): Promise<File> {
  if (!isImageType(file.type)) return file;
  if (file.type === 'image/gif') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
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
    const stem = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${stem}${type === 'image/jpeg' ? '.jpg' : '.png'}`, { type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
