/**
 * Numista's Cloudflare bot protection blocks Vercel serverless function IPs,
 * so our /api/numista-image proxy returns 502 in production. Vercel's built-in
 * Image Optimization (`/_next/image`) runs on a different edge tier with
 * different egress and follows the Numista 301 redirects transparently —
 * use it as the primary loader. Our /api/numista-image stays as a fallback.
 */

const NUMISTA_HOST = /^https:\/\/([a-z]{2}\.)?numista\.com\//i;
const NEXT_IMAGE_WIDTHS = [640, 750, 828, 1080, 1200];

export function isNumistaCatalogueUrl(url) {
  return NUMISTA_HOST.test(String(url || "").trim());
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

/** Safe <img src> for preview: data URLs as-is, Numista HTTPS → /_next/image. */
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
  if (isNumistaCatalogueUrl(s)) return nextImageProxyUrl(s);
  return s;
}

/** Legacy same-origin proxy (fallback when /_next/image fails). */
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

  const fromNextImage = await fetchNextImageDataUrl(u);
  if (fromNextImage.startsWith("data:image/")) return fromNextImage;

  const fromRaw = await fetchNumistaProxyRawDataUrl(u);
  if (fromRaw.startsWith("data:image/")) return fromRaw;

  const fromJson = await fetchNumistaProxyJsonDataUrl(u);
  if (fromJson.startsWith("data:image/")) return fromJson;

  return "";
}

/**
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<{ dataUrl: string, title: string, typeId: number | null } | null>}
 */
export async function fetchRandomNumistaCoin(signal, { maxAttempts = 4 } = {}) {
  let lastDiagnostic = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch("/api/numista-coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ action: "randomPhoto" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastDiagnostic = data;
        // Log full diagnostics so production failures are visible in the browser console.
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[numista] randomPhoto upstream error", {
            httpStatus: res.status,
            ...data,
          });
        }
        continue;
      }
      const resolved = await resolveNumistaCoinResponse(data);
      if (resolved.dataUrl.startsWith("data:image/")) return resolved;
      lastDiagnostic = { stage: "image-load", imageUrl: data?.imageUrl };
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[numista] image proxy failed for", data?.imageUrl);
      }
    } catch (e) {
      lastDiagnostic = { stage: "fetch", error: String(e?.message || e) };
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[numista] randomPhoto fetch threw", e);
      }
    }
  }
  if (lastDiagnostic && typeof console !== "undefined" && console.error) {
    console.error("[numista] gave up after", maxAttempts, "attempts. Last:", lastDiagnostic);
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
