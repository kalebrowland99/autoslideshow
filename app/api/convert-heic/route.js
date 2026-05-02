import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

/**
 * Decode iPhone HEIC/HEIF (and other formats Sharp accepts) → JPEG data URL.
 * Client-side WASM (heic2any) often fails in Chrome; Sharp uses libvips HEIF when available.
 */
export async function POST(req) {
  try {
    const ct = req.headers.get("content-type") || "";
    let buffer;

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("file");
      if (!f || typeof f === "string") {
        return NextResponse.json({ error: "Missing multipart field `file`." }, { status: 400 });
      }
      buffer = Buffer.from(await f.arrayBuffer());
    } else {
      const json = await req.json().catch(() => ({}));
      const raw = typeof json.base64 === "string" ? json.base64.trim() : "";
      const b64 = raw.includes(",") ? raw.replace(/^data:[^;]+;base64,/i, "") : raw;
      if (!b64) {
        return NextResponse.json(
          { error: "Send multipart/form-data with `file`, or JSON `{ base64 }`." },
          { status: 400 }
        );
      }
      buffer = Buffer.from(b64, "base64");
    }

    if (!buffer?.length) {
      return NextResponse.json({ error: "Empty file." }, { status: 400 });
    }

    const jpeg = await sharp(buffer).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();

    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    return NextResponse.json({ dataUrl });
  } catch (err) {
    console.error("[convert-heic]", err);
    return NextResponse.json(
      {
        error:
          err?.message?.includes("unsupported image format") || err?.message?.includes("heif")
            ? "HEIC decode unavailable on this server (Sharp/libvips HEIF)."
            : err?.message || "Could not convert image.",
      },
      { status: 422 }
    );
  }
}
