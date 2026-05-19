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

async function fetchOnce(target, userAgent, headersFor) {
  const res = await fetch(target, {
    headers: headersFor(userAgent),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  if (ab.byteLength <= 0 || ab.byteLength > 25 * 1024 * 1024) return null;
  const headerMime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!looksLikeImageBytes(ab, headerMime)) return null;
  let mime = headerMime.startsWith("image/") ? headerMime : null;
  if (!mime) mime = sniffImageMimeFromBytes(ab);
  if (!mime) return null;
  return `data:${mime};base64,${Buffer.from(ab).toString("base64")}`;
}

export async function fetchRemoteImageDataUrl(imageUrl, userAgent = "AutoSlideshow/1.0") {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const target = imageUrl.trim();
  if (!target) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const headersFor of FETCH_HEADER_STRATEGIES) {
      try {
        const dataUrl = await fetchOnce(target, userAgent, headersFor);
        if (dataUrl) return dataUrl;
      } catch {
        /* try next */
      }
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  return null;
}
