/**
 * Random United-States-only coin photos from Wikimedia Commons.
 *
 * Why this exists: Numista's Cloudflare-protected CDN returns 502 to Vercel
 * function egress IPs and search results aren't always image-bearing.
 * Wikimedia Commons (upload.wikimedia.org) is free, no API key required, no
 * bot blocking, CORS-enabled (Access-Control-Allow-Origin: *), and has
 * tens of thousands of US coin photographs across well-curated categories.
 *
 * Strategy: every request includes the parent "Coins of the United States"
 * category (guaranteed to exist with hundreds of files) plus several random
 * denomination/series subcategories for variety. Each category is listed
 * via a single generator query (up to 500 files), filtered to real
 * photographs, de-duplicated by pageId, and one random candidate is returned.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
/** Never serve a cached random pick — each call must roll fresh. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  "AutoSlideshow/1.0 (https://github.com/kalebrowland99/autoslideshow; +random coin photos)";
const WIKIMEDIA_FETCH_MS = 15_000;

/**
 * Always-included parent category. "Coins of the United States" is one of
 * the largest US coin categories on Commons (hundreds of direct files even
 * after subcategory filtering), so it guarantees a non-empty result set
 * when paired denomination/series subcategories happen to be sparse or
 * missing on Commons.
 */
const PARENT_CATEGORY = "Coins of the United States";

/**
 * Curated Wikimedia Commons leaf categories that contain only US coin
 * photographs. Names match real Commons categories — verified live against
 * the MediaWiki API (each category below returns ≥9 photo files; total
 * pool across all subcategories is ~1700+ images). Singular vs plural
 * naming follows Commons conventions exactly.
 *
 * Source of truth:
 * https://commons.wikimedia.org/wiki/Category:Coins_of_the_United_States_by_name
 */
const COIN_SUBCATEGORIES = [
  // Cents
  "Lincoln cents",
  "Indian Head cent",
  "Obverses of United States cents",
  "Reverses of United States cents",
  // Nickels
  "Buffalo nickels",
  "Jefferson nickel",
  "Liberty Head nickel",
  "Shield nickel",
  // Dimes
  "Barber dimes",
  "Mercury dimes",
  "Roosevelt dimes",
  "Seated Liberty dimes",
  "Draped Bust dimes",
  "Capped Bust dimes",
  // Quarters
  "Washington quarter",
  "Standing Liberty quarters",
  "Seated Liberty quarter",
  "Barber quarter",
  // Half dollars
  "Kennedy half dollar",
  "Franklin half dollar",
  "Walking Liberty half dollars",
  "Barber half dollar",
  "Seated Liberty half dollar",
  "Capped Bust half dollar",
  // Silver dollars + modern dollar coins
  "Morgan dollar",
  "Peace dollar",
  "Eisenhower dollar",
  "Sacagawea dollar",
  "Susan B. Anthony dollar",
  "Trade dollar (United States)",
  "American Silver Eagle",
  "Presidential $1 Coin Program",
  // Commemoratives
  "Commemorative coins of the United States",
];

function pickDistinctSubcategories(n) {
  const max = Math.min(n, COIN_SUBCATEGORIES.length);
  const picked = new Set();
  while (picked.size < max) {
    picked.add(COIN_SUBCATEGORIES[Math.floor(Math.random() * COIN_SUBCATEGORIES.length)]);
  }
  return [...picked];
}

/** Always include the parent category + N random subcategories. */
function pickCategoriesForRequest(subCount = 5) {
  return [PARENT_CATEGORY, ...pickDistinctSubcategories(subCount)];
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
      cache: "no-store",
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

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      route: "/api/wikimedia-coins",
      usage: 'POST JSON { action: "randomPhoto" }',
      parentCategory: PARENT_CATEGORY,
      subCategoryCount: COIN_SUBCATEGORIES.length,
    },
    { headers: NO_CACHE_HEADERS },
  );
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
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const categories = pickCategoriesForRequest(5);
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

  const seenPageIds = new Set();
  const aggregated = [];
  for (const r of results) {
    if (!r?.ok) continue;
    for (const c of extractCandidates(r.data)) {
      if (c.pageId != null) {
        if (seenPageIds.has(c.pageId)) continue;
        seenPageIds.add(c.pageId);
      }
      aggregated.push(c);
    }
  }

  if (aggregated.length === 0) {
    const firstError = diagnostics.find((d) => !d.ok && d.error)?.error || null;
    return NextResponse.json(
      {
        error: firstError
          ? `Wikimedia API error: ${firstError}`
          : "No US coin photos found in Wikimedia categories.",
        diagnostics,
      },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }

  const picked = aggregated[Math.floor(Math.random() * aggregated.length)];
  return NextResponse.json(
    {
      imageUrl: picked.url,
      sourceUrl: picked.sourceUrl,
      title: picked.title,
      typeId: picked.pageId,
      candidateCount: aggregated.length,
      source: "wikimedia",
      clientFetch: true,
    },
    { headers: NO_CACHE_HEADERS },
  );
}
