import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent";
const OPENAI_GENERATIONS = "https://api.openai.com/v1/images/generations";
const OPENAI_EDITS       = "https://api.openai.com/v1/images/edits";
const OPENAI_CHAT        = "https://api.openai.com/v1/chat/completions";

function mimeFromPath(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[ext] ?? "image/jpeg";
}

// ── Gemini handler ────────────────────────────────────────────────────────────
async function generateWithGemini({ prompt, referenceFile, referenceInline, geminiApiKey }) {
  if (!geminiApiKey?.trim()) {
    return { error: "Google AI API key required.", status: 400 };
  }

  let parts;
  if (referenceInline?.base64 && referenceInline?.mimeType) {
    parts = [{ text: prompt }, { inlineData: { mimeType: referenceInline.mimeType, data: referenceInline.base64 } }];
  } else if (referenceFile) {
    const filePath = join(process.cwd(), "public", "references", referenceFile);
    let fileBuffer;
    try { fileBuffer = await readFile(filePath); }
    catch { return { error: `Reference file not found: ${referenceFile}`, status: 400 }; }
    const base64  = fileBuffer.toString("base64");
    const mimeType = mimeFromPath(referenceFile);
    parts = [{ text: prompt }, { inlineData: { mimeType, data: base64 } }];
  } else {
    parts = [{ text: prompt }];
  }

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  });

  let res, data;
  for (let attempt = 0; attempt <= 2; attempt++) {
    res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
      body,
    });
    data = await res.json();
    if (res.status === 429) {
      const retryMatch = data?.error?.message?.match(/retry in ([\d.]+)s/i);
      const waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500 : 30000;
      if (attempt < 2) { await new Promise((r) => setTimeout(r, waitMs)); continue; }
    }
    break;
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.error?.status || `Gemini error ${res.status}`;
    return { error: msg, status: res.status };
  }

  const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) {
    const text   = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || "";
    const reason = data.candidates?.[0]?.finishReason || "";
    return { error: `No image returned.${reason ? ` Finish reason: ${reason}.` : ""}${text ? ` Model: "${text.slice(0, 120)}"` : ""}`, status: 502 };
  }
  return { b64 };
}

// ── GPT-Image-1 handler ───────────────────────────────────────────────────────
async function generateWithGptImage1({ prompt, referenceFile, referenceInline, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key required.", status: 400 };
  }

  const headers = { Authorization: `Bearer ${openaiApiKey}` };

  let res, data;

  if (referenceInline?.base64 && referenceInline?.mimeType) {
    const buf = Buffer.from(referenceInline.base64, "base64");
    const mimeType = referenceInline.mimeType;
    const blob = new Blob([buf], { type: mimeType });
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const fileName = `reference.${ext}`;

    const form = new FormData();
    form.append("image", blob, fileName);
    form.append("prompt", prompt);
    form.append("model", "gpt-image-1.5");
    form.append("size", "1024x1536");
    form.append("quality", "low");
    form.append("n", "1");

    res = await fetch(OPENAI_EDITS, { method: "POST", headers, body: form });
    data = await res.json();
  } else if (referenceFile) {
    // Image edit mode — pass reference photo as the base image
    const filePath = join(process.cwd(), "public", "references", referenceFile);
    let fileBuffer;
    try { fileBuffer = await readFile(filePath); }
    catch { return { error: `Reference file not found: ${referenceFile}`, status: 400 }; }

    const mimeType = mimeFromPath(referenceFile);
    const blob     = new Blob([fileBuffer], { type: mimeType });
    const ext      = referenceFile.split(".").pop()?.toLowerCase() || "png";
    const fileName = `reference.${ext}`;

    const form = new FormData();
    form.append("image",   blob, fileName);
    form.append("prompt",  prompt);
    form.append("model",   "gpt-image-1.5");
    form.append("size",    "1024x1536");
    form.append("quality", "low");
    form.append("n",       "1");

    res  = await fetch(OPENAI_EDITS, { method: "POST", headers, body: form });
    data = await res.json();
  } else {
    // Text-to-image generation
    res = await fetch(OPENAI_GENERATIONS, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:   "gpt-image-1.5",
        prompt,
        size:    "1024x1536",
        quality: "low",
        n:       1,
      }),
    });
    data = await res.json();
  }

  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI error ${res.status}`;
    return { error: msg, status: res.status };
  }

  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return { error: "No image returned from OpenAI.", status: 502 };
  return { b64 };
}

async function identifyWithOpenAI({ imageUrl, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key is not configured on the server.", status: 500 };
  }

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          { type: "text", text: `You are an expert Grailed reseller and thrift evaluator. Analyze this thrift store item photo.

Return ONLY valid JSON — no markdown, no explanation:
{"title": "3-6 word resale title", "price": 45}

Rules:
- title: concise resale product title like "Vintage Chrome Hearts Ring" or "Supreme Box Logo Hoodie" or "Kapital Boro Patchwork Jacket"
- price: realistic Grailed/eBay resale price in USD as an integer

Brand price guidelines:
- Japanese archive (Kapital, Visvim, Undercover, Number Nine, Comme des Garçons, etc.): $150–2000
- High fashion (Rick Owens, Balenciaga, Chrome Hearts, Prada, etc.): $100–1500
- Streetwear (Supreme, BAPE, Off-White, Palace): $60–500
- Gorpcore (Arc'teryx, Patagonia TNF): $40–300
- Vintage workwear (Carhartt, Levi's USA, Dickies): $30–200
- Sneakers (Nike, Jordan, Adidas vintage): $50–400
- General vintage / cultural merch: $15–80

Be decisive. Think like a reseller trying to make money.` },
        ],
      }],
      max_tokens: 60,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data?.error?.message || `OpenAI error ${res.status}`, status: res.status };
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return {
      title: parsed.title?.replace(/^["']|["']$/g, "") || null,
      price: parsed.price ? String(Math.round(Number(parsed.price))) : null,
    };
  } catch {
    return { error: "Could not parse OpenAI identification response.", status: 502 };
  }
}

async function rewordCaptionWithOpenAI({ text, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return { error: "OpenAI API key is not configured on the server.", status: 500 };
  }
  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `You lightly reword this short TikTok slideshow hook so it feels fresh but keeps the same meaning, energy, and emojis. Preserve line breaks as \\n if there are multiple lines. Max 2 lines. Output ONLY the new caption text, no quotes or explanation:\n\n${text}`,
        },
      ],
      max_tokens: 120,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { error: data?.error?.message || `OpenAI error ${res.status}`, status: res.status };
  }

  const data = await res.json();
  let out = data.choices?.[0]?.message?.content?.trim() || "";
  out = out.replace(/^["']|["']$/g, "").trim();
  if (!out) return { error: "Empty reword response.", status: 502 };
  return { text: out };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const {
      action = "generate",
      prompt,
      referenceFile,
      referenceInline,
      imageUrl,
      geminiApiKey: requestGeminiApiKey,
      openaiApiKey: requestOpenaiApiKey,
      model = "gemini",
      text,
    } = await req.json();

    const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || requestOpenaiApiKey?.trim();
    const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || requestGeminiApiKey?.trim();

    let result;
    if (action === "identify") {
      result = await identifyWithOpenAI({ imageUrl, openaiApiKey });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      return NextResponse.json({ title: result.title, price: result.price });
    }

    if (action === "rewordCaption") {
      result = await rewordCaptionWithOpenAI({ text: text ?? "", openaiApiKey });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
      }
      return NextResponse.json({ text: result.text });
    }

    if (model === "gpt-image-1") {
      result = await generateWithGptImage1({ prompt, referenceFile, referenceInline, openaiApiKey });
    } else {
      result = await generateWithGemini({ prompt, referenceFile, referenceInline, geminiApiKey });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }
    return NextResponse.json({ b64: result.b64 });
  } catch (err) {
    console.error("[generate-image]", err);
    return NextResponse.json({ error: err.message || "Unknown server error" }, { status: 500 });
  }
}
