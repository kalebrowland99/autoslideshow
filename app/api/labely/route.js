import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";
const OPENAI_GENERATIONS = "https://api.openai.com/v1/images/generations";
const OPENAI_EDITS = "https://api.openai.com/v1/images/edits";

function mimeFromPath(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[ext] ?? "image/jpeg";
}

async function listLabelyReferenceBasenames() {
  const dir = join(process.cwd(), "public", "labely", "references");
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  return entries.filter((e) => /\.(jpe?g|png|webp|gif)$/i.test(e));
}

function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function verdictFromScore(score) {
  const s = clampScore(score);
  if (s <= 20) return "Avoid";
  if (s <= 60) return "Limit";
  return "Good";
}

async function generateLabelyJson({ openaiApiKey, seedHint }) {
  const hintLine =
    typeof seedHint === "string" && seedHint.trim()
      ? `\n\nOptional inspiration — invent a realistic packaged grocery product that fits this idea (name/brand may differ): ${seedHint.trim()}`
      : "";

  if (!openaiApiKey) {
    return {
      name: "Whole Wheat Fig Apple Cinnamon",
      brand: "Nature's Bakery",
      score: 0,
      verdict: "Avoid",
      analysisTitle: "Labely's Analysis",
      analysis:
        "The **Whole Wheat Fig Apple Cinnamon** bar scored low because it relies on **canola oil** (a **seed oil**) and several processed sugars like **cane sugar** and **brown rice syrup**. It also contains multiple additives such as **glycerin**, **pectin**, and **citric acid**, which push it into the highly processed category. For everyday snacking, simpler options with fewer processed ingredients and no seed oils would be a better fit for your goals.",
      imagePrompt:
        "A clean product photo of a boxed snack bar package on a plain white background, realistic studio lighting, centered, sharp focus, minimal shadow, 1:1.",
    };
  }

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 450,
      messages: [
        {
          role: "user",
          content:
            `You are generating content for an app called "Labely" that gives a simple 0-100 score and a short explanation.\n\nReturn ONLY valid JSON (no markdown, no extra keys) with this exact shape:\n{"name": "...", "brand": "...", "score": 42, "analysisTitle": "Labely\\u2019s Analysis", "analysis": "...", "imagePrompt": "..."}\n\nRules:\n- name: 3-7 words, like a real grocery item\n- brand: 1-3 words\n- score: integer 0-100\n- analysisTitle: exactly "Labely\\u2019s Analysis"\n- analysis: 2-4 sentences; REQUIRED **markdown bold** on the product **name** once and on each concerning ingredient or class you mention (e.g. **seed oils**, **carrageenan**); leave non-problem phrases unbolded\n- imagePrompt: concise prompt for generating a realistic product photo for this item (boxed/bottled/etc) on a plain background\n- Be decisive; do not hedge or refuse.${hintLine}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Could not parse model JSON.");
  }

  const score = clampScore(parsed.score);
  return {
    name: String(parsed.name || "").trim(),
    brand: String(parsed.brand || "").trim(),
    score,
    verdict: verdictFromScore(score),
    analysisTitle: "Labely\u2019s Analysis",
    analysis: String(parsed.analysis || "").trim(),
    imagePrompt: String(parsed.imagePrompt || "").trim(),
  };
}

async function analyzePackagingImage({ imageDataUrl, openaiApiKey }) {
  if (!openaiApiKey?.trim()) {
    return {
      name: "Packaged product",
      brand: "",
      score: 50,
      verdict: verdictFromScore(50),
      analysisTitle: "Labely\u2019s Analysis",
      analysis:
        "Add **OPENAI_API_KEY** on the server to enable vision analysis of your uploaded product photos.",
    };
  }

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.35,
      max_tokens: 900,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
            {
              type: "text",
              text: `You are "Labely", a grocery / packaged-food nutrition analyst (like a clear in-app product card).

From the packaging photo, read labels and infer the exact product name and brand as shown (best guess if partially obscured).

Return ONLY valid JSON (no markdown fences) with this exact shape:
{"name":"...","brand":"...","score":0,"analysis":"..."}

Rules:
- name: concise retail product name (3–10 words), Title Case, as a shopper would say it
- brand: brand on pack (1–4 words), or "" if unknown
- score: integer 0–100 (whole/minimally processed / simple ingredients higher; ultra-processed, artificial sweeteners, heavy sugar, controversial additives, seed oils where relevant → lower)
- analysis: ONE flowing paragraph only (no bullets, no numbered lists, no line breaks). Length about 4–8 sentences, like a premium food-scanning app summary.
  Markdown bold (wrap text in **double asterisks**) is REQUIRED for scannability: (1) bold the full product **name** exactly once in the opening clause; (2) bold every concerning ingredient, additive, sweetener, oil, or ingredient class you name (e.g. **sucralose**, **acesulfame potassium**, **carrageenan**, **artificial sweeteners**, **seed oils**, **high-fructose corn syrup**). Aim for roughly 4–8 bold spans total so negatives pop like a premium label-scan app. Leave the closing balanced takeaway sentence unbolded unless it repeats a specific ingredient name. Plain sentences between bold phrases stay regular weight. Tone: helpful, decisive, not alarmist.`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Could not parse vision JSON.");
  }

  const score = clampScore(parsed.score);
  return {
    name: String(parsed.name || "").trim() || "Product",
    brand: String(parsed.brand || "").trim(),
    score,
    verdict: verdictFromScore(score),
    analysisTitle: "Labely\u2019s Analysis",
    analysis: String(parsed.analysis || "").trim(),
  };
}

async function generateProductImage({ openaiApiKey, imagePrompt }) {
  if (!openaiApiKey) return null;
  if (!imagePrompt) return null;

  const headers = { Authorization: `Bearer ${openaiApiKey}` };
  const refs = await listLabelyReferenceBasenames();
  const refName = refs.length > 0 ? refs[Math.floor(Math.random() * refs.length)] : null;

  if (refName) {
    const filePath = join(process.cwd(), "public", "labely", "references", refName);
    let fileBuffer;
    try {
      fileBuffer = await readFile(filePath);
    } catch {
      fileBuffer = null;
    }
    if (fileBuffer) {
      const mimeType = mimeFromPath(refName);
      const blob = new Blob([fileBuffer], { type: mimeType });
      const ext = refName.split(".").pop()?.toLowerCase() || "png";
      const fileName = `reference.${ext}`;
      const form = new FormData();
      form.append("image", blob, fileName);
      form.append("prompt", imagePrompt);
      form.append("model", "gpt-image-1.5");
      form.append("size", "1024x1024");
      form.append("quality", "low");
      form.append("n", "1");

      const editRes = await fetch(OPENAI_EDITS, { method: "POST", headers, body: form });
      const editData = await editRes.json().catch(() => ({}));
      const b64Edit = editData?.data?.[0]?.b64_json;
      if (editRes.ok && b64Edit) {
        return `data:image/png;base64,${b64Edit}`;
      }
      console.error("[labely] reference edit failed; falling back to text-to-image", editData?.error || editRes.status);
    }
  }

  const res = await fetch(OPENAI_GENERATIONS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      model: "gpt-image-1.5",
      prompt: imagePrompt,
      size: "1024x1024",
      quality: "low",
      n: 1,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI image error ${res.status}`);
  }

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return null;
  return `data:image/png;base64,${b64}`;
}

export async function POST(req) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || "";
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";
    const seedHint = typeof body.seedHint === "string" ? body.seedHint.trim() : "";

    if (imageDataUrl) {
      const analyzed = await analyzePackagingImage({ imageDataUrl, openaiApiKey });
      return NextResponse.json({
        name: analyzed.name,
        brand: analyzed.brand,
        score: analyzed.score,
        verdict: analyzed.verdict,
        analysisTitle: analyzed.analysisTitle,
        analysis: analyzed.analysis,
        imageDataUrl: null,
      });
    }

    const base = await generateLabelyJson({ openaiApiKey, seedHint });
    let outImage = null;
    try {
      outImage = await generateProductImage({
        openaiApiKey,
        imagePrompt: base.imagePrompt,
      });
    } catch (e) {
      console.error("[labely] image generation failed", e);
      outImage = null;
    }

    return NextResponse.json({
      name: base.name,
      brand: base.brand,
      score: base.score,
      verdict: base.verdict,
      analysisTitle: base.analysisTitle,
      analysis: base.analysis,
      imageDataUrl: outImage,
    });
  } catch (err) {
    console.error("[labely]", err);
    return NextResponse.json(
      { error: err?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}
