import { NextResponse } from "next/server";
import { fetchRemoteImageDataUrl } from "@/lib/fetchRemoteImageDataUrl";

export const runtime = "nodejs";
export const maxDuration = 30;

const NUMISTA_HOST = /^https:\/\/([a-z]{2}\.)?numista\.com\//i;

function normalizeRemoteUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || !NUMISTA_HOST.test(s)) return "";
  return s;
}

/** GET /api/numista-image?url=… — proxy or redirect Numista catalogue photos. */
export async function GET(req) {
  const url = normalizeRemoteUrl(new URL(req.url).searchParams.get("url"));
  if (!url) {
    return NextResponse.json({ error: "Missing or invalid Numista image url." }, { status: 400 });
  }

  const mode = String(new URL(req.url).searchParams.get("mode") || "").trim().toLowerCase();
  if (mode === "redirect") {
    return NextResponse.redirect(url, 302);
  }

  const imageDataUrl = await fetchRemoteImageDataUrl(url, "AutoSlideshow Valcoin/1.0 (Numista)");
  if (!imageDataUrl) {
    return NextResponse.json(
      { error: "Could not download image.", imageUrl: url },
      { status: 502 },
    );
  }

  return NextResponse.json({ imageDataUrl, imageUrl: url });
}
