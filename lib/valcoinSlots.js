/** Valcoin slot helpers — Numista catalog only (no AI image / vision / pricing APIs). */

const COIN_BUY = [8, 12, 15, 18, 22, 25, 35, 45, 55, 75, 95, 120, 150, 185, 220];
const LISTING_PREFIXES = ["Pre-owned ", "Used ", "Vintage ", "Authentic "];
const LISTING_SUFFIXES = [" - Great Condition", " - Gently Used", " (Pre-loved)", " - Excellent"];
const LISTING_SOURCES = ["eBay", "Heritage", "Stack's Bowers", "GreatCollections"];

export function valcoinDemoPrices() {
  const buy = COIN_BUY[Math.floor(Math.random() * COIN_BUY.length)];
  const sell = Math.round(buy * (1.15 + Math.random() * 0.45));
  return { spentPrice: String(buy), soldPrice: String(sell) };
}

export function valcoinSoldListings(itemName, soldPrice) {
  const title = String(itemName || "Coin").trim() || "Coin";
  const price = parseFloat(soldPrice);
  const makeRow = (seed) => ({
    title: `${LISTING_PREFIXES[seed % LISTING_PREFIXES.length]}${title}${LISTING_SUFFIXES[(seed + 1) % LISTING_SUFFIXES.length]}`,
    source: LISTING_SOURCES[seed % LISTING_SOURCES.length],
    price: Number.isFinite(price) ? String(Math.round(price * (seed % 2 === 0 ? 0.92 : 1.08))) : "",
    inStock: false,
  });
  return [makeRow(0), makeRow(1)];
}

/**
 * @param {object} slot
 * @param {{ dataUrl: string, title?: string }} numista
 * @param {{ shelfIntro?: boolean }} [opts]
 * @returns {object}
 */
export function patchSlotFromNumista(slot, numista, opts = {}) {
  const title = String(numista.title || "").trim() || "Catalog coin";
  const prices =
    slot?.spentPrice && slot?.soldPrice ? {} : valcoinDemoPrices();
  const sold = prices.soldPrice ?? slot?.soldPrice ?? "";
  const patch = {
    imageUrl: numista.dataUrl,
    itemName: title,
    ...prices,
    matchItems: valcoinSoldListings(title, sold),
  };
  if (opts.shelfIntro) patch.labelyShelfImageUrl = numista.dataUrl;
  return patch;
}
