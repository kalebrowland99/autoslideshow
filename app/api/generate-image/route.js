import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent";

// Infer MIME type from file extension
function mimeFromPath(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[ext] ?? "image/jpeg";
}

export async function POST(req) {
  try {
    const { prompt, referenceFile, geminiApiKey } = await req.json();

    if (!geminiApiKey?.trim()) {
      return NextResponse.json({ error: "Google AI API key required." }, { status: 400 });
    }

    let parts;

    if (referenceFile) {
      // Read directly from public/references/ — no self-HTTP, no CORS, no stack overflow
      const filePath = join(process.cwd(), "public", "references", referenceFile);
      let fileBuffer;
      try {
        fileBuffer = await readFile(filePath);
      } catch {
        return NextResponse.json({ error: `Reference file not found: ${referenceFile}` }, { status: 400 });
      }
      const base64 = fileBuffer.toString("base64");
      const mimeType = mimeFromPath(referenceFile);

      parts = [
        { text: prompt },
        { inlineData: { mimeType, data: base64 } },
      ];
    } else {
      parts = [{ text: prompt }];
    }

    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });

    // Retry up to 2 extra times on rate-limit (429) with the suggested retry delay
    let res, data;
    for (let attempt = 0; attempt <= 2; attempt++) {
      res = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
        body,
      });
      data = await res.json();

      if (res.status === 429) {
        // Parse retry delay from error message ("retry in X.XXs")
        const retryMatch = data?.error?.message?.match(/retry in ([\d.]+)s/i);
        const waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500 : 30000;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }
      break;
    }

    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.status || `Gemini error ${res.status}`;
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (!b64) {
      const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || "";
      const reason = data.candidates?.[0]?.finishReason || "";
      return NextResponse.json(
        { error: `No image returned.${reason ? ` Finish reason: ${reason}.` : ""}${text ? ` Model: "${text.slice(0, 120)}"` : ""}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ b64 });
  } catch (err) {
    console.error("[generate-image]", err);
    return NextResponse.json({ error: err.message || "Unknown server error" }, { status: 500 });
  }
}
