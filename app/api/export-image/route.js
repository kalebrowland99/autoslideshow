import { NextResponse } from "next/server";
import { fetchRemoteImageDataUrl } from "@/lib/fetchRemoteImageDataUrl";

export const runtime = "nodejs";
export const maxDuration = 30;

/** HTTPS hosts we proxy for export (SSRF allowlist). */
const ALLOWED_HOST = /^(.*\.)?numista\.com$/i;

function normalizeRemoteUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    if (!ALLOWED_HOST.test(u.hostname)) return "";
    return u.href;
  } catch {
    return "";
  }
}

/** GET /api/export-image?url=… — same-origin image bytes for export (Numista catalogue). */
export async function GET(req) {
  const url = normalizeRemoteUrl(new URL(req.url).searchParams.get("url"));
  if (!url) {
    return NextResponse.json({ error: "Missing or invalid image url." }, { status: 400 });
  }

  const mode = String(new URL(req.url).searchParams.get("mode") || "").trim().toLowerCase();
  const imageDataUrl = await fetchRemoteImageDataUrl(url, "AutoSlideshow/1.0 (export)");
  if (!imageDataUrl) {
    return NextResponse.json({ error: "Could not download image.", imageUrl: url }, { status: 502 });
  }

  if (mode === "raw") {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(imageDataUrl);
    if (!m) {
      return NextResponse.json({ error: "Invalid image payload." }, { status: 502 });
    }
    return new NextResponse(Buffer.from(m[2], "base64"), {
      headers: {
        "Content-Type": m[1],
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  return NextResponse.json({ imageDataUrl, imageUrl: url });
}
