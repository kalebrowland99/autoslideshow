/** Default batch configs for unattended /automation farm runs. */

const LABELY_BATCH_COUNT = 6;

/** Curated unhealthy / processed foods — one batch theme per row. */
const DEFAULT_LABELY_FOOD_BATCHES = [
  {
    name: "Sugary drinks",
    items: ["Coca-Cola", "Mountain Dew", "Red Bull", "Gatorade", "Sprite", "Dr Pepper"],
    slideshowCount: 1,
  },
  {
    name: "Chips & snacks",
    items: ["Doritos", "Cheetos", "Lay's Classic", "Pringles", "Fritos", "Takis"],
    slideshowCount: 1,
  },
  {
    name: "Candy & chocolate",
    items: ["Snickers", "M&M's", "Skittles", "Reese's", "Kit Kat", "Twix"],
    slideshowCount: 1,
  },
  {
    name: "Fast food",
    items: ["McDonald's Big Mac", "Burger King Whopper", "KFC bucket", "Taco Bell Crunchwrap", "Wendy's Baconator", "Popeyes sandwich"],
    slideshowCount: 1,
  },
  {
    name: "Frozen meals",
    items: ["Hot Pockets", "Totino's Pizza Rolls", "Lean Cuisine", "Hungry-Man dinner", "Banquet chicken", "Stouffer's lasagna"],
    slideshowCount: 1,
  },
  {
    name: "Breakfast junk",
    items: ["Pop-Tarts", "Frosted Flakes", "Lucky Charms", "Honey Buns", "Toaster Strudel", "Cinnamon Toast Crunch"],
    slideshowCount: 1,
  },
];

function labelyFoodDbBatches() {
  return DEFAULT_LABELY_FOOD_BATCHES.map((batch, i) => ({
    id: `batch-${i + 1}`,
    name: batch.name,
    itemsRaw: batch.items.join("\n"),
    slideshowCount: batch.slideshowCount,
  }));
}

export function getFarmDefaults(brand) {
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
      labelyUseBraveImages: true,
      labelyUseSelfieImage: false,
      labelyScanSlotCount: 6,
      labelyFoodDbBatches: labelyFoodDbBatches(),
    },
    batchCount: LABELY_BATCH_COUNT,
  };
}
