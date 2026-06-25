/**
 * Brave Search Image API for food photos.
 * Requires BRAVE_SEARCH_API_KEY (Search plan — image search included).
 * @see https://api-dashboard.search.brave.com/api-reference/images/image_search
 */

import { recordBraveSearches } from "@/lib/braveUsage";
import { getUsedBraveImageUrls, normalizeBraveImageUrl } from "@/lib/braveUsedImages";

const BRAVE_IMAGE_SEARCH = "https://api.search.brave.com/res/v1/images/search";
const FETCH_MS = 15_000;

/** Build the Brave image query from a food name. */
export function buildBraveFoodSearchQuery(foodName) {
  return String(foodName || "").trim();
}

export function braveImagesConfigured() {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());
}

/**
 * @param {string} query
 * @param {{ count?: number }} [opts]
 * @returns {Promise<{ items: { link: string, title: string, thumbnail: string }[], configured: boolean, status?: number }>}
 */
export async function searchBraveFoodImages(query, { count = 10 } = {}) {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) return { items: [], configured: false };

  const searchQ = buildBraveFoodSearchQuery(query);
  if (!searchQ) return { items: [], configured: true };

  const params = new URLSearchParams({
    q: searchQ,
    count: String(Math.min(Math.max(count, 1), 50)),
    country: "US",
    search_lang: "en",
    safesearch: "strict",
    spellcheck: "true",
  });

  try {
    const res = await fetch(`${BRAVE_IMAGE_SEARCH}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": key,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    await recordBraveSearches(1);
    if (!res.ok) return { items: [], configured: true, status: res.status };
    const data = await res.json().catch(() => ({}));
    const used = await getUsedBraveImageUrls();
    const items = Array.isArray(data?.results)
      ? data.results
          .map((item) => ({
            link: String(item?.properties?.url || item?.url || "").trim(),
            title: String(item?.title || "").trim(),
            thumbnail: String(item?.thumbnail?.src || item?.thumbnail || "").trim(),
          }))
          .filter((item) => item.link && !used.has(normalizeBraveImageUrl(item.link)))
      : [];
    return { items, configured: true };
  } catch {
    return { items: [], configured: true };
  }
}
