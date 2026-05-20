/**
 * Random coin photos for Valcoin slides.
 *
 * Primary source: Wikimedia Commons (no API key, no Cloudflare bot block,
 * served from upload.wikimedia.org with `Access-Control-Allow-Origin: *`
 * so the browser can fetch bytes directly and canvas exports are not
 * tainted).
 *
 * The `numista*` symbols and the `/api/numista-image` proxy remain for
 * backwards compatibility with saved shows that still reference Numista
 * URLs — Numista images are routed through Vercel's `/_next/image` which
 * runs on a different edge tier than serverless functions and is not
 * subject to the same Cloudflare blocking.
 */

const NUMISTA_HOST = /^https:\/\/([a-z]{2}\.)?numista\.com\//i;
const WIKIMEDIA_HOST = /^https:\/\/upload\.wikimedia\.org\//i;
const NEXT_IMAGE_WIDTHS = [640, 750, 828, 1080, 1200];

export function isNumistaCatalogueUrl(url) {
  return NUMISTA_HOST.test(String(url || "").trim());
}

export function isWikimediaUploadUrl(url) {
  return WIKIMEDIA_HOST.test(String(url || "").trim());
}

/** Vercel Image Optimization URL — same-origin, runs on Vercel image edge. */
export function nextImageProxyUrl(remoteUrl, { width = 1080, quality = 85 } = {}) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  const safeW = NEXT_IMAGE_WIDTHS.includes(width) ? width : 1080;
  const safeQ = Math.max(1, Math.min(100, Math.floor(quality)));
  const q = new URLSearchParams({ url: u, w: String(safeW), q: String(safeQ) });
  return `/_next/image?${q.toString()}`;
}

/** Safe <img src> for preview. Wikimedia URLs are CORS-friendly — pass through. */
export function numistaDisplaySrc(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("/")) return s;
  if (typeof window !== "undefined") {
    try {
      if (new URL(s, window.location.href).origin === window.location.origin) return s;
    } catch {
      /* ignore */
    }
  }
  if (isWikimediaUploadUrl(s)) return s;
  if (isNumistaCatalogueUrl(s)) return nextImageProxyUrl(s);
  return s;
}

/** Legacy same-origin proxy (Numista fallback only). */
export function numistaImageProxyUrl(remoteUrl, { mode = "raw" } = {}) {
  const u = String(remoteUrl || "").trim();
  if (!u || !isNumistaCatalogueUrl(u)) return "";
  const q = new URLSearchParams({ url: u, mode });
  return `/api/numista-image?${q.toString()}`;
}

async function blobToDataUrl(blob) {
  if (!blob?.type?.startsWith("image/")) return "";
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });
}

/** Direct CORS-friendly fetch (works for Wikimedia upload.wikimedia.org). */
async function fetchDirectDataUrl(remoteUrl) {
  try {
    const res = await fetch(remoteUrl, { mode: "cors", credentials: "omit" });
    if (!res.ok) return "";
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    return dataUrl.startsWith("data:image/") ? dataUrl : "";
  } catch {
    return "";
  }
}

async function fetchNumistaProxyJsonDataUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  try {
    const proxy = `/api/numista-image?${new URLSearchParams({ url: u }).toString()}`;
    const res = await fetch(proxy);
    const data = await res.json().catch(() => ({}));
    const fromJson = typeof data?.imageDataUrl === "string" ? data.imageDataUrl.trim() : "";
    if (fromJson.startsWith("data:image/")) return fromJson;
  } catch {
    /* fall through */
  }
  return "";
}

async function fetchNumistaProxyRawDataUrl(remoteUrl) {
  const proxy = numistaImageProxyUrl(remoteUrl, { mode: "raw" });
  if (!proxy) return "";
  try {
    const res = await fetch(proxy);
    if (!res.ok) return "";
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    return dataUrl.startsWith("data:image/") ? dataUrl : "";
  } catch {
    return "";
  }
}

async function fetchNextImageDataUrl(remoteUrl) {
  const proxy = nextImageProxyUrl(remoteUrl);
  if (!proxy) return "";
  try {
    const res = await fetch(proxy);
    if (!res.ok) return "";
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    return dataUrl.startsWith("data:image/") ? dataUrl : "";
  } catch {
    return "";
  }
}

/**
 * @param {string} remoteUrl
 * @returns {Promise<string>} data URL or ""
 */
export async function loadNumistaImageAsDataUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  if (u.startsWith("data:image/")) return u;

  if (isWikimediaUploadUrl(u)) {
    return await fetchDirectDataUrl(u);
  }

  if (isNumistaCatalogueUrl(u)) {
    const fromNextImage = await fetchNextImageDataUrl(u);
    if (fromNextImage.startsWith("data:image/")) return fromNextImage;

    const fromRaw = await fetchNumistaProxyRawDataUrl(u);
    if (fromRaw.startsWith("data:image/")) return fromRaw;

    const fromJson = await fetchNumistaProxyJsonDataUrl(u);
    if (fromJson.startsWith("data:image/")) return fromJson;
  }

  return "";
}

/**
 * Fetch a random United-States coin photo. Backed by Wikimedia Commons.
 * Keeps the historical `Numista` name so existing callers don't need to change.
 *
 * `excludeSourceUrls` lets the caller skip coins it has already accepted in
 * this slideshow so the 6 slots don't collide. Browser/HTTP cache cannot
 * affect this because the API route is dynamic + `Cache-Control: no-store`
 * and POST responses are never cached, but we still send `cache: "no-store"`
 * defensively.
 *
 * @param {AbortSignal | undefined} signal
 * @param {{ maxAttempts?: number, excludeSourceUrls?: Iterable<string> }} [opts]
 * @returns {Promise<{ dataUrl: string, title: string, typeId: number | null, sourceUrl: string } | null>}
 */
export async function fetchRandomNumistaCoin(
  signal,
  { maxAttempts = 3, excludeSourceUrls } = {},
) {
  const excludeSet = new Set();
  if (excludeSourceUrls) {
    for (const u of excludeSourceUrls) if (typeof u === "string" && u) excludeSet.add(u);
  }
  let lastDiagnostic = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch("/api/wikimedia-coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        cache: "no-store",
        body: JSON.stringify({ action: "randomPhoto", nonce: Math.random() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastDiagnostic = data;
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[coin-photo] wikimedia upstream error", {
            httpStatus: res.status,
            ...data,
          });
        }
        continue;
      }
      const sourceUrl = typeof data?.sourceUrl === "string" ? data.sourceUrl : data?.imageUrl;
      if (sourceUrl && excludeSet.has(sourceUrl)) {
        lastDiagnostic = { stage: "duplicate", sourceUrl };
        continue;
      }
      const resolved = await resolveNumistaCoinResponse(data);
      if (resolved.dataUrl.startsWith("data:image/")) {
        return { ...resolved, sourceUrl: sourceUrl || "" };
      }
      lastDiagnostic = { stage: "image-load", imageUrl: data?.imageUrl };
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[coin-photo] image fetch failed for", data?.imageUrl);
      }
    } catch (e) {
      lastDiagnostic = { stage: "fetch", error: String(e?.message || e) };
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[coin-photo] wikimedia fetch threw", e);
      }
    }
  }
  if (lastDiagnostic && typeof console !== "undefined" && console.error) {
    console.error(
      "[coin-photo] gave up after",
      maxAttempts,
      "attempts. Last:",
      lastDiagnostic,
    );
  }
  return null;
}

/**
 * @param {{ imageDataUrl?: string, imageUrl?: string, title?: string, typeId?: number | null }} data
 * @returns {Promise<{ dataUrl: string, title: string, typeId: number | null }>}
 */
export async function resolveNumistaCoinResponse(data) {
  const title = String(data?.title || "").trim();
  const typeId = data?.typeId != null ? Number(data.typeId) : null;
  const serverData = typeof data?.imageDataUrl === "string" ? data.imageDataUrl.trim() : "";
  if (serverData.startsWith("data:image/")) {
    return { dataUrl: serverData, title, typeId: Number.isFinite(typeId) ? typeId : null };
  }

  const remote = String(data?.imageUrl || "").trim();
  if (!remote) return { dataUrl: "", title, typeId: Number.isFinite(typeId) ? typeId : null };

  const clientData = await loadNumistaImageAsDataUrl(remote);
  return {
    dataUrl: clientData.startsWith("data:image/") ? clientData : "",
    title,
    typeId: Number.isFinite(typeId) ? typeId : null,
  };
}
