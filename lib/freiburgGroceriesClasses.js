/**
 * Freiburg Groceries Dataset class ids (see classid.txt in the upstream repo).
 * @see https://github.com/PhilJd/freiburg_groceries_dataset
 */
export const FREIBURG_ALL_CLASSES = Object.freeze([
  "CANDY",
  "JUICE",
  "VINEGAR",
  "OIL",
  "CHOCOLATE",
  "PASTA",
  "RICE",
  "MILK",
  "SPICES",
  "HONEY",
  "JAM",
  "NUTS",
  "CHIPS",
  "SODA",
  "COFFEE",
  "BEANS",
  "TEA",
  "CORN",
  "CEREAL",
  "CAKE",
  "SUGAR",
  "WATER",
  "FLOUR",
  "TOMATO_SAUCE",
  "FISH",
]);

/** Subset used for “junk / indulgent” demos (optional filters elsewhere). */
export const FREIBURG_JUNK_CLASSES = Object.freeze([
  "CANDY",
  "CHOCOLATE",
  "CHIPS",
  "SODA",
  "CAKE",
  "CEREAL",
  "JUICE",
  "JAM",
  "SUGAR",
]);

const ALL_SET = new Set(FREIBURG_ALL_CLASSES);

export function isFreiburgCategoryId(s) {
  return typeof s === "string" && ALL_SET.has(s);
}

/** Returns a valid class id or "" (Any / random across all classes). */
export function normalizeFreiburgCategoryParam(s) {
  const raw = String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  return ALL_SET.has(raw) ? raw : "";
}

/** Title-ish label for UI, e.g. TOMATO_SAUCE → Tomato sauce */
export function formatFreiburgCategoryLabel(classId) {
  if (!classId || typeof classId !== "string") return "";
  return classId
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}
