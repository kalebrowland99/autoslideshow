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

function dataUrlToBuffer(imageDataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(String(imageDataUrl || "").trim());
  if (!m) return null;
  try {
    return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

/** GET /api/numista-image?url=… — same-origin proxy for Numista catalogue photos (never redirect). */
export async function GET(req) {
  const url = normalizeRemoteUrl(new URL(req.url).searchParams.get("url"));
  if (!url) {
    return NextResponse.json({ error: "Missing or invalid Numista image url." }, { status: 400 });
  }

  const mode = String(new URL(req.url).searchParams.get("mode") || "").trim().toLowerCase();
  if (mode === "redirect") {
    return NextResponse.json(
      {
        error:
          "Redirect mode is disabled (Numista blocks cross-origin browser loads). Use JSON or mode=raw.",
      },
      { status: 400 },
    );
  }

  const imageDataUrl = await fetchRemoteImageDataUrl(url, "AutoSlideshow Valcoin/1.0 (Numista)");
  if (!imageDataUrl) {
    return NextResponse.json(
      { error: "Could not download image from Numista CDN.", imageUrl: url },
      { status: 502 },
    );
  }

  if (mode === "raw") {
    const parsed = dataUrlToBuffer(imageDataUrl);
    if (!parsed?.buffer?.length) {
      return NextResponse.json({ error: "Invalid image payload." }, { status: 502 });
    }
    return new NextResponse(parsed.buffer, {
      headers: {
        "Content-Type": parsed.mime,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  return NextResponse.json({ imageDataUrl, imageUrl: url });
}
