/** Shared slide indexing for standard / app-only / pose-person / iMessage-mom / starterPack formats. */

function appScreenType(config) {
  return (config?.appId ?? "thrifty") === "labely" ? "labely" : "thrifty";
}

export function getTotalSlides(config) {
  const n = config.slots?.length ?? 6;
  const f = config.outputFormat ?? "standard";
  if (f === "labelyOnly" && (config?.appId ?? "thrifty") === "labely") return 1;
  if (f === "posePerson") return n;
  if (f === "imessageMom") return 4;
  if (f === "appOnly") return 1 + n;
  if (f === "starterPack") return 1; // single logical slide; export loop handles phases
  return 1 + n * 2;
}

/**
 * @returns {object} Slide descriptor for preview/export.
 */
export function getSlideInfo(config, slideIndex) {
  const f = config.outputFormat ?? "standard";
  const slots = config.slots ?? [];

  if (f === "labelyOnly" && (config?.appId ?? "thrifty") === "labely") {
    return { type: "labely", slot: slots[0], itemIndex: 0 };
  }

  if (f === "posePerson") {
    const itemIndex = slideIndex;
    return { type: "fullBleed", slot: slots[itemIndex], itemIndex };
  }

  if (f === "starterPack") {
    return { type: "starterPack" };
  }

  if (f === "imessageMom") {
    const slot = slots[0];
    if (slideIndex === 0) return { type: "imessage",     slot, itemIndex: 0 };
    if (slideIndex === 1) return { type: "voicemail",    slot, itemIndex: 0 };
    if (slideIndex === 2) return { type: "imessageText", slot, itemIndex: 0 };
    return { type: appScreenType(config), slot, itemIndex: 0 };
  }

  if (slideIndex === 0) return { type: "collage" };

  if (f === "appOnly") {
    const itemIndex = slideIndex - 1;
    return { type: appScreenType(config), slot: slots[itemIndex], itemIndex };
  }

  const itemIndex = Math.floor((slideIndex - 1) / 2);
  const isReveal = (slideIndex - 1) % 2 === 0;
  return {
    type: isReveal ? "reveal" : appScreenType(config),
    slot: slots[itemIndex],
    itemIndex,
  };
}

/** Map preview slide index → slot index for AI refresh */
export function slideIndexToSlotIndex(slideIndex, config) {
  const f = config.outputFormat ?? "standard";
  if (f === "posePerson") return slideIndex;
  if (f === "labelyOnly" && (config?.appId ?? "thrifty") === "labely") return 0;
  if (f === "imessageMom") return 0;
  if (f === "starterPack") return slideIndex; // slots 0-2 map directly
  if (slideIndex === 0) return null;
  if (f === "appOnly") return slideIndex - 1;
  return Math.floor((slideIndex - 1) / 2);
}
