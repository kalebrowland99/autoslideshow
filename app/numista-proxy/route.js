import { NextResponse } from "next/server";
import { fetchRemoteImageDataUrl } from "@/lib/fetchRemoteImageDataUrl";

export const runtime = "nodejs";

const NUMISTA_HOST = /^https:\/\/([a-z]{2}\.)?numista\.com\//i;

function normalizeRemoteUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || !NUMISTA_HOST.test(s)) return "";
  return s;
}

/**
 * Fallback when the service worker is not active yet (first visit).
 * Prefer SW on repeat visits — it uses the user's network, not Vercel egress.
 */
export async function GET(req) {
  const url = normalizeRemoteUrl(new URL(req.url).searchParams.get("url"));
  if (!url) {
    return NextResponse.json({ error: "Missing or invalid Numista image url." }, { status: 400 });
  }

  const imageDataUrl = await fetchRemoteImageDataUrl(
    url,
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  );
  if (!imageDataUrl) {
    return new NextResponse("Could not download image.", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const m = /^data:([^;]+);base64,(.+)$/i.exec(imageDataUrl);
  if (!m) {
    return new NextResponse("Invalid image payload.", { status: 502 });
  }

  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: {
      "Content-Type": m[1],
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
