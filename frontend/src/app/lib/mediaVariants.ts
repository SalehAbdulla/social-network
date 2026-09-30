/**
 * The smaller versions of an upload, and which one an `<img>` should ask for.
 *
 * The server keeps two derivatives of every image it can resize (see `pkg/media`): a
 * `?size=thumb` at 480 px and a `?size=large` at 1600 px, both caps rather than exact
 * sizes. A media URL therefore answers three pictures without its path changing, which
 * is what makes `srcset` possible here at all: every URL stored in a post, comment,
 * story, message or avatar row is still the same URL.
 *
 * An upload narrower than a cap, a GIF that has to keep its animation and a video all
 * have no such derivative, and the server answers with the original instead. That is why
 * naming both candidates is safe for any upload, and why an old row needs no migration:
 * the worst case is a download that is bigger than it had to be.
 */
import { LARGE_WIDTH, THUMB_WIDTH } from './mediaLimits';

const MEDIA_PREFIX = '/api/v1/media/';

/**
 * The size on its own, for the callers that want one particular picture rather than a
 * choice — a lightbox, say, which is deliberately the whole thing.
 */
export function mediaVariant(url: string, size: 'thumb' | 'large'): string {
  // Anything that is not this application's media — a blob preview from the picker, a
  // data URL, an avatar someone pasted in — is returned untouched, so a caller that is
  // not sure cannot corrupt an image by asking.
  if (!url || !url.startsWith(MEDIA_PREFIX)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}size=${size}`;
}

/**
 * What an `<img>` needs for one upload: a fallback `src` for a browser without `srcset`,
 * the two candidates, and the layout width so the browser can pick between them.
 *
 * `sizes` is the caller's business because only the caller knows how wide the picture is
 * drawn — a 40 px avatar and a full-width feed card want different candidates out of the
 * same pair. The descriptors are the caps, which is honest for every image wider than
 * them and slightly generous for a narrower one, where the browser will simply pick the
 * original that the server answers with.
 */
export function mediaImageProps(url: string, sizes: string) {
  const srcSet = `${mediaVariant(url, 'thumb')} ${THUMB_WIDTH}w, ${mediaVariant(url, 'large')} ${LARGE_WIDTH}w`;
  if (!url.startsWith(MEDIA_PREFIX)) return { src: url };
  return { src: mediaVariant(url, 'large'), srcSet, sizes };
}
