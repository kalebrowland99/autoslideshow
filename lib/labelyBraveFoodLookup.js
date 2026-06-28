import { braveImagesConfigured, searchBraveFoodImages } from "@/lib/braveFoodImage";
import { getUsedBraveImageUrls, normalizeBraveImageUrl } from "@/lib/braveUsedImages";

/** Resolve a food name to Brave image candidates (same shape as /api/labely-food-suggestions). */
export async function lookupFoodBrave(query) {
  const q = String(query || "").trim();
  if (!q) return { query: q, status: "empty" };
  if (!braveImagesConfigured()) {
    return { query: q, status: "error", error: "Brave Image Search is not configured on the server." };
  }

  const { items } = await searchBraveFoodImages(q, { count: 20 });
  if (!items.length) return { query: q, status: "missing" };

  const used = await getUsedBraveImageUrls();
  const candidateDetails = items.slice(0, 20).map((item, i) => ({
    label: item.title || `${q} (${i + 1})`,
    imageUrl: item.link,
  })).filter((d) => !used.has(normalizeBraveImageUrl(d.imageUrl)));
  if (!candidateDetails.length) return { query: q, status: "missing" };
  const candidates = candidateDetails.map((d) => d.label);
  return {
    query: q,
    status: "found",
    match: candidates[0] || q,
    candidates,
    candidateDetails,
  };
}
