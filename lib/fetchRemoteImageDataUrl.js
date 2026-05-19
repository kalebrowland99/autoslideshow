import { sniffImageMimeFromBytes } from "@/lib/openFoodFactsProductImage";

/**
 * Download a remote image and return a data URL (for same-origin export / canvas).
 * @param {string} imageUrl
 * @param {string} [userAgent]
 * @returns {Promise<string | null>}
 */
export async function fetchRemoteImageDataUrl(imageUrl, userAgent = "AutoSlideshow/1.0") {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const res = await fetch(imageUrl.trim(), {
    headers: { "User-Agent": userAgent },
  });
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  if (ab.byteLength <= 0 || ab.byteLength > 25 * 1024 * 1024) return null;
  const headerMime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  let mime = headerMime.startsWith("image/") ? headerMime : null;
  if (!mime) mime = sniffImageMimeFromBytes(ab);
  if (!mime) return null;
  return `data:${mime};base64,${Buffer.from(ab).toString("base64")}`;
}
