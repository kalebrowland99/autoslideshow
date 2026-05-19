/**
 * Browser-side Numista catalogue images via same-origin /api/numista-image proxy.
 * Do not use mode=redirect with crossOrigin — Numista does not send CORS headers.
 */

const NUMISTA_HOST_RE = /(^|\.)numista\.com$/i;

/** @param {string} url */
export function isNumistaCatalogueUrl(url) {
  const s = String(url || "").trim();
  if (!s || !/^https?:\/\//i.test(s)) return false;
  try {
    return NUMISTA_HOST_RE.test(new URL(s).hostname);
  } catch {
    return false;
  }
}

/**
 * Same-origin proxy URL for img/canvas (streams bytes, no redirect).
 * @param {string} remoteUrl
 */
export function numistaImageProxyUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u || !isNumistaCatalogueUrl(u)) return "";
  return `/api/numista-image?${new URLSearchParams({ url: u }).toString()}`;
}

/**
 * Safe src for React img — data URLs pass through, Numista URLs use the proxy.
 * @param {string | null | undefined} url
 */
export function catalogueImageSrc(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("data:image/")) return s;
  if (s.startsWith("/api/numista-image")) return s;
  if (isNumistaCatalogueUrl(s)) return numistaImageProxyUrl(s);
  return s;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read image blob"));
    r.readAsDataURL(blob);
  });
}

/**
 * @param {string} remoteUrl
 * @returns {Promise<string>} data URL or ""
 */
export async function loadNumistaImageAsDataUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  if (u.startsWith("data:image/")) return u;

  const proxy = isNumistaCatalogueUrl(u) ? numistaImageProxyUrl(u) : "";
  const attempts = [proxy, proxy ? `${proxy}&format=json` : ""].filter(Boolean);

  for (let i = 0; i < 3; i++) {
    for (const endpoint of attempts) {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        if (!res.ok) continue;
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/json")) {
          const j = await res.json().catch(() => ({}));
          if (typeof j.imageDataUrl === "string" && j.imageDataUrl.startsWith("data:image/")) {
            return j.imageDataUrl;
          }
          continue;
        }
        const blob = await res.blob();
        if (blob.size > 0 && (blob.type.startsWith("image/") || blob.size > 200)) {
          const dataUrl = await blobToDataUrl(blob);
          if (dataUrl.startsWith("data:image/")) return dataUrl;
        }
      } catch {
        /* retry */
      }
    }
    await new Promise((r) => setTimeout(r, 120 * (i + 1)));
  }
  return "";
}

/**
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<{ dataUrl: string, title: string, typeId: number | null } | null>}
 */
export async function fetchRandomNumistaCoin(signal) {
  try {
    const res = await fetch("/api/numista-coins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ action: "randomPhoto" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const resolved = await resolveNumistaCoinResponse(data);
    if (!resolved.dataUrl) return null;
    return resolved;
  } catch {
    return null;
  }
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
    dataUrl: clientData,
    title,
    typeId: Number.isFinite(typeId) ? typeId : null,
  };
}
