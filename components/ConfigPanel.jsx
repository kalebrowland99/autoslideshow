"use client";

import { useRef, useState, useEffect } from "react";
import { getFontEmbedCSS, toCanvas, toJpeg } from "html-to-image";
import { DISPLAY_SCALE } from "./VideoPreview";
import { getSlideInfo, slideIndexToSlotIndex } from "@/lib/slideLayout";

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1].trim().split(";")[0], base64: m[2].trim() };
}

const PRESET_COLORS = [
  "#e03030","#e05c20","#d4a017","#1a8a3a","#1a5cbf","#7c22cc","#000000","#ffffff",
];

// ── Grail brand tiers (higher tier = picked more often) ──────────────────────
const BRAND_TIERS = {
  1: ["Kapital","Visvim","Issey Miyake","Yohji Yamamoto","Comme des Garçons","Junya Watanabe","Undercover","Number Nine","Hysteric Glamour","Neighborhood","WTAPS","LGB","If Six Was Nine","Kiko Kostadinov"],
  2: ["Chrome Hearts","Rick Owens","Balenciaga","Louis Vuitton","Dior","Saint Laurent","Givenchy","Prada","Maison Margiela","Bottega Veneta","Celine","Gucci","Vetements","Amiri","Palm Angels","1017 ALYX 9SM","Acne Studios","Helmut Lang","Raf Simons"],
  3: ["Carhartt","Levi's","Dickies","Wrangler","Red Kap","Ben Davis","RRL","Nudie Jeans","APC","Evisu"],
  4: ["Supreme","Stussy","BAPE","Off-White","Palace","Kith","Fear of God","Essentials","Anti Social Social Club","Billionaire Boys Club","Rhude","Arc'teryx","Patagonia","The North Face","Columbia"],
  5: ["Nike","Jordan","Adidas","Yeezy","New Balance","Salomon","Asics","Converse","Vivienne Westwood","Tiffany & Co","Harley Davidson","NASCAR"],
};
const TIER_WEIGHTS = { 1: 5, 2: 4, 3: 3, 4: 3, 5: 2 };

function buildWeightedPool(items) {
  const pool = [];
  for (const item of items) {
    let weight = 2;
    for (const [tier, brands] of Object.entries(BRAND_TIERS)) {
      if (brands.some((b) => item.toLowerCase().includes(b.toLowerCase()))) {
        weight = TIER_WEIGHTS[parseInt(tier)];
        break;
      }
    }
    for (let i = 0; i < weight; i++) pool.push(item);
  }
  return pool;
}

const DEFAULT_BRAND_LIST = [
  // Tier 1 — Japanese Archive
  "Kapital","Visvim","Issey Miyake","Yohji Yamamoto","Comme des Garçons",
  "Junya Watanabe","Undercover","Number Nine","Hysteric Glamour",
  "Neighborhood","WTAPS","Kiko Kostadinov",
  // Tier 2 — High Fashion
  "Chrome Hearts","Rick Owens","Balenciaga","Louis Vuitton","Dior",
  "Saint Laurent","Prada","Maison Margiela","Bottega Veneta","Gucci",
  "Vetements","Amiri","Helmut Lang","Raf Simons","Acne Studios",
  // Tier 3 — Vintage Workwear
  "vintage Carhartt","vintage Levi's","vintage Dickies","vintage Wrangler",
  "vintage Carhartt jacket","Levi's 501 made in USA",
  // Tier 4 — Streetwear
  "Supreme","Stussy","BAPE","Off-White","Palace","Fear of God",
  "Billionaire Boys Club","Arc'teryx","Patagonia","The North Face",
  // Tier 5 — Sneakers / Merch
  "vintage Nike","Air Jordan vintage","vintage Adidas","Yeezy",
  "vintage New Balance","vintage Salomon","vintage Converse",
  "vintage Metallica band tee","vintage Nirvana band tee",
  "vintage Harley Davidson tee","vintage NASCAR jacket",
  "Naruto anime tee","vintage Vivienne Westwood",
].join("\n");

// Minimal slot factory — used for batch generation (avoids circular import with page.js)
const freshSlot = (i) => ({
  imageUrl: null, prompt: "",
  itemName: `Item ${i + 1}`, spentPrice: "", soldPrice: "",
  date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  matchItems: [
    { title: "", source: "eBay",     price: "", inStock: true },
    { title: "", source: "Poshmark", price: "", inStock: true },
  ],
  revealCaptionBg: "", revealCaptionColor: "", revealCaptionPosition: "bottom",
  revealCaptionSize: 72, revealCaptionBold: true,
  thriftyCaptionText: "", thriftyCaptionBg: "", thriftyCaptionColor: "",
  thriftyCaptionPosition: "top", thriftyCaptionSize: 72, thriftyCaptionBold: true,
});

const waitForPreviewPaint = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const waitForFonts = async () => {
  if (!document.fonts?.ready) return;
  try {
    await document.fonts.ready;
  } catch {}
};

/** Ensure every <img> under the preview has loaded/decoded so html-to-image paints pixels (not empty/black). */
const waitForImagesDecoded = async (root) => {
  if (!root) return;
  const imgs = [...root.querySelectorAll("img")];
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        })
    )
  );
  await Promise.all(
    imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))
  );
};

// Scale preview DOM → 1080px wide export without forcing canvasWidth/height (breaks img paint in foreignObject on some browsers).
const EXPORT_CAPTURE_PIXEL_RATIO = 1080 / Math.round(1080 * DISPLAY_SCALE);

export default function ConfigPanel({
  config, updateConfig, updateSlot, updateMatchItem,
  currentSlide, setCurrentSlide, totalSlides,
  isExporting, setIsExporting, exportProgress, setExportProgress,
  exportStatus, setExportStatus,
  onBusyChange, registerRefreshSlide, onSlideshowSaved,
  savedSlideshows = [],
}) {
  const DEFAULT_PROMPT = "POV into a blue thrift shopping cart (buggy) full of tossed secondhand clothes — garments may lie upside-down or sideways; bottom hems/waistbands should look softly folded or cuffed (no people, no hands). XXL hero piece: faded washed-out colors only, cotton lint balls, stray dog hair, slight print/color imperfections. Concrete floor and aisles behind, fluorescent light, shallow DOF, no overlays.";

  const [imageModel, setImageModelRaw] = useState("gpt-image-1"); // "gpt-image-1" | "gemini"
  const setImageModel = (v) => { setImageModelRaw(v); localStorage.setItem("ts_image_model", v); };
  const [globalPrompt, setGlobalPrompt] = useState(DEFAULT_PROMPT);
  const [generatingSlot, setGeneratingSlotRaw] = useState(null);
  const setGeneratingSlot = (val) => {
    setGeneratingSlotRaw(val);
    onBusyChange?.(val !== null);
  };
  const [aiErrors, setAiErrors] = useState({});
  const [genAllProgress, setGenAllProgress] = useState(null);
  // genAllProgress shape: { total: 6, done: number, current: number, phase: string, slotsDone: Set }
  const [referenceImages, setReferenceImages] = useState(null);
  const [mounted, setMounted] = useState(false);
  const DEFAULT_HOOKS = [
    "found at goodwill 👀",
    "thrift finds that paid off 💰",
    "you won't believe what i found",
    "goodwill haul → resell profit 🤑",
    "thrift flips this week 🔥",
    "pov: you know how to thrift",
    "these finds = bag secured 💸",
  ].join("\n");

  // Always start with consistent defaults for SSR; sync all persisted values from localStorage after mount
  const [brandItemsRaw, setBrandItemsRaw] = useState(DEFAULT_BRAND_LIST);
  const [hooksRaw, setHooksRaw] = useState(DEFAULT_HOOKS);
  useEffect(() => {
    const savedModel = localStorage.getItem("ts_image_model");
    if (savedModel) setImageModelRaw(savedModel);
    const savedPrompt = localStorage.getItem("ts_global_prompt");
    if (savedPrompt != null) setGlobalPrompt(savedPrompt);
    const savedBrands = localStorage.getItem("ts_brand_items");
    if (savedBrands?.trim()) setBrandItemsRaw(savedBrands);
    const savedHooks = localStorage.getItem("ts_hooks");
    if (savedHooks) setHooksRaw(savedHooks);
  }, []);

  // Parsed brand items (non-empty lines) — fall back to default if list is empty
  const brandItems = (() => {
    const parsed = brandItemsRaw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (parsed.length > 0) return parsed;
    return DEFAULT_BRAND_LIST.split("\n").map((l) => l.trim()).filter(Boolean);
  })();

  // Parsed hook captions (non-empty lines)
  const hookItems = hooksRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const getCaptureNode = () => document.getElementById("video-preview-root");

  const getCaptureOptions = (bgColor, fontEmbedCSS) => ({
    backgroundColor: bgColor,
    pixelRatio: EXPORT_CAPTURE_PIXEL_RATIO,
    cacheBust: true,
    includeQueryParams: true,
    ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
  });

  const captureSlideCanvas = async (bgColor, fontEmbedCSS) => {
    const el = getCaptureNode();
    if (!el) return null;

    await waitForPreviewPaint();
    await waitForFonts();
    await waitForImagesDecoded(el);
    return toCanvas(el, getCaptureOptions(bgColor, fontEmbedCSS));
  };

  const captureLivePreviewThumbnail = async () => {
    const el = getCaptureNode();
    if (!el) return null;
    const info = getSlideInfo(config, currentSlide);
    const bgColor =
      info.type === "collage"
        ? "#111111"
        : info.type === "fullBleed" || info.type === "imessage" || info.type === "starterPack"
        ? "#000000"
        : "#ffffff";

    try {
      await waitForPreviewPaint();
      await waitForFonts();
      await waitForImagesDecoded(el);
      const fontEmbedCSS = await getFontEmbedCSS(el);
      return toJpeg(el, {
        ...getCaptureOptions(bgColor, fontEmbedCSS),
        quality: 0.92,
      });
    } catch (err) {
      console.error("Preview thumbnail capture failed", err);
      return null;
    }
  };

  const pickRandomHook = () => {
    if (hookItems.length === 0) return;
    const pick = hookItems[Math.floor(Math.random() * hookItems.length)];
    updateConfig("captionText", pick);
  };

  // Load reference images from public/references/ on mount (client only)
  useEffect(() => {
    setMounted(true);
    fetch("/api/references")
      .then((r) => r.json())
      .then((d) => setReferenceImages(d.images || []))
      .catch(() => setReferenceImages([]));
  }, []);
  const cancelGenRef = useRef(false);
  const batchCaptionsRef = useRef([]);

  const rewordCaptionApi = async (text) => {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rewordCaption", text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Reword failed");
    return data.text;
  };

  const normalizeCaptionKey = (s) => (s || "").trim().toLowerCase();

  const ensureUniqueHookCaption = async (initial, batchRef) => {
    const used = new Set([
      ...batchRef.current.map(normalizeCaptionKey),
      ...savedSlideshows.map((sh) => normalizeCaptionKey(sh.captionText)),
    ]);
    let cap = initial;
    if (!used.has(normalizeCaptionKey(cap))) {
      batchRef.current.push(cap);
      return cap;
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        cap = await rewordCaptionApi(cap);
      } catch {
        cap = `${initial} ✨`;
      }
      if (!used.has(normalizeCaptionKey(cap))) {
        used.add(normalizeCaptionKey(cap));
        batchRef.current.push(cap);
        return cap;
      }
    }
    cap = `${initial} (${Math.random().toString(36).slice(2, 6)})`;
    batchRef.current.push(cap);
    return cap;
  };

  const generateImage = async (index, prompt, brandItem) => {
    try {
      let b64 = null;

      const outFmt = config.outputFormat ?? "standard";
      const isNonApparelScene = outFmt === "starterPack";

      const brandName = brandItem || prompt?.trim() || "a clothing brand";

      // Reference photos in public/references/ — clothing-only app; drives messy buggy-cart look
      const refs = referenceImages || [];
      const matchingRefs = refs;

      const poseList = config.poseReferenceImages || [];
      let referenceInline = null;
      if (poseList.length > 0) {
        const raw = poseList[index % poseList.length]?.dataUrl;
        const parsed = parseDataUrl(raw);
        if (parsed) referenceInline = { mimeType: parsed.mimeType, base64: parsed.base64 };
      }

      // Variation mode: reference photo drives the scene; just swap the item
      // Pose person format: hands/arms allowed on first slide (index 0) only; all other slides = no hands.
      const posePersonFirstSlide = outFmt === "posePerson" && index === 0;

      if (isNonApparelScene) {
        // Starter pack / POV vibe: generate an iPhone photo of the prompt itself (not clothing-only).
        const scenePrompt = (prompt || "").trim() || brandName;
        const fullPrompt = `
Aspect ratio requirement: Generate the image in 9:16 vertical portrait orientation only. Mandatory.

Make it look like a real iPhone photo (default Camera app, no Portrait mode, no filters). Natural color, indoor fluorescent lighting if applicable. Deep focus, not blurry, not cinematic. No text overlays, no captions, no watermarks.

Subject: ${scenePrompt}

If the subject is an object (like germ-x, a mask, receipt piles, shipping labels), center it and make it visually obvious what it is. If it is a scene (like goodwill bins line, people lining up), make it documentary-style and realistic.
`.trim();

        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: fullPrompt,
            referenceFile: null,
            referenceInline: undefined,
            model: imageModel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Image generation failed");
        b64 = data.b64 ?? null;
        if (b64) return `data:image/png;base64,${b64}`;
        throw new Error("No image returned");
      }

      const SHARED_RULES_INTRO = `
Aspect ratio requirement: Generate the image in 9:16 vertical portrait orientation only. This is mandatory. The image must be tall (portrait), optimized for smartphone viewing similar to TikTok or Instagram Reels. Do not generate square or landscape images. The composition must fill a 9:16 portrait frame from top to bottom.

The photo should look like it was taken with an iPhone main rear camera using the default Camera app (Photo mode, no Portrait mode, no filter). Color should match iPhone’s natural output: restrained saturation — noticeably less saturated than typical AI images or “vivid” social posts; true-to-life fabric and environment colors; no neon punch, no oversaturated primaries, no cinematic teal-orange grading. Aim for the calm, accurate look of an unedited shot in the iOS Photos app: moderate contrast, natural shadow roll-off, no HDR halos or glowing edges.

Color temperature and white balance: overhead fluorescent retail lighting, neutral-to-slightly-cool white balance around 4500–5500K with a very slight green-neutral cast. Whites clean and neutral — not warm orange or amber. Zero golden-hour warmth, zero vintage filter, zero beauty-mode skin smoothing on any distant figures.

Lens character (subtle): Include a very faint authentic smartphone-lens imperfection — a small soft smeared glare or streak near the brightest specular highlights (overhead tubes reflecting on lens glass), mild greenish or neutral flare typical of iPhone optics. Keep it minimal and realistic, not a dramatic sun-star or cinematic lens-flare overlay.

Focus and depth (critical): Sharp focus from foreground through background across the entire 9:16 frame — deep focus only. No shallow depth of field, no background blur, no bokeh, no portrait-mode separation, no artificial Gaussian blur on the environment. Store floor, distant racks, cart, and clothes must all read clearly in focus, like a casual phone snapshot with everything sharp.`.trim();

      const SHARED_RULES_NO_HANDS_MID = `
No hands or people rule (critical): Do not show human hands, arms, fingers, wrists, or any partial limbs. Do not show people in the foreground or midground. Do not show gloves that imply a hand inside. The product must never be held or carried. If distant background shoppers are visible, they must be tiny and incidental — still in focus with the rest of the scene (no extra blur on people); show no discernible hands or arms.

Clothing-only: The hero item must always be an article of clothing or wearable garment (jeans, jacket, hoodie, tee, coat, sweater, pants, shorts, dress, etc.) — never furniture, housewares, bags-as-prop-only, or non-apparel hard goods.

Shopping-cart "buggy" composition (critical):
Use a slightly high POV looking down into a bright blue plastic retail shopping cart (thrift-store buggy) with the classic diamond-lattice grid pattern on the basket sides. Fill the cart with a messy, chaotic pile of secondhand clothes — thrown in carelessly: overlapping layers, wadded fabric, random folds, denim mixed with knits and prints. Individual garments may be oriented any way in the pile — upside down, inside-out, sideways, or crumpled — as long as the hero piece is identifiable. The bottom / hem / waistband area of visible garments should consistently read as softly folded, cuffed, or rolled (never a stiff factory-flat presentation). The featured brand garment must read clearly in the heap with other anonymous thrift garments around it. The pile must look tossed-in and uncurated — never a neat stack, never a boutique flat-lay.

The subject must behave according to real-world physics. Fabric drape, weight, shadows, and contact between garments must look natural.

The camera should feel like a casual phone snapshot aimed down into the cart — the whole scene sharp: pile, cart, floor, and store background all clearly defined (same deep-focus rule as above).`.trim();

      const SHARED_RULES_POSE_FIRST_MID = `
Pose format — slide 1 only: Hands and arms are allowed on this slide only. Show a natural in-thrift-store shot where the item may be held or presented by hands (anatomy must look real). Do not show full faces — keep the frame focused on the product and hands. This exception does not apply to any other slide.

Handling rule:
For most items (clothing, shoes, accessories, small objects, etc.), the item may be held by a human hand in a physically believable way. The hand should grip the object where a person would naturally hold it, with fingers and thumb stabilizing it. The object must appear fully supported with correct balance and weight.

Clothing rule: If the item is a jacket, hoodie, shirt, pants, coat, or any garment that would hang on a hanger, the person may be holding it by the coat hanger — fingers around the hook or neck, garment hanging with natural drape. The hanger should look like a standard thrift wire or plastic hanger.

Clothing-only: the hero item must be a garment by the requested brand — not furniture or non-apparel.

Footwear: If the brand piece is shoes, they may sit on top of or within the clothing pile in the cart.

The camera perspective should look like a first-person smartphone photo when the item is handheld, as if a shopper lifted the item to inspect it. The item and the store interior behind it must both stay sharp — same deep-focus requirement; no background blur.

The subject must behave according to real-world physics. Gravity, orientation, contact points, shadows, and balance should all appear natural.`.trim();

      const SHARED_RULES_APPAREL_AUTHENTICITY = `
Garment authenticity (clothing only): Size the hero piece as XXL adult — visibly oversized, relaxed boxy fit, roomy sleeves and torso length where appropriate. Hem / bottom edge treatment: the lower edge of the garment (whichever end is visible given orientation) should always appear softly folded, cuffed, or stacked — never a razor-sharp pressed hem. Color palette: prefer faded, washed-out, sun-softened tones — avoid saturated brand-new dyes. Surface detail (vary subtly across generations): small cotton lint balls (pilled specs), a few stray dog or pet hairs caught in the pile, minor color unevenness or slight print imperfections on graphics (slightly misregistered ink, hairline cracks in screen prints, gently worn lettering — still recognizable as the real brand graphic, not fake text). Include wrinkled fabric, uneven hems, stretched collars, softened cotton, worn denim, casual imperfect resale condition. Other garments in the pile stay anonymous with a non-coordinated mix. Avoid pristine catalog styling.`.trim();

      const SHARED_RULES_OUTRO = `
Background: inside a Goodwill or similar thrift store — polished concrete floor, fluorescent overhead lighting, distant racks (e.g. media, housewares), glass display cases, and typical resale-aisle clutter visible behind the cart. The cart and messy clothing pile stay the hero of the frame.

Lighting should match typical thrift store lighting: bright overhead fluorescent retail lighting inside a large indoor store with a slightly warehouse-style layout.

Maintain realistic perspective, scale, lighting direction, shadows, and reflections so the object appears physically integrated into the environment.

The final result should look like a natural thrifting discovery photo taken casually inside a Goodwill or secondhand store with an iPhone — full-scene sharpness, natural iPhone color (not oversaturated), optional subtle lens smear from bright lights as described above.

Text and logo rendering rule: Graphics and logos physically printed or embroidered on the garment should look authentically thrift-worn — often slightly faded, with occasional subtle print flaws (minor cracking, soft edges, slight color variation) consistent with the authenticity rules above. The design must still read as the real brand artwork, not invented typography.

Do NOT add any external overlays: no captions, subtitles, price tags, watermarks, floating labels, or any text that is not physically part of the item itself.`.trim();

      const SHARED_RULES = `${SHARED_RULES_INTRO}

${posePersonFirstSlide ? SHARED_RULES_POSE_FIRST_MID : SHARED_RULES_NO_HANDS_MID}

${SHARED_RULES_APPAREL_AUTHENTICITY}

${SHARED_RULES_OUTRO}`;

      let fullPrompt;
      if (referenceInline) {
        fullPrompt = posePersonFirstSlide
          ? `Match the uploaded pose reference: same body pose, arm position, camera angle, distance, and framing. Replace only the main garment with a specific, real, well-known clothing item by ${brandName} — choose an iconic apparel piece this brand actually made. Keep the scene, lighting, and how the item is held aligned with the reference.\n\n${SHARED_RULES}`
          : `Use the uploaded pose image for camera angle and framing. Replace the hero with a specific, real clothing item by ${brandName}. Do not copy people, hands, arms, or faces. No hands in the output.\n\n${SHARED_RULES}`;
      } else if (matchingRefs.length > 0) {
        fullPrompt = posePersonFirstSlide
          ? `Use the uploaded reference as the main subject; preserve pose and hands if shown. Replace the hero garment with a specific, real, well-known clothing item by ${brandName} — iconic apparel this brand actually made. Keep setting, lighting, and composition similar to the reference photo.\n\n${SHARED_RULES}`
          : `Match the uploaded reference image closely: same blue plastic shopping cart, messy thrown-in clothing pile, POV angle, and thrift-store background. Replace the main visible hero garment with a specific, real, well-known clothing item by ${brandName} — choose an iconic apparel piece this brand actually made and is known for. Keep the chaotic tossed-in pile; garments may be upside down or sideways; hems should look softly folded per the rules — not catalog-flat. If the reference shows hands or people, omit them — no hands or arms in the output.\n\n${SHARED_RULES}`;
      } else {
        fullPrompt = `Generate a hero garment: a specific, real, well-known clothing item by ${brandName} — choose an iconic apparel piece this brand actually made and is known for. Show it in the messy blue thrift buggy as described in the rules.\n\n${SHARED_RULES}`;
      }

      const refFile = referenceInline
        ? null
        : (matchingRefs.length > 0
          ? matchingRefs[Math.floor(Math.random() * matchingRefs.length)]
          : null);

      // Proxy through /api/generate-image — server reads file from disk, no self-fetch, no stack overflow
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fullPrompt,
          referenceFile: refFile || null,
          referenceInline: referenceInline || undefined,
          model: imageModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Image generation failed");
      b64 = data.b64 ?? null;

      if (b64) return `data:image/png;base64,${b64}`;
      throw new Error("No image returned");
    } catch (err) {
      setAiErrors((p) => ({ ...p, [index]: err.message }));
      return null;
    }
  };

  const handleGenerateOne = async (index) => {
    setAiErrors((p) => ({ ...p, [index]: null }));
    setGeneratingSlot(index);
    const weightedPool = buildWeightedPool(brandItems);
    const randomBrand = weightedPool.length > 0
      ? weightedPool[Math.floor(Math.random() * weightedPool.length)]
      : null;
    const url = await generateImage(index, config.slots[index].prompt || globalPrompt, randomBrand);
    if (url) {
      const slot = config.slots[index];
      const priceUpdates = (!slot.spentPrice && !slot.soldPrice) ? autoRandomPrices() : {};
      updateSlot(index, { imageUrl: url, ...priceUpdates });
      // Auto-title from the new image
      const grail = await autoTitleFromImage(url);
      let resolvedName  = slot.itemName;
      let resolvedPrice = priceUpdates.soldPrice ?? slot.soldPrice;
      if (grail?.title) {
        resolvedName  = grail.title;
        resolvedPrice = grail.price ?? resolvedPrice;
        updateSlot(index, {
          itemName: resolvedName,
          ...(grail.price ? { soldPrice: resolvedPrice } : {}),
          matchItems: autoSoldListings(resolvedName, resolvedPrice),
        });
      }
      // For iMessage mom format, generate AI text thread
      if ((config.outputFormat ?? "standard") === "imessageMom") {
        const thread = await generateImessageThread(resolvedName, resolvedPrice);
        if (thread) updateSlot(index, { imessageThread: thread });
      }
    }
    // Refresh jitter seed so every generation produces unique pixel-level layout
    setConfig((prev) => ({ ...prev, jitterSeed: (Math.random() * 0xffff) | 0 }));
    setGeneratingSlot(null);
  };

  // ── AI: generate iMessage thread for imessageMom format ─────────────────────
  const generateImessageThread = async (itemName, soldPrice) => {
    try {
      const res = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "imessageThread", itemName, soldPrice }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.thread ?? null;
    } catch { return null; }
  };

  const generateStarterPackText = async () => {
    try {
      const res = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "starterPackThrifting" }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const headline = typeof data.headline === "string" ? data.headline : "";
      const items = Array.isArray(data.items) ? data.items : [];
      const imagePrompts = Array.isArray(data.imagePrompts) ? data.imagePrompts : [];
      if (!headline || items.length !== 3) return null;
      return { headline, items, imagePrompts };
    } catch { return null; }
  };

  // Always regenerates fresh headline + titles + image prompts every call.
  // Returns the sp data so callers can pass prompts directly to ensureStarterPackImages.
  const ensureStarterPackAutofill = async () => {
    const sp = await generateStarterPackText();
    if (!sp) return null;

    updateConfig("starterPackHeadline", sp.headline);
    for (let i = 0; i < 3; i++) {
      updateSlot(i, {
        itemName: sp.items[i] ?? "",
        prompt: sp.imagePrompts[i] ?? sp.items[i] ?? "",
        imageUrl: null,
      });
    }
    return sp;
  };

  // Accepts explicit prompts array to avoid reading stale React state.
  // Falls back to reading config.slots if prompts not provided.
  const ensureStarterPackImages = async (prompts) => {
    for (let i = 0; i < 3; i++) {
      const p = (prompts?.[i] ?? "").trim()
        || (config.slots?.[i]?.prompt ?? "").trim()
        || (config.slots?.[i]?.itemName ?? "").trim();
      if (!p) continue;
      setExportStatus(`Generating starter pack image ${i + 1}/3…`);
      const url = await generateImage(i, p, null);
      if (url) updateSlot(i, { imageUrl: url });
    }
  };

  // (removed POV format; starterPack covers POV vibe now)

  // ── GPT-4 Vision: generate item title from image ──
  // ── Grail Identifier: returns { title, price } from image ───────────────────
  const autoTitleFromImage = async (imageUrl) => {
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "identify",
          imageUrl,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        title: data.title || null,
        price: data.price || null,
      };
    } catch { return null; }
  };

  // ── Random thrift spent price + 40-50% markup sold price ──
  const autoRandomPrices = () => {
    const THRIFT_PRICES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 18, 20, 22, 25];
    const spent = THRIFT_PRICES[Math.floor(Math.random() * THRIFT_PRICES.length)];
    const multiplier = 1.40 + Math.random() * 0.10; // 40-50% more
    const sold = Math.round(spent * multiplier);
    return { spentPrice: String(spent), soldPrice: String(sold) };
  };

  // ── Auto-generate 2 slightly-varied sold listing rows ──
  const autoSoldListings = (itemName, soldPrice) => {
    const PREFIXES = ["Pre-owned ", "Used ", "Vintage ", "Authentic "];
    const SUFFIXES = [" - Great Condition", " - Gently Used", " (Pre-loved)", " - Excellent"];
    const SOURCES  = ["eBay", "Poshmark", "Mercari", "Depop"];
    const price = parseFloat(soldPrice);
    const makeRow = (seed) => ({
      title:   `${PREFIXES[seed % PREFIXES.length]}${itemName}${SUFFIXES[(seed + 1) % SUFFIXES.length]}`,
      source:  SOURCES[seed % SOURCES.length],
      price:   isNaN(price) ? "" : String(Math.round(price * (seed % 2 === 0 ? 0.88 : 1.08))),
      inStock: false,
    });
    return [makeRow(0), makeRow(1)];
  };

  // ── Per-slot: auto-title button ──
  const handleAutoTitle = async (index) => {
    const slot = config.slots[index];
    if (!slot.imageUrl) { setAiErrors((p) => ({ ...p, [`title_${index}`]: "Upload an image first." })); return; }
    setAiErrors((p) => ({ ...p, [`title_${index}`]: null }));
    setGeneratingSlot(`title_${index}`);
    const grail = await autoTitleFromImage(slot.imageUrl);
    if (grail?.title) {
      const resolvedPrice = grail.price ?? slot.soldPrice;
      updateSlot(index, {
        itemName: grail.title,
        ...(grail.price ? { soldPrice: grail.price } : {}),
        matchItems: autoSoldListings(grail.title, resolvedPrice),
      });
    } else {
      setAiErrors((p) => ({ ...p, [`title_${index}`]: "Could not identify item." }));
    }
    setGeneratingSlot(null);
  };

  const handleGenerateAll = async () => {
    setGeneratingSlot("all");
    setAiErrors({});
    batchCaptionsRef.current = [];
    // Auto-pick a random hook caption for the collage slide
    if (hookItems.length > 0) {
      let pick = hookItems[Math.floor(Math.random() * hookItems.length)];
      pick = await ensureUniqueHookCaption(pick, batchCaptionsRef);
      updateConfig("captionText", pick);
    }

    // iMessage mom only uses slot 0
    const isMomFmt = (config.outputFormat ?? "standard") === "imessageMom";
    const allSlots = isMomFmt ? [config.slots[0]] : config.slots;

    // All slots are active if brand items list has items; otherwise filter by slot prompt
    const activeSlots = allSlots
      .map((s, i) => ({ slot: s, i: isMomFmt ? 0 : i }))
      .filter(({ slot }) => brandItems.length > 0 || slot.prompt?.trim());

    if (activeSlots.length === 0) {
      alert("Add items to the Brand Items List or add a prompt to at least one slot.");
      setGeneratingSlot(null);
      return;
    }

    const total = activeSlots.length;
    const slotsDone = new Set();
    cancelGenRef.current = false;

    // Deduplicate brand items first, then shuffle so every slot gets a unique brand
    const uniqueBrands = [...new Set(brandItems)];
    const shuffledUnique = uniqueBrands.length > 0
      ? [...uniqueBrands].sort(() => Math.random() - 0.5)
      : [];
    // If more slots than unique brands, extend with a re-shuffled copy (no back-to-back repeats)
    while (shuffledUnique.length > 0 && shuffledUnique.length < activeSlots.length) {
      const extra = [...uniqueBrands].sort(() => Math.random() - 0.5);
      shuffledUnique.push(...extra);
    }

    let failedCount = 0;
    setGenAllProgress({ total, done: 0, current: activeSlots[0].i, phase: `Starting ${total} image${total > 1 ? "s" : ""}…`, slotsDone });

    for (let idx = 0; idx < activeSlots.length; idx++) {
      if (cancelGenRef.current) {
        setGenAllProgress((p) => p ? { ...p, phase: "Stopped." } : null);
        setTimeout(() => setGenAllProgress(null), 2000);
        setGeneratingSlot(null);
        return;
      }
      const { i } = activeSlots[idx];
      const prompt = config.slots[i].prompt || globalPrompt;
      const stepLabel = `${idx + 1} of ${total}`;

      // Each slot gets its own unique brand item from the deduplicated shuffled list
      const brandItem = shuffledUnique.length > 0 ? shuffledUnique[idx] : null;
      const brandLabel = brandItem ? ` — "${brandItem}"` : "";

      // Phase 1 — generate image
      setGenAllProgress({ total, done: slotsDone.size, current: i, phase: `Generating image ${stepLabel}${brandLabel}…`, slotsDone: new Set(slotsDone) });
      const url = await generateImage(i, prompt, brandItem);

      if (url) {
        const slot = config.slots[i];
        const priceUpdates = (!slot.spentPrice && !slot.soldPrice) ? autoRandomPrices() : {};
        updateSlot(i, { imageUrl: url, ...priceUpdates });

        // Phase 2 — auto-title
        setGenAllProgress({ total, done: slotsDone.size, current: i, phase: `Analyzing item ${stepLabel}…`, slotsDone: new Set(slotsDone) });
        const grail = await autoTitleFromImage(url);
        if (grail?.title) {
          const resolvedPrice = grail.price ?? priceUpdates.soldPrice ?? slot.soldPrice;
          updateSlot(i, {
            itemName: grail.title,
            ...(grail.price ? { soldPrice: grail.price } : {}),
            matchItems: autoSoldListings(grail.title, resolvedPrice),
          });
        }

        slotsDone.add(i);
        setGenAllProgress({ total, done: slotsDone.size, current: i, phase: `Item ${stepLabel} complete`, slotsDone: new Set(slotsDone) });
      } else {
        // Generation failed — count it but don't mark as done
        failedCount++;
        const errMsg = aiErrors[i] || "unknown error";
        setGenAllProgress({ total, done: slotsDone.size, current: i, phase: `Slot ${stepLabel} failed: ${errMsg}`, slotsDone: new Set(slotsDone) });
        await new Promise((r) => setTimeout(r, 2500)); // longer pause so user can read error
      }
    }

    setGeneratingSlot(null);
    const doneCount = slotsDone.size;
    const summary = failedCount > 0
      ? `Done — ${doneCount} succeeded, ${failedCount} failed`
      : "All done! ✓";
    setGenAllProgress((p) => p ? { ...p, phase: summary, done: doneCount } : null);
    setTimeout(() => setGenAllProgress(null), 4000);
  };

  // ── Batch generation: produce N complete slideshows sequentially ─────────────
  const [numSlideshows, setNumSlideshows] = useState(3);

  // Generate one complete slideshow into a local slots array, save via callback.
  const generateOneSlideshow = async (showIndex, totalShows) => {
    const isMomFmt = (config.outputFormat ?? "standard") === "imessageMom";
    const slotCount = isMomFmt ? 1 : 6;

    let hookCaption = hookItems.length > 0
      ? hookItems[Math.floor(Math.random() * hookItems.length)]
      : config.captionText;
    hookCaption = await ensureUniqueHookCaption(hookCaption, batchCaptionsRef);

    // Pick brand items for this show (1 for mom format, 6 for standard)
    const uniqueBrands = [...new Set(brandItems)];
    const shuffled = [...uniqueBrands].sort(() => Math.random() - 0.5);
    while (shuffled.length > 0 && shuffled.length < slotCount)
      shuffled.push(...[...uniqueBrands].sort(() => Math.random() - 0.5));

    const localSlots = Array.from({ length: 6 }, (_, i) => freshSlot(i));

    for (let si = 0; si < slotCount; si++) {
      if (cancelGenRef.current) break;
      const brandItem = shuffled.length > 0 ? shuffled[si] : null;
      setGenAllProgress({
        total: slotCount, done: si, current: si,
        phase: `Show ${showIndex + 1}/${totalShows} · Image ${si + 1}/${slotCount}${brandItem ? ` — "${brandItem}"` : ""}…`,
        slotsDone: new Set(Array.from({ length: si }, (_, k) => k)),
      });
      const url = await generateImage(si, globalPrompt, brandItem);
      if (url) {
        const prices = autoRandomPrices();
        localSlots[si] = { ...localSlots[si], imageUrl: url, ...prices };
        setGenAllProgress({
          total: slotCount, done: si, current: si,
          phase: `Show ${showIndex + 1}/${totalShows} · Analyzing item ${si + 1}/${slotCount}…`,
          slotsDone: new Set(Array.from({ length: si }, (_, k) => k)),
        });
        const grail = await autoTitleFromImage(url);
        if (grail?.title) {
          const rp = grail.price ?? prices.soldPrice;
          localSlots[si] = {
            ...localSlots[si], itemName: grail.title,
            ...(grail.price ? { soldPrice: grail.price } : {}),
            matchItems: autoSoldListings(grail.title, rp),
          };
        }
      }
      // Update live preview so user can watch along
      updateConfig("slots", [...localSlots]);
    }
    updateConfig("captionText", hookCaption);
    await waitForPreviewPaint();
    const previewScreenshot = await captureLivePreviewThumbnail();
    onSlideshowSaved?.({
      slots: [...localSlots],
      captionText: hookCaption,
      previewScreenshot,
      outputFormat: config.outputFormat,
    });
    return localSlots;
  };

  const handleGenerateBatch = async () => {
    if (brandItems.length === 0) {
      alert("Add items to the Brand Items List first.");
      return;
    }
    setGeneratingSlot("all");
    setAiErrors({});
    batchCaptionsRef.current = [];
    cancelGenRef.current = false;
    for (let i = 0; i < numSlideshows; i++) {
      if (cancelGenRef.current) break;
      await generateOneSlideshow(i, numSlideshows);
    }
    setGeneratingSlot(null);
    setGenAllProgress((p) => p
      ? { ...p, phase: `✓ ${numSlideshows} slideshow${numSlideshows > 1 ? "s" : ""} saved to gallery!`, done: 6 }
      : null
    );
    setTimeout(() => setGenAllProgress(null), 4000);
  };

  // ── Video export: capture each slide, then animate ──
  const handleExportVideo = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Capturing slides…");

    if ((config.outputFormat ?? "standard") === "starterPack") {
      setExportStatus("Generating starter pack text…");
      const sp = await ensureStarterPackAutofill();
      setExportStatus("Generating starter pack images…");
      await ensureStarterPackImages(sp?.imagePrompts ?? sp?.items);
      setExportStatus("Capturing slides…");
    }

    const allSlideFrames = [];
    const previewNode = getCaptureNode();
    const fontEmbedCSS = previewNode ? await getFontEmbedCSS(previewNode) : undefined;

    for (let i = 0; i < totalSlides; i++) {
      setCurrentSlide(i);
      await waitForPreviewPaint();

      const info = getSlideInfo(config, i);
      const bg =
        info.type === "collage"
          ? "#111111"
          : info.type === "fullBleed" || info.type === "imessage" || info.type === "starterPack"
          ? "#000000"
          : "#ffffff";

      if (info.type === "starterPack") {
        // Capture 4 phases (each ~1.25s) so items dissolve in over 5 seconds
        const SP_PHASES = 4;
        const SP_PHASE_DURATION = 5 / SP_PHASES; // seconds per phase
        for (let phase = 1; phase <= SP_PHASES; phase++) {
          setConfig((prev) => ({ ...prev, _spPhase: phase }));
          await new Promise((r) => setTimeout(r, 120));
          try {
            const canvas = await captureSlideCanvas(bg, fontEmbedCSS);
            if (!canvas) throw new Error("Preview node not found");
            allSlideFrames.push([canvas, SP_PHASE_DURATION]);
          } catch (err) {
            console.error("Capture error starterPack phase", phase, err);
            allSlideFrames.push([]);
          }
        }
        // Reset phase
        setConfig((prev) => ({ ...prev, _spPhase: -1 }));
      } else {
        await new Promise((r) => setTimeout(r, 80));
        try {
          const canvas = await captureSlideCanvas(bg, fontEmbedCSS);
          if (!canvas) throw new Error("Preview node not found");
          allSlideFrames.push([canvas]);
        } catch (err) {
          console.error("Capture error slide", i, err);
          allSlideFrames.push([]);
        }
      }

      setExportProgress(Math.round((i + 1) / totalSlides * 40));
      setExportStatus(`Captured slide ${i + 1} of ${totalSlides}…`);
    }

    // Filter to slides that have at least one captured frame
    const validSlides = allSlideFrames
      .map((snapshots, i) => ({ snapshots, origIndex: i }))
      .filter(({ snapshots }) => snapshots.length > 0);

    if (validSlides.length === 0) {
      setIsExporting(false);
      setExportStatus("Export failed — no frames captured.");
      return;
    }

    // ── PHASE 2: Encode with native WebCodecs + mp4-muxer (no WASM, no CDN) ──────
    setExportStatus("Preparing encoder…");
    setExportProgress(42);

    // WebCodecs availability check
    if (typeof VideoEncoder === "undefined") {
      setIsExporting(false);
      setExportStatus("WebCodecs not available — please use Chrome or Safari 16+.");
      return;
    }

    const OUT_W = 1080;
    const OUT_H = 1920;
    const fps = 30;
    const transitionFrames = Math.round((config.transitionMs / 1000) * fps);
    const frameDurationUs  = Math.round(1_000_000 / fps); // microseconds per frame

    // Per-slide hold duration in frames.
    // StarterPack phases store their own duration in snapshots[1]; others use global slideDuration.
    const perSlideHoldFrames = validSlides.map(({ snapshots }) => {
      const overrideSec = snapshots[1]; // set for starterPack phases
      const baseSec = typeof overrideSec === "number" ? overrideSec : config.slideDuration;
      const jitterMs = typeof overrideSec === "number" ? 0 : Math.floor(Math.random() * 500);
      return Math.round((baseSec + jitterMs / 1000) * fps);
    });

    // Total frame count for progress
    let totalFrames = 0;
    for (let i = 0; i < validSlides.length; i++) {
      totalFrames += perSlideHoldFrames[i];
      if (i < validSlides.length - 1) totalFrames += transitionFrames;
    }

    // Scale canvas: renders each frame at exact 1080×1920
    const scaleCanvas = document.createElement("canvas");
    scaleCanvas.width  = OUT_W;
    scaleCanvas.height = OUT_H;
    const sctx = scaleCanvas.getContext("2d");

    // ── Optional audio: fetch, decode, prepare ─────────────────────────────
    let decodedAudio = null;   // AudioBuffer | null
    let audioSampleRate = 44100;
    let audioChannels = 2;

    if (config.useRandomAudio && typeof AudioEncoder !== "undefined") {
      try {
        setExportStatus("Loading audio…");
        const { files: audioFiles } = await fetch("/api/audio").then((r) => r.json());
        if (audioFiles?.length > 0) {
          const pick = audioFiles[Math.floor(Math.random() * audioFiles.length)];
          const ab = await fetch(pick).then((r) => r.arrayBuffer());
          const ac = new AudioContext();
          decodedAudio = await ac.decodeAudioData(ab);
          audioSampleRate = decodedAudio.sampleRate;
          audioChannels = Math.min(decodedAudio.numberOfChannels, 2);
          await ac.close();
        }
      } catch (e) {
        console.warn("Audio load failed, exporting without audio:", e);
        decodedAudio = null;
      }
    }

    // mp4-muxer setup (pure JS, in-memory)
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const target = new ArrayBufferTarget();
    const muxerOpts = {
      target,
      video: { codec: "avc", width: OUT_W, height: OUT_H },
      fastStart: "in-memory",
    };
    if (decodedAudio) {
      muxerOpts.audio = { codec: "aac", numberOfChannels: audioChannels, sampleRate: audioSampleRate };
    }
    const muxer = new Muxer(muxerOpts);

    // VideoEncoder (browser-native H.264)
    let encoderError = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error:  (e) => { encoderError = e; console.error("VideoEncoder:", e); },
    });
    encoder.configure({
      codec:        "avc1.640028",   // H.264 High Profile Level 4.0
      width:        OUT_W,
      height:       OUT_H,
      bitrate:      12_000_000,
      framerate:    fps,
      bitrateMode:  "constant",
      latencyMode:  "quality",
    });

    // ── Encode every frame ────────────────────────────────────────────────────
    let pts = 0;           // presentation timestamp in microseconds
    let encoded = 0;

    for (let si = 0; si < validSlides.length; si++) {
      const curSnaps   = validSlides[si].snapshots;
      const holdFrames = perSlideHoldFrames[si];

      for (let f = 0; f < holdFrames; f++) {
        if (encoderError) break;
        sctx.clearRect(0, 0, OUT_W, OUT_H);
        sctx.drawImage(curSnaps[0], 0, 0, OUT_W, OUT_H);

        const vf = new VideoFrame(scaleCanvas, { timestamp: pts, duration: frameDurationUs });
        encoder.encode(vf, { keyFrame: encoded % fps === 0 });
        vf.close();
        pts += frameDurationUs;
        encoded++;

        // Yield periodically to keep the UI responsive
        if (encoded % 20 === 0) {
          await new Promise((r) => setTimeout(r, 0));
          setExportProgress(42 + Math.round((encoded / totalFrames) * 55));
          setExportStatus(`Encoding frame ${encoded} / ${totalFrames}…`);
        }
        // Throttle if the encoder queue is building up
        while (encoder.encodeQueueSize > 12) {
          await new Promise((r) => setTimeout(r, 5));
        }
      }

      // Transition phase — iPhone cubic ease-out swipe
      if (si < validSlides.length - 1) {
        const nxtSnaps = validSlides[si + 1].snapshots;
        for (let f = 0; f < transitionFrames; f++) {
          if (encoderError) break;
          const t      = f / transitionFrames;
          const eased  = 1 - Math.pow(1 - t, 3);
          const offset = Math.round(eased * OUT_W);
          sctx.clearRect(0, 0, OUT_W, OUT_H);
          sctx.drawImage(curSnaps[0], -offset,        0, OUT_W, OUT_H);
          sctx.drawImage(nxtSnaps[0],                   OUT_W - offset, 0, OUT_W, OUT_H);

          const vf = new VideoFrame(scaleCanvas, { timestamp: pts, duration: frameDurationUs });
          encoder.encode(vf, { keyFrame: false });
          vf.close();
          pts += frameDurationUs;
          encoded++;
        }
      }
    }

    if (encoderError) {
      setIsExporting(false);
      setExportStatus(`Encoding failed: ${encoderError.message}`);
      return;
    }

    setExportStatus("Finalizing MP4…");
    setExportProgress(97);
    await encoder.flush();

    // ── Encode audio track (if loaded) ────────────────────────────────────
    if (decodedAudio) {
      try {
        setExportStatus("Encoding audio…");
        const totalVideoDurationSec = (pts) / 1_000_000;
        const totalAudioSamples = Math.ceil(totalVideoDurationSec * audioSampleRate);
        const CHUNK = 4096;

        const channelData = Array.from({ length: audioChannels }, (_, ch) =>
          decodedAudio.getChannelData(ch)
        );
        const srcLen = channelData[0].length;

        let audioError = null;
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error:  (e) => { audioError = e; console.error("AudioEncoder:", e); },
        });
        await audioEncoder.configure({
          codec:            "mp4a.40.2",   // AAC-LC
          sampleRate:       audioSampleRate,
          numberOfChannels: audioChannels,
          bitrate:          192_000,
        });

        let audioOffset = 0;
        while (audioOffset < totalAudioSamples && !audioError) {
          const size = Math.min(CHUNK, totalAudioSamples - audioOffset);
          // Build planar float32 buffer: [ch0 samples … ch1 samples …]
          const buf = new Float32Array(size * audioChannels);
          for (let ch = 0; ch < audioChannels; ch++) {
            for (let i = 0; i < size; i++) {
              buf[ch * size + i] = channelData[ch][(audioOffset + i) % srcLen];
            }
          }
          const timestampUs = Math.round((audioOffset / audioSampleRate) * 1_000_000);
          const audioData = new AudioData({
            format:           "f32-planar",
            sampleRate:       audioSampleRate,
            numberOfChannels: audioChannels,
            numberOfFrames:   size,
            timestamp:        timestampUs,
            data:             buf,
          });
          audioEncoder.encode(audioData);
          audioData.close();
          audioOffset += size;
        }
        await audioEncoder.flush();
      } catch (e) {
        console.warn("Audio encode failed, video will be silent:", e);
      }
    }

    muxer.finalize();

    // Randomised filename for uniqueness
    const uid = Array.from({ length: 10 }, () =>
      "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]
    ).join("");

    const mp4Blob = new Blob([target.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(mp4Blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `thrifty_${uid}.mp4`;
    a.click();
    URL.revokeObjectURL(url);

    setIsExporting(false);
    setExportProgress(100);
    setExportStatus("Done! Video downloaded.");
    setTimeout(() => { setExportStatus(""); setExportProgress(0); }, 3000);
  };

  const handleExportPNG = async () => {
    const el = getCaptureNode();
    if (!el) return;
    setIsExporting(true);
    setExportProgress(20);
    try {
      if ((config.outputFormat ?? "standard") === "starterPack") {
        setExportStatus("Generating starter pack text…");
        const sp = await ensureStarterPackAutofill();
        setExportStatus("Generating starter pack images…");
        await ensureStarterPackImages(sp?.imagePrompts ?? sp?.items);
      }
      const fontEmbedCSS = await getFontEmbedCSS(el);
      const capInfo = getSlideInfo(config, currentSlide);
      const capBg =
        capInfo.type === "collage"
          ? "#111111"
          : capInfo.type === "fullBleed" || capInfo.type === "imessage" || capInfo.type === "starterPack"
          ? "#000000"
          : capInfo.type === "voicemail"
          ? "#ffffff"
          : "#ffffff";
      const canvas = await captureSlideCanvas(capBg, fontEmbedCSS);
      if (!canvas) throw new Error("Preview node not found");
      setExportProgress(80);
      canvas.toBlob((blob) => {
        if (!blob) {
          setIsExporting(false);
          setExportProgress(0);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `slide-${currentSlide + 1}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setExportProgress(100);
        setTimeout(() => { setIsExporting(false); setExportProgress(0); }, 600);
      });
    } catch (err) {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleExportAllPNGs = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Capturing slides…");

    if ((config.outputFormat ?? "standard") === "starterPack") {
      setExportStatus("Generating starter pack text…");
      const sp = await ensureStarterPackAutofill();
      setExportStatus("Generating starter pack images…");
      await ensureStarterPackImages(sp?.imagePrompts ?? sp?.items);
      setExportStatus("Capturing slides…");
    }

    const previewNode = getCaptureNode();
    const fontEmbedCSS = previewNode ? await getFontEmbedCSS(previewNode) : undefined;

    const pngEntries = {};

    for (let i = 0; i < totalSlides; i++) {
      setCurrentSlide(i);
      await waitForPreviewPaint();
      await new Promise((r) => setTimeout(r, 80));

      const info = getSlideInfo(config, i);
      const bg =
        info.type === "collage"    ? "#111111"
        : info.type === "fullBleed" || info.type === "imessage" || info.type === "starterPack" ? "#000000"
        : "#ffffff";

      if (info.type === "starterPack") {
        // Export final phase (all 4 cards visible) as a single PNG
        setConfig((prev) => ({ ...prev, _spPhase: 4 }));
        await new Promise((r) => setTimeout(r, 120));
        try {
          const canvas = await captureSlideCanvas(bg, fontEmbedCSS);
          if (!canvas) throw new Error("no canvas");
          const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
          const arr  = new Uint8Array(await blob.arrayBuffer());
          pngEntries[`${String(i + 1).padStart(2, "0")}-starter-pack.png`] = arr;
        } catch (e) { console.warn("Skipping starterPack slide", e); }
        setConfig((prev) => ({ ...prev, _spPhase: -1 }));
      } else {
        try {
          const canvas = await captureSlideCanvas(bg, fontEmbedCSS);
          if (!canvas) throw new Error("no canvas");
          const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
          const arr  = new Uint8Array(await blob.arrayBuffer());
          const label = info.type === "collage"      ? "collage"
            : info.type === "imessage"     ? "imessage"
            : info.type === "voicemail"    ? "voicemail"
            : info.type === "imessageText" ? "imessage-texts"
            : `slide-${i + 1}`;
          pngEntries[`${String(i + 1).padStart(2, "0")}-${label}.png`] = arr;
        } catch (e) {
          console.warn("Skipping slide", i, e);
        }
      }

      setExportProgress(Math.round(((i + 1) / totalSlides) * 85));
      setExportStatus(`Captured ${i + 1} / ${totalSlides}…`);
    }

    if (Object.keys(pngEntries).length === 0) {
      setIsExporting(false);
      setExportStatus("Nothing to export.");
      return;
    }

    setExportStatus("Building ZIP…");
    setExportProgress(90);

    const { zipSync } = await import("fflate");
    const zipData = zipSync(pngEntries, { level: 1 });
    const blob = new Blob([zipData], { type: "application/zip" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `thrifty_slides_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setIsExporting(false);
    setExportProgress(100);
    setExportStatus("Done! ZIP downloaded.");
    setTimeout(() => { setExportStatus(""); setExportProgress(0); }, 3000);
  };

  // Register the per-slide refresh handler so VideoPreview can trigger generation
  // No deps — runs after every render to keep the latest closure registered
  useEffect(() => {
    registerRefreshSlide?.((slideIdx) => {
      const fmt = config.outputFormat ?? "standard";
      if (slideIdx === 0 && fmt !== "posePerson" && fmt !== "imessageMom") {
        handleGenerateAll();
      } else {
        const itemIdx = slideIndexToSlotIndex(slideIdx, config);
        if (itemIdx != null) handleGenerateOne(itemIdx);
      }
    });
  });

  return (
    <div className="p-5 space-y-5">
      <h2 className="text-white/50 font-bold text-xs uppercase tracking-widest">Configuration</h2>

      <div className="space-y-3 -mt-1">
        <span className="text-white/45 text-xs font-semibold uppercase tracking-wider">Output format</span>
        <div className="flex flex-col gap-2">
          {[
            { id: "standard", label: "Standard", sub: "Collage, then reveal + app per item" },
            { id: "appOnly", label: "App only", sub: "Collage, then app screenshots only (no reveal)" },
            { id: "imessageMom", label: "iMessage mom", sub: "iMessage → Voicemail → Thrifty (3 slides, slot 1 only)" },
            { id: "posePerson", label: "Pose person", sub: "Six full-frame shots; hands OK on slide 1 only" },
            { id: "starterPack", label: "Starter pack", sub: "POV: you thrift full time — 3 struggles + Thrifty (5 sec)" },
          ].map(({ id, label, sub }) => (
            <button
              key={id}
              type="button"
              onClick={() => updateConfig("outputFormat", id)}
              className={`text-left rounded-xl border px-3 py-2 transition-all ${
                (config.outputFormat ?? "standard") === id
                  ? "border-violet-500 bg-violet-500/15 text-white"
                  : "border-white/10 bg-white/4 text-white/50 hover:border-white/20"
              }`}
            >
              <div className="text-xs font-semibold">{label}</div>
              <div className="text-[10px] text-white/40 mt-0.5">{sub}</div>
            </button>
          ))}
        </div>

        {/* ── Starter Pack config ───────────────────────────────────────── */}
        {(config.outputFormat ?? "standard") === "starterPack" && (
          <div className="bg-white/4 border border-violet-500/30 rounded-xl p-3 flex flex-col gap-2">
            <div className="text-white/55 text-xs font-semibold">Starter Pack</div>
            <p className="text-white/35 text-[10px] leading-relaxed">
              Headline stays static. Each of the 3 items + Thrifty dissolves in over 5 seconds.
              Use the image slots below to generate/upload photos for items 1–3.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setIsExporting(true);
                  setExportStatus("Generating starter pack text…");
                  const sp = await ensureStarterPackAutofill();
                  setExportStatus("Generating starter pack images…");
                  await ensureStarterPackImages(sp?.imagePrompts ?? sp?.items);
                  setIsExporting(false);
                  setExportStatus("");
                }}
                className="px-2.5 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-white text-[11px] font-semibold"
              >
                Auto-generate (AI)
              </button>
              <span className="text-white/30 text-[10px]">Generates a fresh headline, titles, and card images every time.</span>
            </div>
            {/* Headline */}
            <label className="text-white/50 text-[10px] font-semibold">Headline text</label>
            <textarea
              rows={2}
              value={config.starterPackHeadline ?? ""}
              onChange={(e) => updateConfig("starterPackHeadline", e.target.value)}
              placeholder="e.g. people with these hobbies have more aura than they know what to do with"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs placeholder:text-white/25 resize-none focus:outline-none focus:border-violet-500/60"
            />
            {/* Item name overrides */}
            <label className="text-white/50 text-[10px] font-semibold mt-1">Item card titles (uses slot name if left blank)</label>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-white/30 text-[10px] w-10 shrink-0">Card {i + 1}</span>
                <input
                  type="text"
                  value={config.slots?.[i]?.itemName ?? ""}
                  onChange={(e) => updateSlot(i, { itemName: e.target.value })}
                  placeholder={`Item ${i + 1} name`}
                  className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-violet-500/60"
                />
              </div>
            ))}
            <p className="text-white/30 text-[10px]">Card 4 is always <span className="text-white/60">Thrifty</span> (auto).</p>
          </div>
        )}

        <div className="bg-white/4 border border-white/10 rounded-xl p-3">
          <div className="text-white/55 text-xs font-semibold mb-1">Pose format (optional)</div>
          <p className="text-white/35 text-[10px] mb-2 leading-relaxed">
            Upload your own reference photos. The model matches pose and framing, then swaps in each item. Images are cycled by slot (1→2→3…→1). With <span className="text-white/50">Pose person</span> selected, hands/arms are only allowed on the first generated slide; other slides stay hands-free.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            className="text-white/50 text-[11px] w-full file:mr-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-white/10 file:text-white/80"
            onChange={(e) => {
              const files = [...e.target.files];
              if (!files.length) return;
              Promise.all(
                files.map(
                  (f) =>
                    new Promise((res) => {
                      const r = new FileReader();
                      r.onload = () => res({ id: `${Date.now()}-${Math.random()}`, dataUrl: r.result });
                      r.readAsDataURL(f);
                    })
                )
              ).then((list) => {
                updateConfig("poseReferenceImages", [...(config.poseReferenceImages || []), ...list]);
              });
              e.target.value = "";
            }}
          />
          {(config.poseReferenceImages?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 items-center justify-between">
              <span className="text-violet-300 text-[10px] font-medium">{config.poseReferenceImages.length} loaded</span>
              <button
                type="button"
                onClick={() => updateConfig("poseReferenceImages", [])}
                className="text-[10px] text-red-400/90 hover:text-red-300 font-medium"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-white/5" />

      {/* ── COLLAGE CAPTION ── */}
      <Section title="Collage Caption" icon="💬">
        <div className="flex items-start gap-2">
          <Textarea
            value={config.captionText}
            onChange={(e) => updateConfig("captionText", e.target.value)}
            placeholder="My top 6 Most Favorite&#10;Goodwill Finds"
            rows={2}
          />
          <button
            onClick={pickRandomHook}
            disabled={hookItems.length === 0}
            title="Pick a random hook"
            className="shrink-0 w-8 h-8 mt-0.5 rounded-lg bg-white/8 hover:bg-white/15 border border-white/10 text-base flex items-center justify-center transition-colors disabled:opacity-30"
          >
            🎲
          </button>
        </div>

        {/* ── Caption style toggle ── */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wider shrink-0">Style</span>
          <div className="flex gap-1">
            {[
              { id: "tiktok",    label: "TikTok text" },
              { id: "tickerBox", label: "Ticker box" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => updateConfig("captionStyle", id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                  (config.captionStyle ?? "tiktok") === id
                    ? "border-violet-500 bg-violet-500/20 text-white"
                    : "border-white/10 bg-white/5 text-white/40 hover:border-white/20"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Color pickers — only visible when tickerBox is selected */}
        {(config.captionStyle ?? "tiktok") === "tickerBox" && (
          <div className="mt-2 flex gap-3">
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={config.captionBg ?? "#e03030"}
                onChange={(e) => updateConfig("captionBg", e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-white/20 bg-transparent"
                title="Box background color"
              />
              <span className="text-white/35 text-[10px]">Box color</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={config.captionColor ?? "#ffffff"}
                onChange={(e) => updateConfig("captionColor", e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-white/20 bg-transparent"
                title="Text color"
              />
              <span className="text-white/35 text-[10px]">Text color</span>
            </div>
          </div>
        )}

        <div className="mt-2">
          <label className="text-white/35 text-[10px] block mb-1">TikTok @ watermark (iMessage mom slides)</label>
          <input
            type="text"
            value={config.tiktokWatermark ?? ""}
            onChange={(e) => updateConfig("tiktokWatermark", e.target.value)}
            placeholder="@mom"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500/60 placeholder-white/20"
          />
        </div>

        <div className="mt-2">
          <label className="text-white/35 text-[10px] block mb-1">Voicemail caller ID (iMessage mom)</label>
          <input
            type="text"
            value={config.voicemailDisplayNumber ?? ""}
            onChange={(e) => updateConfig("voicemailDisplayNumber", e.target.value)}
            placeholder="+1 (225) 427-8071"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500/60 placeholder-white/20"
          />
        </div>

        {/* Hook list */}
        <div className="mt-3 bg-white/4 border border-white/10 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <Label>Hook Captions</Label>
            {mounted && hookItems.length > 0 && (
              <span className="text-violet-300 text-[10px] font-medium">{hookItems.length} hook{hookItems.length > 1 ? "s" : ""}</span>
            )}
          </div>
          <textarea
            value={hooksRaw}
            onChange={(e) => { setHooksRaw(e.target.value); localStorage.setItem("ts_hooks", e.target.value); }}
            placeholder={"found at goodwill 👀\nthrift finds that paid off 💰\nyou won't believe what i found"}
            rows={5}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-violet-500/60 placeholder-white/15 resize-none"
          />
          <p className="text-white/25 text-[10px] mt-1">One caption per line. A random one is picked each time you generate.</p>
        </div>
      </Section>

      {/* ── AI GENERATION ── */}
      <Section title="AI Generation" icon="✨">
        {/* Model selector */}
        <div className="flex gap-2 mb-3">
          {[
            { id: "gpt-image-1", label: "GPT-Image-1.5", color: "border-emerald-500 bg-emerald-500/15 text-emerald-200" },
            { id: "gemini",      label: "Gemini Flash",  color: "border-violet-500 bg-violet-500/15 text-violet-200" },
          ].map(({ id, label, color }) => {
            const isMom = (config.outputFormat ?? "standard") === "imessageMom";
            const imgs = isMom ? 1 : 6;
            const sub = id === "gpt-image-1"
              ? `$${(0.015 * imgs).toFixed(2)}/slideshow`
              : `$${(0.07  * imgs).toFixed(2)}/slideshow`;
            return (
            <button
              key={id}
              onClick={() => setImageModel(id)}
              className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold transition-all text-left ${
                imageModel === id ? color : "border-white/10 bg-white/4 text-white/40 hover:text-white/60"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {imageModel === id && <span className="w-2 h-2 rounded-full bg-current inline-block" />}
                {label}
              </span>
              <span className={`block text-[10px] mt-0.5 font-normal ${imageModel === id ? "opacity-70" : "opacity-40"}`}>{sub} · low quality</span>
            </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5 text-xs text-emerald-200">
          <div className="font-semibold">AI keys are managed on the server.</div>
          <div className="mt-1 text-emerald-100/70">
            This deployment uses the Vercel environment variables for image generation and auto-title,
            so teammates can use the app without entering API keys here.
          </div>
        </div>

        {/* Reference images status — only rendered client-side to avoid hydration mismatch */}
        {mounted && <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
          referenceImages === null ? "bg-white/4 border border-white/8 text-white/35"
          : referenceImages.length > 0 ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
          : "bg-white/4 border border-white/8 text-white/35"
        }`}>
          <span>{referenceImages === null ? "⏳" : referenceImages.length > 0 ? "🖼️" : "📂"}</span>
          {referenceImages === null ? (
            <span>Loading reference photos…</span>
          ) : referenceImages.length > 0 ? (
            <span>
              <strong>{referenceImages.length}</strong> reference photo{referenceImages.length > 1 ? "s" : ""} in{" "}
              <code className="text-white/50">public/references/</code> — used for the messy blue shopping-cart (buggy) look; clothing-only generations match this composition.
            </span>
          ) : (
            <span>Add a PNG/JPEG to <code className="text-white/50">public/references/</code> (e.g. messy clothes in a blue cart) to lock the buggy aesthetic.</span>
          )}
        </div>}
        {/* Brand Items List */}
        <div className="mt-3 bg-white/4 border border-white/10 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <Label>Brand Items List</Label>
            {mounted && brandItems.length > 0 && (
              <span className="text-violet-300 text-[10px] font-medium">{brandItems.length} item{brandItems.length > 1 ? "s" : ""}</span>
            )}
          </div>
          <textarea
            value={brandItemsRaw}
            onChange={(e) => { setBrandItemsRaw(e.target.value); localStorage.setItem("ts_brand_items", e.target.value); }}
            placeholder={"vintage Carhartt double-knee pants\nSupreme box logo hoodie\nvintage Levi's 501\nKapital boro jacket\nvintage Nike windbreaker"}
            rows={5}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-violet-500/60 placeholder-white/15 resize-none"
          />
          <p className="text-white/25 text-[10px] mt-1">Clothing only — one garment per line. Each slot gets a different piece from this list, shown in the messy cart pile.</p>
        </div>

        <div className="mt-2 flex gap-2">
          <button onClick={handleGenerateAll} disabled={generatingSlot !== null}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
            {generatingSlot === "all" ? "Generating…" : "✨ Generate 1 Slideshow"}
          </button>
          {generatingSlot === "all" && (
            <button
              onClick={() => { cancelGenRef.current = true; }}
              className="px-3 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
              title="Stop generating"
            >
              ■ Stop
            </button>
          )}
        </div>

        {/* ── Batch: generate N slideshows ── */}
        <div className="mt-3 pt-3 border-t border-white/8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-white/45 text-xs flex-1">Generate multiple slideshows</span>
            <div className="flex items-center gap-1.5">
              <span className="text-white/30 text-[11px]">qty</span>
              <input
                type="number" min={1} max={50}
                value={numSlideshows}
                onChange={(e) => setNumSlideshows(Math.max(1, Math.min(50, Number(e.target.value))))}
                className="w-14 bg-white/8 border border-white/15 rounded-lg px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-violet-500/60"
              />
            </div>
          </div>
          <button
            onClick={handleGenerateBatch}
            disabled={generatingSlot !== null}
            className="w-full py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
          >
            {generatingSlot === "all" ? "Generating…" : `🎬 Generate ${numSlideshows} Slideshow${numSlideshows > 1 ? "s" : ""}`}
          </button>
          <p className="text-white/25 text-[10px] mt-1.5 text-center">
            {(() => {
              const isMom = (config.outputFormat ?? "standard") === "imessageMom";
              const imgs = isMom ? 1 : 6;
              const cost = imageModel === "gpt-image-1" ? 0.015 * imgs : 0.07 * imgs;
              return `est. $${(numSlideshows * cost).toFixed(2)} · each goes to gallery on the right`;
            })()}
          </p>
        </div>

        {/* Progress tracker */}
        {genAllProgress && (
          <div className="mt-3 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            {/* Slot dots */}
            <div className="flex gap-1.5 justify-center">
              {Array.from({ length: config.slots.length }).map((_, i) => {
                const done = genAllProgress.slotsDone.has(i);
                const active = !done && i === genAllProgress.current;
                return (
                  <div key={i} className={`relative flex items-center justify-center rounded-full transition-all
                    ${done ? "w-7 h-7 bg-violet-500" : active ? "w-7 h-7 bg-violet-600/50 ring-2 ring-violet-400" : "w-7 h-7 bg-white/10"}`}>
                    {done ? (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5l2.5 2.5 4.5-5" />
                      </svg>
                    ) : active ? (
                      <div className="w-2.5 h-2.5 border-2 border-violet-300 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span className="text-white/30 text-[10px] font-bold">{i + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${(genAllProgress.done / genAllProgress.total) * 100}%` }}
              />
            </div>

            {/* Status text */}
            <p className="text-white/50 text-xs text-center">{genAllProgress.phase}</p>
          </div>
        )}
      </Section>

      {/* ── VIDEO SETTINGS ── */}
      <Section title="Video Settings" icon="🎬">
        <div className="flex items-center gap-3">
          <Label className="shrink-0">Slide duration</Label>
          <input type="range" min={1} max={8} step={0.5} value={config.slideDuration}
            onChange={(e) => updateConfig("slideDuration", Number(e.target.value))}
            className="flex-1 accent-violet-500" />
          <span className="text-white text-sm w-8 text-right shrink-0">{config.slideDuration}s</span>
        </div>
      </Section>

      {/* ── EXPORT ── */}
      <div className="space-y-2 pb-8">
        <h3 className="text-white/50 text-xs uppercase tracking-widest font-bold mb-3">Export</h3>
        {/* ── Background music toggle ── */}
        <div className="bg-white/4 border border-white/10 rounded-xl p-3 flex items-start gap-3">
          <button
            type="button"
            onClick={() => updateConfig("useRandomAudio", !config.useRandomAudio)}
            className={`mt-0.5 w-9 h-5 rounded-full flex-shrink-0 transition-colors relative ${config.useRandomAudio ? "bg-violet-500" : "bg-white/15"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${config.useRandomAudio ? "left-[18px]" : "left-0.5"}`} />
          </button>
          <div>
            <div className="text-xs font-semibold text-white/80">Background music</div>
            <div className="text-[10px] text-white/35 mt-0.5 leading-relaxed">
              Drop <span className="text-white/55">.mp3 / .wav / .m4a</span> files into{" "}
              <span className="text-white/55">public/audio/</span> — a random track is mixed in on export.
              {config.useRandomAudio && typeof window !== "undefined" && typeof AudioEncoder === "undefined" && (
                <span className="text-amber-400"> AudioEncoder not supported in this browser — use Chrome.</span>
              )}
            </div>
          </div>
        </div>

        {(isExporting || exportStatus) && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>{exportStatus || "Exporting…"}</span>
              <span>{exportProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all duration-200" style={{ width: `${exportProgress}%` }} />
            </div>
          </div>
        )}
        <button onClick={handleExportPNG} disabled={isExporting}
          className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-sm font-semibold border border-white/10 transition-colors">
          📸 Export Current Slide as PNG
        </button>
        <button onClick={handleExportAllPNGs} disabled={isExporting}
          className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-sm font-semibold border border-white/10 transition-colors">
          🗂️ Export All Slides as PNG (ZIP)
        </button>
        <button onClick={handleExportVideo} disabled={isExporting}
          className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
          🎬 Export Full Video (.mp4)
        </button>
        <p className="text-white/25 text-xs text-center">
          {totalSlides} slides · {(config.slideDuration * totalSlides).toFixed(0)}s+ · 1080×1920 full res
        </p>
      </div>
    </div>
  );
}

// ── Shared UI ──
function Section({ title, icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span>{icon}</span>
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      {children}
      <div className="mt-5 border-b border-white/5" />
    </div>
  );
}
function Label({ children, className = "" }) {
  return <label className={`block text-white/45 text-xs mb-1 ${className}`}>{children}</label>;
}
function Input({ value, onChange, placeholder }) {
  return (
    <input type="text" value={value} onChange={onChange} placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500/60 placeholder-white/20" />
  );
}
function Textarea({ value, onChange, placeholder, rows = 2 }) {
  return (
    <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/60 placeholder-white/20 resize-none" />
  );
}
