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

async function fetchNumistaProxyJsonDataUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  try {
    const res = await fetch(numistaImageProxyUrl(u, { redirect: false }));
    const data = await res.json().catch(() => ({}));
    const fromJson = typeof data?.imageDataUrl === "string" ? data.imageDataUrl.trim() : "";
    if (fromJson.startsWith("data:image/")) return fromJson;
  } catch {
    /* fall through */
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

  const fromApi = await fetchNumistaProxyJsonDataUrl(u);
  if (fromApi.startsWith("data:image/")) return fromApi;

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
