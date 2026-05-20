/**
 * Numista catalogue images load via wsrv.nl (free public image proxy).
 * Vercel function IPs are often throttled/blocked by Cloudflare in front of
 * en.numista.com, so server-side downloads are unreliable. wsrv.nl has its own
 * IP ranges, returns CORS=* headers, and is purpose-built for hot-linking.
 * The same-origin /api/numista-image proxy remains a fallback.
 */

const NUMISTA_HOST = /^https:\/\/([a-z]{2}\.)?numista\.com\//i;
const WSRV_BASE = "https://wsrv.nl/";

export function isNumistaCatalogueUrl(url) {
  return NUMISTA_HOST.test(String(url || "").trim());
}

/** Public CORS-friendly image proxy. wsrv takes URL without protocol. */
export function wsrvProxyUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u || !isNumistaCatalogueUrl(u)) return "";
  return `${WSRV_BASE}?url=${encodeURIComponent(u.replace(/^https?:\/\//i, ""))}`;
}

/** Safe <img src> for preview: data URLs as-is, Numista HTTPS → wsrv.nl. */
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
  if (isNumistaCatalogueUrl(s)) return wsrvProxyUrl(s) || numistaImageProxyUrl(s, { mode: "raw" });
  return s;
}

/** Same-origin proxy URL (fallback when wsrv.nl is blocked / unavailable). */
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

async function fetchWsrvDataUrl(remoteUrl) {
  const proxy = wsrvProxyUrl(remoteUrl);
  if (!proxy) return "";
  try {
    const res = await fetch(proxy, { mode: "cors", credentials: "omit" });
    if (!res.ok) return "";
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    return dataUrl.startsWith("data:image/") ? dataUrl : "";
  } catch {
    return "";
  }
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

/**
 * @param {string} remoteUrl
 * @returns {Promise<string>} data URL or ""
 */
export async function loadNumistaImageAsDataUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  if (u.startsWith("data:image/")) return u;

  const fromWsrv = await fetchWsrvDataUrl(u);
  if (fromWsrv.startsWith("data:image/")) return fromWsrv;

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
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch("/api/numista-coins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ action: "randomPhoto" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) continue;
      const resolved = await resolveNumistaCoinResponse(data);
      if (resolved.dataUrl.startsWith("data:image/")) return resolved;
    } catch {
      /* try next */
    }
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
