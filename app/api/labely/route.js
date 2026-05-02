import { NextResponse } from "next/server";
import { runImageGenerationPipeline } from "@/lib/imageGenerationBackend";
import { listPublicReferenceImageRelPaths } from "@/lib/referenceImages";

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

/** Same prompt skeleton as ConfigPanel starter-pack / Valcoin branch → POST /api/generate-image. */
function buildLabelyPackPromptWithReference({ name, brand, imagePrompt }) {
  const scenePrompt = `${name}. Brand on pack: ${brand}. Packaging notes: ${(imagePrompt || "").trim() || "realistic retail grocery packaging."}`;
  return `
Aspect ratio requirement: Generate the image in 9:16 vertical portrait orientation only. Mandatory.

Make it look like a real iPhone photo (default Camera app, no Portrait mode, no filters). Natural color, indoor fluorescent lighting if applicable. Deep focus, not blurry, not cinematic. No text overlays, no captions, no watermarks.

Reference-image rule (CRITICAL): Make the photo EXACT 1:1 as the reference image, just swap out the main packaged food or beverage product to match the subject below.

Subject: ${scenePrompt}

If the subject is an object (packaged snack, bottle, carton, frozen bag), center it and make it visually obvious and physically plausible in the scene.
`.trim();
}

function buildLabelyPackPromptNoReference({ name, brand, imagePrompt }) {
  const scenePrompt = `${name}. Brand on pack: ${brand}. ${(imagePrompt || "").trim() || "Realistic retail grocery packaging."}`;
  return `
Aspect ratio requirement: Generate the image in 9:16 vertical portrait orientation only. Mandatory.

Make it look like a real iPhone photo (default Camera app, no Portrait mode, no filters). Natural color, indoor fluorescent lighting if applicable. Deep focus, not blurry, not cinematic. No text overlays, no captions, no watermarks.

Subject: ${scenePrompt}

If the subject is an object (packaged snack, bottle, carton, frozen bag), center it and make it visually obvious what it is.
`.trim();
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

function normalizeLabelyLegalNote(s) {
  const t = typeof s === "string" ? s.trim() : "";
  return t || "No lawsuits found.";
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
        "The **Whole Wheat Fig Apple Cinnamon** bar scores low for everyday snacking because it leans on refined sweeteners, canola-based fat, and several texture additives typical of highly processed snack bars — fine occasionally, but not what most people want as a daily default.",
      labelyLegalNote: "No lawsuits found.",
      imagePrompt:
        "Rectangular paperboard snack bar box, matte finish, earth-tone label with fruit illustration, nutrition facts panel visible — packaging cues only.",
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
      temperature: 0.55,
      max_tokens: 900,
      messages: [
        {
          role: "user",
          content:
            `You are generating content for "Labely", a grocery label-scanning style app. Be concrete about ingredients and processing — not vague wellness talk.\n\nReturn ONLY valid JSON (no markdown fences, no extra keys) with this exact shape:\n{"name": "...", "brand": "...", "score": 42, "analysisTitle": "Labely\\u2019s Analysis", "analysis": "...", "imagePrompt": "...", "labelyLegalNote": "..."}\n\nProduct fields:\n- name: 3–7 words, realistic grocery retail\n- brand: 1–3 words\n- score: integer 0–100\n- analysisTitle: exactly "Labely\\u2019s Analysis"\n\nanalysis — one flowing paragraph, 5–8 sentences. Not medical advice.\n- Use **markdown bold** only **1 to 3 times total** in the entire analysis (count **pairs**). Typically: bold the **product name** once, then at most **two** other bold spans for the most important ingredient or concern — never more than three bold spans.\n- Without extra bolding, still name specific additives, oils, sweeteners, and processing issues in plain text where relevant.\n- Do not mention lawsuits, recalls, or regulators here — that belongs only in labelyLegalNote.\n\nlabelyLegalNote — plain text, one or two short sentences:\n- If there are no documented lawsuits, class actions, major FDA/regulatory actions, or widely reported recalls tied to this invented brand/product or its key ingredients, set labelyLegalNote to exactly: No lawsuits found.\n- Otherwise summarize only verifiable public-pattern facts; never invent case names, docket numbers, or dates.\n\nimagePrompt: packaging-only cues (shape, materials, label colors, category). No background/lighting.\n\nBe decisive; do not refuse.${hintLine}`,
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
    labelyLegalNote: normalizeLabelyLegalNote(parsed.labelyLegalNote),
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
      labelyLegalNote: "No lawsuits found.",
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
              text: `You are "Labely", a grocery label-scanning analyst. Prioritize what is literally visible on the package (ingredient list, Nutrition Facts, claims). Infer cautiously only where the label is unreadable.

From the photo: read product name, brand, and every ingredient line you can see. Prefer quoting real label language.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{"name":"...","brand":"...","score":0,"analysis":"...","labelyLegalNote":"..."}

Rules:
- name: concise retail product name (3–10 words), Title Case, as on shelf
- brand: brand on pack (1–4 words), or "" if unknown
- score: integer 0–100 (whole/minimally processed / simple ingredients higher; ultra-processed, artificial sweeteners, heavy sugar/sodium, controversial additives → lower)

analysis — ONE flowing paragraph, 6–10 sentences (no bullets). Premium scanner tone; concrete detail in plain text:
- Use **markdown bold** only **1 to 3 times total** (count **pairs**). Usually bold the **product name** once; optionally bold one or two other critical ingredients — never more than three bold spans.
- Name specific ingredients, additives, and nutrition issues from the label in full sentences; do not rely only on bold for detail.
- Do not mention lawsuits or regulators in analysis — use labelyLegalNote only.

labelyLegalNote — plain text:
- If no applicable lawsuits, class actions, FDA/regulatory actions, or major recalls for this exact product/brand (from what you can verify from the package or widely known public facts), set to exactly: No lawsuits found.
- Otherwise one short factual sentence; never invent case names or dates.

Not medical advice. Tone: helpful, decisive, not alarmist.`,
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
    labelyLegalNote: normalizeLabelyLegalNote(parsed.labelyLegalNote),
  };
}

/** Uses the same backend as Thrifty → `/api/generate-image` with GPT Image only (no Gemini). */
async function generateProductImage({ imagePrompt, name, brand }) {
  const promptOk = (imagePrompt || "").trim();
  const titleOk = (name || "").trim() || (brand || "").trim();
  if (!promptOk && !titleOk) return null;

  const refs = await listPublicReferenceImageRelPaths("labely");
  const refFile = refs.length > 0 ? refs[Math.floor(Math.random() * refs.length)] : null;

  const prompt = refFile
    ? buildLabelyPackPromptWithReference({
        name: name || "Packaged product",
        brand: brand || "",
        imagePrompt: promptOk || "Realistic retail grocery packaging.",
      })
    : buildLabelyPackPromptNoReference({
        name: name || "Packaged product",
        brand: brand || "",
        imagePrompt: promptOk || "Realistic retail grocery packaging.",
      });

  const result = await runImageGenerationPipeline({
    prompt,
    referenceFile: refFile || null,
    referenceInline: undefined,
    referenceRoot: refFile ? "labely/references" : undefined,
    model: "gpt-image-1",
  });

  if (result.error) {
    console.error("[labely] image pipeline", result.error);
    return null;
  }
  if (result.b64) return `data:image/png;base64,${result.b64}`;
  return null;
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
        labelyLegalNote: analyzed.labelyLegalNote,
        imageDataUrl: null,
      });
    }

    const base = await generateLabelyJson({ openaiApiKey, seedHint });
    let outImage = null;
    try {
      outImage = await generateProductImage({
        imagePrompt: base.imagePrompt,
        name: base.name,
        brand: base.brand,
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
      labelyLegalNote: base.labelyLegalNote,
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
