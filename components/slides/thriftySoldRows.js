const PREFIXES = ["Pre-owned ", "Used ", "Vintage ", "Authentic ", "Like-New "];
const SUFFIXES = [" - Great Condition", " - Gently Used", " (Pre-loved)", " - Excellent", " - Good Shape"];

export function buildSoldRows(slot, src1, src2) {
  const filled = slot.matchItems?.filter((m) => m.title || m.price) ?? [];
  if (filled.length >= 2) {
    return [
      { ...filled[0], source: src1, inStock: false },
      { ...filled[1], source: src2, inStock: false },
    ];
  }
  const base = slot.itemName || "";
  const price = parseFloat(slot.soldPrice);
  const makeRow = (seed, src) => ({
    title: base
      ? `${PREFIXES[seed % PREFIXES.length]}${base}${SUFFIXES[(seed + 1) % SUFFIXES.length]}`
      : `Sold listing ${seed + 1}`,
    source: src,
    price: Number.isNaN(price) ? "" : String(Math.round(price * (seed % 2 === 0 ? 0.88 : 1.08))),
    inStock: false,
  });
  return [
    filled[0] ? { ...filled[0], source: src1, inStock: false } : makeRow(0, src1),
    filled[1] ? { ...filled[1], source: src2, inStock: false } : makeRow(1, src2),
  ];
}
