import { inlineSlotImageFields } from "@/lib/exportImagePrepare";
import { isLabelyScanTourFormat, LABELY_SCAN_TOUR_SLOTS } from "@/lib/slideLayout";

/** Apps that load Numista catalogue photos (CORS blocks direct export). */
export function needsExportImageInlining(config) {
  const aid = config?.appId ?? "thrifty";
  return aid === "valcoin" || aid === "labely";
}

/**
 * Remote catalogue URLs break html-to-image / canvas export (CORS).
 * Inline data URLs before capture so every slide produces frames.
 * @param {object} config
 * @returns {Promise<object>}
 */
export async function ensureExportImageUrls(config) {
  if (!config || !Array.isArray(config.slots)) return config;

  const slotCount = isLabelyScanTourFormat(config)
    ? Math.min(config.slots.length, LABELY_SCAN_TOUR_SLOTS + 1)
    : config.slots.length;

  const slots = await Promise.all(
    config.slots.slice(0, slotCount).map((slot) => inlineSlotImageFields(slot)),
  );

  const rest = config.slots.slice(slotCount);
  return { ...config, slots: [...slots, ...rest.map((s) => ({ ...s }))] };
}
