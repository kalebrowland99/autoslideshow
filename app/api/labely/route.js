import { NextResponse } from "next/server";
import { runImageGenerationPipeline } from "@/lib/imageGenerationBackend";
import { iphoneRetailPhotoImperfectionPrompt } from "@/lib/iphoneRetailPhotoImperfectionPrompt";
import { listPublicReferenceImageRelPaths } from "@/lib/referenceImages";

const LABELY_IPHONE_LOOK = `${iphoneRetailPhotoImperfectionPrompt()}

No text overlays, no captions, no watermarks.`;

/** Labely AI pack shots: discarded-in-bin look (always applied in image prompts). */
const LABELY_TRASH_COMPOSITION = `
Trash-can scene (CRITICAL — every image):
- The product sits **inside or right against a household trash can** (plastic step-bin or simple metal kitchen bin). **Scale must be believable**: the pack’s size vs the can rim, wall height, and opening must match real life (typical grocery pack in a normal kitchen trash can — never doll-sized or billboard-sized).
- A **thin white or gray plastic trash-bag liner** is always in frame and **always drapes over roughly half the product** (about 45–55% obscured — part of the front or one long side hidden; the rest still clearly shows the real SKU).
- **Packaging wear (pick a believable mix):** slight **dents** or crushed corners, **discolored** or sun-faded ink, scuffs, soft creases. The pack may be **upside down, on its side, or at a random roll/yaw** — any plausible tumble angle; **never** perfectly squared to the camera unless it would naturally land that way.
- **Surface detail:** fine **dust specks**, lint, or crumbs on the bag and pack where light catches them.
- **Printed “specs” on the pack:** show real-looking **nutrition facts, ingredients blur, barcode, net weight** where the visible faces allow — worn but partly readable like a phone photo, not fake fantasy type.
- **Framing (not a macro):** Medium-wide iPhone distance — include a clear slice of the **can rim, bag, and bin context**; the hero pack should read at roughly **half to two-thirds** of the 9:16 frame height, **not** an ultra-tight crop that fills the entire frame edge-to-edge.
`.trim();

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

/** Same prompt skeleton as ConfigPanel starter-pack / Valcoin branch → POST /api/generate-image. */
function buildLabelyPackPromptWithReference({ name, brand, imagePrompt }) {
  const scenePrompt = `${name}. Brand on pack: ${brand}. Packaging notes: ${(imagePrompt || "").trim() || "realistic retail grocery packaging."}`;
  return `
${LABELY_IPHONE_LOOK}

${LABELY_TRASH_COMPOSITION}

Reference-image rule: Use the reference image for **iPhone photo character** (noise, color, mild lens smear) only. **Replace the environment** with the trash-can scene above — not the reference’s original room/shelf. Swap the hero product to match the subject below.

Subject: ${scenePrompt}

Packaging must look like the **real** retail product and brand named above (authentic trade dress, true logo shapes and colors shoppers recognize). No parody brands or invented lookalike packs.

Place the pack **plausibly in or against the bin** (may be off-center, tilted, or partly inside the bag) so it reads as a real discarded grocery item.
`.trim();
}

function buildLabelyPackPromptNoReference({ name, brand, imagePrompt }) {
  const scenePrompt = `${name}. Brand on pack: ${brand}. ${(imagePrompt || "").trim() || "Realistic retail grocery packaging."}`;
  return `
${LABELY_IPHONE_LOOK}

${LABELY_TRASH_COMPOSITION}

Subject: ${scenePrompt}

Packaging must look like the **real** retail product and brand named above (authentic trade dress, true logo shapes and colors). No parody or generic knockoff design.

Place the pack **plausibly in or against the bin** (may be off-center, tilted, or partly inside the bag) so it reads as a real discarded grocery item.
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
  const trimmedSeed = typeof seedHint === "string" ? seedHint.trim() : "";
  const hintLine = trimmedSeed
    ? `\n\nUSER SEED (mandatory): "${trimmedSeed}". If this names a **known real grocery product** (e.g. Oreo, Diet Coke, Cheerios), set **name** and **brand** to that **actual** retail SKU and owner as sold in stores — not a fictional soundalike. If the seed is broad ("energy drink", "cereal"), pick **one specific real flagship SKU** (real brand + real product line). **imagePrompt** must describe **authentic** packaging for that exact product (true colors, logo, pack shape).`
    : `\n\nNo user seed: choose **one specific real retail grocery SKU** consumers can buy (authentic brand + product name). Do not invent fictional brand names or fake "Store Brand" stand-ins for the pack shot.`;
  const varietyLine = `\n\nUniqueness (request ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}): Use a fresh opening and wholly new **fictional** scanner compound names in analysis only; vary which attributes you emphasize (e.g. sugar load, sodium, fats, shelf-stable texture, portion realism, marketing claims). Do not echo canned phrases from prior outputs.`;

  if (!openaiApiKey) {
    return {
      name: "Whole Wheat Fig Apple Cinnamon",
      brand: "Nature's Bakery",
      score: 12,
      verdict: "Avoid",
      analysisTitle: "Labely's Analysis",
      analysis:
        "For a whole-grain fig bar positioned as an everyday snack, the panel pattern matches other shelf-stable bars: added sweetness and texture aids are common. This scan calls out elevated markers for **hexylcrystallene-9**, **ortho-flumazine**, and **dextro-9-thylborate**, with **triethyl snackamide** showing repeat hits on the texture stack. Not medical advice.",
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
      temperature: 0.82,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content:
            `You are generating JSON for "Labely", a grocery label-scanning style app. The **packaging and product identity must be a real retail SKU** (authentic brand + product name as shoppers would find in a supermarket). The **writeup** sounds like a realistic label scan — but Labely flags risk using **fictional compound names only** in analysis (satirical scanner hits, **not** real toxicology or real chemical hazards).\n\nReturn ONLY valid JSON (no markdown fences, no extra keys) with this exact shape:\n{"name": "...", "brand": "...", "score": 14, "analysisTitle": "Labely\\u2019s Analysis", "analysis": "...", "imagePrompt": "...", "labelyLegalNote": "..."}\n\nProduct fields:\n- name: 3–7 words — **real** product as on shelf (match the user seed when provided; otherwise pick a specific real SKU)\n- brand: 1–3 words — **real** brand on pack (Oreo, Coca-Cola, Kellogg\\u2019s, etc. — never invented brand names)\n- score: integer **5–20 only** (Labely\\u2019s harsh internal scale — never above 20)\n- analysisTitle: exactly "Labely\\u2019s Analysis"\n\nanalysis — **2–4 short sentences**, one paragraph, **unique wording every generation**.\n- **Tone:** calm, specific, slightly skeptical analyst — like in-app nutrition copy. **No** horror, dread, gothic, or magical metaphors (ban words such as: sinister, nightmare, terror, curse, whisper, shrouded, doom, apocalypse, haunted, evil, "unknown horrors"). **No** ALL-CAPS scare lines.\n- **Grounding:** tie plain text to this **real** product\\u2019s role (snack, soda, cereal, frozen meal, etc.) and plausible label themes (sweetness, sodium, fats, ultra-processing, portions, claims vs ingredients). Then weave **3–5 new fictional "chemical" names** each run (plausible-sounding gibberish — **not** real CAS/IUPAC names, **not** real regulated substances, **not** implying real lab detection). Wrap **each** fictional name in **markdown bold** only. Do **not** bold the product name or real nutrient words.\n- Do **not** claim real lab tests, lawsuits, diseases, or regulatory actions in analysis.\n- Do not mention lawsuits, recalls, or regulators here — use labelyLegalNote only.\n\nlabelyLegalNote — plain text, one or two short sentences:\n- If there are no documented lawsuits, class actions, major FDA/regulatory actions, or widely reported recalls tied to this **real** brand/product line in general knowledge, set labelyLegalNote to exactly: No lawsuits found.\n- Otherwise summarize only verifiable public-pattern facts; never invent case names, docket numbers, or dates.\n\nimagePrompt: **only** short extra cues for the image model (flavor line, pack material, which faces stay visible). The **fixed scene** (trash can, bag ~half covering, dents/discoloration/rotation, dust specks, label specs) is added server-side — here describe **authentic retail identity** for the named real product (true colors, logo, format) plus optional imperfection hints (e.g. dented corner, faded nutrition panel). No watermarks.\n\nBe decisive; do not refuse.${varietyLine}${hintLine}`,
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
        "Vision is offline. Configure **OPENAI_API_KEY** to run label OCR; until then placeholder markers **null-phase crylamide** and **void-9-thylate** stand in for uncaptured spectra. Not medical advice.",
      labelyLegalNote: "No lawsuits found.",
    };
  }

  const varietyLine = `\n\nUniqueness (request ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}): New fake compound names and a different analytical lead every time; do not reuse horror-style or gothic phrasing.`;

  const visionUserText = `You are "Labely", a grocery label-scanning style app. Write like a **realistic in-app ingredient analysis** of the **actual packaged product in the photo** — grounded in what is visible (name, brand, category, claims, Nutrition Facts if readable) — while flagging concerns using **fictional compound names only** (satirical markers, not real lab results or real toxicology).

Read the photo carefully: product name, brand, food category, and any legible nutrition or ingredient cues. If text is unreadable, infer only obvious grocery-category defaults; do not invent specific real ingredients you cannot see.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{"name":"...","brand":"...","score":12,"analysis":"...","labelyLegalNote":"..."}

Rules:
- name: concise retail product name (3–10 words), Title Case — from the pack when possible, else best guess
- brand: brand on pack (1–4 words), or "" if unknown
- score: integer **5–20 only** (Labely\\u2019s harsh internal scale — never above 20)

analysis — **2–4 short sentences**, one paragraph, **unique wording each run**.
- **Tone:** measured, analyst-like, specific to **this** SKU and what the label suggests. **No** horror, dread, gothic, or magical metaphors (ban: sinister, nightmare, terror, curse, whisper, shrouded, doom, apocalypse, haunted, evil, "unknown horrors"). **No** ALL-CAPS scare lines.
- Tie plain text to **visible** or clearly inferable facts (e.g. "frozen novelty bar", "flavored sparkling water", sodium/sugar per serving if shown). Then weave **3–5 invented compound names** (not real chemicals, not real CAS names) as fictional scanner hits; wrap **each** in **markdown bold** only.
- Do **not** claim a real toxin was detected, a real disease risk, or a real lawsuit in analysis.
- Do not mention lawsuits, recalls, or regulators in analysis — use labelyLegalNote only.

labelyLegalNote — plain text:
- If no applicable lawsuits, class actions, FDA/regulatory actions, or major recalls for this exact product/brand (from what you can verify from the package or widely known public facts), set to exactly: No lawsuits found.
- Otherwise one short factual sentence; never invent case names or dates.${varietyLine}`;

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.72,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
            {
              type: "text",
              text: visionUserText,
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
