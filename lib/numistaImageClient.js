/**
 * Browser-side Numista catalogue images. Vercel often cannot fetch en.numista.com
 * directly; loading via same-origin redirect lets the user's browser request the CDN.
 */

export function numistaImageProxyUrl(remoteUrl, { redirect = true } = {}) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  const q = new URLSearchParams({ url: u });
  if (redirect) q.set("mode", "redirect");
  return `/api/numista-image?${q.toString()}`;
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

  const attempts = [
    [numistaImageProxyUrl(u), true],
    [u, true],
    [numistaImageProxyUrl(u), false],
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
    dataUrl: clientData || remote,
    title,
    typeId: Number.isFinite(typeId) ? typeId : null,
  };
}
