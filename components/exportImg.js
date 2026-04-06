/**
 * Use on slide <img> so canvas-based capture can read pixels for remote URLs
 * (requires CORS headers on the image host). Omit for data: and blob: URLs.
 */
export function exportImgCrossOrigin(src) {
  if (!src || typeof src !== "string") return undefined;
  return /^https?:\/\//i.test(src) ? "anonymous" : undefined;
}
