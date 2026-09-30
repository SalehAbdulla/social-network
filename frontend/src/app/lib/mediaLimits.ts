/**
 * The upload limits, in one place for the browser.
 *
 * The same ceilings live in `backend/pkg/app/handlers/MediaHandler.go` (file bytes
 * and decoded canvas) and `CommentHandler.go` (attachments), and
 * `backend/pkg/app/handlers/media_limits_test.go` reads *this* file and compares
 * the two, so a number can only be changed on both sides: the copy that is left
 * behind fails that check by name. Before this module the ceilings were typed out
 * three times — in the picker, again in `api/social.ts`, and again on the server —
 * which is how the composer came to explain a limit the uploader disagreed with.
 *
 * The values are written as plain byte counts rather than as expressions such as
 * `10 * 1024 * 1024` so the Go check can read them without evaluating anything.
 */

/** 10 MiB — the image ceiling, and the one the composer can still check locally. */
export const MAX_IMAGE_BYTES = 10485760;

/** 50 MiB — the video ceiling, and the hard ceiling for every upload. */
export const MAX_VIDEO_BYTES = 52428800;

/** 40 megapixels — the decoded-canvas ceiling that stops a decompression bomb. */
export const MAX_IMAGE_PIXELS = 40000000;

/**
 * Four attachments. A comment is capped at this on the server
 * (`maxCommentImages`); the post cap is the composer's own rule, because the
 * server counts nothing there and stores whatever URLs it is handed.
 */
export const MAX_ATTACHMENTS = 4;

/**
 * The two derivatives the server keeps for an image upload, in pixels of width:
 * `?size=thumb` and `?size=large` on a media URL. The server never upscales, so an
 * upload narrower than a cap has no such derivative and answers with the original —
 * which is why `srcset` may name both without knowing anything about the file.
 *
 * `media_limits_test.go` holds these two numbers against the Go constants in
 * `pkg/media`, so a cap changed on one side fails the other side's test by name.
 */
export const THUMB_WIDTH = 480;
export const LARGE_WIDTH = 1600;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm'];

/** The `accept` attribute for a file input, built from the two lists above. */
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');
export const MEDIA_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(',');

export function isImageType(type: string): boolean {
  return IMAGE_TYPES.includes(type);
}

export function isVideoType(type: string): boolean {
  return VIDEO_TYPES.includes(type);
}

/**
 * Bytes as a person reads them: "68 B", "1.2 KB", "12.4 MB". One decimal place
 * above bytes, which is the precision a limit discussion needs.
 *
 * The backend has its own copy of this rule for the message a refused upload earns
 * (`humanBytes` in `MediaHandler.go`). The drift check compares the *limits* on the
 * two sides, not the wording, so the two formatters are deliberately independent —
 * a shared one would mean generating one language from the other.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${oneDecimal(bytes / 1024)} KB`;
  return `${oneDecimal(bytes / 1048576)} MB`;
}

/** One decimal place, without a trailing `.0`: 10 MB, not 10.0 MB. */
function oneDecimal(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

/**
 * The sentence a file that is too big earns, naming its own size and the ceiling it
 * met: "Image is 12.4 MB; the limit is 10 MB." The same sentence is thrown by
 * `upload()` and shown by the picker, so a rejection reads the same wherever it is
 * noticed, and it is what the toast shows verbatim.
 */
export function oversizeMessage(file: File): string {
  const video = isVideoType(file.type);
  const limit = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  return `${video ? 'Video' : 'Image'} is ${formatBytes(file.size)}; the limit is ${formatBytes(limit)}.`;
}
