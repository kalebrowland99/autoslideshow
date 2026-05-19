/**
 * Browser-side Numista catalogue images.
 * Same-origin byte proxy avoids redirect + CORS failures on en.numista.com.
 */

const NUMISTA_HOST = /^https:\/\/([a-z]{2}\.)?numista\.com\//i;

export function isNumistaCatalogueUrl(url) {
  return NUMISTA_HOST.test(String(url || "").trim());
}

/** Same-origin proxy URL (streams bytes; never use redirect — that triggers CORS). */
export function numistaImageProxyUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u || u.startsWith("data:") || u.startsWith("/")) return u;
  if (!isNumistaCatalogueUrl(u)) return u;
  return `/api/numista-image?${new URLSearchParams({ url: u })}`;
}

/**
 * For &lt;img src&gt; preview: use the catalogue URL directly (no crossOrigin).
 * Export paths must use data URLs from {@link loadNumistaImageAsDataUrl}.
 */
export function displayImageSrc(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("/")) return u;
  if (isNumistaCatalogueUrl(u)) return u;
  return u;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read image blob"));
    r.readAsDataURL(blob);
  });
}

function imageElementToDataUrl(src, { crossOrigin = false } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("No 2d context");
        ctx.drawImage(img, 0, 0);
        const out = c.toDataURL("image/jpeg", 0.92);
        if (!out?.startsWith("data:image/")) throw new Error("Canvas export failed");
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

async function fetchProxyAsDataUrl(proxyUrl) {
  const res = await fetch(proxyUrl, { credentials: "same-origin" });
  if (!res.ok) return "";
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.startsWith("image/")) {
    const blob = await res.blob();
    if (blob.size > 0) {
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.startsWith("data:image/")) return dataUrl;
    }
  }
  if (ct.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    const server = typeof data.imageDataUrl === "string" ? data.imageDataUrl.trim() : "";
    if (server.startsWith("data:image/")) return server;
  }
  return "";
}

/**
 * @param {string} remoteUrl
 * @returns {Promise<string>} data URL or ""
 */
export async function loadNumistaImageAsDataUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  if (u.startsWith("data:image/")) return u;

  const proxy = numistaImageProxyUrl(u);
  if (proxy !== u) {
    try {
      const fromStream = await fetchProxyAsDataUrl(proxy);
      if (fromStream.startsWith("data:image/")) return fromStream;
    } catch {
      /* fall through */
    }
    try {
      const jsonUrl = `${proxy}${proxy.includes("?") ? "&" : "?"}format=json`;
      const fromJson = await fetchProxyAsDataUrl(jsonUrl);
      if (fromJson.startsWith("data:image/")) return fromJson;
    } catch {
      /* fall through */
    }
  }

  if (isNumistaCatalogueUrl(u)) {
    try {
      const direct = await imageElementToDataUrl(u, { crossOrigin: false });
      if (direct.startsWith("data:image/")) return direct;
    } catch {
      /* fall through */
    }
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
    if (!resolved.dataUrl?.startsWith("data:image/")) return null;
    return resolved;
  } catch {
    return null;
  }
}

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
