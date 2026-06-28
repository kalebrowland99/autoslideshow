import { searchBraveFoodImages, braveImagesConfigured } from "@/lib/braveFoodImage";
import { lookupFoodBrave } from "@/lib/labelyBraveFoodLookup";
import { DEFAULT_LABELY_FOOD_BATCHES } from "@/lib/farmDefaults";

export const LABELY_FARM_BATCH_COUNT = 6;
export const LABELY_ITEMS_PER_BATCH = 6;

/** Brave image searches biased toward unhealthy American grocery products. */
const UNHEALTHY_US_BRAVE_QUERIES = [
  "doritos nacho chips bag walmart usa",
  "coca cola soda bottle american grocery",
  "oreo cookies package united states store",
  "hot pockets frozen box usa grocery aisle",
  "lucky charms cereal box american supermarket",
  "mountain dew bottle convenience store usa",
  "cheetos crunchy bag american grocery",
  "pop tarts frosted box usa store shelf",
  "digiorno frozen pizza box walmart",
  "monster energy drink can usa gas station",
  "takis fuego chips bag american store",
  "hostess twinkies package united states",
  "snickers candy bar checkout usa",
  "pringles chips can american grocery",
  "frosted flakes cereal box kelloggs usa",
  "ramen noodles maruchan cup american store",
  "gatorade sports drink bottle usa",
  "reese peanut butter cups package walmart",
  "totinos pizza rolls bag frozen usa",
  "red bull energy drink can american store",
  "mcdonalds big mac fast food usa",
  "taco bell crunchwrap american fast food",
  "ben and jerrys ice cream pint usa grocery",
  "honey buns packaged snack american gas station",
  "capri sun juice pouch american grocery",
];

const JUNK_HINTS = [
  "chip", "soda", "candy", "cookie", "cereal", "frozen", "pizza", "burger",
  "energy", "snack", "sugar", "cola", "dew", "nacho", "ramen", "nugget",
  "fries", "donut", "ice cream", "twinkie", "hot pocket", "taki", "cheeto",
  "oreo", "dorito", "gatorade", "monster", "red bull", "pringles", "snickers",
];

const HEALTHY_BLOCK = [
  "organic", "salad", "broccoli", "spinach", "kale", "apple slice", "banana",
  "grilled chicken breast", "brown rice", "oat milk", "protein powder",
];

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function dailyShuffle(items, salt = "") {
  const day = new Date().toISOString().slice(0, 10);
  let seed = 0;
  for (const ch of `${day}:${salt}`) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const rand = mulberry32(seed || 1);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cleanBraveProductTitle(title, fallbackQuery) {
  let text = String(title || "").trim();
  text = text.replace(/\s*[-|•–].*$/s, "").trim();
  text = text.replace(
    /\b(walmart|target|kroger|costco|amazon|grocery|supermarket|store|usa|united states|photo|image)\b/gi,
    "",
  );
  text = text.replace(/\s+/g, " ").trim();
  if (text.length < 3) {
    text = String(fallbackQuery || "")
      .replace(/\b(in store|walmart|usa|american|grocery)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return text.split(/\s+/).slice(0, 7).join(" ").trim();
}

export function looksLikeUnhealthyAmericanFood(name) {
  const n = String(name || "").toLowerCase();
  if (!n || n.length < 3) return false;
  if (HEALTHY_BLOCK.some((word) => n.includes(word))) return false;
  return JUNK_HINTS.some((hint) => n.includes(hint));
}

function staticFallbackBatch(batchIndex) {
  const row = DEFAULT_LABELY_FOOD_BATCHES[batchIndex] || DEFAULT_LABELY_FOOD_BATCHES[0];
  return {
    id: `batch-${batchIndex + 1}`,
    name: row.name,
    itemsRaw: row.items.join("\n"),
    slideshowCount: 1,
    foodDbMatches: {},
  };
}

function rowHasBraveImage(row) {
  if (!row || !["found", "recommend"].includes(row.status)) return false;
  const details = Array.isArray(row.candidateDetails) ? row.candidateDetails : [];
  return details.some((d) => String(d?.imageUrl || "").trim());
}

/**
 * Build six Labely food-db batches with items + Brave image matches for farm automation.
 * Rotates daily via query shuffle; falls back to static lists if Brave is unavailable.
 */
export async function buildLabelyFarmBatches() {
  if (!braveImagesConfigured()) {
    return DEFAULT_LABELY_FOOD_BATCHES.map((row, i) => staticFallbackBatch(i));
  }

  const batches = [];
  const globalSeen = new Set();
  const queries = dailyShuffle(UNHEALTHY_US_BRAVE_QUERIES);

  for (let b = 0; b < LABELY_FARM_BATCH_COUNT; b++) {
    const items = [];
    const foodDbMatches = {};
    const batchQueries = dailyShuffle(queries, `batch-${b}`);

    for (const query of batchQueries) {
      if (items.length >= LABELY_ITEMS_PER_BATCH) break;
      const { items: hits } = await searchBraveFoodImages(query, { count: 24 });
      for (const hit of hits) {
        if (items.length >= LABELY_ITEMS_PER_BATCH) break;
        const name = cleanBraveProductTitle(hit.title, query);
        const key = name.toLowerCase();
        if (!name || globalSeen.has(key)) continue;
        if (!looksLikeUnhealthyAmericanFood(name)) continue;

        const row = await lookupFoodBrave(name);
        if (!rowHasBraveImage(row)) continue;

        globalSeen.add(key);
        items.push(name);
        foodDbMatches[name] = row;
      }
    }

    if (items.length === 0) {
      batches.push(staticFallbackBatch(b));
      continue;
    }

    batches.push({
      id: `batch-${b + 1}`,
      name: items[0] ? `${items[0]} batch` : `Brave batch ${b + 1}`,
      itemsRaw: items.join("\n"),
      slideshowCount: 1,
      foodDbMatches,
    });
  }

  return batches;
}
