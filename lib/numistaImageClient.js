/**
 * Browser-side Numista catalogue images — use exportImagePrepare (server proxy).
 */

import { remoteImageToDataUrl } from "@/lib/exportImagePrepare";

export function numistaImageProxyUrl(remoteUrl, { redirect = false, raw = false } = {}) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  const q = new URLSearchParams({ url: u });
  if (raw) q.set("mode", "raw");
  else if (redirect) q.set("mode", "redirect");
  return `/api/numista-image?${q.toString()}`;
}

/** @param {string} remoteUrl @returns {Promise<string>} */
export async function loadNumistaImageAsDataUrl(remoteUrl) {
  return remoteImageToDataUrl(remoteUrl);
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
