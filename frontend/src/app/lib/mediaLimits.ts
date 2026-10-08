
export const MAX_IMAGE_BYTES = 10485760;

export const MAX_VIDEO_BYTES = 52428800;

export const MAX_IMAGE_PIXELS = 40000000;

export const MAX_ATTACHMENTS = 4;

export const THUMB_WIDTH = 480;
export const LARGE_WIDTH = 1600;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm'];

export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');
export const MEDIA_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(',');

export function isImageType(type: string): boolean {
  return IMAGE_TYPES.includes(type);
}

export function isVideoType(type: string): boolean {
  return VIDEO_TYPES.includes(type);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${oneDecimal(bytes / 1024)} KB`;
  return `${oneDecimal(bytes / 1048576)} MB`;
}

function oneDecimal(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

export function oversizeMessage(file: File): string {
  const video = isVideoType(file.type);
  const limit = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  return `${video ? 'Video' : 'Image'} is ${formatBytes(file.size)}; the limit is ${formatBytes(limit)}.`;
}
