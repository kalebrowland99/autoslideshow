"use client";

import { useRef, useState, useEffect } from "react";
import { getFontEmbedCSS, toCanvas, toJpeg } from "html-to-image";
import { DISPLAY_SCALE } from "./VideoPreview";

const PRESET_COLORS = [
  "#e03030","#e05c20","#d4a017","#1a8a3a","#1a5cbf","#7c22cc","#000000","#ffffff",
];

// ── Grail brand tiers (higher tier = picked more often) ──────────────────────
const BRAND_TIERS = {
  1: ["Kapital","Visvim","Issey Miyake","Yohji Yamamoto","Comme des Garçons","Junya Watanabe","Undercover","Number Nine","Hysteric Glamour","Neighborhood","WTAPS","LGB","If Six Was Nine","Kiko Kostadinov"],
  2: ["Chrome Hearts","Rick Owens","Balenciaga","Louis Vuitton","Dior","Saint Laurent","Givenchy","Prada","Maison Margiela","Bottega Veneta","Celine","Gucci","Vetements","Amiri","Palm Angels","1017 ALYX 9SM","Acne Studios","Helmut Lang","Raf Simons","Herman Miller","Knoll","Eames"],
  3: ["Carhartt","Levi's","Dickies","Wrangler","Red Kap","Ben Davis","RRL","Nudie Jeans","APC","Evisu"],
  4: ["Supreme","Stussy","BAPE","Off-White","Palace","Kith","Fear of God","Essentials","Anti Social Social Club","Billionaire Boys Club","Rhude","Arc'teryx","Patagonia","The North Face","Columbia"],
  5: ["Nike","Jordan","Adidas","Yeezy","New Balance","Salomon","Asics","Converse","Vivienne Westwood","Tiffany & Co","Harley Davidson","NASCAR"],
};
const TIER_WEIGHTS = { 1: 5, 2: 4, 3: 3, 4: 3, 5: 2 };

// ── Furniture detection ───────────────────────────────────────────────────────
const FURNITURE_BRANDS = [
  "herman miller","knoll","eames","drexel","lane furniture",
  "restoration hardware","west elm","cb2","pottery barn","crate and barrel",
  "ethan allen","bassett","hooker","broyhill","thomasville",
];
const FURNITURE_KEYWORDS = [
  "chair","couch","sofa","table","dresser","lamp","shelf","cabinet",
  "desk","bed","nightstand","credenza","wardrobe","armchair","bookcase",
  "sideboard","ottoman","bench","stool","buffet","chest","hutch",
  "headboard","loveseat","sectional","recliner","vanity","console",
];

function isFurnitureItem(item) {
  if (!item) return false;
  const lower = item.toLowerCase();
  return FURNITURE_BRANDS.some((b) => lower.includes(b)) ||
         FURNITURE_KEYWORDS.some((k) => lower.includes(k));
}

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
  // Furniture — multiple distinct products per brand so each slideshow varies
  "Herman Miller Aeron chair",
  "Herman Miller Eames DSW plastic side chair",
  "Herman Miller Eames RAR rocking armchair",
  "Herman Miller Eames wire chair DKR",
  "Herman Miller Eames fiberglass armchair DAR",
  "Herman Miller Eames 670 lounge chair and ottoman",
  "Herman Miller Eames aluminum group chair",
  "Knoll Tulip pedestal chair Eero Saarinen",
  "Knoll Barcelona chair Mies van der Rohe",
  "Knoll Womb chair Eero Saarinen",
  "mid-century modern teak credenza",
  "mid-century modern walnut dresser with hairpin legs",
  "vintage solid wood farm dining table",
  "vintage Lane Furniture record cabinet",
  "vintage Drexel walnut dresser",
  "vintage G Plan teak sideboard",
  "vintage Danish teak sofa",
  "solid wood dovetail tallboy dresser",
  "vintage industrial pipe shelf unit",
  "vintage rattan peacock chair",
  "vintage Bertoia diamond wire chair",
  "vintage butterfly sling chair",
  "vintage egg-shaped pod chair",
  "vintage travertine side table",
  "vintage brutalist ceramic lamp",
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
}) {
  const DEFAULT_PROMPT = "A thrift store find held up in one hand toward the camera, shot inside a real Goodwill or thrift store — clothing racks and shelves softly blurred in the background, bright overhead fluorescent lighting, shallow depth of field, candid realistic photo style, natural colors, no text, no watermarks, no studio backdrop";

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
    if (savedBrands) setBrandItemsRaw(savedBrands);
    const savedHooks = localStorage.getItem("ts_hooks");
    if (savedHooks) setHooksRaw(savedHooks);
  }, []);

  // Parsed brand items (non-empty lines)
  const brandItems = brandItemsRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

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
    const bgColor = currentSlide === 0 ? "#111111" : "#ffffff";

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

  const generateImage = async (index, prompt, brandItem) => {
    try {
      let b64 = null;

      // Detect item type to choose reference photos
      const itemIsFurniture = isFurnitureItem(brandItem) || isFurnitureItem(prompt);
      const brandName = brandItem || prompt?.trim() || "a thrift store item";

      // Detect furniture reference photos by filename keywords (no prefix needed)
      const FURNITURE_FILE_KEYWORDS = [
        "furniture","chair","couch","sofa","table","dresser","lamp","shelf",
        "cabinet","desk","bed","nightstand","credenza","wardrobe","armchair",
        "bookcase","sideboard","ottoman","bench","stool","buffet","chest",
        "hutch","headboard","loveseat","sectional","recliner","floor",
      ];
      const isRefFurniture = (f) => {
        const name = f.toLowerCase();
        return FURNITURE_FILE_KEYWORDS.some((k) => name.includes(k));
      };
      const refs = referenceImages || [];
      const furnitureRefs = refs.filter(isRefFurniture);
      const clothingRefs  = refs.filter((f) => !isRefFurniture(f));
      const matchingRefs  = itemIsFurniture
        ? (furnitureRefs.length > 0 ? furnitureRefs : refs)
        : (clothingRefs.length  > 0 ? clothingRefs  : refs);

      // Variation mode: reference photo drives the scene; just swap the item
      // Text-to-image fallback: full scene description needed
      const SHARED_RULES = `
Aspect ratio requirement: Generate the image in 9:16 vertical portrait orientation only. This is mandatory. The image must be tall (portrait), optimized for smartphone viewing similar to TikTok or Instagram Reels. Do not generate square or landscape images. The composition must fill a 9:16 portrait frame from top to bottom.

The photo should look like it was taken using an iPhone 15 Pro Max smartphone camera. Apply the exact iPhone 15 Pro Max color science: Display P3 wide color gamut, accurate natural colors, realistic HDR with lifted shadows, sharp foreground detail.

Color temperature and white balance are critical: the scene is lit by overhead fluorescent retail store lights which produce a neutral-to-slightly-cool white balance at approximately 4500–5500K with a very slight green-neutral cast. The whites in the image must appear clean, crisp, and neutral — not warm, not orange, not yellow, not amber. There must be zero warm incandescent glow, zero golden-hour toning, zero cinematic color grading, zero film emulation, and zero vintage warm filter. Colors should look exactly as a real iPhone camera sees a Goodwill store: accurate, slightly cool, neutral and clean under fluorescent retail lighting. Blues appear vivid and accurate. Whites appear clean. Shadows are cool-neutral and slightly lifted by Smart HDR processing. The overall image looks like an unedited iPhone snapshot, not a color-graded commercial photo.

Handling rule:
For most items (clothing, shoes, accessories, small objects, etc.), the item should be held by a human hand in a physically believable way, following real-world physics. The hand should grip the object where a person would naturally hold it, with fingers wrapping around appropriate areas and the thumb stabilizing it. The object must appear fully supported by the hand with correct balance and weight, not floating or clipping through the fingers. Finger placement, wrist angle, and grip pressure should look natural, like someone casually lifting the item to inspect it while browsing. Maintain realistic proportions between the hand and the object.

Clothing rule: If the item is a jacket, hoodie, shirt, pants, coat, or any garment that would normally hang on a hanger, the person must be holding it by gripping the top of the coat hanger — fingers wrapped around the hanger hook or neck area, the garment hanging naturally below with gravity pulling it down. The hanger itself must look anatomically correct (a standard thrift store wire or plastic hanger with a realistic hook at the top). The clothing must hang loosely and naturally with realistic fabric drape, wrinkles, and weight — not stiff, flat, or rigid like a product photo. The garment must be sized as if it fits a full-grown adult, with realistic sleeve length, body width, and shoulder span — not small or child-sized. Fabric folds and creases should look natural, as if the item has been worn and stored.

Exception for large objects: If the item is large furniture or heavy objects such as cabinets, nightstands, chairs, tables, shelves, dressers, or similar items, do not include a hand holding it. Instead, place the item naturally in the thrift store environment, such as sitting on the floor, on display, or positioned in the furniture section of the store. The furniture should appear stable, grounded, and properly resting according to real-world physics.

The subject must behave according to real-world physics. Gravity, orientation, contact points, shadows, and balance should all appear natural.

Footwear rule: if the item is a pair of shoes, show only one shoe being held in the hand. Do not display both shoes together.

Place the scene inside a Goodwill or similar thrift store environment. Randomly choose a believable section of the store so the background varies across generations. Possible settings include clothing racks filled with mixed garments, outlet bins with piles of clothing, shoe aisles, jacket sections, shelf displays, furniture sections, or open browsing aisles. The environment should resemble a real thrift shop with racks, hangers, plastic bins, simple shelving, furniture displays, and wide walkways.

Lighting should match typical thrift store lighting: bright overhead fluorescent retail lighting inside a large indoor store with a slightly warehouse-style layout.

The camera perspective should look like a first-person smartphone photo when the item is handheld, as if a shopper lifted the item to inspect it while browsing. The object in the foreground should remain sharp and detailed, while the store interior and distant shoppers remain slightly blurred with natural depth of field.

Maintain realistic perspective, scale, lighting direction, shadows, and reflections so the object appears physically integrated into the environment.

The final result should look like a natural thrifting discovery photo taken casually inside a Goodwill or secondhand store using an iPhone 15 Pro Max.

Text and logo rendering rule: If the item has a brand logo, text graphic, embroidery, print, or any typography that is physically part of the item (such as a Supreme box logo, Nike swoosh wordmark, band tee graphic, or embossed lettering), render it with sharp, clean, legible edges exactly as it appears on the real product. This is critical — brand markings on the item itself must be clear and accurate, not blurry, distorted, or omitted.

Do NOT add any external overlays: no captions, subtitles, price tags, watermarks, floating labels, or any text that is not physically part of the item itself.`.trim();

      const fullPrompt = matchingRefs.length > 0
        ? `Use the uploaded image as the main subject and preserve the item exactly as it appears, including its shape, color, texture, branding, and small details. Do not redesign, stylize, exaggerate, or invent new parts of the object. Replace the item with a specific, real, well-known product by ${brandName} — choose an iconic piece this brand actually made and is known for. Keep the setting, lighting, and composition identical to the uploaded photo.\n\n${SHARED_RULES}`
        : `Show a specific, real, well-known product by ${brandName} — choose an iconic piece this brand actually made and is known for.\n\n${SHARED_RULES}`;

      // Pick a random reference image if available
      const refFile = matchingRefs.length > 0
        ? matchingRefs[Math.floor(Math.random() * matchingRefs.length)]
        : null;

      // Proxy through /api/generate-image — server reads file from disk, no self-fetch, no stack overflow
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fullPrompt,
          referenceFile: refFile || null,
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
      if (grail?.title) {
        const resolvedPrice = grail.price ?? priceUpdates.soldPrice ?? slot.soldPrice;
        updateSlot(index, {
          itemName: grail.title,
          ...(grail.price ? { soldPrice: grail.price } : {}),
          matchItems: autoSoldListings(grail.title, resolvedPrice),
        });
      }
    }
    setGeneratingSlot(null);
  };

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
    // Auto-pick a random hook caption for the collage slide
    if (hookItems.length > 0) {
      const pick = hookItems[Math.floor(Math.random() * hookItems.length)];
      updateConfig("captionText", pick);
    }

    // All slots are active if brand items list has items; otherwise filter by slot prompt
    const activeSlots = config.slots
      .map((s, i) => ({ slot: s, i }))
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
    const hookCaption = hookItems.length > 0
      ? hookItems[Math.floor(Math.random() * hookItems.length)]
      : config.captionText;

    // Pick 6 unique brand items for this show
    const uniqueBrands = [...new Set(brandItems)];
    const shuffled = [...uniqueBrands].sort(() => Math.random() - 0.5);
    while (shuffled.length > 0 && shuffled.length < 6)
      shuffled.push(...[...uniqueBrands].sort(() => Math.random() - 0.5));

    const localSlots = Array.from({ length: 6 }, (_, i) => freshSlot(i));

    for (let si = 0; si < 6; si++) {
      if (cancelGenRef.current) break;
      const brandItem = shuffled.length > 0 ? shuffled[si] : null;
      setGenAllProgress({
        total: 6, done: si, current: si,
        phase: `Show ${showIndex + 1}/${totalShows} · Image ${si + 1}/6${brandItem ? ` — "${brandItem}"` : ""}…`,
        slotsDone: new Set(Array.from({ length: si }, (_, k) => k)),
      });
      const url = await generateImage(si, globalPrompt, brandItem);
      if (url) {
        const prices = autoRandomPrices();
        localSlots[si] = { ...localSlots[si], imageUrl: url, ...prices };
        setGenAllProgress({
          total: 6, done: si, current: si,
          phase: `Show ${showIndex + 1}/${totalShows} · Analyzing item ${si + 1}/6…`,
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

    // ThriftySlides are at positions 2, 4, 6, … (i > 0 && (i-1) % 2 === 1)
    const isThriftySlide = (i) => i > 0 && (i - 1) % 2 === 1;

    // allSlideFrames[i] = Canvas[] — ThriftySlides get multiple canvases, others get one
    const allSlideFrames = [];
    const previewNode = getCaptureNode();
    const fontEmbedCSS = previewNode ? await getFontEmbedCSS(previewNode) : undefined;

    for (let i = 0; i < totalSlides; i++) {
      setCurrentSlide(i);
      await waitForPreviewPaint();

      const bg = i === 0 ? "#111111" : "#ffffff";

      if (isThriftySlide(i)) {
        // Capture ONE clean background snapshot before confetti fires (fires at 300ms).
        // Confetti will be drawn directly onto the export canvas at true 30fps.
        setExportStatus(`Capturing slide ${i + 1}…`);
        await new Promise((r) => setTimeout(r, 60));
        try {
          const canvas = await captureSlideCanvas(bg, fontEmbedCSS);
          if (!canvas) throw new Error("Preview node not found");
          allSlideFrames.push([canvas]);
        } catch (err) {
          console.error("Capture error slide", i, err);
          allSlideFrames.push([]);
        }
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

    // Per-slide hold duration in frames (with random jitter for TikTok variance)
    const perSlideHoldFrames = validSlides.map(() => {
      const jitterMs = Math.floor(Math.random() * 500);
      return Math.round((config.slideDuration + jitterMs / 1000) * fps);
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

    // ── Confetti physics for ThriftySlides — drawn directly at 30fps ──────────
    const CONFETTI_COLORS_EXP = [
      "#f44336","#e91e63","#9c27b0","#3f51b5","#2196f3",
      "#00bcd4","#4caf50","#ffeb3b","#ff9800","#ff5722",
    ];
    // Scale particle size from display pixels to export pixels
    const displayW = Math.round(1080 * DISPLAY_SCALE);
    const displayH = Math.round(1920 * DISPLAY_SCALE);
    const confScaleX = OUT_W / displayW;
    const confScaleY = OUT_H / displayH;
    // Confetti fires 300ms after slide mount
    const confettiDelayFrames = Math.round(0.3 * fps);

    function makeExportParticles() {
      const origins = [{ x: OUT_W * 0.5, y: OUT_H * 0.50 }];
      return Array.from({ length: 40 }, (_, i) => {
        const o = origins[i % origins.length];
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * (OUT_H * 0.05);
        return {
          x: o.x + (Math.random() - 0.5) * OUT_W * 0.06,
          y: o.y,
          vx: Math.cos(angle) * speed * 0.25,
          vy: -(Math.random() * speed * 0.35 + speed * 0.1),
          color: CONFETTI_COLORS_EXP[Math.floor(Math.random() * CONFETTI_COLORS_EXP.length)],
          w: (2 + Math.random() * 4) * confScaleX,
          h: (1.5 + Math.random() * 3) * confScaleY,
          rot: Math.random() * Math.PI * 2,
          rotV: (Math.random() - 0.5) * 0.25,
          offscreen: false,
          shape: Math.random() > 0.45 ? "rect" : "circle",
        };
      });
    }

    function stepExportParticles(particles) {
      for (const p of particles) {
        if (p.offscreen) continue;
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += OUT_H * 0.0008;
        p.vx *= 0.985;
        p.rot += p.rotV;
        if (p.y > OUT_H + 20) p.offscreen = true;
      }
    }

    function drawExportConfetti(ctx, particles) {
      for (const p of particles) {
        if (p.offscreen) continue;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // mp4-muxer setup (pure JS, in-memory)
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const target = new ArrayBufferTarget();
    const muxer  = new Muxer({
      target,
      video: { codec: "avc", width: OUT_W, height: OUT_H },
      fastStart: "in-memory",
    });

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
      const needsConfetti = isThriftySlide(validSlides[si].origIndex);

      // Create a fresh particle system per ThriftySlide (spawned at confettiDelayFrames)
      let confettiParticles = null;

      // Hold phase — draw static background + live confetti physics at true 30fps
      for (let f = 0; f < holdFrames; f++) {
        if (encoderError) break;
        sctx.clearRect(0, 0, OUT_W, OUT_H);
        sctx.drawImage(curSnaps[0], 0, 0, OUT_W, OUT_H);

        if (needsConfetti) {
          if (f === confettiDelayFrames) confettiParticles = makeExportParticles();
          if (confettiParticles) {
            drawExportConfetti(sctx, confettiParticles);
            stepExportParticles(confettiParticles);
          }
        }

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
      const fontEmbedCSS = await getFontEmbedCSS(el);
      const canvas = await captureSlideCanvas(currentSlide === 0 ? "#111111" : "#ffffff", fontEmbedCSS);
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

  // Register the per-slide refresh handler so VideoPreview can trigger generation
  // No deps — runs after every render to keep the latest closure registered
  useEffect(() => {
    registerRefreshSlide?.((slideIdx) => {
      if (slideIdx === 0) {
        handleGenerateAll();
      } else {
        const itemIdx = Math.floor((slideIdx - 1) / 2);
        handleGenerateOne(itemIdx);
      }
    });
  });

  return (
    <div className="p-5 space-y-5">
      <h2 className="text-white/50 font-bold text-xs uppercase tracking-widest">Configuration</h2>

      {/* ── COLLAGE CAPTION ── */}
      <Section title="Collage Caption" icon="💬">
        {/* Universal caption size — controls all slides */}
        <div className="flex items-center gap-3 mb-3">
          <label className="text-white/45 text-xs shrink-0">Text size (all slides)</label>
          <input
            type="range" min={36} max={110} step={2}
            value={config.captionSize}
            onChange={(e) => updateConfig("captionSize", Number(e.target.value))}
            className="flex-1 h-1 rounded-full appearance-none bg-white/15 accent-violet-500"
          />
          <span className="text-white/60 text-xs w-7 text-right">{config.captionSize}</span>
        </div>
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
            { id: "gpt-image-1", label: "GPT-Image-1.5", sub: "$0.09/slideshow", color: "border-emerald-500 bg-emerald-500/15 text-emerald-200" },
            { id: "gemini",      label: "Gemini Flash",  sub: "$0.42/slideshow", color: "border-violet-500 bg-violet-500/15 text-violet-200" },
          ].map(({ id, label, sub, color }) => (
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
          ))}
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
          ) : referenceImages.length > 0 ? (() => {
            const FKEYS = ["furniture","chair","couch","sofa","table","dresser","lamp","shelf","cabinet","desk","floor"];
            const f = referenceImages.filter((r) => FKEYS.some((k) => r.toLowerCase().includes(k))).length;
            const c = referenceImages.length - f;
            return <span>
              <strong>{referenceImages.length}</strong> reference photo{referenceImages.length > 1 ? "s" : ""} loaded
              {f > 0 && c > 0 && <> — <span className="text-amber-300">{c} clothing</span> / <span className="text-emerald-300">{f} furniture</span></>}
              {f > 0 && c === 0 && <> — <span className="text-emerald-300">{f} furniture only</span></>}
              {f === 0 && c > 0 && <> — include "chair", "furniture" etc. in filenames to tag furniture refs</>}
            </span>;
          })() : (
            <span>No reference photos — add images to <code className="text-white/50">public/references/</code> for variation mode</span>
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
            placeholder={"harley davidson vintage t-shirt\nrestoration hardware linen couch\nvintage michael kors purse\nlouis vuitton neverfull tote\nnike air jordan 1985 sneakers"}
            rows={5}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-violet-500/60 placeholder-white/15 resize-none"
          />
          <p className="text-white/25 text-[10px] mt-1">One item per line. AI will feature each item in a reference photo style. Each slot gets a different item from this list.</p>
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
            est. {imageModel === "gpt-image-1"
              ? `$${(numSlideshows * 0.09).toFixed(2)}`
              : `$${(numSlideshows * 0.42).toFixed(2)}`
            } · each goes to gallery on the right
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
