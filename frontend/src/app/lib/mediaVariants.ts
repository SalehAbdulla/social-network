import { LARGE_WIDTH, THUMB_WIDTH } from './mediaLimits';

const MEDIA_PREFIX = '/api/v1/media/';

export function mediaVariant(url: string, size: 'thumb' | 'large'): string {
  if (!url || !url.startsWith(MEDIA_PREFIX)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}size=${size}`;
}

export function mediaImageProps(url: string, sizes: string) {
  const srcSet = `${mediaVariant(url, 'thumb')} ${THUMB_WIDTH}w, ${mediaVariant(url, 'large')} ${LARGE_WIDTH}w`;
  if (!url.startsWith(MEDIA_PREFIX)) return { src: url };
  return { src: mediaVariant(url, 'large'), srcSet, sizes };
}
