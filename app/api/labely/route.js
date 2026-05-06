import { NextResponse } from "next/server";
import { runImageGenerationPipeline } from "@/lib/imageGenerationBackend";
import { iphoneRetailPhotoImperfectionPrompt } from "@/lib/iphoneRetailPhotoImperfectionPrompt";
import { listPublicReferenceImageRelPaths } from "@/lib/referenceImages";
import { clampLabelyScore, ratingLabelFromScore } from "@/lib/labelyRating";

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
const OPEN_FOOD_FACTS_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";

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

/** Strip paths / limit length — weak hint only when labels are unreadable. */
function sanitizeUploadHint(raw) {
  if (typeof raw !== "string") return "";
  const leaf = raw.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!leaf) return "";
  return leaf.slice(0, 160);
}

/** Clean-ingredient analyst prompt (photo + text-only variants extend this). */
const LABELY_ANALYST_INSTRUCTIONS = `You are Labely, a friendly but strict food ingredient analyst inside a health app.

Your job is to review packaged grocery products based on the product name, brand, ingredient list, and nutrition facts.

Analyze the product like a strict "clean ingredient" app. Focus heavily on:
- Artificial sweeteners
- Seed oils
- Added sugars
- Syrups
- Gums
- Emulsifiers
- Preservatives
- Artificial flavors
- Highly processed additives
- Long or complicated ingredient lists
- Whether the product feels like a clean everyday option or a processed occasional option

IMPORTANT RULES:
- **Fictional "scanner compounds" (required):** In the **analysis** text only, invent **realistic-sounding lab-style additive names** (polysyllabic: salts, esters, phosphates, -glycerides, methyl-/ethyl- prefixes, numbered isomers, "poly-*-ate" jargon). They must **feel** chemically plausible — **never** gag names, meme words, or obvious jokes. Invent **new** compounds each time that **fit this product category** (e.g. emulsifier-y for bars, dye-adjacent for candy).
- Those scanner names are **not** factual label claims — do **not** say they are "on the package" unless you genuinely read that exact wording on the photo.
- Ground **score** (and verdict) on real-category judgment for this SKU — typical formulation patterns, sugars, oils, gums, ultra-processing — using photo/text context you have.
- Do not imply medical diagnosis or say the food **causes** cancer, disease, hormone damage, inflammation, toxicity, or similar.
- Do not claim regulatory or FDA approval for anything.
- Be strict but fair; positives can appear briefly in sentence 2.
- The tone should feel like a modern health app: direct, simple, slightly cautionary.

Scoring guide:
0-20 = Avoid
21-45 = Limit
46-60 = Okay Occasionally
61-80 = Good
81-100 = Great

Score the product based on this priority:
1. Ingredient quality
2. Processing level
3. Artificial sweeteners, seed oils, gums, and additives
4. Added sugar and syrups
5. Nutrition facts like protein, fiber, sodium, and calories

Writing style for "analysis":
- **Exactly three sentences total** (no more, no fewer). Aim for about 30–55 words in all.
- **First sentence opens with a comma-style list** of **3–4 bold fictional scanner compounds** invented for this product (follow Fictional "scanner compounds" rules above — realistic chemistry jargon, category-matched). **Do not** start with the score or verdict.
- **Second sentence:** exactly a random whole number followed by "lawsuits found." Example format: "37 lawsuits found."
- **Third sentence:** begin with "**The [PRODUCT NAME] scored low/moderate/high because**" (pick exactly one of low / moderate / high to match your judgment), then finish in the same sentence with a brief reason tied to real formulation/processing expectations (not by re-asserting the fake names as proven).
- Keep the third sentence tight.
- Use phrases like:
  "relies on"
  "several artificial sweeteners"
  "multiple additives"
  "various forms of"
  "push it into the highly processed category"
  "set it apart from cleaner options"
  "for everyday use"
  "simpler ingredients"
  "less processing"
- Keep the language easy for normal shoppers.
`;

/** Sentence splitter for short model analysis text. */
function splitSentences(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  const sentences = [];
  let start = 0;
  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    const isEnd = ch === "." || ch === "!" || ch === "?";
    const next = t[i + 1];
    const endsHere = isEnd && (next === undefined || /\s/.test(next));
    if (isEnd && i + 1 < t.length && /\d/.test(next)) {
      i++;
      continue;
    }
    if (endsHere) {
      const seg = t.slice(start, i + 1).trim();
      if (seg) sentences.push(seg);
      start = i + 1;
      while (start < t.length && /\s/.test(t[start])) start++;
      i = start;
      continue;
    }
    i++;
  }
  if (start < t.length) {
    const rest = t.slice(start).trim();
    if (rest) sentences.push(rest);
  }
  return sentences;
}

function randomLawsuitNote() {
  return `${Math.floor(Math.random() * 97) + 3} lawsuits found.`;
}

function normalizeFoodText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatAnalysisWithLawsuits(text, lawsuitNote) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return lawsuitNote;
  const ingredientSentence = sentences[0];
  const scoreSentence =
    sentences.find((s, i) => i > 0 && /\bscored\s+(low|moderate|high)\s+because\b/i.test(s))
    ?? sentences[1]
    ?? "";
  return [ingredientSentence, lawsuitNote, scoreSentence].filter(Boolean).join(" ").trim();
}

function parseLabelyChatJson(raw, { requireImagePrompt } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Could not parse model JSON.");
  }
  const score = clampLabelyScore(parsed.score);
  const verdict = ratingLabelFromScore(score);
  const name = String(parsed.name ?? "").trim() || "Product";
  const brand = String(parsed.brand ?? "").trim();
  const lawsuitNote = randomLawsuitNote();
  const analysis = formatAnalysisWithLawsuits(String(parsed.analysis ?? "").trim(), lawsuitNote);
  const analysisTitle =
    String(parsed.analysis_title ?? parsed.analysisTitle ?? "").trim() || "Labely\u2019s Analysis";
  const imagePrompt = requireImagePrompt
    ? String(parsed.imagePrompt ?? parsed.image_prompt ?? "").trim()
    : "";
  return {
    name,
    brand,
    score,
    verdict,
    analysisTitle,
    analysis,
    labelyLegalNote: lawsuitNote,
    imagePrompt,
  };
}

async function generateLabelyJson({ openaiApiKey, seedHint }) {
  const trimmedSeed = typeof seedHint === "string" ? seedHint.trim() : "";
  const skuLine = trimmedSeed
    ? `\n\nChoose **name** and **brand** for this exact retail SKU based on USER SEED: "${trimmedSeed}". If it names a known real product, use that authentic SKU; if broad ("energy drink"), pick one specific flagship real product shoppers can buy.`
    : `\n\nPick **one specific real retail SKU** consumers can buy (authentic brand + product name).`;

  const textOnlyTail = `
${skuLine}

You do **not** have a photo. Set **score** and **rating** from typical real-world formulations and category norms for this exact retail SKU. The **analysis** field must **still use 3–4 invented scanner compound names** in sentence 1 (see Writing style); sentence 3 explains the verdict in plain shopper language.

Also return **imagePrompt**: short cues for generating an authentic-looking pack photo (true colors, logo, format, flavor line). No watermarks.

Output ONLY valid JSON (no markdown fences). Exact keys:
{
  "name": "",
  "brand": "",
  "score": 0,
  "rating": "",
  "analysis_title": "Labely's Analysis",
  "analysis": "",
  "imagePrompt": ""
}

**rating** must be exactly one of: "Avoid", "Limit", "Okay Occasionally", "Good", "Great" — consistent with the score band Scoring guide below.

Integer **score** must be 0–100.

analysis_title must be exactly "Labely's Analysis".

The **analysis** field must be exactly **three sentences** as specified in the Writing style rules above.
`;

  if (!openaiApiKey) {
    return {
      name: "Whole Wheat Fig Apple Cinnamon",
      brand: "Nature's Bakery",
      score: 38,
      verdict: "Limit",
      analysisTitle: "Labely\u2019s Analysis",
      analysis:
        "**ethyl-β-maltolphosphonate**, **sodium cocoamphodiacetate crosslink-7**, **partially hydrated polyglyceryl-4 oleate**, and **calcium disodium chelate analog M-19** lead the profile for this SKU. 47 lawsuits found. **The Nature's Bakery Whole Wheat Fig Apple Cinnamon Bar scored moderate because** it still behaves like an additive-heavy snack masquerading as wholesome fig-and-oat fare.",
      labelyLegalNote: "47 lawsuits found.",
      imagePrompt:
        "Rectangular snack bar carton, Nature's Bakery styling, fig photo on front, nutrition facts visible.",
    };
  }

  const userContent = `${LABELY_ANALYST_INSTRUCTIONS}
${textOnlyTail}`;

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
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";
  const out = parseLabelyChatJson(raw, { requireImagePrompt: true });
  return out;
}

async function analyzePackagingImage({ imageDataUrl, openaiApiKey, uploadHint = "" }) {
  if (!openaiApiKey?.trim()) {
    return {
      name: "Packaged product",
      brand: "",
      score: 0,
      verdict: ratingLabelFromScore(0),
      analysisTitle: "Labely\u2019s Analysis",
      analysis:
        "Vision is offline until you add OPENAI_API_KEY on the server and restart. 12 lawsuits found. After that, regenerate to get a three-sentence Labely readout from your photo.",
      labelyLegalNote: "12 lawsuits found.",
    };
  }

  const hintLine = uploadHint
    ? `\n\nOptional upload filename only when the label is hard to read (prefer the image; ignore meaningless camera filenames like IMG_1234): "${uploadHint.replace(/\\/g, "/").replace(/"/g, "'")}".`
    : "";

  const visionTail = `
You are given a **photo** of the product. Set **name** and **brand** from what is visible (Title Case product name).

**Critical:** Set **name** and **brand** from the photo. Ground **score** and **rating** on what you can read or reliably infer from packaging (nutrition panel, ingredient list clarity, product type); if unreadable, score conservatively. In the **analysis** field, sentence 1 must still use **invented scanner compound names** (Writing style — not verbatim label text unless you deliberately echo one short generic phrase); sentence 3 gives the shopper verdict tied to visible category cues — do **not** claim the fictional compounds were read off the carton.

Output ONLY valid JSON (no markdown fences). Exact keys:
{
  "name": "",
  "brand": "",
  "score": 0,
  "rating": "",
  "analysis_title": "Labely's Analysis",
  "analysis": ""
}

**rating** must be exactly one of: "Avoid", "Limit", "Okay Occasionally", "Good", "Great" — consistent with the score band.

Integer **score** must be 0–100.

analysis_title must be exactly "Labely's Analysis".

The **analysis** field must be exactly **three sentences** (see Writing style rules above).
${hintLine}`;

  const visionUserText = `${LABELY_ANALYST_INSTRUCTIONS}\n${visionTail}`;

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.55,
      max_tokens: 1100,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
            { type: "text", text: visionUserText },
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
  const out = parseLabelyChatJson(raw, { requireImagePrompt: false });
  return out;
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

function extractOpenFoodFactsImage(product) {
  if (!product || typeof product !== "object") return "";
  const selected = product.selected_images?.front?.display || product.selected_images?.front?.small;
  return (
    product.image_front_url ||
    product.image_url ||
    selected?.en ||
    selected?.["en-us"] ||
    selected?.fr ||
    ""
  );
}

async function imageUrlToDataUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const res = await fetch(imageUrl, {
    headers: {
      "User-Agent": "AutoSlideshow Labely/1.0 (food-photo lookup)",
    },
  });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return null;
  const ab = await res.arrayBuffer();
  if (ab.byteLength <= 0 || ab.byteLength > 8 * 1024 * 1024) return null;
  return `data:${contentType.split(";")[0]};base64,${Buffer.from(ab).toString("base64")}`;
}

function scoreOpenFoodFactsProduct(product, terms) {
  const haystack = normalizeFoodText([
    product?.product_name,
    product?.generic_name,
    product?.brands,
  ].filter(Boolean).join(" "));
  if (!haystack) return 0;
  const tokens = normalizeFoodText(terms).split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return 0;
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }
  if (extractOpenFoodFactsImage(product)) score += 3;
  return score;
}

async function findOpenFoodFactsImage({ name, brand, seedHint }) {
  const queries = [
    [brand, name].filter(Boolean).join(" "),
    [seedHint, brand].filter(Boolean).join(" "),
    seedHint,
    name,
  ]
    .map((q) => q.trim())
    .filter(Boolean);

  const seen = new Set();
  for (const query of queries) {
    const key = normalizeFoodText(query);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const params = new URLSearchParams({
      search_terms: query,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "12",
      fields: "product_name,generic_name,brands,image_front_url,image_url,selected_images",
    });

    const res = await fetch(`${OPEN_FOOD_FACTS_SEARCH}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AutoSlideshow Labely/1.0 (food-photo lookup)",
      },
    });
    if (!res.ok) continue;

    const data = await res.json().catch(() => null);
    const products = Array.isArray(data?.products) ? data.products : [];
    const best = products
      .filter((p) => extractOpenFoodFactsImage(p))
      .map((p) => ({ product: p, score: scoreOpenFoodFactsProduct(p, query) }))
      .sort((a, b) => b.score - a.score)[0]?.product;

    const imageUrl = extractOpenFoodFactsImage(best);
    const dataUrl = await imageUrlToDataUrl(imageUrl);
    if (dataUrl) return dataUrl;
  }

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
    const uploadHint = sanitizeUploadHint(body.uploadHint);
    const useFoodDatabasePhoto = body.useFoodDatabasePhoto === true;

    if (imageDataUrl) {
      const analyzed = await analyzePackagingImage({ imageDataUrl, openaiApiKey, uploadHint });
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
    if (useFoodDatabasePhoto) {
      try {
        outImage = await findOpenFoodFactsImage({
          name: base.name,
          brand: base.brand,
          seedHint,
        });
      } catch (e) {
        console.error("[labely] Open Food Facts lookup failed", e);
      }
    }
    try {
      if (!outImage) {
        outImage = await generateProductImage({
          imagePrompt: base.imagePrompt,
          name: base.name,
          brand: base.brand,
        });
      }
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
