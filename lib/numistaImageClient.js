/**
 * Browser-side Numista catalogue images. Use same-origin /api/numista-image so
 * export (html-to-image / canvas) never fetches en.numista.com directly (CORS).
 */

export function numistaImageProxyUrl(remoteUrl, { redirect = false, raw = false } = {}) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  const q = new URLSearchParams({ url: u });
  if (raw) q.set("mode", "raw");
  else if (redirect) q.set("mode", "redirect");
  return `/api/numista-image?${q.toString()}`;
}

function isNumistaCatalogueUrl(url) {
  return /^https:\/\/([a-z]{2}\.)?numista\.com\//i.test(String(url || "").trim());
}

async function fetchNumistaImageDataUrlFromApi(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u || !isNumistaCatalogueUrl(u)) return "";

  try {
    const res = await fetch(`/api/numista-image?${new URLSearchParams({ url: u })}`);
    const data = await res.json().catch(() => ({}));
    const dataUrl = typeof data?.imageDataUrl === "string" ? data.imageDataUrl.trim() : "";
    if (res.ok && dataUrl.startsWith("data:image/")) return dataUrl;
  } catch {
    /* try raw */
  }

  try {
    const res = await fetch(numistaImageProxyUrl(u, { raw: true }));
    if (!res.ok) return "";
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return "";
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read failed"));
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

function imageElementToDataUrl(src, { crossOrigin = true } = {}) {
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

/**
 * @param {string} remoteUrl
 * @returns {Promise<string>} data URL or ""
 */
export async function loadNumistaImageAsDataUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  if (u.startsWith("data:image/")) return u;

  const fromApi = await fetchNumistaImageDataUrlFromApi(u);
  if (fromApi.startsWith("data:image/")) return fromApi;

  const attempts = [
    [numistaImageProxyUrl(u, { raw: true }), true],
    [u, true],
  ];
  for (const [src, cors] of attempts) {
    try {
      const dataUrl = await imageElementToDataUrl(src, { crossOrigin: cors });
      if (dataUrl.startsWith("data:image/")) return dataUrl;
    } catch {
      /* try next */
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
