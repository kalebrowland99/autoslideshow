import { sniffImageMimeFromBytes } from "@/lib/openFoodFactsProductImage";

/**
 * Download a remote image and return a data URL (for same-origin export / canvas).
 * @param {string} imageUrl
 * @param {string} [userAgent]
 * @returns {Promise<string | null>}
 */
const FETCH_MS = 20_000;

const FETCH_HEADER_STRATEGIES = [
  (ua) => ({ "User-Agent": ua, Accept: "image/*,*/*;q=0.8" }),
  (ua) => ({
    "User-Agent": ua,
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    Referer: "https://en.numista.com/",
  }),
];

function looksLikeImageBytes(ab, headerMime) {
  if (!ab || ab.byteLength <= 0) return false;
  const ct = String(headerMime || "").toLowerCase();
  if (ct.includes("text/html") || ct.includes("application/json")) return false;
  if (ct.startsWith("image/")) return true;
  return Boolean(sniffImageMimeFromBytes(ab));
}

export async function fetchRemoteImageDataUrl(imageUrl, userAgent = "AutoSlideshow/1.0") {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const target = imageUrl.trim();
  if (!target) return null;

  for (const headersFor of FETCH_HEADER_STRATEGIES) {
    try {
      const res = await fetch(target, {
        headers: headersFor(userAgent),
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_MS),
      });
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      if (ab.byteLength <= 0 || ab.byteLength > 25 * 1024 * 1024) continue;
      const headerMime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!looksLikeImageBytes(ab, headerMime)) continue;
      let mime = headerMime.startsWith("image/") ? headerMime : null;
      if (!mime) mime = sniffImageMimeFromBytes(ab);
      if (!mime) continue;
      return `data:${mime};base64,${Buffer.from(ab).toString("base64")}`;
    } catch {
      /* try next strategy */
    }
  }
  return null;
}
