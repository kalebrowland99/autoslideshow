import { NextResponse } from "next/server";
import { fetchRemoteImageDataUrl } from "@/lib/fetchRemoteImageDataUrl";

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

async function numistaJson(path, apiKey) {
  const res = await fetch(`${NUMISTA_API}${path}`, {
    headers: {
      Accept: "application/json",
      "Numista-API-Key": apiKey,
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: errText.slice(0, 200) || `HTTP ${res.status}` };
  }
  const data = await res.json().catch(() => null);
  return { ok: true, data };
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

function pickBestType(types, query) {
  const qNorm = normalizeCoinText(query);
  if (!Array.isArray(types) || types.length === 0) return null;
  const ranked = types
    .map((t) => ({ t, score: scoreTypeAgainstQuery(t, qNorm) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.t || types[0];
}

function obverseUrlFromType(t) {
  if (!t || typeof t !== "object") return "";
  return (
    String(t.obverse_picture || "").trim() ||
    String(t.obverse_thumbnail || "").trim() ||
    ""
  );
}

/** GET /types/{id} may return the type at root or under `type`. */
function unwrapTypePayload(data) {
  if (!data || typeof data !== "object") return null;
  if (data.type && typeof data.type === "object" && data.type.id != null) return data.type;
  if (data.id != null) return data;
  return data;
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
      const best = pickBestType(types, query);
      if (best?.id) {
        const d = await numistaJson(`/types/${best.id}`, apiKey);
        if (d.ok && d.data) chosen = unwrapTypePayload(d.data) || best;
        else chosen = best;
      }
    }

    const thumb = obverseUrlFromType(chosen);
    if (!thumb) {
      return NextResponse.json(
        { error: "No Numista obverse image found for that coin. Try a different name or disable Numista photos to use AI." },
        { status: 404 },
      );
    }

    const imageDataUrl = await fetchRemoteImageDataUrl(thumb, "AutoSlideshow Valcoin/1.0 (Numista)");
    if (!imageDataUrl) {
      return NextResponse.json({ error: "Could not download coin image from Numista." }, { status: 502 });
    }

    return NextResponse.json({
      imageDataUrl,
      title: String(chosen?.title || "").trim(),
      typeId: chosen?.id != null ? Number(chosen.id) : null,
    });
  }

  return NextResponse.json({ error: "Unknown action. Use \"search\" or \"photo\"." }, { status: 400 });
}
