import { loadNumistaImageAsDataUrl } from "@/lib/numistaImageClient";
import { isLabelyScanTourFormat, LABELY_SCAN_TOUR_SLOTS } from "@/lib/slideLayout";

const IMAGE_KEYS = ["imageUrl", "labelyShelfImageUrl"];

/**
 * Remote catalogue URLs break html-to-image / canvas export (CORS).
 * Inline data URLs before capture so every slide produces frames.
 * @param {object} config
 * @returns {Promise<object>}
 */
export async function ensureExportImageUrls(config) {
  if (!config || !Array.isArray(config.slots)) return config;

  const slots = config.slots.map((s) => ({ ...s }));
  const slotCount = isLabelyScanTourFormat(config)
    ? Math.min(slots.length, LABELY_SCAN_TOUR_SLOTS + 1)
    : slots.length;

  for (let i = 0; i < slotCount; i++) {
    const slot = slots[i];
    if (!slot || typeof slot !== "object") continue;

    let next = { ...slot };
    for (const key of IMAGE_KEYS) {
      const url = String(next[key] || "").trim();
      if (!url || url.startsWith("data:")) continue;
      const dataUrl = await loadNumistaImageAsDataUrl(url);
      if (dataUrl.startsWith("data:image/")) next[key] = dataUrl;
    }

    const hero = String(next.imageUrl || "").trim();
    const shelf = String(next.labelyShelfImageUrl || "").trim();
    if (hero.startsWith("data:") && !shelf.startsWith("data:")) {
      next.labelyShelfImageUrl = hero;
    } else if (shelf.startsWith("data:") && !hero.startsWith("data:")) {
      next.imageUrl = shelf;
    }

    slots[i] = next;
  }

  return { ...config, slots };
}
