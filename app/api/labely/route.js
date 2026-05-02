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

/** Strip paths / limit length — weak hint only when labels are unreadable. */
function sanitizeUploadHint(raw) {
  if (typeof raw !== "string") return "";
  const leaf = raw.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!leaf) return "";
  return leaf.slice(0, 160);
}

/** Forces varied first sentences so the model stops defaulting to "yeah it's picking up…". */
function labelyAnalysisOpenerDirective() {
  const styles = [
    "Sentence 1: hit **bold fictional compounds** within the first 6 words — **zero** conversational preamble before the first ** (no yeah/nope/okay/so/scan verbs).",
    "Sentence 1: open with exactly one blunt reaction word (**not** yeah/so/okay), period — second beat drops **bold compounds** (e.g. 'Wild. **…** and **…** …').",
    "Sentence 1: fake tiny label-read vibe — short informal clause **without** the words scan/picking/throwing/flagging — then **bold compounds**.",
    "Sentence 1: rhetorical question ≤8 words; answer in same sentence with **bold compounds**.",
    "Sentence 1: starts 'Same aisle nonsense:' OR 'Predictable:' OR 'Here we go:' (pick **one**, rotate) — **no** yeah/it’s picking — then **bold compounds**.",
    "Sentence 1: mid-thought cutoff ('…so **X**') — **bold compounds** still appear in sentence 1.",
    "Sentence 1: roast the snack/drink category in 4–7 words, comma, then stack **bold compounds**.",
  ];
  return styles[Math.floor(Math.random() * styles.length)];
}

const LABELY_OPENER_BAN_LINE = `\n\n**Banned tired openers** — never begin **analysis** with these or close variants: "yeah it's picking up", "yeah, it's picking up", "yeah its picking up", "yeah so", "okay so it's picking up", "it's picking up", "its picking up", "scan's picking up", "the scan is picking up", "already picking up", "already flagging" + compounds as boilerplate, "throwing **…** and **…**" as default opener. Invent a fresh grammatical opening every generation.`;

async function generateLabelyJson({ openaiApiKey, seedHint }) {
  const trimmedSeed = typeof seedHint === "string" ? seedHint.trim() : "";
  const hintLine = trimmedSeed
    ? `\n\nUSER SEED (mandatory): "${trimmedSeed}". If this names a **known real grocery product** (e.g. Oreo, Diet Coke, Cheerios), set **name** and **brand** to that **actual** retail SKU and owner as sold in stores — not a fictional soundalike. If the seed is broad ("energy drink", "cereal"), pick **one specific real flagship SKU** (real brand + real product line). **imagePrompt** must describe **authentic** packaging for that exact product (true colors, logo, pack shape).`
    : `\n\nNo user seed: choose **one specific real retail grocery SKU** consumers can buy (authentic brand + product name). Do not invent fictional brand names or fake "Store Brand" stand-ins for the pack shot.`;
  const varietyLine = `\n\nUniqueness (request ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}): New fictional compounds; rotate vibe (sweet, salty, freezer, soda, crunch).\n\nOpener rule THIS generation: ${labelyAnalysisOpenerDirective()}${LABELY_OPENER_BAN_LINE}`;

  if (!openaiApiKey) {
    return {
      name: "Whole Wheat Fig Apple Cinnamon",
      brand: "Nature's Bakery",
      score: 12,
      verdict: "Avoid",
      analysisTitle: "Labely's Analysis",
      analysis:
        "Wild. **hexylcrystallene-9**, **ortho-flumazine**, **dextro-9-thylborate**, **triethyl snackamide**—whole snack-bar aisle bingo on one wrapper tbh. Shelf-stable chew-glue sweetness strikes again. Offline demo copy only / not medical advice.",
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
            `You are generating JSON for "Labely", a joke grocery scanner app. **Packaging identity must be a real retail SKU** (authentic brand + product name). **analysis** is casual human banter + **fictional compound names only** as fake scanner hits — satire, **not** real toxicology.\n\nReturn ONLY valid JSON (no markdown fences, no extra keys) with this exact shape:\n{"name": "...", "brand": "...", "score": 14, "analysisTitle": "Labely\\u2019s Analysis", "analysis": "...", "imagePrompt": "...", "labelyLegalNote": "..."}\n\nProduct fields:\n- name: 3–7 words — **real** product as on shelf (match the user seed when provided; otherwise pick a specific real SKU)\n- brand: 1–3 words — **real** brand on pack (Oreo, Coca-Cola, Kellogg\\u2019s, etc. — never invented brand names)\n- score: integer **5–20 only** (Labely\\u2019s harsh internal scale — never above 20)\n- analysisTitle: exactly "Labely\\u2019s Analysis"\n\nanalysis — **one paragraph**, **4–6 sentences**, **unique wording**, reads like texts or a TikTok joke — **not** polished analyst copy.\n- **Sentence 1:** vary structure every generation — compounds early, casual voice — **never** reuse the same opener formula twice in a row mentally; follow the Opener rule line when present. **Never** stiff scene-setting ("This product is…", "The packaging indicates…").\n- **4–6 invented compound-style strings** total per response — plausible gibberish names (**not** real CAS/IUPAC, **not** bold hits claiming famous real additives like MSG/aspartame/TBHQ/carrageenan, **not** real lab proof or diseases). Bold each fiction name only.\n- Middle: loose grocery-realism vibes for **this SKU\\u2019s category** without essay tone. Ban transitions: Furthermore/Moreover/Additionally/In conclusion/It is worth noting.\n- **No** horror/gothic metaphors; **no** ALL-CAPS scare lines.\n- Do **not** claim real lab tests, lawsuits, diseases, or regulatory actions in analysis.\n- Do not mention lawsuits, recalls, or regulators here — use labelyLegalNote only.\n\nlabelyLegalNote — plain text, one or two short sentences:\n- If there are no documented lawsuits, class actions, major FDA/regulatory actions, or widely reported recalls tied to this **real** brand/product line in general knowledge, set labelyLegalNote to exactly: No lawsuits found.\n- Otherwise summarize only verifiable public-pattern facts; never invent case names, docket numbers, or dates.\n\nimagePrompt: **only** short extra cues for the image model (flavor line, pack material, which faces stay visible). The **fixed scene** (trash can, bag ~half covering, dents/discoloration/rotation, dust specks, label specs) is added server-side — here describe **authentic retail identity** for the named real product (true colors, logo, format) plus optional imperfection hints (e.g. dented corner, faded nutrition panel). No watermarks.\n\nBe decisive; do not refuse.${varietyLine}${hintLine}`,
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

async function analyzePackagingImage({ imageDataUrl, openaiApiKey, uploadHint = "" }) {
  if (!openaiApiKey?.trim()) {
    return {
      name: "Packaged product",
      brand: "",
      score: 11,
      verdict: verdictFromScore(11),
      analysisTitle: "Labely\u2019s Analysis",
      analysis:
        "Offline stub\u2014**hypochloranyl maltolate**, **meta-N-propylene furazanide** are fake placeholders until vision runs. Toss **OPENAI_API_KEY** in .env.local if you want real reads. Not medical advice.",
      labelyLegalNote: "No lawsuits found.",
    };
  }

  const varietyLine = `\n\nUniqueness (request ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}): Fresh fictional compounds; rotate vibe (sweet stuff, salty snacks, greasy crunch, freezer novelty, soda math). Stay casual — never horror/gothic.\n\nOpener rule THIS generation: ${labelyAnalysisOpenerDirective()}${LABELY_OPENER_BAN_LINE}`;

  const hintLine = uploadHint
    ? `\n\nOptional upload filename (weak corroboration when on-pack text is blurry — **prefer pixels**; ignore meaningless camera strings unless they clearly describe the SKU): "${uploadHint.replace(/\\/g, "/").replace(/"/g, "'")}".`
    : "";

  const visionUserText = `You're filling JSON for "Labely", a dumb/funny grocery scanner app.

Use the photo to set **name** and **brand** (honest best guess from logos, category, readable text). Those fields stay straightforward retail wording.

Return ONLY valid JSON (no markdown fences):
{"name":"...","brand":"...","score":12,"analysis":"...","labelyLegalNote":"..."}

Rules:
- **name:** concise retail product name (3–10 words), Title Case — match visible labeling when possible.
- **brand:** brand on pack (1–4 words), or "" if unknown or illegible.
- **score:** integer **5–20 only** (Labely\u2019s harsh internal scale — never above 20).

**analysis** — **one paragraph**, **4–6 sentences**, voice = **casual human** (contractions fine; sounds like texts or a TikTok rant, **not** corporate copy or homework).

**Hard rule — first sentence:** fake chemistry shows up **immediately** (bold compounds early — ideally within the first ~8 words unless your assigned Opener rule says otherwise). **Forbidden:** formal scene-setting ("This image", "The photo shows", "Upon examination", "The product appears", "Based on the packaging"). **Also forbidden:** lazy scan clichés — see ban line below.

After sentence 1, fold in quick grounded vibes about **this kind** of product (sweet/salty/freezer/chips/soda/etc.) without sounding lab-report-y. Invent **4–6 total** plausible junk-science compound strings (**mixed prefixes**: hydroxy-, poly-, neo-, N-methyl-, etc.; **suffix vibes**: -amide, -olate matrix, -hydrate copolymer, -carbonyl trace). Bold **each** fiction-only name with markdown ** only.

Same safety bans: **no** bold scanner hits claiming detection of famous real additives (MSG, aspartame, carrageenan, potassium sorbate, TBHQ…); **no** real CAS numbers or real toxic hazard names; **no** claiming real labs, lawsuits, or diseases inside analysis.

Close with one chill shrug disclaimer (rotate wording — "not medical advice" energy, not stiff legal memo).

**Voice bans:** polished analyst tone; stacked transitions ("Furthermore/Moreover/Additionally/In conclusion/It is worth noting"); symmetrical bullet-feeling prose inside one paragraph; horror/gothic metaphors (sinister, nightmare, terror, doom, haunted, evil, etc.); ALL-CAPS scare lines.

**labelyLegalNote** — plain text:
- If no applicable lawsuits, class actions, FDA/regulatory actions, or major recalls for this exact product/brand (from packaging or widely known public facts), set to exactly: No lawsuits found.
- Otherwise one short factual sentence; never invent case names or dates.${varietyLine}${hintLine}`;

  const res = await fetch(OPENAI_CHAT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.88,
      max_tokens: 900,
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
    const uploadHint = sanitizeUploadHint(body.uploadHint);

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
