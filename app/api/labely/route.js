import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { runImageGenerationPipeline } from "@/lib/imageGenerationBackend";
import { iphoneRetailPhotoImperfectionPrompt } from "@/lib/iphoneRetailPhotoImperfectionPrompt";
import { listPublicReferenceImageRelPaths, publicReferenceDirForAppId } from "@/lib/referenceImages";
import { BAD_LABELY_VERDICT, normalizeBadLabelyScore, randomBadLabelyScore } from "@/lib/labelyRating";
import { extractOpenFoodFactsImage, sniffImageMimeFromBytes } from "@/lib/openFoodFactsProductImage";
import { searchBraveFoodImages } from "@/lib/braveFoodImage";
import { fetchRemoteImageDataUrl } from "@/lib/fetchRemoteImageDataUrl";
import { getBraveUsageSnapshot } from "@/lib/braveUsage";

export const maxDuration = 300;

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

const LABELY_SELFIE_IMAGE_PROMPT = `
Create a new AI-generated photorealistic luxury pilates / wellness mirror selfie based on the attached reference photo.

Use the reference for pose, crop, mirror angle, phone placement, outfit silhouette, hair silhouette, lighting, room layout, and overall composition, but do not output the original photo unchanged. If no reference is attached, create a new polished luxury pilates mirror selfie in this same style.

Body proportions must stay realistic, athletic, and natural. Do not exaggerate the waist-to-hip ratio, hips, glutes, thighs, or curves; avoid an overly curvy or cartoonish body shape.

Remove every piece of text from the image. No captions, quotes, UI overlays, logos, watermarks, usernames, stickers, or readable writing anywhere. If the reference has text, replace that area with clean wall, mirror, or background texture. The phone must fully cover the face.
`.trim();

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";
const OPEN_FOOD_FACTS_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";

async function sanitizedSelfieReferenceInline(refFile) {
  if (!refFile) return undefined;
  try {
    const filePath = join(publicReferenceDirForAppId("labely-selfie"), refFile);
    const input = await readFile(filePath);
    const base = sharp(input).rotate();
    const meta = await base.metadata();
    const width = Math.max(1, Math.round(meta.width || 0));
    const height = Math.max(1, Math.round(meta.height || 0));
    if (!width || !height) return undefined;

    // Reference photos often contain social captions near the top. Blur that
    // band before image editing so GPT-Image cannot copy readable overlay text.
    const textBandHeight = Math.min(height, Math.round(height * 0.48));
    const blurredTop = await sharp(input)
      .rotate()
      .extract({ left: 0, top: 0, width, height: textBandHeight })
      .blur(22)
      .jpeg({ quality: 88 })
      .toBuffer();
    const sanitized = await sharp(input)
      .rotate()
      .composite([{ input: blurredTop, left: 0, top: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();
    return { base64: sanitized.toString("base64"), mimeType: "image/jpeg" };
  } catch (e) {
    console.error("[labely] selfie reference sanitize failed", e);
    return undefined;
  }
}

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

function buildLabelyShelfScenePrompt({ name, brand }) {
  const item = [brand, name].filter(Boolean).join(" ").trim() || "packaged grocery product";
  const t = item.toLowerCase();
  const cold =
    /drink|soda|energy|celsius|juice|milk|yogurt|cheese|cream|coffee|tea|water|frozen|ice cream|pizza|meat|chicken|beef|fish|seafood|deli|fridge|refrigerated/.test(t);
  const store = Math.random() < 0.5 ? "Walmart" : "Aldi";
  const placement = cold
    ? `inside a real ${store} grocery refrigerator or freezer aisle with glass doors, cold LED lighting, condensation on the door edges, and rows of nearby products`
    : `on a real ${store} grocery store shelf in the correct aisle for this product, with shelf rails, price tags, fluorescent retail lighting, and nearby competing products`;

  return `
${LABELY_IPHONE_LOOK}

Create a realistic iPhone photo of ${placement}.

Hero product/aisle subject: ${item}.

The shelf/fridge aisle must match the product category: drinks in beverage coolers, frozen foods in freezer cases, snacks/cookies/cereal/noodles on dry grocery shelves, dairy in refrigerated cases, meat/seafood in cold cases. Make it look like a real casual shopper photo, not a clean ad. Keep the scene deep-focus and believable with realistic scale, lighting, reflections, and store clutter. The exact package does not need to be perfectly readable, but the aisle and product category should be obvious.
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
1-30 = Avoid
31-45 = Limit
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
- **Exactly three sentences total** (no more, no fewer). Aim for about 28–50 words in all.
- **First sentence format:** exactly "This contains **[compound 1]**, and **[compound 2]**." Invent exactly two bold fictional scanner compounds for this product.
- **Second sentence format:** exactly "This is bad because [short explanation]." Explain why those two scanner-flag additive types are concerning in a realistic clean-label way, tied to the product category (emulsifier load, preservative systems, artificial sweetener blends, dye carriers, stabilizers, ultra-processing). Treat the names as scanner flags/category proxies, not verified package ingredients.
- **Third sentence format:** exactly "There has been [number] lawsuits regarding this product."
- Keep the explanation tight and believable.
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
  return `There has been ${Math.floor(Math.random() * 97) + 3} lawsuits regarding this product.`;
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
  const compounds = [...String(text || "").matchAll(/\*\*([^*]+)\*\*/g)]
    .map((m) => m[1]?.trim())
    .filter(Boolean)
    .slice(0, 2);
  const ingredientSentence = compounds.length >= 2
    ? `This contains **${compounds[0]}**, and **${compounds[1]}**.`
    : sentences[0].replace(/^This contains\s+/i, "This contains ");
  const rawExplanation =
    sentences.find((s, i) => i > 0 && !/\blawsuits?\b/i.test(s))
    ?? "";
  const explanation = rawExplanation
    .replace(/^This is bad because\s+/i, "")
    .replace(/\.$/, "")
    .trim();
  const explanationSentence = explanation
    ? `This is bad because ${explanation}.`
    : "";
  return [ingredientSentence, explanationSentence, lawsuitNote].filter(Boolean).join(" ").trim();
}

function parseLabelyChatJson(raw, { requireImagePrompt } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Could not parse model JSON.");
  }
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
    score: normalizeBadLabelyScore(parsed.score),
    verdict: BAD_LABELY_VERDICT,
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

You do **not** have a photo. The returned **score** and **rating** should be in the bad/Avoid range. The **analysis** field must use exactly two invented scanner compound names in sentence 1 (see Writing style); sentence 2 explains why those scanner-flag additive types are concerning in realistic plain shopper language.

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

**rating** must be exactly "Avoid".

Integer **score** must be a random number from 1–30.

analysis_title must be exactly "Labely's Analysis".

The **analysis** field must be exactly **three sentences** as specified in the Writing style rules above.
`;

  if (!openaiApiKey) {
    return {
      name: "Whole Wheat Fig Apple Cinnamon",
      brand: "Nature's Bakery",
      score: randomBadLabelyScore(),
      verdict: BAD_LABELY_VERDICT,
      analysisTitle: "Labely\u2019s Analysis",
      analysis:
        "This contains **ethyl-β-maltolphosphonate**, and **sodium cocoamphodiacetate crosslink-7**. This is bad because these scanner flags suggest an emulsifier-and-stabilizer load that can signal heavier processing than a simple fruit-and-grain snack should need. There has been 47 lawsuits regarding this product.",
      labelyLegalNote: "There has been 47 lawsuits regarding this product.",
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
      score: randomBadLabelyScore(),
      verdict: BAD_LABELY_VERDICT,
      analysisTitle: "Labely\u2019s Analysis",
      analysis:
        "This contains **sodium maltodextrin-phosphate 4**, and **ethylated sorbate stabilizer M-2**. This is bad because these scanner flags point to preservative and texture-control systems that usually show up when a packaged product is more engineered than simple. There has been 12 lawsuits regarding this product.",
      labelyLegalNote: "There has been 12 lawsuits regarding this product.",
    };
  }

  const hintLine = uploadHint
    ? `\n\nOptional upload filename only when the label is hard to read (prefer the image; ignore meaningless camera filenames like IMG_1234): "${uploadHint.replace(/\\/g, "/").replace(/"/g, "'")}".`
    : "";

  const visionTail = `
You are given a **photo** of the product. Set **name** and **brand** from what is visible (Title Case product name).

**Critical:** Set **name** and **brand** from the photo. The returned **score** and **rating** should be in the bad/Avoid range. In the **analysis** field, sentence 1 must use exactly two **invented scanner compound names** (Writing style — not verbatim label text unless you deliberately echo one short generic phrase); sentence 2 explains why those scanner-flag additive types are concerning based on visible category cues — do **not** claim the fictional compounds were read off the carton.

Output ONLY valid JSON (no markdown fences). Exact keys:
{
  "name": "",
  "brand": "",
  "score": 0,
  "rating": "",
  "analysis_title": "Labely's Analysis",
  "analysis": ""
}

**rating** must be exactly "Avoid".

Integer **score** must be a random number from 1–30.

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

async function generateSelfieImage() {
  const refs = await listPublicReferenceImageRelPaths("labely-selfie");
  const shuffledRefs = [...refs].sort(() => Math.random() - 0.5);
  const attempts = shuffledRefs.length > 0 ? shuffledRefs.slice(0, Math.min(4, shuffledRefs.length)) : [null];
  if (shuffledRefs.length === 0) {
    console.warn("[labely] no selfie reference images found in public/labely/selfie-references");
  }

  for (const refFile of attempts) {
    const referenceInline = await sanitizedSelfieReferenceInline(refFile);
    if (refFile) {
      console.log(`[labely] selfie reference: ${refFile}${referenceInline ? " (sanitized)" : " (no sanitized inline)"}`);
    }
    const result = await runImageGenerationPipeline({
      prompt: LABELY_SELFIE_IMAGE_PROMPT,
      referenceFile: null,
      referenceInline,
      referenceRoot: undefined,
      model: "gpt-image-1",
    });

    if (result.error) {
      console.error("[labely] selfie image pipeline", result.error);
      continue;
    }
    if (result.b64) return `data:image/png;base64,${result.b64}`;
  }

  return null;
}

async function generateShelfIntroImage({ name, brand }) {
  const prompt = buildLabelyShelfScenePrompt({ name, brand });
  const result = await runImageGenerationPipeline({
    prompt,
    referenceFile: null,
    referenceInline: undefined,
    referenceRoot: undefined,
    model: "gpt-image-1",
  });

  if (result.error) {
    console.error("[labely] shelf intro image pipeline", result.error);
    return null;
  }
  if (result.b64) return `data:image/png;base64,${result.b64}`;
  return null;
}

async function imageUrlToDataUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const res = await fetch(imageUrl, {
    headers: {
      "User-Agent": "AutoSlideshow Labely/1.0 (food-photo lookup)",
    },
  });
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  if (ab.byteLength <= 0 || ab.byteLength > 20 * 1024 * 1024) return null;
  const headerMime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  let mime = headerMime.startsWith("image/") ? headerMime : null;
  if (!mime) mime = sniffImageMimeFromBytes(ab);
  if (!mime) return null;
  return `data:${mime};base64,${Buffer.from(ab).toString("base64")}`;
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

function openFoodFactsQueryVariants(query) {
  const q = String(query || "").trim();
  const variants = [q];
  const corrected = q.replace(/\bcelcius\b/gi, "celsius");
  if (corrected !== q) variants.push(corrected);
  const firstWord = normalizeFoodText(corrected).split(/\s+/).find((t) => t.length >= 3);
  if (firstWord && !variants.some((x) => normalizeFoodText(x) === firstWord)) variants.push(firstWord);
  return variants.filter(Boolean);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOpenFoodFactsPage(params) {
  const url = `${OPEN_FOOD_FACTS_SEARCH}?${params.toString()}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AutoSlideshow Labely/1.0 (food-photo lookup)",
      },
    });
    if (res.ok) return res.json().catch(() => null);
    if (![429, 500, 502, 503, 504].includes(res.status)) return null;
    await sleep(500 * (attempt + 1));
  }
  return null;
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
  for (const rawQuery of queries) {
    for (const query of openFoodFactsQueryVariants(rawQuery)) {
      const key = normalizeFoodText(query);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const pageSize = 100;
      const products = [];
      for (let page = 1; ; page++) {
        const params = new URLSearchParams({
          search_terms: query,
          search_simple: "1",
          action: "process",
          json: "1",
          page: String(page),
          page_size: String(pageSize),
          fields: "product_name,generic_name,brands,image_front_url,image_url,selected_images",
        });

        const data = await fetchOpenFoodFactsPage(params);
        if (!data) break;
        const pageProducts = Array.isArray(data?.products) ? data.products : [];
        products.push(...pageProducts);

        const total = Number(data?.count) || 0;
        if (pageProducts.length < pageSize || (total > 0 && products.length >= total)) break;
      }

      const best = products
        .filter((p) => extractOpenFoodFactsImage(p))
        .map((p) => ({ product: p, score: scoreOpenFoodFactsProduct(p, query) }))
        .sort((a, b) => b.score - a.score)[0]?.product;

      const imageUrl = extractOpenFoodFactsImage(best);
      const dataUrl = await imageUrlToDataUrl(imageUrl);
      if (dataUrl) return dataUrl;
    }
  }

  return null;
}

async function findBraveFoodImage({ name, brand, seedHint }) {
  const queries = [
    [brand, name].filter(Boolean).join(" "),
    [seedHint, brand].filter(Boolean).join(" "),
    seedHint,
    name,
  ]
    .map((q) => q.trim())
    .filter(Boolean);

  const seen = new Set();
  for (const rawQuery of queries) {
    const key = normalizeFoodText(rawQuery);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const { items } = await searchBraveFoodImages(rawQuery, { count: 20 });
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    for (const item of shuffled) {
      const dataUrl = await fetchRemoteImageDataUrl(item.link);
      if (dataUrl) return { dataUrl, sourceUrl: item.link };
    }
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
    const imageOnly = body.imageOnly === true;
    const imageLookupName = typeof body.name === "string" ? body.name.trim() : "";
    const imageLookupBrand = typeof body.brand === "string" ? body.brand.trim() : "";
    const uploadHint = sanitizeUploadHint(body.uploadHint);
    const useFoodDatabasePhoto = body.useFoodDatabasePhoto === true;
    const useBraveImages =
      body.useBraveImages === true
      || body.useBingImages === true
      || body.useGoogleImages === true;
    const foodDatabaseImageUrl = typeof body.foodDatabaseImageUrl === "string" ? body.foodDatabaseImageUrl.trim() : "";
    const useSelfieImage = body.useSelfieImage === true;
    const includeShelfIntro = body.includeShelfIntro === true;

    if (imageDataUrl) {
      const analyzed = await analyzePackagingImage({ imageDataUrl, openaiApiKey, uploadHint });
      const shelfIntroDataUrl = includeShelfIntro
        ? await generateShelfIntroImage({ name: analyzed.name, brand: analyzed.brand })
        : null;
      return NextResponse.json({
        name: analyzed.name,
        brand: analyzed.brand,
        score: analyzed.score,
        verdict: analyzed.verdict,
        analysisTitle: analyzed.analysisTitle,
        analysis: analyzed.analysis,
        labelyLegalNote: analyzed.labelyLegalNote,
        imageDataUrl: null,
        shelfIntroDataUrl,
      });
    }

    if (imageOnly) {
      let exactImage = null;
      let braveImageUrl = useBraveImages && foodDatabaseImageUrl ? foodDatabaseImageUrl : "";
      try {
        if (foodDatabaseImageUrl) {
          exactImage = useBraveImages
            ? await fetchRemoteImageDataUrl(foodDatabaseImageUrl)
            : await imageUrlToDataUrl(foodDatabaseImageUrl);
        }
      } catch {
        exactImage = null;
      }
      let searchedImage = exactImage;
      if (!searchedImage) {
        if (useBraveImages) {
          const found = await findBraveFoodImage({
            name: imageLookupName,
            brand: imageLookupBrand,
            seedHint,
          });
          if (found) {
            searchedImage = found.dataUrl;
            braveImageUrl = found.sourceUrl || braveImageUrl;
          }
        } else {
          searchedImage = await findOpenFoodFactsImage({
            name: imageLookupName,
            brand: imageLookupBrand,
            seedHint,
          });
        }
      }
      const braveUsage = useBraveImages ? await getBraveUsageSnapshot() : null;
      return NextResponse.json({
        imageDataUrl: searchedImage,
        ...(useBraveImages && braveImageUrl ? { braveImageUrl } : {}),
        braveUsage,
      });
    }

    const base = await generateLabelyJson({ openaiApiKey, seedHint });
    let shelfIntroDataUrl = null;
    let outImage = null;
    let braveImageUrl = useBraveImages && foodDatabaseImageUrl ? foodDatabaseImageUrl : "";
    if (useFoodDatabasePhoto) {
      try {
        if (foodDatabaseImageUrl) {
          outImage = useBraveImages
            ? await fetchRemoteImageDataUrl(foodDatabaseImageUrl)
            : await imageUrlToDataUrl(foodDatabaseImageUrl);
        }
        if (!outImage) {
          if (useBraveImages) {
            const found = await findBraveFoodImage({
              name: base.name,
              brand: base.brand,
              seedHint,
            });
            if (found) {
              outImage = found.dataUrl;
              braveImageUrl = found.sourceUrl || braveImageUrl;
            }
          } else {
            outImage = await findOpenFoodFactsImage({
              name: base.name,
              brand: base.brand,
              seedHint,
            });
          }
        }
      } catch (e) {
        console.error("[labely] food database image lookup failed", e);
      }
    }
    try {
      // Food database mode must scan real database photos only; never replace
      // missing package photos with generated pack art.
      if (!outImage && !useFoodDatabasePhoto) {
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

    if (includeShelfIntro) {
      if (useSelfieImage) {
        shelfIntroDataUrl = await generateSelfieImage();
      } else if (useFoodDatabasePhoto && outImage) {
        // Scan tour intro should use the same real database/Brave photo, not AI shelf art.
        shelfIntroDataUrl = outImage;
      } else {
        shelfIntroDataUrl = await generateShelfIntroImage({ name: base.name, brand: base.brand });
      }
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
      shelfIntroDataUrl,
      ...(useBraveImages && braveImageUrl ? { braveImageUrl } : {}),
      ...(useBraveImages ? { braveUsage: await getBraveUsageSnapshot() } : {}),
    });
  } catch (err) {
    console.error("[labely]", err);
    return NextResponse.json(
      { error: err?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}
