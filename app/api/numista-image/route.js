import { NextResponse } from "next/server";
import { fetchRemoteImageBuffer, fetchRemoteImageDataUrl } from "@/lib/fetchRemoteImageDataUrl";

export const runtime = "nodejs";
export const maxDuration = 30;

const NUMISTA_HOST = /^https:\/\/([a-z]{2}\.)?numista\.com\//i;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function normalizeRemoteUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || !NUMISTA_HOST.test(s)) return "";
  return s;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/numista-image?url=…
 * Default: stream image bytes (same-origin, CORS-safe for canvas / html-to-image).
 * ?format=json → { imageDataUrl } when the server can download.
 */
export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const url = normalizeRemoteUrl(params.get("url"));
  if (!url) {
    return NextResponse.json(
      { error: "Missing or invalid Numista image url." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const format = String(params.get("format") || "").trim().toLowerCase();
  if (format === "json") {
    const imageDataUrl = await fetchRemoteImageDataUrl(url, "AutoSlideshow Valcoin/1.0 (Numista)");
    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "Could not download image.", imageUrl: url },
        { status: 502, headers: CORS_HEADERS },
      );
    }
    return NextResponse.json({ imageDataUrl, imageUrl: url }, { headers: CORS_HEADERS });
  }

  const buf = await fetchRemoteImageBuffer(url, "AutoSlideshow Valcoin/1.0 (Numista)");
  if (!buf) {
    return NextResponse.json(
      { error: "Could not download image.", imageUrl: url },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  return new NextResponse(buf.ab, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": buf.mime,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
