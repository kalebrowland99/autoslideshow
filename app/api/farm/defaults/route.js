import { getFarmDefaults } from "@/lib/farmDefaults";
import { buildLabelyFarmBatches } from "@/lib/farmLabelyFoods";

export const maxDuration = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand") || "labely";
  const key = String(brand).trim().toLowerCase();

  if (key === "labely") {
    const labelyFoodDbBatches = await buildLabelyFarmBatches();
    return Response.json({
      brand: "labely",
      config: {
        appId: "labely",
        outputFormat: "labelyScan",
        labelyAiProducts: true,
        labelyUseFoodDatabasePhotos: true,
        labelyUseBraveImages: true,
        labelyUseSelfieImage: false,
        labelyScanSlotCount: 6,
        labelyFoodDbBatches,
      },
      batchCount: labelyFoodDbBatches.length,
      source: "brave",
    });
  }

  return Response.json(getFarmDefaults(key));
}
