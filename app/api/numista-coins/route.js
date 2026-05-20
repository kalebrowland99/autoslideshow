import { NextResponse } from "next/server";
import { fetchRemoteImageDataUrl } from "@/lib/fetchRemoteImageDataUrl";

export const runtime = "nodejs";
export const maxDuration = 60;

const NUMISTA_API = "https://api.numista.com/api/v3";

function normalizeCoinText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreTypeAgainstQuery(type, qNorm) {
  if (!type || !qNorm) return 0;
  const title = normalizeCoinText(type.title);
  const issuer = normalizeCoinText(
    typeof type.issuer === "object" && type.issuer ? type.issuer.name || type.issuer.code : type.issuer,
  );
  const hay = `${title} ${issuer}`;
  let score = 0;
  for (const tok of qNorm.split(/\s+/).filter((t) => t.length >= 2)) {
    if (hay.includes(tok)) score += 2;
  }
  if (type.obverse_thumbnail || type.obverse_picture) score += 1;
  return score;
}

const NUMISTA_FETCH_MS = 22_000;

async function numistaJson(path, apiKey) {
  try {
    const res = await fetch(`${NUMISTA_API}${path}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AutoSlideshow/1.0 (Numista)",
        "Numista-API-Key": apiKey,
      },
      signal: AbortSignal.timeout(NUMISTA_FETCH_MS),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: errText.slice(0, 200) || `HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, data };
  } catch (e) {
    const name = e?.name || "";
    const msg =
      name === "TimeoutError" || name === "AbortError"
        ? "Numista API request timed out"
        : String(e?.message || e || "Numista request failed");
    return { ok: false, status: 502, error: msg };
  }
}

/** Try coin-only search first, then unrestricted (Numista catalog varies by account/API version). */
async function searchTypesList(query, apiKey) {
  const paths = [
    `/types?q=${encodeURIComponent(query)}&count=24&category=coin`,
    `/types?q=${encodeURIComponent(query)}&count=24`,
  ];
  let lastFail = /** @type {{ ok: false; status: number; error: string } | null} */ (null);
  for (const path of paths) {
    const r = await numistaJson(path, apiKey);
    if (!r.ok) {
      lastFail = r;
      continue;
    }
    const types = Array.isArray(r.data?.types) ? r.data.types : [];
    if (types.length > 0) return { ok: true, data: { types } };
  }
  if (lastFail) return lastFail;
  return { ok: true, data: { types: [] } };
}

function scoreTypesRanked(types, query) {
  const qNorm = normalizeCoinText(query);
  if (!Array.isArray(types) || types.length === 0) return [];
  return types
    .map((t) => ({ t, score: scoreTypeAgainstQuery(t, qNorm) }))
    .sort((a, b) => b.score - a.score);
}

/** Resolve catalogue image hrefs (API sometimes returns site-relative paths). */
function resolveNumistaImageUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `https://en.numista.com${s}`;
  return s;
}

/** Prefer thumbnail first (smaller, more reliable), then full picture. */
function obverseUrlsFromType(t) {
  if (!t || typeof t !== "object") return [];
  const pic = resolveNumistaImageUrl(t.obverse_picture);
  const thumb = resolveNumistaImageUrl(t.obverse_thumbnail);
  const out = [];
  if (thumb) out.push(thumb);
  if (pic && pic !== thumb) out.push(pic);
  return out;
}

function obverseUrlFromType(t) {
  return obverseUrlsFromType(t)[0] || "";
}

/**
 * @param {object} chosen
 * @param {string} userAgent
 * @returns {Promise<{ imageDataUrl: string | null, imageUrl: string, title: string, typeId: number | null } | null>}
 */
async function coinImagePayload(chosen, userAgent) {
  const urls = obverseUrlsFromType(chosen);
  if (urls.length === 0) return null;

  let imageDataUrl = null;
  for (const u of urls) {
    imageDataUrl = await fetchRemoteImageDataUrl(u, userAgent);
    if (imageDataUrl) break;
  }

  return {
    imageDataUrl,
    imageUrl: urls[0],
    title: String(chosen?.title || "").trim(),
    typeId: chosen?.id != null ? Number(chosen.id) : null,
  };
}

/** GET /types/{id} may return the type at root or under `type`. */
function unwrapTypePayload(data) {
  if (!data || typeof data !== "object") return null;
  if (data.type && typeof data.type === "object" && data.type.id != null) return data.type;
  if (data.id != null) return data;
  return data;
}

const NUMISTA_IMAGE_FIELDS = ["obverse_picture", "obverse_thumbnail", "reverse_picture", "reverse_thumbnail"];

/**
 * Search rows often include thumbnails; GET /types/{id} sometimes omits image URLs.
 * Prefer non-empty image fields from either payload so we do not drop usable URLs.
 * @param {object | null} listRow
 * @param {object | null} detailRow
 */
function mergeNumistaTypeRow(listRow, detailRow) {
  if (!listRow && !detailRow) return null;
  if (!detailRow) return listRow && typeof listRow === "object" ? { ...listRow } : listRow;
  if (!listRow) return detailRow && typeof detailRow === "object" ? { ...detailRow } : detailRow;
  const out = { ...listRow, ...detailRow };
  for (const k of NUMISTA_IMAGE_FIELDS) {
    const dt = typeof detailRow[k] === "string" ? detailRow[k].trim() : "";
    const lt = typeof listRow[k] === "string" ? listRow[k].trim() : "";
    out[k] = dt || lt || "";
  }
  return out;
}

/** Broad catalog searches — random picks walk thousands of distinct Numista types over time. */
const NUMISTA_RANDOM_SEARCHES = [
  "gold coin", "silver dollar", "ancient roman denarius", "byzantine solidus", "US morgan dollar",
  "peace dollar", "walking liberty half", "mercury dime", "standing liberty quarter", "buffalo nickel",
  "lincoln wheat cent", "indian head cent", "trade dollar", "seated liberty dollar", "capped bust half",
  "krugerrand", "maple leaf gold", "panda gold", "sovereign victoria", "florin", "crown silver",
  "reichsmark", "reichspfennig", "napoleon 20 francs", "swiss 20 francs", "peso plata mexico",
  "8 reales", "columnario", "ducato venice", "taler", "thaler", "polish zloty", "ruble silver",
  "kopeck empire", "ottoman akce", "islamic dirham", "umayyad dinar", "celtic stater", "greek owl tetradrachm",
  "athens owl", "alexander tetradrachm", "seleucid", "ptolemy coin", "carthage shekel", "sicily tetradrachm",
  "britannia silver", "canadian silver dollar", "australian florin", "new zealand crown", "south africa penny",
  "japanese yen silver", "korean yang", "chinese dragon dollar", "tibet tangka", "india rupee silver",
  "philippine peso", "brazil 960 reis", "chile peso", "peru sol", "colombia 8 escudos", "argentina peso",
  "austria philharmonic", "german mark silver", "italian lira", "spain escudo", "portugal escudo",
  "netherlands gulden", "belgium franc", "sweden krona silver", "norway speciedaler", "denmark rigsdaler",
  "finland markka", "iceland crown", "hungary forint gold", "romania lei", "bulgaria lev", "serbia dinar",
  "israel lira", "egypt piastre", "ethiopia birr", "morocco dirham", "tunisia franc", "south africa krugerrand",
  "rhodesia crown", "zimbabwe dollar", "kenya shilling", "nigeria pound", "commemorative euro silver",
  "euro gold", "monaco franc", "vatican lira", "san marino coin", "andorra diner", "proof set silver",
  "mint set unc", "error coin", "pattern coin", "medal numismatic", "jeton", "token trade",
];

function pickRandomSearchQuery() {
  return NUMISTA_RANDOM_SEARCHES[Math.floor(Math.random() * NUMISTA_RANDOM_SEARCHES.length)];
}

/**
 * @param {string} apiKey
 * @returns {Promise<object | null>}
 */
async function pickRandomCatalogType(apiKey) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const r = await searchTypesList(pickRandomSearchQuery(), apiKey);
    if (!r.ok) continue;
    const types = (Array.isArray(r.data?.types) ? r.data.types : []).filter((t) => obverseUrlsFromType(t).length > 0);
    if (types.length === 0) continue;
    const pick = types[Math.floor(Math.random() * types.length)];
    const id = pick?.id;
    if (!Number.isFinite(Number(id))) continue;
    const d = await numistaJson(`/types/${Math.floor(Number(id))}`, apiKey);
    const detail = d.ok && d.data ? unwrapTypePayload(d.data) : null;
    const chosen = mergeNumistaTypeRow(pick, detail);
    if (obverseUrlFromType(chosen)) return chosen;
  }
  return null;
}

export async function GET() {
  const hasKey = Boolean(process.env.NUMISTA_API_KEY?.trim());
  return NextResponse.json({
    ok: true,
    route: "/api/numista-coins",
    numistaApiKeyConfigured: hasKey,
    usage: 'POST JSON { action: "search" | "photo" | "randomPhoto", ... }',
  });
}

export async function POST(req) {
  const apiKey = process.env.NUMISTA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "NUMISTA_API_KEY is not set. For local dev add it to .env.local (see .env.example). For production set it in your host (e.g. Vercel → Project → Settings → Environment Variables) and redeploy.",
      },
      { status: 501 },
    );
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = String(body.action || "").trim();

  if (action === "search") {
    const query = String(body.query || "").trim();
    if (!query) return NextResponse.json({ results: [] });
    const r = await searchTypesList(query, apiKey);
    if (!r.ok) {
      return NextResponse.json(
        { error: r.error || "Numista search failed", results: [] },
        { status: r.status >= 400 && r.status < 600 ? r.status : 502 },
      );
    }
    const types = Array.isArray(r.data?.types) ? r.data.types : [];
    const results = types.map((t) => ({
      id: t.id,
      title: t.title || "",
      issuer:
        typeof t.issuer === "object" && t.issuer
          ? String(t.issuer.name || t.issuer.code || "").trim()
          : String(t.issuer || "").trim(),
      category: t.category || "",
      obverse_thumbnail: String(t.obverse_thumbnail || "").trim(),
      reverse_thumbnail: String(t.reverse_thumbnail || "").trim(),
    }));
    return NextResponse.json({ results });
  }

  if (action === "photo") {
    const query = String(body.query || "").trim();
    const typeIdRaw = body.typeId;
    const typeId = typeIdRaw != null && typeIdRaw !== "" ? Number(typeIdRaw) : NaN;

    let chosen = null;
    if (Number.isFinite(typeId) && typeId > 0) {
      const r = await numistaJson(`/types/${Math.floor(typeId)}`, apiKey);
      if (r.ok && r.data) chosen = unwrapTypePayload(r.data);
    }
    if (!chosen && query) {
      const r = await searchTypesList(query, apiKey);
      if (!r.ok) {
        return NextResponse.json(
          { error: r.error || "Numista search failed" },
          { status: r.status >= 400 && r.status < 600 ? r.status : 502 },
        );
      }
      const types = Array.isArray(r.data?.types) ? r.data.types : [];
      const ranked = scoreTypesRanked(types, query);
      for (const { t: best } of ranked) {
        if (!best?.id) continue;
        const d = await numistaJson(`/types/${best.id}`, apiKey);
        const detail = d.ok && d.data ? unwrapTypePayload(d.data) : null;
        const merged = mergeNumistaTypeRow(best, detail);
        if (obverseUrlsFromType(merged).length > 0) {
          chosen = merged;
          break;
        }
      }
    }

    const payload = await coinImagePayload(chosen, "AutoSlideshow Valcoin/1.0 (Numista)");
    if (!payload) {
      return NextResponse.json(
        { error: "No Numista obverse image found for that coin. Try a different name or upload a photo." },
        { status: 422 },
      );
    }

    return NextResponse.json(payload);
  }

  if (action === "randomPhoto") {
    const ua = "AutoSlideshow Valcoin/1.0 (Numista random)";
    for (let round = 0; round < 6; round++) {
      const chosen = await pickRandomCatalogType(apiKey);
      if (!chosen) continue;
      const payload = await coinImagePayload(chosen, ua);
      if (!payload) continue;
      if (payload.imageDataUrl) return NextResponse.json(payload);
      if (payload.imageUrl) {
        return NextResponse.json({
          ...payload,
          clientFetch: true,
        });
      }
      await new Promise((r) => setTimeout(r, 60 * (round + 1)));
    }
    return NextResponse.json(
      {
        error:
          "Could not pick a random catalog coin with an obverse image. Try again or check Numista API access.",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ error: "Unknown action. Use \"search\", \"photo\", or \"randomPhoto\"." }, { status: 400 });
}
