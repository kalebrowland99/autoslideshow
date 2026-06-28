/** Default batch configs for unattended /automation farm runs. */

import { LABELY_BATCH_COUNT, labelyFoodDbBatches } from "@/lib/labelyFarmFoodPicker";

export function getFarmDefaults(brand, { jobId = "" } = {}) {
  const key = String(brand || "labely").trim().toLowerCase();
  if (key === "valcoin") {
    return {
      brand: "valcoin",
      config: {
        appId: "valcoin",
        outputFormat: "labelyScan",
        labelyScanSlotCount: 6,
      },
    };
  }
  return {
    brand: "labely",
    config: {
      appId: "labely",
      outputFormat: "labelyScan",
      labelyAiProducts: true,
      labelyUseFoodDatabasePhotos: true,
      /** Brave web image search — "{food} in store" (US). Same role as manual Google Images picks. */
      labelyUseBraveImages: true,
      labelyUseSelfieImage: false,
      labelyScanSlotCount: 6,
      labelyFoodDbBatches: labelyFoodDbBatches(jobId),
    },
    batchCount: LABELY_BATCH_COUNT,
    foodSelection: "random_unhealthy_american_brave_images",
  };
}
