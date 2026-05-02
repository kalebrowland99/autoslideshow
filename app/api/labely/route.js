import { NextResponse } from "next/server";
import { runImageGenerationPipeline } from "@/lib/imageGenerationBackend";
import { iphoneRetailPhotoImperfectionPrompt } from "@/lib/iphoneRetailPhotoImperfectionPrompt";
import { listPublicReferenceImageRelPaths } from "@/lib/referenceImages";

const LABELY_IPHONE_LOOK = `${iphoneRetailPhotoImperfectionPrompt()}

No text overlays, no captions, no watermarks.`;

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

/** Same prompt skeleton as ConfigPanel starter-pack / Valcoin branch → POST /api/generate-image. */
function buildLabelyPackPromptWithReference({ name, brand, imagePrompt }) {
  const scenePrompt = `${name}. Brand on pack: ${brand}. Packaging notes: ${(imagePrompt || "").trim() || "realistic retail grocery packaging."}`;
  return `
${LABELY_IPHONE_LOOK}

Reference-image rule (CRITICAL): Make the photo EXACT 1:1 as the reference image, just swap out the main packaged food or beverage product to match the subject below.

Subject: ${scenePrompt}

If the subject is an object (packaged snack, bottle, carton, frozen bag), center it and make it visually obvious and physically plausible in the scene.
`.trim();
}

function buildLabelyPackPromptNoReference({ name, brand, imagePrompt }) {
  const scenePrompt = `${name}. Brand on pack: ${brand}. ${(imagePrompt || "").trim() || "Realistic retail grocery packaging."}`;
  return `
${LABELY_IPHONE_LOOK}

Subject: ${scenePrompt}

If the subject is an object (packaged snack, bottle, carton, frozen bag), center it and make it visually obvious what it is.
`.trim();
}

function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Labely is always in the worst band — never "Good" / never reassuring scores. */
function clampLabelyScaryScore(score) {
  const c = clampScore(score);
  return Math.max(5, Math.min(20, c));
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
      score: 12,
      verdict: "Avoid",
      analysisTitle: "Labely's Analysis",
      analysis:
        "Something is wrong under the wrapper: **hexylcrystallene-9** is crawling up the readout, **ortho-flumazine** is spiking like a warning klaxon, and **dextro-9-thylborate** should not be this loud. **Triethyl snackamide** registered twice — that is not normal. Not medical advice.",
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
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content:
            `You are generating content for "Labely", a satirical grocery label-scanning app — horror-adjacent parody, not real toxicology or real health claims.\n\nReturn ONLY valid JSON (no markdown fences, no extra keys) with this exact shape:\n{"name": "...", "brand": "...", "score": 14, "analysisTitle": "Labely\\u2019s Analysis", "analysis": "...", "imagePrompt": "...", "labelyLegalNote": "..."}\n\nProduct fields:\n- name: 3–7 words, realistic grocery retail\n- brand: 1–3 words\n- score: integer **5–20 only** (always catastrophic on Labely\\u2019s scale — never above 20, never reassuring)\n- analysisTitle: exactly "Labely\\u2019s Analysis"\n\nanalysis — **2–4 short sentences**, one paragraph. Tone: **maximally negative, dread-heavy, almost scary** — urgent, ominous, like a corrupted scanner that wants the user unsettled. Not medical advice; invented nonsense only.\n- Invent **3–6 random made-up "bad chemical" names** (absurd pseudo-scientific compounds — NOT real chemicals, NOT real CAS names, do not copy real regulated substances).\n- Wrap **each** invented chemical name in **markdown bold** using **double asterisks** (e.g. **flumazine-7**).\n- Plain text between bold bits should sound **bleak, hostile, or panicked** — never cheerful, never "fine in moderation". Do not bold anything except those invented names.\n- Do not mention lawsuits, recalls, or regulators here — that belongs only in labelyLegalNote.\n\nlabelyLegalNote — plain text, one or two short sentences:\n- If there are no documented lawsuits, class actions, major FDA/regulatory actions, or widely reported recalls tied to this invented brand/product or its key ingredients, set labelyLegalNote to exactly: No lawsuits found.\n- Otherwise summarize only verifiable public-pattern facts; never invent case names, docket numbers, or dates.\n\nimagePrompt: packaging-only cues (shape, materials, label colors, category). No background/lighting.\n\nBe decisive; do not refuse.${hintLine}`,
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

  const score = clampLabelyScaryScore(parsed.score);
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
      score: 11,
      verdict: verdictFromScore(11),
      analysisTitle: "Labely\u2019s Analysis",
      analysis:
        "Labely cannot see the pack yet — imagine **null-phase crylamide** and **void-9-thylate** stacking in the dark. Add **OPENAI_API_KEY** before this gets worse. Not medical advice.",
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
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
            {
              type: "text",
              text: `You are "Labely", a satirical grocery label-scanning app — horror-adjacent parody, not real toxicology or real health claims. Read the photo for product name and brand when visible.

From the photo: read product name and brand when legible. Ingredient lines optional for context only.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{"name":"...","brand":"...","score":12,"analysis":"...","labelyLegalNote":"..."}

Rules:
- name: concise retail product name (3–10 words), Title Case — from the pack when possible, else best guess
- brand: brand on pack (1–4 words), or "" if unknown
- score: integer **5–20 only** — always catastrophic on Labely\\u2019s scale (never above 20, never reassuring)

analysis — **2–4 short sentences**, one paragraph. Tone: **maximally negative, dread-heavy, almost scary** — urgent, ominous, like a corrupted scanner. Not medical advice; invented nonsense only.
- Invent **3–6 random made-up "bad chemical" names** (absurd pseudo-scientific compounds — NOT real chemicals, NOT real CAS names, do not copy real regulated substances).
- Wrap **each** invented chemical name in **markdown bold** (**...**). Do not bold anything except those invented names.
- Plain text between bold bits must sound **bleak, hostile, or panicked** — never cheerful. Tie the dread to what kind of product it looks like. Do not claim real toxins were detected.

labelyLegalNote — plain text:
- If no applicable lawsuits, class actions, FDA/regulatory actions, or major recalls for this exact product/brand (from what you can verify from the package or widely known public facts), set to exactly: No lawsuits found.
- Otherwise one short factual sentence; never invent case names or dates.`,
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

  const score = clampLabelyScaryScore(parsed.score);
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
