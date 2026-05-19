import { loadNumistaImageAsDataUrl } from "@/lib/numistaImageClient";
import { isLabelyScanTourFormat, LABELY_SCAN_TOUR_SLOTS } from "@/lib/slideLayout";

const IMAGE_KEYS = ["imageUrl", "labelyShelfImageUrl"];

async function hydrateSlotImages(slots, slotCount) {
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
  return slots;
}

/**
 * Convert remote coin URLs to data URLs so html-to-image and canvas export can read pixels.
 * @param {object} config
 * @returns {Promise<object>}
 */
export async function ensureScanTourExportImages(config) {
  if (!isLabelyScanTourFormat(config)) return config;
  const slots = Array.isArray(config.slots) ? [...config.slots] : [];
  const slotCount = Math.min(slots.length, LABELY_SCAN_TOUR_SLOTS + 1);
  await hydrateSlotImages(slots, slotCount);
  return { ...config, slots };
}

/** Valcoin collage + scan: hydrate all six slot images before batch/generate. */
export async function ensureValcoinSlotImages(config) {
  if ((config?.appId ?? "thrifty") !== "valcoin") return config;
  const slots = Array.isArray(config.slots) ? [...config.slots] : [];
  await hydrateSlotImages(slots, Math.min(slots.length, 6));
  return { ...config, slots };
}
