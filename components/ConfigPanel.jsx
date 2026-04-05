"use client";

import { useRef, useState, useEffect } from "react";
import html2canvas from "html2canvas";
import { getSlideInfo, DISPLAY_SCALE } from "./VideoPreview";

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
  // Furniture
  "Herman Miller chair","Knoll chair","Eames lounge chair",
  "mid-century modern teak credenza","mid-century modern walnut dresser",
  "vintage solid wood dining table","vintage Lane furniture cabinet",
  "vintage Drexel dresser","vintage Restoration Hardware couch",
  "vintage teak sideboard","vintage mid-century modern sofa",
  "solid wood dovetail dresser","vintage industrial metal shelving",
  "vintage sculptural armchair",
].join("\n");

export default function ConfigPanel({
  config, updateConfig, updateSlot, updateMatchItem,
  currentSlide, setCurrentSlide, totalSlides,
  isExporting, setIsExporting, exportProgress, setExportProgress,
  exportStatus, setExportStatus,
  onBusyChange, registerRefreshSlide,
}) {
  const DEFAULT_PROMPT = "A thrift store find held up in one hand toward the camera, shot inside a real Goodwill or thrift store — clothing racks and shelves softly blurred in the background, bright overhead fluorescent lighting, shallow depth of field, candid realistic photo style, natural colors, no text, no watermarks, no studio backdrop";

  const [geminiApiKey, setGeminiApiKey] = useState(""); // Google AI — image generation (Nano Banana 2)
  const [aiApiKey, setAiApiKey] = useState("");          // OpenAI — auto-titling (GPT-4o vision)
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
    const savedGemini = localStorage.getItem("ts_gemini_key");
    if (savedGemini) setGeminiApiKey(savedGemini);
    const savedKey = localStorage.getItem("ts_api_key");
    if (savedKey) setAiApiKey(savedKey);
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
    if (!geminiApiKey.trim()) {
      setAiErrors((p) => ({ ...p, [index]: "Google AI API key required." }));
      return null;
    }
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

The photo should look like it was taken using an iPhone 15 Pro Max smartphone camera, with realistic smartphone photography characteristics such as natural HDR, balanced exposure, sharp foreground detail, and realistic indoor lighting typical of modern iPhone photography.

Handling rule:
For most items (clothing, shoes, accessories, small objects, etc.), the item should be held by a human hand in a physically believable way, following real-world physics. The hand should grip the object where a person would naturally hold it, with fingers wrapping around appropriate areas and the thumb stabilizing it. The object must appear fully supported by the hand with correct balance and weight, not floating or clipping through the fingers. Finger placement, wrist angle, and grip pressure should look natural, like someone casually lifting the item to inspect it while browsing. Maintain realistic proportions between the hand and the object.

Exception for large objects: If the item is large furniture or heavy objects such as cabinets, nightstands, chairs, tables, shelves, dressers, or similar items, do not include a hand holding it. Instead, place the item naturally in the thrift store environment, such as sitting on the floor, on display, or positioned in the furniture section of the store. The furniture should appear stable, grounded, and properly resting according to real-world physics.

The subject must behave according to real-world physics. Gravity, orientation, contact points, shadows, and balance should all appear natural.

Footwear rule: if the item is a pair of shoes, show only one shoe being held in the hand. Do not display both shoes together.

Place the scene inside a Goodwill or similar thrift store environment. Randomly choose a believable section of the store so the background varies across generations. Possible settings include clothing racks filled with mixed garments, outlet bins with piles of clothing, shoe aisles, jacket sections, shelf displays, furniture sections, or open browsing aisles. The environment should resemble a real thrift shop with racks, hangers, plastic bins, simple shelving, furniture displays, and wide walkways.

Lighting should match typical thrift store lighting: bright overhead fluorescent retail lighting inside a large indoor store with a slightly warehouse-style layout.

The camera perspective should look like a first-person smartphone photo when the item is handheld, as if a shopper lifted the item to inspect it while browsing. The object in the foreground should remain sharp and detailed, while the store interior and distant shoppers remain slightly blurred with natural depth of field.

Maintain realistic perspective, scale, lighting direction, shadows, and reflections so the object appears physically integrated into the environment.

The final result should look like a natural thrifting discovery photo taken casually inside a Goodwill or secondhand store using an iPhone 15 Pro Max.

Do not add text, captions, labels, price tags, logos, watermarks, or graphic overlays.`.trim();

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
          referenceFile: refFile || null,  // just the filename, server reads from public/references/
          geminiApiKey,
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
      if (aiApiKey.trim()) {
        const grail = await autoTitleFromImage(url, aiApiKey);
        if (grail?.title) {
          const resolvedPrice = grail.price ?? priceUpdates.soldPrice ?? slot.soldPrice;
          updateSlot(index, {
            itemName: grail.title,
            ...(grail.price ? { soldPrice: grail.price } : {}),
            matchItems: autoSoldListings(grail.title, resolvedPrice),
          });
        }
      }
    }
    setGeneratingSlot(null);
  };

  // ── GPT-4 Vision: generate item title from image ──
  // ── Grail Identifier: returns { title, price } from image ───────────────────
  const autoTitleFromImage = async (imageUrl, apiKey) => {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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
      if (!res.ok) return null;
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content?.trim() || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      return {
        title: parsed.title?.replace(/^["']|["']$/g, "") || null,
        price: parsed.price ? String(Math.round(Number(parsed.price))) : null,
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
    if (!aiApiKey.trim()) { setAiErrors((p) => ({ ...p, [`title_${index}`]: "API key required." })); return; }
    setAiErrors((p) => ({ ...p, [`title_${index}`]: null }));
    setGeneratingSlot(`title_${index}`);
    const grail = await autoTitleFromImage(slot.imageUrl, aiApiKey);
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
    if (!geminiApiKey.trim()) { alert("Enter your Google AI API key first."); return; }
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

        // Phase 2 — auto-title (if API key present)
        if (aiApiKey.trim()) {
          setGenAllProgress({ total, done: slotsDone.size, current: i, phase: `Analyzing item ${stepLabel}…`, slotsDone: new Set(slotsDone) });
          const grail = await autoTitleFromImage(url, aiApiKey);
          if (grail?.title) {
            const resolvedPrice = grail.price ?? priceUpdates.soldPrice ?? slot.soldPrice;
            updateSlot(i, {
              itemName: grail.title,
              ...(grail.price ? { soldPrice: grail.price } : {}),
              matchItems: autoSoldListings(grail.title, resolvedPrice),
            });
          }
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

  // ── Video export: capture each slide, then animate ──
  const handleExportVideo = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Capturing slides…");

    const captureScale = Math.round(1080 / (1080 * DISPLAY_SCALE));

    // ThriftySlides are at positions 2, 4, 6, … (i > 0 && (i-1) % 2 === 1)
    const isThriftySlide = (i) => i > 0 && (i - 1) % 2 === 1;

    // For ThriftySlides we capture multiple snapshots to animate confetti.
    // Timestamps (ms after mount) to capture — spans before + during confetti burst + falling
    const THRIFTY_CAPTURE_MS = [50, 380, 680, 1000, 1380];

    const captureOpts = (bgColor) => ({
      useCORS: true, allowTaint: true, scale: captureScale,
      backgroundColor: bgColor, logging: false,
    });

    // allSlideFrames[i] = Canvas[] — ThriftySlides get multiple canvases, others get one
    const allSlideFrames = [];

    for (let i = 0; i < totalSlides; i++) {
      setCurrentSlide(i);
      // Wait for React to render the slide
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const el = document.getElementById("video-preview-root");
      if (!el) { allSlideFrames.push([]); continue; }

      const bg = i === 0 ? "#111111" : "#ffffff";

      if (isThriftySlide(i)) {
        setExportStatus(`Capturing slide ${i + 1} (confetti)…`);
        const snapshots = [];
        let elapsed = 0;
        for (const t of THRIFTY_CAPTURE_MS) {
          await new Promise((r) => setTimeout(r, t - elapsed));
          elapsed = t;
          try {
            const canvas = await html2canvas(el, captureOpts(bg));
            snapshots.push(canvas);
          } catch (err) {
            console.error("Capture error slide", i, "at", t, "ms", err);
          }
        }
        allSlideFrames.push(snapshots);
      } else {
        await new Promise((r) => setTimeout(r, 80));
        try {
          const canvas = await html2canvas(el, captureOpts(bg));
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

    setExportStatus("Encoding video…");

    const W = validSlides[0].snapshots[0].width;
    const H = validSlides[0].snapshots[0].height;
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = W;
    outputCanvas.height = H;
    const ctx = outputCanvas.getContext("2d");

    const fps = 30;
    const transitionFrames = Math.round((config.transitionMs / 1000) * fps);

    // Each slide gets a slightly randomised hold duration (base ± up to 0.5s)
    const perSlideDurationFrames = validSlides.map(() => {
      const jitterMs = Math.floor(Math.random() * 500);
      return Math.round((config.slideDuration + jitterMs / 1000) * fps);
    });

    // Build cumulative segment start positions
    const segmentStarts = [];
    let cursor = 0;
    for (let i = 0; i < validSlides.length; i++) {
      segmentStarts.push(cursor);
      cursor += perSlideDurationFrames[i] + (i < validSlides.length - 1 ? transitionFrames : 0);
    }
    const totalOutputFrames = cursor;

    // Pick the right snapshot for an animated (ThriftySlide) segment
    // posInHold: frames elapsed in the hold portion, holdFrames: total hold frames
    const getCanvas = (snapshots, posInHold, holdFrames) => {
      if (snapshots.length === 1) return snapshots[0];
      const t = posInHold / Math.max(holdFrames - 1, 1);
      return snapshots[Math.min(Math.floor(t * snapshots.length), snapshots.length - 1)];
    };

    const stream = outputCanvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "thrifty-slideshow.webm";
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
      setExportProgress(100);
      setExportStatus("Done! Video downloaded.");
      setTimeout(() => { setExportStatus(""); setExportProgress(0); }, 3000);
    };

    recorder.start();

    let frameNum = 0;

    const renderNextFrame = () => {
      if (frameNum >= totalOutputFrames) {
        recorder.stop();
        return;
      }

      // Find which segment this frame belongs to
      let segIndex = validSlides.length - 1;
      for (let i = 0; i < validSlides.length - 1; i++) {
        if (frameNum < segmentStarts[i + 1]) { segIndex = i; break; }
      }
      const posInSeg = frameNum - segmentStarts[segIndex];
      const holdFrames = perSlideDurationFrames[segIndex];

      const curSnapshots = validSlides[segIndex].snapshots;
      const nxtSnapshots = validSlides[Math.min(segIndex + 1, validSlides.length - 1)].snapshots;

      ctx.clearRect(0, 0, W, H);

      if (posInSeg < holdFrames) {
        // Animated hold — pick the right confetti snapshot for this moment
        ctx.drawImage(getCanvas(curSnapshots, posInSeg, holdFrames), 0, 0);
      } else {
        // iPhone-style thumb swipe: fast start, cubic deceleration
        const t = (posInSeg - holdFrames) / transitionFrames;
        const eased = 1 - Math.pow(1 - t, 3);
        const offset = Math.round(eased * W);
        // Use last snapshot of current slide and first of next during transition
        ctx.drawImage(curSnapshots[curSnapshots.length - 1], -offset, 0);
        ctx.drawImage(nxtSnapshots[0], W - offset, 0);
      }

      frameNum++;
      const pct = 40 + Math.round((frameNum / totalOutputFrames) * 58);
      setExportProgress(pct);

      if (frameNum % 10 === 0) {
        setTimeout(renderNextFrame, 0);
      } else {
        requestAnimationFrame(renderNextFrame);
      }
    };

    renderNextFrame();
  };

  const handleExportPNG = async () => {
    const el = document.getElementById("video-preview-root");
    if (!el) return;
    setIsExporting(true);
    setExportProgress(20);
    const captureScale = Math.round(1080 / (1080 * DISPLAY_SCALE));
    try {
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: true,
        scale: captureScale,
        backgroundColor: currentSlide === 0 ? "#111111" : "#ffffff",
      });
      setExportProgress(80);
      canvas.toBlob((blob) => {
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
        <Label>Google AI API Key <span className="text-white/30 font-normal">(Nano Banana 2 — image gen)</span></Label>
        <input type="password" value={geminiApiKey}
          onChange={(e) => { setGeminiApiKey(e.target.value); localStorage.setItem("ts_gemini_key", e.target.value); }}
          placeholder="AIza..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/60 placeholder-white/20 font-mono" />
        <Label className="mt-2">OpenAI API Key <span className="text-white/30 font-normal">(GPT-4o — auto-title)</span></Label>
        <input type="password" value={aiApiKey}
          onChange={(e) => { setAiApiKey(e.target.value); localStorage.setItem("ts_api_key", e.target.value); }}
          placeholder="sk-..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500/60 placeholder-white/20 font-mono" />

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
            {generatingSlot === "all" ? "Generating…" : "✨ Generate All 6 Images"}
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
          🎬 Export Full Video (.webm)
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
