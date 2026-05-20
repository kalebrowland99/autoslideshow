/**
 * Random coin photos from Wikimedia Commons.
 *
 * Why this exists: Numista's Cloudflare-protected CDN returns 502 to Vercel
 * function egress IPs and search results aren't always image-bearing.
 * Wikimedia Commons (upload.wikimedia.org) is free, no API key required, no
 * bot blocking, CORS-enabled (Access-Control-Allow-Origin: *), and has
 * hundreds of thousands of coin photographs across well-curated categories.
 *
 * Strategy: pick a random coin category, list up to 500 files via the
 * MediaWiki API with a single generator query, filter to real photographs,
 * and return one random image URL.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  "AutoSlideshow/1.0 (https://github.com/kalebrowland99/autoslideshow; +random coin photos)";
const WIKIMEDIA_FETCH_MS = 15_000;

/**
 * Curated Wikimedia Commons categories that contain large numbers of coin
 * photographs. Chosen to span eras (ancient → modern), metals, and regions
 * so successive random picks feel diverse.
 */
const COIN_CATEGORIES = [
  "Coins of the United States",
  "Coins of Canada",
  "Coins of the United Kingdom",
  "Coins of Australia",
  "Coins of New Zealand",
  "Coins of Mexico",
  "Coins of Brazil",
  "Coins of Argentina",
  "Coins of Chile",
  "Coins of Peru",
  "Coins of Colombia",
  "Coins of Japan",
  "Coins of China",
  "Coins of India",
  "Coins of South Korea",
  "Coins of Thailand",
  "Coins of Indonesia",
  "Coins of the Philippines",
  "Coins of France",
  "Coins of Germany",
  "Coins of Italy",
  "Coins of Spain",
  "Coins of Portugal",
  "Coins of the Netherlands",
  "Coins of Belgium",
  "Coins of Switzerland",
  "Coins of Austria",
  "Coins of Sweden",
  "Coins of Norway",
  "Coins of Denmark",
  "Coins of Finland",
  "Coins of Poland",
  "Coins of Russia",
  "Coins of Ukraine",
  "Coins of Greece",
  "Coins of Turkey",
  "Coins of Egypt",
  "Coins of Morocco",
  "Coins of South Africa",
  "Coins of Israel",
  "Coins of Saudi Arabia",
  "Coins of Iran",
  "Coins of the Roman Empire",
  "Roman Imperial coins",
  "Roman Republican coins",
  "Ancient Greek coins",
  "Byzantine coins",
  "Medieval coins",
  "Medieval coins of Europe",
  "Gold coins",
  "Silver coins",
  "Commemorative coins",
  "Coins of the Soviet Union",
  "Coins of the German Empire",
  "Coins of the Weimar Republic",
  "Coins of Nazi Germany",
  "Euro coins",
  "Bullion coins",
];

function pickCategory() {
  return COIN_CATEGORIES[Math.floor(Math.random() * COIN_CATEGORIES.length)];
}

function pickDistinctCategories(n) {
  const max = Math.min(n, COIN_CATEGORIES.length);
  const picked = new Set();
  while (picked.size < max) picked.add(pickCategory());
  return [...picked];
}

/**
 * One MediaWiki query: list category members AND fetch image metadata in a
 * single round trip via a generator query.
 */
async function fetchCategoryFiles(category) {
  const params = new URLSearchParams({
    action: "query",
    generator: "categorymembers",
    gcmtitle: `Category:${category}`,
    gcmtype: "file",
    gcmlimit: "500",
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "1080",
    format: "json",
    formatversion: "2",
  });
  const url = `${WIKIMEDIA_API}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(WIKIMEDIA_FETCH_MS),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, data };
  } catch (e) {
    const name = e?.name || "";
    return {
      ok: false,
      status: 502,
      error:
        name === "TimeoutError" || name === "AbortError"
          ? "Wikimedia request timed out"
          : String(e?.message || e || "Wikimedia request failed"),
    };
  }
}

const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Files inside coin categories that aren't actual coin photographs. */
const REJECT_TITLE = /(map|chart|graph|logo|seal|coat[_ ]of[_ ]arms|flag|stamp|banknote|paper money|diagram|schematic|cover|book|portrait of)/i;

function basenameToTitle(rawTitle) {
  return String(rawTitle || "")
    .replace(/^File:/i, "")
    .replace(/\.(jpe?g|png|webp|gif|tiff?)$/i, "")
    .replace(/[_]+/g, " ")
    .trim();
}

function extractCandidates(data) {
  const pages = data?.query?.pages;
  const list = Array.isArray(pages) ? pages : pages ? Object.values(pages) : [];
  const out = [];
  for (const p of list) {
    const info = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
    if (!info?.url) continue;
    const mime = String(info.mime || "").toLowerCase();
    if (!PHOTO_MIMES.has(mime)) continue;
    const title = basenameToTitle(p.title);
    if (!title || REJECT_TITLE.test(title)) continue;
    const url = info.thumburl || info.url;
    if (!url || !/^https:\/\/upload\.wikimedia\.org\//.test(url)) continue;
    out.push({
      url,
      sourceUrl: info.url,
      title,
      pageId: p.pageid ?? null,
      width: info.thumbwidth || info.width || null,
      height: info.thumbheight || info.height || null,
    });
  }
  return out;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/wikimedia-coins",
    usage: 'POST JSON { action: "randomPhoto" }',
    categoryCount: COIN_CATEGORIES.length,
  });
}

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = String(body.action || "").trim();

  if (action !== "randomPhoto") {
    return NextResponse.json(
      { error: 'Unknown action. Use { "action": "randomPhoto" }.' },
      { status: 400 },
    );
  }

  const categories = pickDistinctCategories(4);
  const results = await Promise.all(categories.map((c) => fetchCategoryFiles(c)));

  const diagnostics = categories.map((category, i) => {
    const r = results[i];
    return {
      category,
      ok: r?.ok === true,
      status: r?.status ?? null,
      error: r?.error || null,
    };
  });

  const aggregated = [];
  for (const r of results) {
    if (!r?.ok) continue;
    aggregated.push(...extractCandidates(r.data));
  }

  if (aggregated.length === 0) {
    const firstError = diagnostics.find((d) => !d.ok && d.error)?.error || null;
    return NextResponse.json(
      {
        error: firstError
          ? `Wikimedia API error: ${firstError}`
          : "No coin photos found in Wikimedia categories.",
        diagnostics,
      },
      { status: 502 },
    );
  }

  const picked = aggregated[Math.floor(Math.random() * aggregated.length)];
  return NextResponse.json({
    imageUrl: picked.url,
    sourceUrl: picked.sourceUrl,
    title: picked.title,
    typeId: picked.pageId,
    source: "wikimedia",
    clientFetch: true,
  });
}
