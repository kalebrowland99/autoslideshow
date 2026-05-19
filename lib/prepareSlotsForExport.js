import { loadNumistaImageAsDataUrl } from "@/lib/numistaImageClient";

/** @param {string | null | undefined} url */
export async function ensureExportableImageUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("data:image/")) return s;
  if (!/^https?:\/\//i.test(s)) return s;
  const data = await loadNumistaImageAsDataUrl(s);
  return data.startsWith("data:image/") ? data : s;
}

/** Inline remote catalogue photos as data URLs so html-to-image / canvas export can read pixels. */
export async function prepareConfigForExport(config) {
  const slots = Array.isArray(config?.slots) ? config.slots : [];
  const nextSlots = await Promise.all(
    slots.map(async (slot) => {
      if (!slot || typeof slot !== "object") return slot;
      const imageUrl = await ensureExportableImageUrl(slot.imageUrl);
      const labelyShelfImageUrl = await ensureExportableImageUrl(slot.labelyShelfImageUrl);
      return {
        ...slot,
        ...(imageUrl ? { imageUrl } : {}),
        ...(labelyShelfImageUrl ? { labelyShelfImageUrl } : {}),
      };
    }),
  );
  return { ...config, slots: nextSlots };
}
