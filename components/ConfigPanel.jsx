"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { flushSync } from "react-dom";
import { getFontEmbedCSS, toCanvas, toJpeg } from "html-to-image";
import { DISPLAY_SCALE } from "./VideoPreview";
import {
  getSlideInfo,
  getTotalSlides,
  slideIndexToSlotIndex,
  isLabelySingleSlideFormat,
  isLabelyScanTourFormat,
  LABELY_SCAN_TOUR_SLOTS,
} from "@/lib/slideLayout";
import { buildLabelyScanFrameSequence } from "@/lib/labelyScanExport";
import { getBrand } from "@/lib/brand";
import {
  fileToDisplayableDataUrl,
  tryFileToDisplayableDataUrl,
  isLikelyRasterImageFile,
  IMAGE_FILE_ACCEPT,
} from "@/lib/fileToDisplayableDataUrl";
import { iphoneRetailPhotoImperfectionPrompt } from "@/lib/iphoneRetailPhotoImperfectionPrompt";
import { BAD_LABELY_VERDICT, normalizeBadLabelyScore } from "@/lib/labelyRating";

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1].trim().split(";")[0], base64: m[2].trim() };
}

/** Fisher–Yates shuffle (returns a new array). */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

const DEFAULT_LABELY_ITEMS = [
  "Nature's Bakery whole wheat fig bar (apple cinnamon)",
  "Core Power Elite chocolate protein shake bottle",
  "Barebells creamy crisp protein bar",
  "Cinnamon Toast Crunch family size cereal box",
  "Oatly Original oatmilk half gallon",
  "Chobani Flip strawberry cheesecake yogurt cup",
  "RXBar chocolate sea salt protein bar",
  "KIND dark chocolate nuts & sea salt bar",
  "Goldfish cheddar snack crackers carton",
  "Yasso frozen Greek yogurt bars (fudge)",
  "Liquid I.V. hydration multiplier stick packs",
  "Perfect Bar peanut butter refrigerated bar",
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
  labelyBrand: "",
  labelyScore: 0,
  labelyVerdict: "",
  labelyAnalysis: "",
  labelyAnalysisTitle: "Labely's Analysis",
  labelyLegalNote: "No lawsuits found.",
});

/** Reset Labely AI fields when this slot's photo no longer matches cached analysis (shuffle/reorder/new batch row). */
function labelySlotAfterImageSwap(prevSlot, imageUrl, slotIndex) {
  return {
    ...prevSlot,
    imageUrl,
    itemName: `Item ${slotIndex + 1}`,
    labelyBrand: "",
    labelyScore: 0,
    labelyVerdict: "",
    labelyAnalysis: "",
    labelyAnalysisTitle: "Labely's Analysis",
    labelyLegalNote: "No lawsuits found.",
  };
}

const waitForPreviewPaint = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** Random hex id for scrambled export names and ZIP entry metadata. */
function randomExportHex(byteLength = 8) {
  const u = new Uint8Array(byteLength);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(u);
  } else {
    for (let i = 0; i < byteLength; i++) u[i] = Math.floor(Math.random() * 256);
  }
  return [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 1-based order prefix + long random hex tail (sortable, tail looks unstructured). */
function sanitizeFileToken(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function sequentialRandomMp4Name(orderIndexZeroBased, show = null) {
  const batch = Number(show?.batchNumber);
  const inBatch = Number(show?.batchSlideshowIndex);
  const foodToken = sanitizeFileToken(show?.batchFoodName) || "food";
  const rand = randomExportHex(6);
  if (Number.isFinite(batch) && batch > 0) {
    if (Number.isFinite(inBatch) && inBatch > 1) return `${batch}-${inBatch}-${foodToken}-${rand}.mp4`;
    return `${batch}-${foodToken}-${rand}.mp4`;
  }
  return `${orderIndexZeroBased + 1}${randomExportHex(14)}.mp4`;
}

function triggerMp4Download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function triggerZipDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rows for food DB search dropdowns — label text + optional Open Food Facts front photo. */
function foodDbDropdownRowsFromSuggestionRow(row) {
  if (!row) return [];
  const labels = [
    ...new Set(
      [
        ...(Array.isArray(row.candidates) ? row.candidates : []),
        row.match,
        row.suggestion,
      ].filter(Boolean),
    ),
  ];
  const detailMap = new Map(
    (Array.isArray(row.candidateDetails) ? row.candidateDetails : []).map((d) => [
      d.label,
      String(d.imageUrl || "").trim(),
    ]),
  );
  return labels.map((label) => ({ label, imageUrl: detailMap.get(label) || "" }));
}

function persistedFoodDbRowForSelection(label, option = null, sourceRow = null) {
  const name = String(label || "").trim();
  if (!name) return null;
  const imageUrl = String(option?.imageUrl || "").trim();
  const candidates = [
    name,
    ...(Array.isArray(sourceRow?.candidates) ? sourceRow.candidates : []),
  ].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)].slice(0, 12);
  const existingDetails = Array.isArray(sourceRow?.candidateDetails) ? sourceRow.candidateDetails : [];
  const detailsByLabel = new Map(
    existingDetails
      .map((d) => [String(d?.label || "").trim(), String(d?.imageUrl || "").trim()])
      .filter(([k]) => k),
  );
  if (imageUrl) detailsByLabel.set(name, imageUrl);
  return {
    query: name,
    status: "found",
    match: name,
    candidates: uniqueCandidates,
    candidateDetails: uniqueCandidates.map((candidate) => ({
      label: candidate,
      imageUrl: detailsByLabel.get(candidate) || "",
    })),
  };
}

/** @param {{ label: string, imageUrl?: string }} row */
function FoodDbDropdownRowThumb({ row }) {
  const url = String(row.imageUrl || "").trim();
  return url ? (
    <img
      src={url}
      alt=""
      className="h-11 w-11 shrink-0 rounded-md border border-white/10 bg-white object-contain"
      loading="lazy"
    />
  ) : (
    <div
      className="h-11 w-11 shrink-0 rounded-md border border-dashed border-white/15 bg-white/5"
      aria-hidden
    />
  );
}

/** Merge a saved gallery show into the workspace snapshot for export (keeps duration, transitions, audio). */
function galleryShowToExportConfig(workspace, show) {
  const appId = show.appId != null ? show.appId : workspace.appId;
  const isLabely = appId === "labely";
  const outputFormat =
    show.outputFormat != null
      ? show.outputFormat
      : isLabely
        ? "labelyScan"
        : workspace.outputFormat;
  const rawSlots =
    Array.isArray(show.slots) && show.slots.length > 0 ? show.slots : workspace.slots;
  return {
    ...workspace,
    slots: rawSlots.map((s) => ({ ...s })),
    appId,
    outputFormat,
    captionText: isLabely ? "" : (show.captionText ?? workspace.captionText),
    jitterSeed: show.jitterSeed ?? workspace.jitterSeed,
    labelyOutroText: show.labelyOutroText ?? workspace.labelyOutroText,
  };
}

function badLabelyPatch(score) {
  return { labelyScore: normalizeBadLabelyScore(score), labelyVerdict: BAD_LABELY_VERDICT };
}

function labelyShelfScenePrompt(itemName, brandName = "") {
  const item = [brandName, itemName].filter(Boolean).join(" ").trim() || "packaged grocery product";
  const t = item.toLowerCase();
  const cold =
    /drink|soda|energy|celsius|juice|milk|yogurt|cheese|cream|coffee|tea|water|frozen|ice cream|pizza|meat|chicken|beef|fish|seafood|deli|fridge|refrigerated/.test(t);
  const store = Math.random() < 0.5 ? "Walmart" : "Aldi";
  const placement = cold
    ? `inside a real ${store} grocery refrigerator or freezer aisle with glass doors, cold LED lighting, condensation on the door edges, and rows of nearby products`
    : `on a real ${store} grocery store shelf in the correct aisle for this product, with shelf rails, price tags, fluorescent retail lighting, and nearby competing products`;
  return `
${iphoneRetailPhotoImperfectionPrompt()}

No text overlays, no captions, no watermarks.

Create a realistic iPhone photo of ${placement}.

Hero product/aisle subject: ${item}.

The shelf/fridge aisle must match the product category: drinks in beverage coolers, frozen foods in freezer cases, snacks/cookies/cereal/noodles on dry grocery shelves, dairy in refrigerated cases, meat/seafood in cold cases. Make it look like a real casual shopper photo, not a clean ad. Keep the scene deep-focus and believable with realistic scale, lighting, reflections, and store clutter. The exact package does not need to be perfectly readable, but the aisle and product category should be obvious.
`.trim();
}

const LABELY_DB_BATCH_COUNT = 6;
const DEFAULT_LABELY_DB_BATCHES = Array.from({ length: LABELY_DB_BATCH_COUNT }, (_, i) => ({
  id: `batch-${i + 1}`,
  name: `Food database batch ${i + 1}`,
  itemsRaw: "",
  slideshowCount: 1,
}));

/** One folder per physical phone; each folder gets one unique video per food DB batch (clips not reused across folders). */
const GALLERY_IPHONE_DEVICE_COUNT = 20;

/**
 * Batch-gallery export: one ZIP per `iPhone 1` … `iPhone 20`, each holding six videos (batches 1–6).
 * @returns {null | { error: string } | { zipPlans: { iphoneNumber: number, jobs: { zipRelPath: string, show: object }[] }[] }}
 */
function tryBuildIphoneBatchZipPlan(savedSlideshows) {
  if (!Array.isArray(savedSlideshows) || savedSlideshows.length === 0) return null;

  const batchMetaOk = (bn) =>
    Number.isFinite(bn) && bn >= 1 && bn <= LABELY_DB_BATCH_COUNT;

  const rows = savedSlideshows.map((show, origIdx) => ({
    show,
    batchNumber: Number(show?.batchNumber),
    batchSlideshowIndex: Number(show?.batchSlideshowIndex),
    origIdx,
  }));

  const hasBatchMeta = (r) => batchMetaOk(r.batchNumber);
  const anyBatch = rows.some(hasBatchMeta);
  const allBatch = rows.every(hasBatchMeta);

  if (anyBatch && !allBatch) {
    return {
      error:
        "This gallery mixes batch-generated slideshows with others. Remove non-batch items or regenerate so every thumbnail uses batch export metadata.",
    };
  }
  if (!allBatch) return null;

  /** @type {Map<number, typeof rows>} */
  const groups = new Map();
  for (let b = 1; b <= LABELY_DB_BATCH_COUNT; b++) groups.set(b, []);
  for (const row of rows) {
    groups.get(row.batchNumber).push(row);
  }

  for (let b = 1; b <= LABELY_DB_BATCH_COUNT; b++) {
    groups.get(b).sort((a, c) => {
      const ai = Number.isFinite(a.batchSlideshowIndex) ? a.batchSlideshowIndex : 0;
      const ci = Number.isFinite(c.batchSlideshowIndex) ? c.batchSlideshowIndex : 0;
      if (ai !== ci) return ai - ci;
      return a.origIdx - c.origIdx;
    });
  }

  const need = GALLERY_IPHONE_DEVICE_COUNT;
  for (let b = 1; b <= LABELY_DB_BATCH_COUNT; b++) {
    const n = groups.get(b).length;
    if (n < need) {
      return {
        error: `Batch ${b} has ${n} video(s); need at least ${need} unique videos per batch for iPhone pack export (${need} phones × ${LABELY_DB_BATCH_COUNT} batches). Increase slideshow count for that batch and regenerate.`,
      };
    }
  }

  const zipPlans = [];
  let encodeOrdinal = 0;
  for (let phone = 0; phone < need; phone++) {
    const jobs = [];
    for (let b = 1; b <= LABELY_DB_BATCH_COUNT; b++) {
      const row = groups.get(b)[phone];
      const filename = sequentialRandomMp4Name(encodeOrdinal++, row.show);
      jobs.push({ zipRelPath: filename, show: row.show });
    }
    zipPlans.push({ iphoneNumber: phone + 1, jobs });
  }

  return { zipPlans };
}

/** Unique `.png` basename for ZIP (order inside archive = capture order). */
function uniqueRandomZipPngName(usedNames) {
  let name;
  do {
    name = `${randomExportHex(10)}.png`;
  } while (usedNames.has(name));
  usedNames.add(name);
  return name;
}

/** Per-file ZIP metadata (fflate): variable mod time + short internal comment. */
function randomZipEntryOptions() {
  const skewMs = Math.floor(Math.random() * (4 * 365.25 * 24 * 3600 * 1000));
  return {
    level: 1,
    mtime: Date.now() - skewMs,
    comment: randomExportHex(6),
  };
}

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
  config, setConfig, updateConfig, updateSlot, updateMatchItem,
  currentSlide, setCurrentSlide, totalSlides,
  isExporting, setIsExporting, exportProgress, setExportProgress,
  exportStatus, setExportStatus,
  onBusyChange, registerRefreshSlide, onSlideshowSaved, onSavedSlideshowsChange,
  activeShowIdx = null,
  savedSlideshows = [],
}) {
  const brand = getBrand(config);
  const isValcoin = brand.appId === "valcoin";
  const isLabely = brand.appId === "labely";
  const isLabelyFoodDbBatchMode = isLabely && !!config.labelyAiProducts && !!config.labelyUseFoodDatabasePhotos;
  const hasSavedLabelySlideshows = savedSlideshows.some((show) => show?.appId === "labely");
  const labelyUploadsLocked = isLabely && !!config.labelyAiProducts;
  const labelyFoodDbBatches = useMemo(() => {
    const raw = Array.isArray(config.labelyFoodDbBatches) ? config.labelyFoodDbBatches : [];
    return DEFAULT_LABELY_DB_BATCHES.map((base, i) => {
      const row = raw[i] || {};
      return {
        ...base,
        ...(typeof row.name === "string" ? { name: row.name } : {}),
        ...(typeof row.itemsRaw === "string" ? { itemsRaw: row.itemsRaw } : {}),
        slideshowCount: Math.max(0, Math.min(200, Number(row.slideshowCount) || 0)),
        foodDbMatches: row.foodDbMatches && typeof row.foodDbMatches === "object" ? row.foodDbMatches : {},
      };
    });
  }, [config.labelyFoodDbBatches]);
  const totalBatchSlideshows = useMemo(
    () => labelyFoodDbBatches.reduce((sum, b) => sum + (Number(b.slideshowCount) || 0), 0),
    [labelyFoodDbBatches]
  );
  const updateLabelyFoodDbBatch = (batchIndex, patch) => {
    setConfig((prev) => {
      const current = Array.isArray(prev.labelyFoodDbBatches)
        ? prev.labelyFoodDbBatches
        : DEFAULT_LABELY_DB_BATCHES;
      const next = DEFAULT_LABELY_DB_BATCHES.map((base, i) => ({ ...base, ...(current[i] || {}) }));
      next[batchIndex] = { ...next[batchIndex], ...patch };
      return { ...prev, labelyFoodDbBatches: next };
    });
  };
  const referencesDirLabel =
    brand.appId === "valcoin"
      ? "public/valcoin/references/"
      : brand.appId === "labely"
        ? "public/labely/references/"
        : "public/references/";

  const VALUABLE_US_COINS = [
    // Key-date / classic
    "1909-S VDB Lincoln cent",
    "1916-D Mercury dime",
    "1877 Indian Head cent",
    "1901-S Barber quarter",
    "1894-S Barber dime",
    "1913 Liberty Head nickel",
    "1932-D Washington quarter",
    "1932-S Washington quarter",
    "1893-S Morgan silver dollar",
    "1921 Peace dollar",
    "1937-D 3-legged Buffalo nickel",
    "1922 no D Lincoln cent",
    "1914-D Lincoln cent",
    "1926-S Buffalo nickel",
    "1908-S Indian Head cent",
    "1873-CC Seated Liberty dollar",
    "1907 High Relief Saint-Gaudens double eagle",
    "1885 Liberty Head nickel",
    // Modern / popular errors & varieties
    "2004-D Wisconsin quarter (extra leaf error)",
    "1955 Lincoln cent (doubled die obverse)",
    "1972 Lincoln cent (doubled die obverse)",
    "1943 copper Lincoln cent",
    "1969-S Lincoln cent (doubled die obverse)",
    "1982 no-mint-mark Roosevelt dime (error variety)",
    "2000-P Sacagawea dollar (Cheerios variety)",
    "2007 Presidential dollar (missing edge lettering error)",
    "1995 doubled die Lincoln cent",
    // Proof / silver issues people recognize
    "1976-S silver Washington quarter (proof)",
    "1964 Washington quarter (proof)",
    "1892 Columbus commemorative half dollar",
    "1986 American Silver Eagle (bullion)",
    "1995-W American Silver Eagle (proof)",
    "1933 Saint-Gaudens double eagle",
  ];

  const DEFAULT_PROMPT = isValcoin
    ? "A single valuable US quarter coin on a wooden table, photographed like a real iPhone photo shot on 0.5× (ultra-wide). The coin should be a real existing valuable variety (random pick), natural room lighting, no hands, no text overlays, no other coins, no props. Composition: the coin should appear smaller in the frame (not filling the shot) with lots of surrounding table visible. Lens/look: subtle ultra-wide edge stretch and mild barrel distortion like iPhone 0.5×. Quality: intentionally a bit worse/rough — slightly blurry/soft focus like a quick snap, less sharp, mild motion blur or missed focus is okay. Color: iPhone-like but a bit bland/flat (slightly desaturated, lower contrast), not cinematic. Texture: visible sensor grain and minor compression artifacts. Include realistic imperfections: light dust, tiny lint specks, faint fingerprints/smudges, small nicks, micro-scratches, slight wear/toning, and minor surface blemishes."
    : isLabely
    ? "Labely uses your uploaded photos only — this prompt is not used to generate images. You can leave it or add notes for yourself."
    : "POV into a blue thrift shopping cart (buggy) full of tossed secondhand clothes — garments may lie upside-down or sideways; bottom hems/waistbands should look softly folded or cuffed (no people, no hands). XXL hero piece: faded washed-out colors only, cotton lint balls, stray dog hair, slight print/color imperfections. Concrete floor and aisles behind, fluorescent light, shallow DOF, no overlays.";

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
  const storeKey = (base) => `${base}_${brand.appId}`;
  const DEFAULT_HOOKS_THRIFTY = [
    "found at goodwill 👀",
    "thrift finds that paid off 💰",
    "you won't believe what i found",
    "goodwill haul → resell profit 🤑",
    "thrift flips this week 🔥",
    "pov: you know how to thrift",
    "these finds = bag secured 💸",
  ].join("\n");
  const DEFAULT_HOOKS_VALCOIN = [
    "coin check before i list it 🪙",
    "this coin might be a key date…",
    "found in a jar and had to scan it",
    "is this a real error coin?",
    "grading candidate or nah?",
    "silver? proof? let’s check 👀",
    "coin collectors will understand this",
  ].join("\n");

  // Always start with consistent defaults for SSR; sync all persisted values from localStorage after mount
  const [brandItemsRaw, setBrandItemsRaw] = useState(DEFAULT_BRAND_LIST);
  const [hooksRaw, setHooksRaw] = useState(DEFAULT_HOOKS_THRIFTY);
  useEffect(() => {
    const savedModel = localStorage.getItem("ts_image_model");
    if (savedModel) setImageModelRaw(savedModel);
    const savedPrompt = localStorage.getItem(storeKey("ts_global_prompt"));
    if (savedPrompt != null) setGlobalPrompt(savedPrompt);
    else setGlobalPrompt(DEFAULT_PROMPT);
    const savedBrands = localStorage.getItem(storeKey("ts_brand_items"));
    if (savedBrands?.trim()) setBrandItemsRaw(savedBrands);
    else setBrandItemsRaw(isValcoin ? VALUABLE_US_COINS.join("\n") : isLabely ? DEFAULT_LABELY_ITEMS : DEFAULT_BRAND_LIST);
    const savedHooks = localStorage.getItem(storeKey("ts_hooks"));
    if (savedHooks) setHooksRaw(savedHooks);
    else setHooksRaw(isValcoin ? DEFAULT_HOOKS_VALCOIN : DEFAULT_HOOKS_THRIFTY);
  }, [brand.appId]); // reload per-brand persisted values

  // Valcoin: coin-centric default hook captions (only if user hasn't customized).
  useEffect(() => {
    if (!mounted) return;
    if (!isValcoin) return;
    const savedHooks = localStorage.getItem(storeKey("ts_hooks"));
    if (!savedHooks || savedHooks.trim() === DEFAULT_HOOKS_THRIFTY.trim()) {
      setHooksRaw(DEFAULT_HOOKS_VALCOIN);
      localStorage.setItem(storeKey("ts_hooks"), DEFAULT_HOOKS_VALCOIN);
    }
  }, [mounted, isValcoin, brand.appId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickValuableUSCoin = () => {
    const idx = Math.floor(Math.random() * VALUABLE_US_COINS.length);
    return VALUABLE_US_COINS[idx];
  };

  // When switching to Valcoin, make the default prompt/list coin-appropriate
  // (only if the user hasn't already customized them in localStorage).
  useEffect(() => {
    if (!mounted) return;
    if (!isValcoin) return;
    const savedPrompt = localStorage.getItem(storeKey("ts_global_prompt"));
    const savedBrands = localStorage.getItem(storeKey("ts_brand_items"));
    if (!savedPrompt) {
      setGlobalPrompt(DEFAULT_PROMPT);
      localStorage.setItem(storeKey("ts_global_prompt"), DEFAULT_PROMPT);
    }
    if (!savedBrands) {
      const list = VALUABLE_US_COINS.join("\n");
      setBrandItemsRaw(list);
      localStorage.setItem(storeKey("ts_brand_items"), list);
    }
  }, [mounted, isValcoin, brand.appId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parsed brand items (non-empty lines) — fall back to defaults when empty
  const brandItems = (() => {
    const parsed = brandItemsRaw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (parsed.length > 0) return parsed;
    if (isLabely && config.labelyAiProducts && config.labelyUseFoodDatabasePhotos) return [];
    if (isLabely && config.labelyAiProducts) {
      return DEFAULT_LABELY_ITEMS.split("\n").map((l) => l.trim()).filter(Boolean);
    }
    if (isLabely) return [];
    return DEFAULT_BRAND_LIST.split("\n").map((l) => l.trim()).filter(Boolean);
  })();
  const [foodDbSuggestions, setFoodDbSuggestions] = useState([]);
  const [foodDbSuggestionStatus, setFoodDbSuggestionStatus] = useState("idle");
  const [foodDbSearch, setFoodDbSearch] = useState("");
  const [foodDbSearchStatus, setFoodDbSearchStatus] = useState("idle");
  const [foodDbSearchOptions, setFoodDbSearchOptions] = useState([]);
  const [batchFoodDbSearch, setBatchFoodDbSearch] = useState({});
  const [batchFoodDbSearchStatus, setBatchFoodDbSearchStatus] = useState({});
  const [batchFoodDbSearchOptions, setBatchFoodDbSearchOptions] = useState({});
  const foodDbSuggestionCacheRef = useRef(new Map());
  const foodDbKeyFor = (value) => String(value || "").trim().toLowerCase();
  const foodDbSuggestionKey = useMemo(() => (
    isLabely && config.labelyAiProducts && config.labelyUseFoodDatabasePhotos
      ? brandItems.slice(0, 20).join("\n")
      : ""
  ), [isLabely, config.labelyAiProducts, config.labelyUseFoodDatabasePhotos, brandItemsRaw]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!foodDbSuggestionKey) {
      setFoodDbSuggestions([]);
      setFoodDbSuggestionStatus("idle");
      return;
    }
    let cancelled = false;
    const requestedItems = foodDbSuggestionKey.split("\n").filter(Boolean);
    const missingItems = requestedItems.filter((item) => !foodDbSuggestionCacheRef.current.has(foodDbKeyFor(item)));
    const cachedRows = requestedItems
      .map((item) => foodDbSuggestionCacheRef.current.get(foodDbKeyFor(item)))
      .filter(Boolean);
    setFoodDbSuggestions(cachedRows);
    if (missingItems.length === 0) {
      setFoodDbSuggestionStatus("done");
      return;
    }
    setFoodDbSuggestionStatus("loading");
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/labely-food-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: missingItems }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const incoming = Array.isArray(body.results) ? body.results : [];
        for (const row of incoming) {
          if (row?.query) foodDbSuggestionCacheRef.current.set(foodDbKeyFor(row.query), row);
        }
        const requested = new Set(requestedItems);
        setFoodDbSuggestions((prev) => {
          const prevByQuery = new Map(prev.map((row) => [row.query, row]));
          for (const row of incoming) {
            const old = prevByQuery.get(row.query);
            const keepOld =
              old &&
              ["found", "recommend"].includes(old.status) &&
              ["missing", "error"].includes(row.status);
            prevByQuery.set(row.query, keepOld ? old : row);
          }
          return [...prevByQuery.values()].filter((row) => requested.has(row.query));
        });
        setFoodDbSuggestionStatus(res.ok ? "done" : "error");
      } catch {
        if (!cancelled) {
          setFoodDbSuggestionStatus("error");
        }
      }
    }, 550);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [foodDbSuggestionKey]);

  const replaceFoodListItem = (from, to) => {
    const lines = brandItemsRaw.trim()
      ? brandItemsRaw.split("\n")
      : brandItems;
    const next = lines
      .map((line) => (line.trim() === from ? to : line))
      .join("\n");
    setBrandItemsRaw(next);
    localStorage.setItem(storeKey("ts_brand_items"), next);
    const cached = foodDbSuggestionCacheRef.current.get(foodDbKeyFor(from));
    if (cached) {
      foodDbSuggestionCacheRef.current.set(foodDbKeyFor(to), { ...cached, query: to });
    }
  };
  const addFoodListItem = (item) => {
    const nextItem = String(item || "").trim();
    if (!nextItem) return;
    const current = brandItemsRaw.trim()
      ? brandItemsRaw.split("\n").map((line) => line.trim()).filter(Boolean)
      : [];
    if (!current.some((line) => line.toLowerCase() === nextItem.toLowerCase())) {
      const next = [...current, nextItem].join("\n");
      setBrandItemsRaw(next);
      localStorage.setItem(storeKey("ts_brand_items"), next);
    }
    setFoodDbSearch("");
    setFoodDbSearchOptions([]);
    setFoodDbSearchStatus("idle");
  };
  const removeFoodListItem = (item) => {
    const next = brandItems
      .filter((line) => line !== item)
      .join("\n");
    setBrandItemsRaw(next);
    localStorage.setItem(storeKey("ts_brand_items"), next);
  };
  const runFoodDbSearch = async () => {
    const q = foodDbSearch.trim();
    if (!isLabely || !config.labelyAiProducts || !config.labelyUseFoodDatabasePhotos || q.length < 2) {
      setFoodDbSearchOptions([]);
      setFoodDbSearchStatus("idle");
      return;
    }
    setFoodDbSearchStatus("loading");
    setFoodDbSearchOptions([]);
    try {
      const res = await fetch("/api/labely-food-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [q] }),
      });
      const body = await res.json().catch(() => ({}));
      const row = Array.isArray(body.results) ? body.results[0] : null;
      if (row?.query) foodDbSuggestionCacheRef.current.set(foodDbKeyFor(row.query), row);
      setFoodDbSearchOptions(foodDbDropdownRowsFromSuggestionRow(row));
      setFoodDbSearchStatus(res.ok ? "done" : "error");
    } catch {
      setFoodDbSearchOptions([]);
      setFoodDbSearchStatus("error");
    }
  };
  const addBatchFoodListItem = (batchIndex, item, option = null) => {
    const nextItem = String(item || "").trim();
    if (!nextItem) return;
    const batch = labelyFoodDbBatches[batchIndex] || {};
    const current = String(labelyFoodDbBatches[batchIndex]?.itemsRaw || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const existingMatches = batch.foodDbMatches && typeof batch.foodDbMatches === "object" ? batch.foodDbMatches : {};
    const persistedRow = persistedFoodDbRowForSelection(nextItem, option);
    const patch = {};
    if (!current.some((line) => line.toLowerCase() === nextItem.toLowerCase())) {
      patch.itemsRaw = [...current, nextItem].join("\n");
    }
    if (persistedRow) {
      patch.foodDbMatches = { ...existingMatches, [nextItem]: persistedRow };
      foodDbSuggestionCacheRef.current.set(foodDbKeyFor(nextItem), persistedRow);
    }
    if (Object.keys(patch).length > 0) {
      updateLabelyFoodDbBatch(batchIndex, patch);
    }
    const batchId = batch.id;
    if (batchId) {
      setBatchFoodDbSearch((prev) => ({ ...prev, [batchId]: "" }));
      setBatchFoodDbSearchOptions((prev) => ({ ...prev, [batchId]: [] }));
      setBatchFoodDbSearchStatus((prev) => ({ ...prev, [batchId]: "idle" }));
    }
  };
  const removeBatchFoodListItem = (batchIndex, item) => {
    const current = String(labelyFoodDbBatches[batchIndex]?.itemsRaw || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const batch = labelyFoodDbBatches[batchIndex] || {};
    const existingMatches = batch.foodDbMatches && typeof batch.foodDbMatches === "object" ? batch.foodDbMatches : {};
    const nextMatches = { ...existingMatches };
    delete nextMatches[item];
    updateLabelyFoodDbBatch(batchIndex, { itemsRaw: current.filter((line) => line !== item).join("\n"), foodDbMatches: nextMatches });
  };
  const handleBatchFoodDbSearchChange = (batchIndex, value) => {
    const batchId = labelyFoodDbBatches[batchIndex]?.id;
    if (!batchId) return;
    setBatchFoodDbSearch((prev) => ({ ...prev, [batchId]: value }));
    if (String(value || "").trim().length < 2) {
      setBatchFoodDbSearchOptions((prev) => ({ ...prev, [batchId]: [] }));
      setBatchFoodDbSearchStatus((prev) => ({ ...prev, [batchId]: "idle" }));
    }
  };
  const runBatchFoodDbSearch = async (batchIndex) => {
    const batchId = labelyFoodDbBatches[batchIndex]?.id;
    if (!batchId) return;
    const q = String(batchFoodDbSearch[batchId] || "").trim();
    if (q.length < 2) {
      setBatchFoodDbSearchOptions((prev) => ({ ...prev, [batchId]: [] }));
      setBatchFoodDbSearchStatus((prev) => ({ ...prev, [batchId]: "idle" }));
      return;
    }
    setBatchFoodDbSearchStatus((prev) => ({ ...prev, [batchId]: "loading" }));
    setBatchFoodDbSearchOptions((prev) => ({ ...prev, [batchId]: [] }));
    try {
      const res = await fetch("/api/labely-food-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [q] }),
      });
      const body = await res.json().catch(() => ({}));
      const row = Array.isArray(body.results) ? body.results[0] : null;
      if (row?.query) foodDbSuggestionCacheRef.current.set(foodDbKeyFor(row.query), row);
      setBatchFoodDbSearchOptions((prev) => ({ ...prev, [batchId]: foodDbDropdownRowsFromSuggestionRow(row) }));
      setBatchFoodDbSearchStatus((prev) => ({ ...prev, [batchId]: res.ok ? "done" : "error" }));
    } catch {
      setBatchFoodDbSearchOptions((prev) => ({ ...prev, [batchId]: [] }));
      setBatchFoodDbSearchStatus((prev) => ({ ...prev, [batchId]: "error" }));
    }
  };
  const foodDbSuggestionsByQuery = useMemo(() => {
    const m = new Map();
    for (const row of foodDbSuggestions) {
      if (row?.query) m.set(row.query, row);
    }
    return m;
  }, [foodDbSuggestions]);
  const applyFoodDbCandidate = (item, value) => {
    if (!value || value === item) return;
    replaceFoodListItem(item, value);
  };

  const foodDbImageUrlFromRow = (row, item = "") => {
    if (!row) return "";
    const preferred = [
      item,
      row.match,
      row.suggestion,
      ...(Array.isArray(row.candidates) ? row.candidates : []),
    ].map((x) => String(x || "").trim()).filter(Boolean);
    const details = Array.isArray(row.candidateDetails) ? row.candidateDetails : [];
    for (const label of preferred) {
      const found = details.find((d) => String(d?.label || "").trim() === label);
      const url = String(found?.imageUrl || "").trim();
      if (url) return url;
    }
    for (const d of details) {
      const url = String(d?.imageUrl || "").trim();
      if (url) return url;
    }
    return "";
  };

  const foodDbImageUrlForItem = (item, matches = {}) => {
    const key = String(item || "").trim();
    if (!key) return "";
    return foodDbImageUrlFromRow(matches[key], key)
      || foodDbImageUrlFromRow(foodDbSuggestionCacheRef.current.get(foodDbKeyFor(key)), key);
  };

  const foodDbImageUrlForSlot = (slot, matches = {}) => {
    const candidates = [
      slot?.labelyDbSeedHint,
      [slot?.labelyBrand, slot?.itemName].filter(Boolean).join(" "),
      slot?.itemName,
    ].map((x) => String(x || "").trim()).filter(Boolean);
    for (const candidate of candidates) {
      const url = foodDbImageUrlForItem(candidate, matches);
      if (url) return url;
    }
    return "";
  };

  const fetchLabelyDatabaseImage = async ({ slot, exactImageUrl = "" }) => {
    const res = await fetch("/api/labely", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortRef.current?.signal,
      body: JSON.stringify({
        imageOnly: true,
        useFoodDatabasePhoto: true,
        name: slot?.itemName || "",
        brand: slot?.labelyBrand || "",
        seedHint: slot?.labelyDbSeedHint || slot?.itemName || "",
        ...(exactImageUrl ? { foodDatabaseImageUrl: exactImageUrl } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok && typeof body.imageDataUrl === "string" && body.imageDataUrl ? body.imageDataUrl : "";
  };

  useEffect(() => {
    if (!isLabelyFoodDbBatchMode) return;
    for (const batch of labelyFoodDbBatches) {
      const matches = batch.foodDbMatches && typeof batch.foodDbMatches === "object" ? batch.foodDbMatches : {};
      for (const [item, row] of Object.entries(matches)) {
        if (item && row?.query) {
          foodDbSuggestionCacheRef.current.set(foodDbKeyFor(item), row);
        }
      }
    }
  }, [isLabelyFoodDbBatchMode, labelyFoodDbBatches]);

  // Parsed hook captions (non-empty lines). Labely never uses collage hooks.
  const hookItems = isLabely
    ? []
    : hooksRaw
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
        : info.type === "fullBleed" || info.type === "imessage" || info.type === "starterPack" || info.type === "labelyShelfIntro"
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

  // Load reference images (brand-specific) on mount (client only)
  useEffect(() => {
    setMounted(true);
    fetch(`/api/references?appId=${encodeURIComponent(brand.appId)}`)
      .then((r) => r.json())
      .then((d) => setReferenceImages(d.images || []))
      .catch(() => setReferenceImages([]));
  }, [brand.appId]);
  const cancelGenRef = useRef(false);
  const batchCaptionsRef = useRef([]);
  const apiKeyWarnedRef = useRef(false);
  const abortRef = useRef(null); // AbortController for force-stopping in-flight requests

  const hardStop = () => {
    cancelGenRef.current = true;
    try { abortRef.current?.abort("stopped"); } catch {}
    abortRef.current = null;
    setGeneratingSlot(null);
    setGenAllProgress((p) => p ? { ...p, phase: "Stopped." } : null);
    setTimeout(() => setGenAllProgress(null), 2000);
  };

  const rewordCaptionApi = async (text) => {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortRef.current?.signal,
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

      const isNonApparelScene = outFmt === "starterPack" || isValcoin;

      const brandName = brandItem || prompt?.trim() || "a clothing brand";

      // Reference photos (Thrifty: cart look; Valcoin: coin/table look)
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
${iphoneRetailPhotoImperfectionPrompt()}

No text overlays, no captions, no watermarks.

${isValcoin
  ? `Reference-image rule (CRITICAL): Make the photo EXACT 1:1 as the reference image, just swap out the coin with the chosen coin.`
  : ""
}

Subject: ${scenePrompt}

If the subject is an object (like germ-x, a mask, receipt piles, shipping labels), center it and make it visually obvious what it is. If it is a scene (like goodwill bins line, people lining up), make it documentary-style and realistic.
`.trim();

        const refFile = referenceInline
          ? null
          : (matchingRefs.length > 0
            ? matchingRefs[Math.floor(Math.random() * matchingRefs.length)]
            : null);

        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: fullPrompt,
            referenceFile: refFile || null,
            referenceInline: undefined,
            referenceRoot:
              brand.appId === "valcoin"
                ? "valcoin/references"
                : brand.appId === "labely"
                  ? "labely/references"
                  : "references",
            model: imageModel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Image generation failed");
        b64 = data.b64 ?? null;
        if (b64) return `data:image/png;base64,${b64}`;
        throw new Error("No image returned");
      }

      const SHARED_RULES_INTRO = iphoneRetailPhotoImperfectionPrompt("thrift");

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
        signal: abortRef.current?.signal,
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
      const msg = err?.message || String(err);
      if (!apiKeyWarnedRef.current && /api key required|api key not set|OPENAI_API_KEY|GEMINI_API_KEY/i.test(msg)) {
        apiKeyWarnedRef.current = true;
        alert("AI generation needs an API key. Add OPENAI_API_KEY (or GEMINI_API_KEY) to a .env.local file, restart `npm run dev`, then try again.");
      }
      setAiErrors((p) => ({ ...p, [index]: err.message }));
      return null;
    }
  };

  const generateLabelyShelfIntroImage = async (itemName, brandName = "") => {
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current?.signal,
        body: JSON.stringify({
          prompt: labelyShelfScenePrompt(itemName, brandName),
          model: imageModel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Shelf intro image generation failed");
      return data?.b64 ? `data:image/png;base64,${data.b64}` : null;
    } catch (err) {
      if (err?.name === "AbortError") return null;
      console.error("Labely shelf intro generation failed", err);
      return null;
    }
  };

  const fillLabelyFromImage = async (imageDataUrl, opts = {}) => {
    const uploadHint =
      typeof opts.uploadHint === "string" && opts.uploadHint.trim()
        ? opts.uploadHint.trim().slice(0, 160)
        : "";
    try {
      const res = await fetch("/api/labely", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current?.signal,
        body: JSON.stringify({
          imageDataUrl,
          ...(uploadHint ? { uploadHint } : {}),
          ...(opts.includeShelfIntro ? { includeShelfIntro: true } : {}),
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  /** Re-run vision on preview slots 0–5 so Labely copy matches batch photos after shuffle/reorder. */
  const runLabelyVisionForPreviewSlots = async (batchUrls) => {
    if (!isLabely || config.labelyAiProducts) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      for (let i = 0; i < Math.min(6, batchUrls.length); i++) {
        const url = batchUrls[i];
        if (!url) continue;
        setGeneratingSlot(i);
        setAiErrors((p) => ({ ...p, [i]: null }));
        const ly = await fillLabelyFromImage(url, { includeShelfIntro: i === 0 && isLabelyScanTourFormat(config) });
        if (ly?.name) {
          updateSlot(i, {
            itemName: ly.name,
            labelyBrand: ly.brand ?? "",
            ...badLabelyPatch(ly.score),
            labelyAnalysis: ly.analysis ?? "",
            labelyAnalysisTitle: ly.analysisTitle ?? "Labely's Analysis",
            labelyLegalNote: ly.labelyLegalNote?.trim() || "No lawsuits found.",
            ...(ly.shelfIntroDataUrl ? { labelyShelfImageUrl: ly.shelfIntroDataUrl } : {}),
          });
        } else {
          setAiErrors((p) => ({ ...p, [i]: "Could not analyze this photo." }));
        }
      }
    } finally {
      setGeneratingSlot(null);
      abortRef.current = null;
    }
  };

  /** No photo — GPT picks a real retail SKU + score + analysis (fictional scanner compounds) + optional pack image (same as POST /api/labely with no body image). */
  const fillLabelyFromAi = async (seedHint, errorSlotIdx = null, opts = {}) => {
    const foodDatabaseImageUrl =
      typeof opts.foodDatabaseImageUrl === "string" && opts.foodDatabaseImageUrl.trim()
        ? opts.foodDatabaseImageUrl.trim()
        : "";
    try {
      const res = await fetch("/api/labely", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current?.signal,
        body: JSON.stringify({
          ...(seedHint?.trim() ? { seedHint: seedHint.trim() } : {}),
          useFoodDatabasePhoto: !!config.labelyUseFoodDatabasePhotos,
          ...(foodDatabaseImageUrl ? { foodDatabaseImageUrl } : {}),
          ...(opts.includeShelfIntro ? { includeShelfIntro: true } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof body?.error === "string" ? body.error : `Labely request failed (${res.status})`;
        if (typeof errorSlotIdx === "number") {
          setAiErrors((p) => ({ ...p, [errorSlotIdx]: msg }));
        }
        return null;
      }
      return body;
    } catch (e) {
      if (typeof errorSlotIdx === "number") {
        setAiErrors((p) => ({ ...p, [errorSlotIdx]: e?.message || "Network error" }));
      }
      return null;
    }
  };

  /** Row index across all shows: 0…(qty×slotsPerShow−1). Rows 0–5 mirror live preview slots. */
  const runLabelySlotWithDataUrl = async (globalIdx, dataUrl, labelyHints = {}) => {
    if (config.labelyAiProducts) return;
    if (!dataUrl || typeof dataUrl !== "string") return;
    setAiErrors((p) => ({ ...p, [globalIdx]: null }));
    setGeneratingSlot(globalIdx);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      setBatchImageDataUrls((prev) => {
        const need = Math.max(prev.length, globalIdx + 1);
        const next = Array.from({ length: need }, (_, i) => (i < prev.length ? prev[i] : null));
        next[globalIdx] = dataUrl;
        return next;
      });
      if (globalIdx < 6) {
        updateSlot(globalIdx, { imageUrl: dataUrl });
        const ly = await fillLabelyFromImage(dataUrl, {
          ...labelyHints,
          includeShelfIntro: globalIdx === 0 && isLabelyScanTourFormat(config),
        });
        if (ly?.name) {
          updateSlot(globalIdx, {
            itemName: ly.name,
            labelyBrand: ly.brand ?? "",
            ...badLabelyPatch(ly.score),
            labelyAnalysis: ly.analysis ?? "",
            labelyAnalysisTitle: ly.analysisTitle ?? "Labely's Analysis",
            labelyLegalNote: ly.labelyLegalNote?.trim() || "No lawsuits found.",
            ...(ly.shelfIntroDataUrl ? { labelyShelfImageUrl: ly.shelfIntroDataUrl } : {}),
          });
        } else {
          setAiErrors((p) => ({ ...p, [globalIdx]: "Could not analyze this photo." }));
        }
      }
      setConfig((prev) => ({ ...prev, jitterSeed: (Math.random() * 0xffff) | 0 }));
    } catch (e) {
      setAiErrors((p) => ({ ...p, [globalIdx]: e?.message || "Upload failed" }));
    } finally {
      setGeneratingSlot(null);
      abortRef.current = null;
    }
  };

  const handleLabelySlotUpload = async (globalIdx, file) => {
    if (!isLikelyRasterImageFile(file)) return;
    let dataUrl;
    try {
      dataUrl = await fileToDisplayableDataUrl(file);
    } catch {
      setAiErrors((p) => ({ ...p, [globalIdx]: "Could not read this photo (try JPEG or HEIC)." }));
      return;
    }
    await runLabelySlotWithDataUrl(globalIdx, dataUrl, { uploadHint: file.name });
  };

  /** User-uploaded photo for Thrifty / Valcoin (no AI image gen). globalIdx ≥ 6 = batch-only row. */
  const handleThriftyValcoinSlotFile = async (globalIdx, file) => {
    if (!isLikelyRasterImageFile(file)) return;
    setAiErrors((p) => ({ ...p, [globalIdx]: null }));
    setGeneratingSlot(globalIdx);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const dataUrl = await fileToDisplayableDataUrl(file);
      setBatchImageDataUrls((prev) => {
        const need = Math.max(prev.length, globalIdx + 1);
        const next = Array.from({ length: need }, (_, i) => (i < prev.length ? prev[i] : null));
        next[globalIdx] = dataUrl;
        return next;
      });
      if (globalIdx >= 6) {
        setConfig((prev) => ({ ...prev, jitterSeed: (Math.random() * 0xffff) | 0 }));
        return;
      }
      const slot = config.slots[globalIdx];
      const weightedPool = buildWeightedPool(brandItems);
      const randomBrand = weightedPool.length > 0
        ? weightedPool[Math.floor(Math.random() * weightedPool.length)]
        : null;
      const coinPick = isValcoin ? pickValuableUSCoin() : null;
      const hint = isValcoin ? coinPick : randomBrand;
      const priceUpdates =
        !slot.spentPrice && !slot.soldPrice
          ? (isValcoin && hint ? (await coinPrices(hint)) : null) ?? autoRandomPrices()
          : {};
      const isPlaceholderName = /^item\s+\d+$/i.test((slot.itemName ?? "").trim());
      updateSlot(globalIdx, {
        imageUrl: dataUrl,
        ...priceUpdates,
        ...(isValcoin && hint && (isPlaceholderName || !(slot.itemName ?? "").trim()) ? { itemName: hint } : {}),
      });
      const grail = await autoTitleFromImage(dataUrl);
      let resolvedName = slot.itemName;
      let resolvedPrice = priceUpdates.soldPrice ?? slot.soldPrice;
      if (grail?.title) {
        resolvedName = grail.title;
        resolvedPrice = grail.price ?? resolvedPrice;
        updateSlot(globalIdx, {
          itemName: resolvedName,
          ...(grail.price ? { soldPrice: resolvedPrice } : {}),
          matchItems: autoSoldListings(resolvedName, resolvedPrice),
        });
      }
      if ((config.outputFormat ?? "standard") === "imessageMom") {
        const thread = await generateImessageThread(resolvedName, resolvedPrice);
        if (thread) updateSlot(globalIdx, { imessageThread: thread });
      }
      setConfig((prev) => ({ ...prev, jitterSeed: (Math.random() * 0xffff) | 0 }));
    } catch (e) {
      setAiErrors((p) => ({ ...p, [globalIdx]: e?.message || "Upload failed" }));
    } finally {
      setGeneratingSlot(null);
      abortRef.current = null;
    }
  };

  const handleGenerateOne = async (index) => {
    setAiErrors((p) => ({ ...p, [index]: null }));
    setGeneratingSlot(index);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    if (isLabely) {
      try {
        if (config.labelyAiProducts) {
          const weightedPool = buildWeightedPool(brandItems);
          const hint =
            weightedPool.length > 0
              ? weightedPool[Math.floor(Math.random() * weightedPool.length)]
              : null;
          const includeShelfIntro = index === 0 && isLabelyScanTourFormat(config);
          const foodDatabaseImageUrl = foodDbImageUrlForItem(hint);
          const ly = await fillLabelyFromAi(hint, index, {
            includeShelfIntro,
            foodDatabaseImageUrl,
          });
          if (ly?.name) {
            const shelfIntroUrl = ly.shelfIntroDataUrl || (includeShelfIntro
              ? await generateLabelyShelfIntroImage(ly.name, ly.brand ?? "")
              : null);
            updateSlot(index, {
              itemName: ly.name,
              labelyBrand: ly.brand ?? "",
              ...badLabelyPatch(ly.score),
              labelyAnalysis: ly.analysis ?? "",
              labelyAnalysisTitle: ly.analysisTitle ?? "Labely's Analysis",
              labelyLegalNote: ly.labelyLegalNote?.trim() || "No lawsuits found.",
              ...(hint ? { labelyDbSeedHint: hint } : {}),
              ...(foodDatabaseImageUrl ? { labelyDbImageUrl: foodDatabaseImageUrl } : {}),
              ...(ly.imageDataUrl ? { imageUrl: ly.imageDataUrl } : {}),
              ...(shelfIntroUrl ? { labelyShelfImageUrl: shelfIntroUrl } : {}),
            });
            setConfig((prev) => ({ ...prev, jitterSeed: (Math.random() * 0xffff) | 0 }));
          } else {
            setAiErrors((p) => ({ ...p, [index]: "AI product generation failed." }));
          }
        } else {
          const slot = config.slots[index];
          if (!slot.imageUrl?.trim()) {
            setAiErrors((p) => ({ ...p, [index]: "Upload a photo for this slot first (sidebar)." }));
          } else {
            const includeShelfIntro = index === 0 && isLabelyScanTourFormat(config);
            const ly = await fillLabelyFromImage(slot.imageUrl, { includeShelfIntro });
            if (ly?.name) {
              const shelfIntroUrl = ly.shelfIntroDataUrl || (includeShelfIntro
                ? await generateLabelyShelfIntroImage(ly.name, ly.brand ?? "")
                : null);
              updateSlot(index, {
                itemName: ly.name,
                labelyBrand: ly.brand ?? "",
                ...badLabelyPatch(ly.score),
                labelyAnalysis: ly.analysis ?? "",
                labelyAnalysisTitle: ly.analysisTitle ?? "Labely's Analysis",
                labelyLegalNote: ly.labelyLegalNote?.trim() || "No lawsuits found.",
                ...(shelfIntroUrl ? { labelyShelfImageUrl: shelfIntroUrl } : {}),
              });
              setConfig((prev) => ({ ...prev, jitterSeed: (Math.random() * 0xffff) | 0 }));
            } else {
              setAiErrors((p) => ({ ...p, [index]: "Could not analyze this photo." }));
            }
          }
        }
      } finally {
        setGeneratingSlot(null);
        abortRef.current = null;
      }
      return;
    }
    const weightedPool = buildWeightedPool(brandItems);
    const randomBrand = weightedPool.length > 0
      ? weightedPool[Math.floor(Math.random() * weightedPool.length)]
      : null;
    const coinPick = isValcoin ? pickValuableUSCoin() : null;
    const hint = isValcoin ? coinPick : randomBrand;
    const basePrompt = config.slots[index].prompt || globalPrompt;
    const prompt = hint ? `${basePrompt}\n\nSpecific item to depict: ${hint}.` : basePrompt;
    const url = await generateImage(index, prompt, hint);
    if (url) {
      const slot = config.slots[index];
      const priceUpdates = (!slot.spentPrice && !slot.soldPrice)
        ? (isValcoin && hint ? (await coinPrices(hint)) : null) ?? autoRandomPrices()
        : {};
      const isPlaceholderName = /^item\s+\d+$/i.test((slot.itemName ?? "").trim());
      updateSlot(index, {
        imageUrl: url,
        ...priceUpdates,
        ...(isValcoin && hint && (isPlaceholderName || !(slot.itemName ?? "").trim()) ? { itemName: hint } : {}),
      });
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
    abortRef.current = null;
  };

  // ── AI: generate iMessage thread for imessageMom format ─────────────────────
  const generateImessageThread = async (itemName, soldPrice) => {
    try {
      const res = await fetch("/api/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current?.signal,
        body: JSON.stringify({ type: "imessageThread", itemName, soldPrice, appId: config.appId }),
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
        signal: abortRef.current?.signal,
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
  // Falls back to cfgForSlots.slots (defaults to live config) when prompts are incomplete.
  const ensureStarterPackImages = async (prompts, cfgForSlots = null) => {
    const slotCfg = cfgForSlots ?? config;
    const valcoinSlots = getBrand(slotCfg).appId === "valcoin";
    for (let i = 0; i < 3; i++) {
      const p = (prompts?.[i] ?? "").trim()
        || (slotCfg.slots?.[i]?.prompt ?? "").trim()
        || (slotCfg.slots?.[i]?.itemName ?? "").trim();
      if (!p) continue;
      setExportStatus(`Generating starter pack image ${i + 1}/3…`);
      const hint = valcoinSlots ? pickValuableUSCoin() : null;
      const prompt = hint ? `${p}\n\nSpecific item to depict: ${hint}.` : p;
      const url = await generateImage(i, prompt, hint);
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
        signal: abortRef.current?.signal,
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

  const coinPrices = async (coinName) => {
    const name = String(coinName ?? "").trim();
    if (!name) return null;
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current?.signal,
        body: JSON.stringify({ action: "coinPrices", text: name }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.buy || !data?.sell) return null;
      return { spentPrice: String(data.buy), soldPrice: String(data.sell) };
    } catch {
      return null;
    }
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
    if (isLabely) {
      const ly = await fillLabelyFromImage(slot.imageUrl, { includeShelfIntro: index === 0 && isLabelyScanTourFormat(config) });
      if (ly?.name) {
        updateSlot(index, {
          itemName: ly.name,
          labelyBrand: ly.brand ?? "",
          ...badLabelyPatch(ly.score),
          labelyAnalysis: ly.analysis ?? "",
          labelyAnalysisTitle: ly.analysisTitle ?? "Labely's Analysis",
          labelyLegalNote: ly.labelyLegalNote?.trim() || "No lawsuits found.",
          ...(ly.shelfIntroDataUrl ? { labelyShelfImageUrl: ly.shelfIntroDataUrl } : {}),
        });
      } else {
        setAiErrors((p) => ({ ...p, [`title_${index}`]: "Could not analyze packaging." }));
      }
    } else {
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
    }
    setGeneratingSlot(null);
  };

  const handleGenerateAll = async () => {
    const generationJitterSeed = (Math.random() * 0xffff) | 0;
    setGeneratingSlot("all");
    setAiErrors({});
    batchCaptionsRef.current = [];
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      setConfig((prev) => ({ ...prev, jitterSeed: generationJitterSeed }));
      // Auto-pick a random hook caption for the collage slide
      if (hookItems.length > 0) {
        let pick = hookItems[Math.floor(Math.random() * hookItems.length)];
        pick = await ensureUniqueHookCaption(pick, batchCaptionsRef);
        updateConfig("captionText", pick);
      }

      // iMessage mom / Labely single-slide only use slot 0
      const isMomFmt = (config.outputFormat ?? "standard") === "imessageMom";
      const allSlots = isMomFmt
        ? [config.slots[0]]
        : isLabelyScanTourFormat(config)
          ? config.slots.slice(0, LABELY_SCAN_TOUR_SLOTS)
          : isLabelySingleSlideFormat(config)
            ? [config.slots[0]]
            : config.slots;

      // All slots are active if brand items list has items; otherwise filter by slot prompt
      const activeSlots = allSlots
        .map((s, i) => ({ slot: s, i: isMomFmt ? 0 : i }))
        .filter(({ slot, i }) =>
          isLabely
            ? config.labelyAiProducts
              ? true
              : Boolean((batchImageDataUrls[i] ?? slot.imageUrl)?.trim())
            : brandItems.length > 0 || slot.prompt?.trim()
        );

      if (activeSlots.length === 0) {
        alert(
          isLabely
            ? config.labelyAiProducts
              ? "Could not determine slots to generate."
              : "Upload at least one slot photo under Product photos, then run Generate again."
            : "Add items to the Brand Items List or add a prompt to at least one slot."
        );
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
      /** Labely ×3 AI + scan tour: merge all slot patches in one commit (avoids lost updates mid-loop). */
      const tourAiDeferredWrites = [];
      setGenAllProgress({ total, done: 0, current: activeSlots[0].i, phase: `Starting ${total} image${total > 1 ? "s" : ""}…`, slotsDone });

      for (let idx = 0; idx < activeSlots.length; idx++) {
        if (cancelGenRef.current) {
          if (tourAiDeferredWrites.length > 0) {
            flushSync(() => {
              setConfig((prev) => ({
                ...prev,
                slots: prev.slots.map((slot, idx) => {
                  const hit = tourAiDeferredWrites.find((x) => x.i === idx);
                  return hit ? { ...slot, ...hit.patch } : slot;
                }),
              }));
            });
            flushSync(() => setCurrentSlide(0));
          }
          setGenAllProgress((p) => (p ? { ...p, phase: "Stopped." } : null));
          setTimeout(() => setGenAllProgress(null), 2000);
          return;
        }
        const { i } = activeSlots[idx];
        const prompt = config.slots[i].prompt || globalPrompt;
        const stepLabel = `${idx + 1} of ${total}`;

        // Each slot gets its own unique brand item from the deduplicated shuffled list
        const brandItem = shuffledUnique.length > 0 ? shuffledUnique[idx] : null;
        const brandLabel = brandItem ? ` — "${brandItem}"` : "";

        const hint = isValcoin ? pickValuableUSCoin() : brandItem;
        const p = hint ? `${prompt}\n\nSpecific item to depict: ${hint}.` : prompt;

        if (isLabely) {
          setGenAllProgress({
            total,
            done: slotsDone.size,
            current: i,
            phase: config.labelyAiProducts
              ? `Labely AI product ${stepLabel}${brandLabel}…`
              : `Labely analysis ${stepLabel}…`,
            slotsDone: new Set(slotsDone),
          });
          let ly;
          const includeShelfIntro = i === 0 && isLabelyScanTourFormat(config);
          if (config.labelyAiProducts) {
            ly = await fillLabelyFromAi(brandItem, i, { includeShelfIntro });
          } else {
            const slot = config.slots[i];
            const url = (batchImageDataUrls[i] ?? slot.imageUrl)?.trim();
            ly = await fillLabelyFromImage(url, { includeShelfIntro });
          }
          if (ly?.name) {
            const shelfIntroUrl = ly.shelfIntroDataUrl || (includeShelfIntro
              ? await generateLabelyShelfIntroImage(ly.name, ly.brand ?? "")
              : null);
            const patch = {
              itemName: ly.name,
              labelyBrand: ly.brand ?? "",
              ...badLabelyPatch(ly.score),
              labelyAnalysis: ly.analysis ?? "",
              labelyAnalysisTitle: ly.analysisTitle ?? "Labely's Analysis",
              labelyLegalNote: ly.labelyLegalNote?.trim() || "No lawsuits found.",
              ...(config.labelyAiProducts && ly.imageDataUrl ? { imageUrl: ly.imageDataUrl } : {}),
              ...(shelfIntroUrl ? { labelyShelfImageUrl: shelfIntroUrl } : {}),
            };
            const batchTourAi = config.labelyAiProducts && isLabelyScanTourFormat(config);
            if (batchTourAi) {
              tourAiDeferredWrites.push({ i, patch });
            } else {
              flushSync(() => {
                updateSlot(i, patch);
                setConfig((prev) => ({ ...prev, jitterSeed: generationJitterSeed }));
              });
            }
            slotsDone.add(i);
            setGenAllProgress({ total, done: slotsDone.size, current: i, phase: `Slot ${stepLabel} complete`, slotsDone: new Set(slotsDone) });
          } else {
            failedCount++;
            const errMsg = aiErrors[i] || "analysis failed";
            setGenAllProgress({ total, done: slotsDone.size, current: i, phase: `Slot ${stepLabel} failed: ${errMsg}`, slotsDone: new Set(slotsDone) });
            await new Promise((r) => setTimeout(r, 2500));
          }
        } else {
          setGenAllProgress({ total, done: slotsDone.size, current: i, phase: `Generating image ${stepLabel}${brandLabel}…`, slotsDone: new Set(slotsDone) });
          const url = await generateImage(i, p, hint);

          if (url) {
            const slot = config.slots[i];
            const priceUpdates = (!slot.spentPrice && !slot.soldPrice)
              ? (isValcoin && hint ? (await coinPrices(hint)) : null) ?? autoRandomPrices()
              : {};
            const isPlaceholderName = /^item\s+\d+$/i.test((slot.itemName ?? "").trim());
            updateSlot(i, {
              imageUrl: url,
              ...priceUpdates,
              ...(isValcoin && hint && (isPlaceholderName || !(slot.itemName ?? "").trim()) ? { itemName: hint } : {}),
            });

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
            failedCount++;
            const errMsg = aiErrors[i] || "unknown error";
            setGenAllProgress({ total, done: slotsDone.size, current: i, phase: `Slot ${stepLabel} failed: ${errMsg}`, slotsDone: new Set(slotsDone) });
            await new Promise((r) => setTimeout(r, 2500));
          }
        }
      }

      if (tourAiDeferredWrites.length > 0) {
        flushSync(() => {
          setConfig((prev) => ({
            ...prev,
            jitterSeed: generationJitterSeed,
            slots: prev.slots.map((slot, idx) => {
              const hit = tourAiDeferredWrites.find((x) => x.i === idx);
              return hit ? { ...slot, ...hit.patch } : slot;
            }),
          }));
        });
        flushSync(() => setCurrentSlide(0));
      }

      const doneCount = slotsDone.size;
      const missingPackShots =
        config.labelyAiProducts &&
        tourAiDeferredWrites.length > 0 &&
        tourAiDeferredWrites.some(({ patch }) => !String(patch.imageUrl || "").trim());
      const summary = failedCount > 0
        ? `Done — ${doneCount} succeeded, ${failedCount} failed`
        : missingPackShots
          ? "All done — text & scores saved, but no pack images. Check the terminal running next dev for [labely] logs; set OPENAI_API_KEY in .env.local. (Localhost is fine — images are created on the server.)"
        : "All done! ✓";
      setGenAllProgress((p) => p ? { ...p, phase: summary, done: doneCount } : null);
      setTimeout(() => setGenAllProgress(null), missingPackShots ? 12000 : 4000);
    } catch (err) {
      console.error("Generate 1 slideshow failed:", err);
      setGenAllProgress((p) => p ? { ...p, phase: "Generation failed — check console for details." } : null);
      setTimeout(() => setGenAllProgress(null), 5000);
    } finally {
      setGeneratingSlot(null);
      abortRef.current = null;
    }
  };

  // ── Batch generation: produce N complete slideshows sequentially ─────────────
  const [numSlideshows, setNumSlideshows] = useState(3);
  /** Data URLs in play order: show 1 slots 1…6 (or 1 for iMessage mom), then show 2, … Row count = length. */
  const [batchImageDataUrls, setBatchImageDataUrls] = useState([]);
  const [bulkDropHover, setBulkDropHover] = useState(false);
  const bulkFileInputRef = useRef(null);

  const batchSlotCount =
    (config.outputFormat ?? "standard") === "imessageMom"
      ? 1
      : isLabelyScanTourFormat(config)
        ? LABELY_SCAN_TOUR_SLOTS
        : isLabelySingleSlideFormat(config)
          ? 1
          : 6;
  const effectiveNumSlideshows = isLabelyFoodDbBatchMode ? totalBatchSlideshows : numSlideshows;
  const batchImagesNeeded = effectiveNumSlideshows * batchSlotCount;

  const hasWorkspacePhotos = useMemo(
    () =>
      batchImageDataUrls.some(Boolean) ||
      config.slots.some((s) => Boolean(s.imageUrl?.trim())),
    [batchImageDataUrls, config.slots]
  );

  const clearAllWorkspacePhotos = useCallback(() => {
    if (labelyUploadsLocked || generatingSlot !== null) return;
    setBatchImageDataUrls(Array.from({ length: batchImagesNeeded }, () => null));
    setConfig((prev) => ({
      ...prev,
      slots: prev.slots.map((s, i) =>
        isLabely ? labelySlotAfterImageSwap(s, null, i) : { ...s, imageUrl: null }
      ),
    }));
    setAiErrors({});
  }, [batchImagesNeeded, isLabely, labelyUploadsLocked, generatingSlot, setConfig]);

  useEffect(() => {
    const need = effectiveNumSlideshows * batchSlotCount;
    if (need <= 0) return;
    setBatchImageDataUrls((prev) => {
      if (prev.length === need) return prev;
      return Array.from({ length: need }, (_, i) => (i < prev.length ? prev[i] ?? null : null));
    });
  }, [effectiveNumSlideshows, batchSlotCount]);

  const reorderBatchRows = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    if (generatingSlot !== null) return;
    setBatchImageDataUrls((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setConfig((p) => ({
        ...p,
        slots: p.slots.map((s, i) => {
          if (!(i < 6 && i < next.length)) return s;
          const url = next[i] ?? null;
          return isLabely && !labelyUploadsLocked
            ? labelySlotAfterImageSwap(s, url, i)
            : { ...s, imageUrl: url };
        }),
      }));
      if (isLabely && !labelyUploadsLocked) {
        void runLabelyVisionForPreviewSlots(next);
      }
      return next;
    });
  };

  /**
   * @param {File[]} fileList
   * @param {{ replace?: boolean }} opts replace: fill batch slots from decoded images placed randomly across slideshows (square drop); false = merge into existing rows (file picker).
   */
  const handleBulkImageFiles = async (fileList, opts = { replace: true }) => {
    if (generatingSlot !== null) return;
    if (isLabely && config.labelyAiProducts) return;
    const imageFiles = [...fileList].filter((f) => isLikelyRasterImageFile(f));
    if (!imageFiles.length) return;
    const showsBefore = numSlideshows;
    const perShow = batchSlotCount;
    try {
      const results = await Promise.all(imageFiles.map((f) => tryFileToDisplayableDataUrl(f)));
      const urls = results.map((r) => (r.ok ? r.dataUrl : null));
      const failedNames = results
        .map((r, i) => (!r.ok ? imageFiles[i]?.name || `#${i + 1}` : null))
        .filter(Boolean);
      if (!urls.some(Boolean)) {
        alert(
          `Could not read any images.${failedNames.length ? `\n\n(${failedNames.slice(0, 6).join(", ")})` : ""}`
        );
        return;
      }
      if (failedNames.length) {
        console.warn("[bulk] skipped unreadable files:", failedNames);
      }
      const minShows = Math.max(1, Math.ceil(imageFiles.length / perShow));
      if (opts.replace) {
        const newShows = Math.max(showsBefore, minShows);
        const need = newShows * perShow;
        const goodUrls = urls.filter(Boolean);
        const shuffledUrls = shuffleArray(goodUrls);
        const slotOrder = shuffleArray(Array.from({ length: need }, (_, i) => i));
        const nextBatch = Array.from({ length: need }, () => null);
        for (let i = 0; i < shuffledUrls.length; i++) {
          nextBatch[slotOrder[i]] = shuffledUrls[i];
        }
        setNumSlideshows(newShows);
        setBatchImageDataUrls(nextBatch);
        setConfig((prev) => ({
          ...prev,
          slots: prev.slots.map((s, i) => {
            if (!(i < 6 && i < nextBatch.length)) return s;
            const url = nextBatch[i] ?? null;
            return isLabely && !config.labelyAiProducts
              ? labelySlotAfterImageSwap(s, url, i)
              : { ...s, imageUrl: url };
          }),
        }));

        if (isLabely && !config.labelyAiProducts) {
          void runLabelyVisionForPreviewSlots(nextBatch);
        }
      } else {
        const need = showsBefore * perShow;
        setBatchImageDataUrls((prev) =>
          Array.from({ length: need }, (_, i) => urls[i] ?? prev[i] ?? null)
        );
      }
    } catch {
      alert("Could not read one or more images.");
    }
  };

  // Generate one complete slideshow into a local slots array, save via callback.
  const generateOneSlideshow = async (showIndex, totalShows, options = {}) => {
    const isMomFmt = (config.outputFormat ?? "standard") === "imessageMom";
    const slotCount = isMomFmt
      ? 1
      : isLabelyScanTourFormat(config)
        ? LABELY_SCAN_TOUR_SLOTS
        : isLabelySingleSlideFormat(config)
          ? 1
          : 6;
    const base = showIndex * slotCount;
    const slice =
      batchImageDataUrls.length > base
        ? Array.from({ length: slotCount }, (_, si) =>
            base + si < batchImageDataUrls.length ? batchImageDataUrls[base + si] ?? null : null
          )
        : null;

    let hookCaption = "";
    if (!isLabely) {
      hookCaption =
        hookItems.length > 0
          ? hookItems[Math.floor(Math.random() * hookItems.length)]
          : config.captionText;
      hookCaption = await ensureUniqueHookCaption(hookCaption, batchCaptionsRef);
    }

    const sourceBrandItems = Array.isArray(options.brandItemsOverride) && options.brandItemsOverride.length > 0
      ? options.brandItemsOverride
      : brandItems;
    const sourceFoodDbMatches =
      options.foodDbMatchesOverride && typeof options.foodDbMatchesOverride === "object"
        ? options.foodDbMatchesOverride
        : {};
    const uniqueBrands = [...new Set(sourceBrandItems)];
    const shuffled = [...uniqueBrands].sort(() => Math.random() - 0.5);
    while (shuffled.length > 0 && shuffled.length < slotCount)
      shuffled.push(...[...uniqueBrands].sort(() => Math.random() - 0.5));

    const localSlots = Array.from({ length: 6 }, (_, i) => freshSlot(i));
    const showJitterSeed = (Math.random() * 0xffff) | 0;

    if (isLabely) {
      if (config.labelyAiProducts) {
        for (let si = 0; si < slotCount; si++) {
          if (cancelGenRef.current) break;
          const brandItem = shuffled.length > 0 ? shuffled[si] : null;
          setGenAllProgress({
            total: slotCount,
            done: si,
            current: si,
            phase: `Show ${showIndex + 1}/${totalShows} · AI product ${si + 1}/${slotCount}${brandItem ? ` — "${brandItem}"` : ""}…`,
            slotsDone: new Set(Array.from({ length: si }, (_, k) => k)),
          });
          const includeShelfIntro = si === 0 && isLabelyScanTourFormat(config);
          const foodDatabaseImageUrl = foodDbImageUrlForItem(brandItem, sourceFoodDbMatches);
          const ly = await fillLabelyFromAi(brandItem, si, {
            includeShelfIntro,
            foodDatabaseImageUrl,
          });
          if (ly?.name) {
            const shelfIntroUrl = ly.shelfIntroDataUrl || (includeShelfIntro
              ? await generateLabelyShelfIntroImage(ly.name, ly.brand ?? "")
              : null);
            localSlots[si] = {
              ...localSlots[si],
              itemName: ly.name,
              labelyBrand: ly.brand ?? "",
              ...badLabelyPatch(ly.score),
              labelyAnalysis: ly.analysis ?? "",
              labelyAnalysisTitle: ly.analysisTitle ?? "Labely's Analysis",
              labelyLegalNote: ly.labelyLegalNote?.trim() || "No lawsuits found.",
              ...(brandItem ? { labelyDbSeedHint: brandItem } : {}),
              ...(foodDatabaseImageUrl ? { labelyDbImageUrl: foodDatabaseImageUrl } : {}),
              ...(ly.imageDataUrl ? { imageUrl: ly.imageDataUrl } : {}),
              ...(shelfIntroUrl ? { labelyShelfImageUrl: shelfIntroUrl } : {}),
            };
          }
          updateConfig("slots", [...localSlots]);
        }
      } else {
      for (let si = 0; si < slotCount; si++) {
        if (cancelGenRef.current) break;
        const pre = slice?.[si] ?? null;
        setGenAllProgress({
          total: slotCount,
          done: si,
          current: si,
          phase: `Show ${showIndex + 1}/${totalShows} · Photo ${si + 1}/${slotCount}${pre ? "" : " (skipped — no queued image)"}…`,
          slotsDone: new Set(Array.from({ length: si }, (_, k) => k)),
        });
        if (!pre) continue;
        localSlots[si] = { ...localSlots[si], imageUrl: pre };
        const includeShelfIntro = si === 0 && isLabelyScanTourFormat(config);
        const ly = await fillLabelyFromImage(pre, { includeShelfIntro });
        if (ly?.name) {
          const shelfIntroUrl = ly.shelfIntroDataUrl || (includeShelfIntro
            ? await generateLabelyShelfIntroImage(ly.name, ly.brand ?? "")
            : null);
          localSlots[si] = {
            ...localSlots[si],
            itemName: ly.name,
            labelyBrand: ly.brand ?? "",
            ...badLabelyPatch(ly.score),
            labelyAnalysis: ly.analysis ?? "",
            labelyAnalysisTitle: ly.analysisTitle ?? "Labely's Analysis",
            labelyLegalNote: ly.labelyLegalNote?.trim() || "No lawsuits found.",
            ...(shelfIntroUrl ? { labelyShelfImageUrl: shelfIntroUrl } : {}),
          };
        }
        updateConfig("slots", [...localSlots]);
      }
      }
      const hasAny = localSlots.some((s) => s.itemName?.trim() || s.imageUrl?.trim());
      if (!hasAny) return null;
      flushSync(() => {
        setConfig((prev) => ({
          ...prev,
          slots: [...localSlots],
          captionText: "",
          jitterSeed: showJitterSeed,
        }));
      });
      await waitForPreviewPaint();
      const previewScreenshot = await captureLivePreviewThumbnail();
      const savedShow = {
        slots: [...localSlots],
        captionText: "",
        previewScreenshot,
        outputFormat: config.outputFormat,
        appId: config.appId,
        jitterSeed: showJitterSeed,
        ...(config.labelyOutroText ? { labelyOutroText: config.labelyOutroText } : {}),
        ...(config.labelyFoodDbBatches ? { labelyFoodDbBatches: config.labelyFoodDbBatches } : {}),
        ...(options.batchMeta || {}),
      };
      onSlideshowSaved?.(savedShow);
      return savedShow;
    }

    for (let si = 0; si < slotCount; si++) {
      if (cancelGenRef.current) break;
      const brandItem = shuffled.length > 0 ? shuffled[si] : null;
      const pre = slice?.[si] ?? null;
      setGenAllProgress({
        total: slotCount,
        done: si,
        current: si,
        phase: pre
          ? `Show ${showIndex + 1}/${totalShows} · Upload ${si + 1}/${slotCount}…`
          : `Show ${showIndex + 1}/${totalShows} · Image ${si + 1}/${slotCount}${brandItem ? ` — "${brandItem}"` : ""}…`,
        slotsDone: new Set(Array.from({ length: si }, (_, k) => k)),
      });
      const hintGen = isValcoin ? pickValuableUSCoin() : brandItem;
      const p = hintGen ? `${globalPrompt}\n\nSpecific item to depict: ${hintGen}.` : globalPrompt;
      let url = pre;
      if (!url) url = await generateImage(si, p, hintGen);
      if (url) {
        const prices = pre
          ? autoRandomPrices()
          : (isValcoin && hintGen ? (await coinPrices(hintGen)) : null) ?? autoRandomPrices();
        const isPlaceholderName = /^item\s+\d+$/i.test((localSlots[si]?.itemName ?? "").trim());
        localSlots[si] = {
          ...localSlots[si],
          imageUrl: url,
          ...prices,
          ...(isValcoin && hintGen && !pre && (isPlaceholderName || !(localSlots[si]?.itemName ?? "").trim())
            ? { itemName: hintGen }
            : {}),
        };
        setGenAllProgress({
          total: slotCount,
          done: si,
          current: si,
          phase: `Show ${showIndex + 1}/${totalShows} · Analyzing item ${si + 1}/${slotCount}…`,
          slotsDone: new Set(Array.from({ length: si }, (_, k) => k)),
        });
        const grail = await autoTitleFromImage(url);
        if (grail?.title) {
          const rp = grail.price ?? prices.soldPrice;
          localSlots[si] = {
            ...localSlots[si],
            itemName: grail.title,
            ...(grail.price ? { soldPrice: grail.price } : {}),
            matchItems: autoSoldListings(grail.title, rp),
          };
        }
        if ((config.outputFormat ?? "standard") === "imessageMom") {
          const slotNow = localSlots[si];
          const thread = await generateImessageThread(slotNow.itemName, slotNow.soldPrice);
          if (thread) localSlots[si] = { ...localSlots[si], imessageThread: thread };
        }
      }
      updateConfig("slots", [...localSlots]);
    }
    updateConfig("captionText", hookCaption);
    updateConfig("jitterSeed", showJitterSeed);
    await waitForPreviewPaint();
    const previewScreenshot = await captureLivePreviewThumbnail();
    const savedShow = {
      slots: [...localSlots],
      captionText: hookCaption,
      previewScreenshot,
      outputFormat: config.outputFormat,
      appId: config.appId,
      jitterSeed: showJitterSeed,
      ...(config.labelyOutroText ? { labelyOutroText: config.labelyOutroText } : {}),
      ...(config.labelyFoodDbBatches ? { labelyFoodDbBatches: config.labelyFoodDbBatches } : {}),
      ...(options.batchMeta || {}),
    };
    onSlideshowSaved?.(savedShow);
    return savedShow;
  };

  const handleGenerateBatch = async () => {
    if (isLabelyFoodDbBatchMode) {
      const plans = labelyFoodDbBatches
        .map((b, idx) => ({
          batchNumber: idx + 1,
          batchName: String(b.name || "").trim(),
          items: String(b.itemsRaw || "").split("\n").map((x) => x.trim()).filter(Boolean),
          slideshowCount: Math.max(0, Math.min(200, Number(b.slideshowCount) || 0)),
          foodDbMatches: b.foodDbMatches && typeof b.foodDbMatches === "object" ? b.foodDbMatches : {},
        }))
        .filter((b) => b.slideshowCount > 0);
      const totalShows = plans.reduce((sum, p) => sum + p.slideshowCount, 0);
      if (totalShows <= 0) {
        alert("Set at least one batch slideshow count above 0.");
        return;
      }
      if (plans.some((p) => p.items.length === 0)) {
        alert("Each batch with a non-zero slideshow count needs at least one food item.");
        return;
      }
      setGeneratingSlot("all");
      setAiErrors({});
      batchCaptionsRef.current = [];
      cancelGenRef.current = false;
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      try {
        let globalShowIdx = 0;
        const generatedShows = [];
        for (const plan of plans) {
          for (let i = 0; i < plan.slideshowCount; i++) {
            if (cancelGenRef.current) break;
            const savedShow = await generateOneSlideshow(globalShowIdx, totalShows, {
              brandItemsOverride: plan.items,
              foodDbMatchesOverride: plan.foodDbMatches,
              batchMeta: {
                batchNumber: plan.batchNumber,
                batchSlideshowIndex: i + 1,
                batchFoodName: plan.batchName || plan.items[0] || "food",
              },
            });
            if (savedShow) generatedShows.push(savedShow);
            globalShowIdx++;
          }
          if (cancelGenRef.current) break;
        }
        if (!cancelGenRef.current) {
          setGenAllProgress((p) => p
            ? { ...p, phase: `✓ ${generatedShows.length} slideshow${generatedShows.length > 1 ? "s" : ""} saved. Auto-exporting iPhone ZIPs…`, done: 6 }
            : null
          );
          const restoreConfig = {
            ...config,
            slots: (config.slots ?? []).map((s) => ({ ...s })),
          };
          await exportIphoneZipPlans(generatedShows, restoreConfig, { auto: true });
        } else {
          setGenAllProgress((p) => p
            ? { ...p, phase: `Stopped after ${generatedShows.length} slideshow${generatedShows.length === 1 ? "" : "s"}.`, done: 6 }
            : null
          );
        }
        setTimeout(() => setGenAllProgress(null), 4000);
      } catch (err) {
        console.error("Generate batch failed:", err);
        setGenAllProgress((p) => p ? { ...p, phase: "Batch failed — check console for details." } : null);
        setTimeout(() => setGenAllProgress(null), 5000);
      } finally {
        setGeneratingSlot(null);
        abortRef.current = null;
      }
      return;
    }

    if (isLabely) {
      if (!config.labelyAiProducts && !batchImageDataUrls.some(Boolean)) {
        alert("Add at least one photo in the image rows above (or use multi-select). Order is slideshow #1 first, then #2, etc.");
        return;
      }
    } else if (brandItems.length === 0 && !batchImageDataUrls.some(Boolean)) {
      alert("Add brand items for AI images, or queue batch uploads — or both (uploads fill first, AI fills gaps).");
      return;
    }
    setGeneratingSlot("all");
    setAiErrors({});
    batchCaptionsRef.current = [];
    cancelGenRef.current = false;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      for (let i = 0; i < numSlideshows; i++) {
        if (cancelGenRef.current) break;
        await generateOneSlideshow(i, numSlideshows);
      }
      setGenAllProgress((p) => p
        ? { ...p, phase: `✓ ${numSlideshows} slideshow${numSlideshows > 1 ? "s" : ""} saved to gallery!`, done: 6 }
        : null
      );
      setTimeout(() => setGenAllProgress(null), 4000);
    } catch (err) {
      console.error("Generate batch failed:", err);
      setGenAllProgress((p) => p ? { ...p, phase: "Batch failed — check console for details." } : null);
      setTimeout(() => setGenAllProgress(null), 5000);
    } finally {
      setGeneratingSlot(null);
      abortRef.current = null;
    }
  };

  // ── Video export: capture each slide, then animate ──
  const encodeWorkspaceVideoToBlob = async (exportCfg) => {
    setExportProgress(0);

    if ((exportCfg.outputFormat ?? "standard") === "starterPack") {
      setExportStatus("Generating starter pack text…");
      const sp = await ensureStarterPackAutofill();
      setExportStatus("Generating starter pack images…");
      await ensureStarterPackImages(sp?.imagePrompts ?? sp?.items, exportCfg);
      setExportStatus("Capturing slides…");
    }

    const slidesCount = getTotalSlides(exportCfg);
    const allSlideFrames = [];
    const previewNode = getCaptureNode();
    const fontEmbedCSS = previewNode ? await getFontEmbedCSS(previewNode) : undefined;
    const fps = 30;

    for (let i = 0; i < slidesCount; i++) {
      flushSync(() => {
        setCurrentSlide(i);
      });
      await waitForPreviewPaint();

      const info = getSlideInfo(exportCfg, i);
      const bg =
        info.type === "collage"
          ? "#111111"
          : info.type === "fullBleed" || info.type === "imessage" || info.type === "starterPack" || info.type === "labelyShelfIntro"
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
      } else if (
        (exportCfg.outputFormat ?? "standard") === "labelyScan" &&
        (exportCfg.appId ?? "thrifty") === "labely" &&
        info.type === "labely"
      ) {
        await new Promise((r) => setTimeout(r, 80));
        try {
          const labelyCanvas = await captureSlideCanvas(bg, fontEmbedCSS);
          if (!labelyCanvas) throw new Error("Preview node not found");
          const slotNow = info.slot ?? exportCfg.slots?.[i];
          const productDataUrl =
            typeof slotNow?.imageUrl === "string" ? slotNow.imageUrl.trim() : "";
          const seq = await buildLabelyScanFrameSequence({
            productDataUrl,
            labelyCanvas,
            scanSec: 1.35,
            revealSec: 0.52,
            holdSec: exportCfg.slideDuration,
            fps,
            imageVariationSeed: (exportCfg.jitterSeed ?? 0) + (info.itemIndex ?? i) * 9973,
          });
          allSlideFrames.push([labelyCanvas, seq]);
        } catch (err) {
          console.error("Capture error Labely scan intro", err);
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

      setExportProgress(Math.round((i + 1) / slidesCount * 40));
      setExportStatus(`Captured slide ${i + 1} of ${slidesCount}…`);
    }

    // Filter to slides that have at least one captured frame
    const validSlides = allSlideFrames
      .map((snapshots, i) => ({ snapshots, origIndex: i }))
      .filter(({ snapshots }) => snapshots.length > 0);

    if (validSlides.length === 0) {
      setExportStatus("Export failed — no frames captured.");
      return null;
    }

    // ── PHASE 2: Encode with native WebCodecs + mp4-muxer (no WASM, no CDN) ──────
    setExportStatus("Preparing encoder…");
    setExportProgress(42);

    // WebCodecs availability check
    if (typeof VideoEncoder === "undefined") {
      setExportStatus("WebCodecs not available — please use Chrome or Safari 16+.");
      return null;
    }

    const OUT_W = 1080;
    const OUT_H = 1920;
    const transitionFrames = Math.round((exportCfg.transitionMs / 1000) * fps);
    const frameDurationUs  = Math.round(1_000_000 / fps); // microseconds per frame

    // Per-slide hold duration in frames.
    // Labely scan intro: snapshots[1] is HTMLCanvasElement[] (one frame per entry).
    // StarterPack phases: snapshots[1] is duration in seconds (number).
    const perSlideHoldFrames = validSlides.map(({ snapshots }) => {
      if (Array.isArray(snapshots) && snapshots.length >= 2 && Array.isArray(snapshots[1])) {
        return snapshots[1].length;
      }
      const overrideSec = snapshots[1];
      const baseSec = typeof overrideSec === "number" ? overrideSec : exportCfg.slideDuration;
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

    if (exportCfg.useRandomAudio && typeof AudioEncoder !== "undefined") {
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

    const slideRepresentativeCanvas = (snaps) => {
      if (Array.isArray(snaps?.[1]) && snaps[1].length > 0) return snaps[1][snaps[1].length - 1];
      return snaps[0];
    };
    const slideFirstCanvas = (snaps) => {
      if (Array.isArray(snaps?.[1]) && snaps[1].length > 0) return snaps[1][0];
      return snaps[0];
    };

    for (let si = 0; si < validSlides.length; si++) {
      const curSnaps = validSlides[si].snapshots;
      const frameSeq = Array.isArray(curSnaps?.[1]) ? curSnaps[1] : null;
      const holdFrames = perSlideHoldFrames[si];

      for (let f = 0; f < holdFrames; f++) {
        if (encoderError) break;
        sctx.clearRect(0, 0, OUT_W, OUT_H);
        const src = frameSeq ? frameSeq[f] : curSnaps[0];
        sctx.drawImage(src, 0, 0, OUT_W, OUT_H);

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
        const curCv = slideRepresentativeCanvas(curSnaps);
        const nxtCv = slideFirstCanvas(nxtSnaps);
        for (let f = 0; f < transitionFrames; f++) {
          if (encoderError) break;
          const t      = f / transitionFrames;
          const eased  = 1 - Math.pow(1 - t, 3);
          const offset = Math.round(eased * OUT_W);
          sctx.clearRect(0, 0, OUT_W, OUT_H);
          sctx.drawImage(curCv, -offset,        0, OUT_W, OUT_H);
          sctx.drawImage(nxtCv,                   OUT_W - offset, 0, OUT_W, OUT_H);

          const vf = new VideoFrame(scaleCanvas, { timestamp: pts, duration: frameDurationUs });
          encoder.encode(vf, { keyFrame: false });
          vf.close();
          pts += frameDurationUs;
          encoded++;
        }
      }
    }

    if (encoderError) {
      setExportStatus(`Encoding failed: ${encoderError.message}`);
      return null;
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

    return new Blob([target.buffer], { type: "video/mp4" });
  };

  const handleExportVideo = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Capturing slides…");
    try {
      const blob = await encodeWorkspaceVideoToBlob(config);
      if (blob) {
        triggerMp4Download(blob, `${randomExportHex(14)}.mp4`);
        setExportProgress(100);
        setExportStatus("Done! Video downloaded.");
      }
    } finally {
      setIsExporting(false);
      setTimeout(() => {
        setExportStatus("");
        setExportProgress(0);
      }, 3000);
    }
  };

  const exportIphoneZipPlans = async (shows, restoreConfig, { auto = false } = {}) => {
    const zipPlan = tryBuildIphoneBatchZipPlan(shows);
    if (zipPlan?.error) {
      if (auto) setExportStatus(zipPlan.error);
      else alert(zipPlan.error);
      return false;
    }

    if (zipPlan?.zipPlans?.length) {
      const zipPlans = zipPlan.zipPlans;
      const totalJobs = zipPlans.reduce((sum, plan) => sum + plan.jobs.length, 0);
      let completedJobs = 0;
      setIsExporting(true);
      setExportProgress(0);
      setExportStatus(`${auto ? "Auto-export: " : ""}Encoding ${totalJobs} videos into ${zipPlans.length} ZIPs…`);
      try {
        const { zipSync } = await import("fflate");
        let downloadedZipCount = 0;

        for (const plan of zipPlans) {
          const zipEntries = {};
          for (let i = 0; i < plan.jobs.length; i++) {
            const { zipRelPath, show } = plan.jobs[i];
            setExportStatus(`${auto ? "Auto-export: " : ""}iPhone ${plan.iphoneNumber}: encoding video ${i + 1} / ${plan.jobs.length}…`);
            const exportCfg = galleryShowToExportConfig(restoreConfig, show);
            flushSync(() => setConfig(exportCfg));
            flushSync(() => setCurrentSlide(0));
            await waitForPreviewPaint();
            const blob = await encodeWorkspaceVideoToBlob(exportCfg);
            if (blob) {
              const arr = new Uint8Array(await blob.arrayBuffer());
              zipEntries[zipRelPath] = [arr, randomZipEntryOptions()];
            }
            completedJobs++;
            setExportProgress(Math.round((completedJobs / totalJobs) * 95));
            await new Promise((r) => setTimeout(r, 120));
          }

          if (Object.keys(zipEntries).length === 0) continue;

          setExportStatus(`${auto ? "Auto-export: " : ""}Building ZIP ${plan.iphoneNumber} / ${zipPlans.length}…`);
          const zipData = zipSync(zipEntries, { level: 1 });
          const blob = new Blob([zipData], { type: "application/zip" });
          triggerZipDownload(blob, `labely-iphone-${String(plan.iphoneNumber).padStart(2, "0")}-${randomExportHex(10)}.zip`);
          downloadedZipCount++;
          await new Promise((r) => setTimeout(r, 650));
        }

        if (downloadedZipCount === 0) {
          setExportStatus("Nothing encoded — ZIP export cancelled.");
        } else {
          setExportProgress(100);
          setExportStatus(`Done! Downloaded ${downloadedZipCount} iPhone ZIPs (${LABELY_DB_BATCH_COUNT} videos each).`);
        }
        return downloadedZipCount > 0;
      } catch (e) {
        console.error(e);
        setExportStatus("iPhone ZIP export failed — see console.");
        return false;
      } finally {
        flushSync(() => setConfig(restoreConfig));
        flushSync(() => setCurrentSlide(0));
        setIsExporting(false);
        setTimeout(() => {
          setExportStatus("");
          setExportProgress(0);
        }, 5000);
      }
    }
    return false;
  };

  const handleExportAllVideos = async () => {
    const restoreConfig = {
      ...config,
      slots: (config.slots ?? []).map((s) => ({ ...s })),
    };

    if (await exportIphoneZipPlans(savedSlideshows, restoreConfig)) return;

    if (savedSlideshows.length < 2) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Preparing batch export…");
    try {
      for (let i = 0; i < savedSlideshows.length; i++) {
        const show = savedSlideshows[i];
        setExportStatus(`Exporting video ${i + 1} of ${savedSlideshows.length}…`);
        const exportCfg = galleryShowToExportConfig(restoreConfig, show);
        flushSync(() => setConfig(exportCfg));
        flushSync(() => setCurrentSlide(0));
        await waitForPreviewPaint();
        const blob = await encodeWorkspaceVideoToBlob(exportCfg);
        if (blob) {
          triggerMp4Download(blob, sequentialRandomMp4Name(i, show));
          await new Promise((r) => setTimeout(r, 400));
        }
        setExportProgress(Math.round(((i + 1) / savedSlideshows.length) * 100));
      }
      setExportProgress(100);
      setExportStatus(`Done! ${savedSlideshows.length} videos downloaded.`);
    } catch (e) {
      console.error(e);
      setExportStatus("Batch video export failed — see console.");
    } finally {
      flushSync(() => setConfig(restoreConfig));
      flushSync(() => setCurrentSlide(0));
      setIsExporting(false);
      setTimeout(() => {
        setExportStatus("");
        setExportProgress(0);
      }, 4000);
    }
  };

  const handleFixBlankLabelyPhotos = async () => {
    if (!Array.isArray(savedSlideshows) || savedSlideshows.length === 0 || typeof onSavedSlideshowsChange !== "function") return;
    const labelyShows = savedSlideshows.filter((show) => show?.appId === "labely");
    const blankSlots = labelyShows.reduce(
      (sum, show) => sum + (Array.isArray(show?.slots) ? show.slots.filter((slot) => !String(slot?.imageUrl || "").trim()).length : 0),
      0,
    );
    if (blankSlots === 0) {
      setExportStatus("No blank Labely photos found.");
      setExportProgress(100);
      setTimeout(() => {
        setExportStatus("");
        setExportProgress(0);
      }, 2500);
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus(`Fixing ${blankSlots} blank Labely photo${blankSlots === 1 ? "" : "s"}…`);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const repaired = savedSlideshows.map((show) => ({
        ...show,
        slots: Array.isArray(show?.slots) ? show.slots.map((slot) => ({ ...slot })) : show?.slots,
      }));
      let checked = 0;
      let fixed = 0;

      for (let showIndex = 0; showIndex < repaired.length; showIndex++) {
        const show = repaired[showIndex];
        if (show?.appId !== "labely" || !Array.isArray(show.slots)) continue;
        const batchIndex = Number(show.batchNumber) - 1;
        const showBatches = Array.isArray(show.labelyFoodDbBatches) ? show.labelyFoodDbBatches : [];
        const sourceBatch =
          (batchIndex >= 0 ? showBatches[batchIndex] : null)
          || (batchIndex >= 0 ? labelyFoodDbBatches[batchIndex] : null)
          || null;
        const matches = sourceBatch?.foodDbMatches && typeof sourceBatch.foodDbMatches === "object" ? sourceBatch.foodDbMatches : {};

        for (let slotIndex = 0; slotIndex < show.slots.length; slotIndex++) {
          const slot = show.slots[slotIndex];
          if (String(slot?.imageUrl || "").trim()) continue;
          checked++;
          setExportStatus(`Fixing blank photo ${checked} / ${blankSlots}…`);
          const exactImageUrl = String(slot?.labelyDbImageUrl || "").trim() || foodDbImageUrlForSlot(slot, matches);
          const imageDataUrl = await fetchLabelyDatabaseImage({ slot, exactImageUrl });
          if (imageDataUrl) {
            show.slots[slotIndex] = {
              ...slot,
              imageUrl: imageDataUrl,
              ...(exactImageUrl ? { labelyDbImageUrl: exactImageUrl } : {}),
            };
            fixed++;
          }
          setExportProgress(Math.round((checked / blankSlots) * 100));
          await new Promise((r) => setTimeout(r, 80));
        }
      }

      onSavedSlideshowsChange(repaired);
      if (activeShowIdx != null && repaired[activeShowIdx]) {
        const active = repaired[activeShowIdx];
        setConfig((prev) => ({
          ...prev,
          slots: Array.isArray(active.slots) ? active.slots : prev.slots,
          ...(active.jitterSeed != null ? { jitterSeed: active.jitterSeed } : {}),
        }));
      }
      setExportProgress(100);
      setExportStatus(`Done! Fixed ${fixed} / ${blankSlots} blank Labely photo${blankSlots === 1 ? "" : "s"}.`);
    } catch (e) {
      console.error("Fix blank Labely photos failed:", e);
      setExportStatus("Fix blank photos failed — see console.");
    } finally {
      abortRef.current = null;
      setIsExporting(false);
      setTimeout(() => {
        setExportStatus("");
        setExportProgress(0);
      }, 5000);
    }
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
    const usedZipEntryNames = new Set();

    for (let i = 0; i < totalSlides; i++) {
      flushSync(() => {
        setCurrentSlide(i);
      });
      await waitForPreviewPaint();
      await new Promise((r) => setTimeout(r, 80));

      const info = getSlideInfo(config, i);
      const bg =
        info.type === "collage"    ? "#111111"
        : info.type === "fullBleed" || info.type === "imessage" || info.type === "starterPack" || info.type === "labelyShelfIntro" ? "#000000"
        : "#ffffff";

      if (info.type === "starterPack") {
        // Export final phase (all 4 cards visible) as a single PNG
        setConfig((prev) => ({ ...prev, _spPhase: 4 }));
        await new Promise((r) => setTimeout(r, 120));
        try {
          const canvas = await captureSlideCanvas(bg, fontEmbedCSS);
          if (!canvas) throw new Error("no canvas");
          const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
          const arr = new Uint8Array(await blob.arrayBuffer());
          pngEntries[uniqueRandomZipPngName(usedZipEntryNames)] = [arr, randomZipEntryOptions()];
        } catch (e) { console.warn("Skipping starterPack slide", e); }
        setConfig((prev) => ({ ...prev, _spPhase: -1 }));
      } else {
        try {
          const canvas = await captureSlideCanvas(bg, fontEmbedCSS);
          if (!canvas) throw new Error("no canvas");
          const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
          const arr = new Uint8Array(await blob.arrayBuffer());
          pngEntries[uniqueRandomZipPngName(usedZipEntryNames)] = [arr, randomZipEntryOptions()];
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
    a.download = `${randomExportHex(12)}.zip`;
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
      if (isLabelySingleSlideFormat(config)) {
        handleGenerateOne(0);
        return;
      }
      if (
        slideIdx === 0 &&
        fmt !== "posePerson" &&
        fmt !== "imessageMom" &&
        !isLabelyScanTourFormat(config)
      ) {
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
            ...(isLabely
              ? [
                  {
                    id: "labelyScan",
                    label: "Labely grocery intro + scan (×3)",
                    sub: `Opening grocery shelf/fridge scene, then three Labely slides (slots 1–${LABELY_SCAN_TOUR_SLOTS}). Export = shelf intro, scan over each image, Labely slides up, then transitions to the next.`,
                  },
                  {
                    id: "labelyOnly",
                    label: "Labely (single slide)",
                    sub: "One Labely slide only — upload a packaging photo below (slot 1), then Generate.",
                  },
                ]
              : []),
            { id: "standard", label: "Standard", sub: "Collage, then reveal + app per item" },
            { id: "appOnly", label: "App only", sub: "Collage, then app screenshots only (no reveal)" },
            ...(!isValcoin ? [{ id: "imessageMom", label: "iMessage mom", sub: `iMessage → Voicemail → ${brand.appName} (3 slides, slot 1 only)` }] : []),
            ...(!isValcoin ? [{ id: "posePerson", label: "Pose person", sub: "Six full-frame shots; hands OK on slide 1 only" }] : []),
            ...(!isValcoin ? [{ id: "starterPack", label: "Starter pack", sub: `POV: you thrift full time — 3 struggles + ${brand.appName} (5 sec)` }] : []),
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
              Headline stays static. Each of the 3 items + {brand.appName} dissolves in over 5 seconds.
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
            <p className="text-white/30 text-[10px]">Card 4 is always <span className="text-white/60">{brand.appName}</span> (auto).</p>
          </div>
        )}

        <div className="bg-white/4 border border-white/10 rounded-xl p-3">
          <div className="text-white/55 text-xs font-semibold mb-1">Pose format (optional)</div>
          <p className="text-white/35 text-[10px] mb-2 leading-relaxed">
            Upload your own reference photos. The model matches pose and framing, then swaps in each item. Images are cycled by slot (1→2→3…→1). With <span className="text-white/50">Pose person</span> selected, hands/arms are only allowed on the first generated slide; other slides stay hands-free.
          </p>
          <input
            type="file"
            accept={IMAGE_FILE_ACCEPT}
            multiple
            className="text-white/50 text-[11px] w-full file:mr-2 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:bg-white/10 file:text-white/80"
            onChange={(e) => {
              const files = [...e.target.files];
              e.target.value = "";
              if (!files.length) return;
              void (async () => {
                const results = await Promise.all(files.map((f) => tryFileToDisplayableDataUrl(f)));
                const list = results
                  .filter((r) => r.ok)
                  .map((r) => ({ id: `${Date.now()}-${Math.random()}`, dataUrl: r.dataUrl }));
                const bad = results.length - list.length;
                if (!list.length) {
                  alert("Could not read any of those images (try JPEG, PNG, or HEIC).");
                  return;
                }
                updateConfig("poseReferenceImages", [...(config.poseReferenceImages || []), ...list]);
                if (bad) console.warn("[pose refs] skipped", bad, "file(s)");
              })();
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

      {/* ── COLLAGE CAPTION (hooks + collage text — Labely has none) ── */}
      <Section title={isLabely ? "Reveal captions" : "Collage Caption"} icon="💬">
        {!isLabely && (
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
        )}

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

        {!isValcoin && (
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
        )}

        {!isValcoin && (
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
        )}

        {!isLabely && (
        <div className="mt-3 bg-white/4 border border-white/10 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <Label>Hook Captions</Label>
            {mounted && hookItems.length > 0 && (
              <span className="text-violet-300 text-[10px] font-medium">{hookItems.length} hook{hookItems.length > 1 ? "s" : ""}</span>
            )}
          </div>
          <textarea
            value={hooksRaw}
            onChange={(e) => { setHooksRaw(e.target.value); localStorage.setItem(storeKey("ts_hooks"), e.target.value); }}
            placeholder={"found at goodwill 👀\nthrift finds that paid off 💰\nyou won't believe what i found"}
            rows={5}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-violet-500/60 placeholder-white/15 resize-none"
          />
          <p className="text-white/25 text-[10px] mt-1">One caption per line. A random one is picked each time you generate.</p>
        </div>
        )}
      </Section>

      {/* ── AI GENERATION ── */}
      <Section title="AI Generation" icon="✨">
        {!isLabely && (
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
        )}

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5 text-xs text-emerald-200">
          <div className="font-semibold">AI keys are managed on the server.</div>
          <div className="mt-1 text-emerald-100/70">
            {isLabely
              ? config.labelyAiProducts
                ? config.labelyUseFoodDatabasePhotos
                  ? "AI Labely: GPT picks and scores the SKU, then Open Food Facts is searched for a real package photo. No AI photo generation is attempted while database photos are on."
                  : "AI Labely: GPT picks real retail products (your list seeds the SKU — e.g. Oreo → real Oreo packaging), writes fictional chemical hits in the analysis, scores, and generates a pack image (no uploads). Toggle off to use real photos + vision instead."
                : "Labely analyzes your uploaded photos with vision (OpenAI). Toggle “AI-generated products” below for the older all-AI grocery flow."
              : "This deployment uses the Vercel environment variables for image generation and auto-title, so teammates can use the app without entering API keys here."}
          </div>
        </div>

        {isLabely ? (
          <div className="mt-3 space-y-2">
          <div className="rounded-xl border border-violet-500/35 bg-violet-500/12 px-3 py-2.5">
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={!!config.labelyAiProducts}
                onClick={() => updateConfig("labelyAiProducts", !config.labelyAiProducts)}
                className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${
                  config.labelyAiProducts ? "bg-violet-500" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    config.labelyAiProducts ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white/90">AI-generated products (junk-food / grocery style)</div>
                <p className="mt-1 text-[10px] leading-relaxed text-white/45">
                  On: no photo uploads — GPT chooses real brands/SKUs (from your seed list when present), same fictional scanner compounds in analysis, plus a generated pack image. Off: upload real packaging photos and vision reads each label (current default).
                </p>
              </div>
            </div>
          </div>
          {config.labelyAiProducts ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!config.labelyUseFoodDatabasePhotos}
                  onClick={() => updateConfig("labelyUseFoodDatabasePhotos", !config.labelyUseFoodDatabasePhotos)}
                  className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${
                    config.labelyUseFoodDatabasePhotos ? "bg-emerald-500" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      config.labelyUseFoodDatabasePhotos ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white/90">Use food database photos</div>
                  <p className="mt-1 text-[10px] leading-relaxed text-white/45">
                    Searches Open Food Facts for a real package photo from the chosen food name. If there is no usable match, the image is left blank and a similar database item is recommended below.
                </p>
              </div>
            </div>
            </div>
          ) : null}
          </div>
        ) : null}

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
              <code className="text-white/50">{referencesDirLabel}</code>{" "}
              — used as the reference style for AI generations.
            </span>
          ) : (
            <span>
              Add a PNG/JPEG to{" "}
              <code className="text-white/50">{referencesDirLabel}</code>
              {brand.appId === "valcoin"
                ? " (e.g. a coin-on-table macro style reference) to lock the Valcoin look."
                : brand.appId === "labely"
                ? " (e.g. shelf lighting / pack styling you like) so AI pack shots echo that look."
                : " (e.g. messy clothes in a blue cart) to lock the buggy aesthetic."}
            </span>
          )}
        </div>}
        {/* Labely AI: same role as Thrifty “Brand Items List” — seeds packaged-food generations */}
        {isLabely && config.labelyAiProducts ? (
          <div className="mt-3 bg-white/4 border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <Label>Food &amp; drink list</Label>
              {mounted && (isLabelyFoodDbBatchMode ? totalBatchSlideshows > 0 : brandItems.length > 0) && (
                <span className="text-violet-300 text-[10px] font-medium">
                  {isLabelyFoodDbBatchMode
                    ? `${totalBatchSlideshows} slideshow${totalBatchSlideshows > 1 ? "s" : ""}`
                    : `${brandItems.length} item${brandItems.length > 1 ? "s" : ""}`}
                </span>
              )}
            </div>
            <p className="text-white/35 text-[10px] mb-2 leading-relaxed">
              {config.labelyUseFoodDatabasePhotos
                ? "Search Open Food Facts, choose the exact package match, then it is added to this list."
                : "One real packaged product per line — same idea as Thrifty's brand list. Generate picks from this list (shuffled); GPT uses that real SKU for name/brand/pack image while analysis still uses fictional scanner compound names."}
            </p>
            {isLabelyFoodDbBatchMode ? (
              <div className="space-y-2">
                {labelyFoodDbBatches.map((batch, idx) => (
                  <div key={batch.id} className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 p-2">
                    {(() => {
                      const batchItems = String(batch.itemsRaw || "")
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean);
                      const savedPhotoCount = batchItems.filter((item) => foodDbImageUrlForItem(item, batch.foodDbMatches)).length;
                      const missingPhotoCount = Math.max(0, batchItems.length - savedPhotoCount);
                      return (
                        <>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={batch.name}
                        onChange={(e) => updateLabelyFoodDbBatch(idx, { name: e.target.value.slice(0, 42) })}
                        placeholder={`Food database batch ${idx + 1}`}
                        className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/25 px-2 py-1 text-[11px] font-semibold text-emerald-100 outline-none placeholder-emerald-200/35 focus:border-emerald-400/60"
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white/35">slideshows</span>
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={batch.slideshowCount}
                          onChange={(e) => updateLabelyFoodDbBatch(idx, { slideshowCount: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })}
                          className="w-16 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-center text-[11px] text-white outline-none focus:border-emerald-400/60"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="relative">
                        <input
                          type="text"
                          value={batchFoodDbSearch[batch.id] ?? ""}
                          onChange={(e) => handleBatchFoodDbSearchChange(idx, e.target.value)}
                          onKeyDown={(e) => {
                            const opts = batchFoodDbSearchOptions[batch.id] || [];
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            if (opts[0]?.label && (batchFoodDbSearchStatus[batch.id] || "idle") === "done") {
                              addBatchFoodListItem(idx, opts[0].label, opts[0]);
                            } else {
                              void runBatchFoodDbSearch(idx);
                            }
                          }}
                          placeholder="Type product, then press Enter to search…"
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] text-white outline-none placeholder-white/20 focus:border-emerald-400/60"
                        />
                        {(batchFoodDbSearch[batch.id] || "").trim().length >= 2 ? (
                          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-44 overflow-y-auto rounded-lg border border-emerald-500/25 bg-zinc-950 shadow-xl">
                            {(batchFoodDbSearchStatus[batch.id] || "idle") === "idle" ? (
                              <div className="px-3 py-2 text-[10px] text-white/35">Press Enter to search Open Food Facts.</div>
                            ) : (batchFoodDbSearchStatus[batch.id] || "idle") === "loading" ? (
                              <div className="px-3 py-2 text-[10px] text-white/35">Searching Open Food Facts…</div>
                            ) : (batchFoodDbSearchOptions[batch.id] || []).length > 0 ? (
                              (batchFoodDbSearchOptions[batch.id] || []).map((option) => (
                                <button
                                  key={`${batch.id}-${option.label}`}
                                  type="button"
                                  onClick={() => addBatchFoodListItem(idx, option.label, option)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-emerald-500/15"
                                >
                                  <span className="min-w-0 flex-1 text-[11px] leading-snug text-white/75">
                                    {option.label}
                                  </span>
                                  <FoodDbDropdownRowThumb row={option} />
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-[10px] text-red-300/80">
                                {(batchFoodDbSearchStatus[batch.id] || "idle") === "error" ? "Search failed. Try again." : "No database matches yet."}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                      {String(batch.itemsRaw || "").split("\n").map((line) => line.trim()).filter(Boolean).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {String(batch.itemsRaw || "").split("\n").map((line) => line.trim()).filter(Boolean).map((item) => (
                            <button
                              key={`${batch.id}-${item}`}
                              type="button"
                              onClick={() => removeBatchFoodListItem(idx, item)}
                              className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-100 hover:bg-red-500/15 hover:text-red-200"
                              title="Remove from batch"
                            >
                              {item} ×
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-white/30">Add one or more matched products to this batch.</p>
                      )}
                      <p className="text-[10px] text-white/30">
                        Items in this batch generate only this batch&apos;s slideshows.
                      </p>
                      <div className="rounded-md border border-emerald-500/15 bg-black/15 p-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/80">
                            Saved package photos
                          </span>
                          <span className="text-[10px] text-white/35">
                            {savedPhotoCount}/{batchItems.length || 0} saved
                          </span>
                        </div>
                        {missingPhotoCount > 0 ? (
                          <p className="text-[10px] text-amber-300/85">
                            {missingPhotoCount} item{missingPhotoCount === 1 ? "" : "s"} need a saved photo. Search and select an exact database result above.
                          </p>
                        ) : batchItems.length > 0 ? (
                          <p className="text-[10px] text-emerald-300/75">Ready. Generation uses these saved photo URLs directly.</p>
                        ) : null}
                        {batchItems.length > 0 ? (
                          <div className="mt-1.5 space-y-1">
                            {batchItems.slice(0, 10).map((item) => {
                              const hasPhoto = Boolean(foodDbImageUrlForItem(item, batch.foodDbMatches));
                              return (
                                <div key={`${batch.id}-match-${item}`} className="flex items-center justify-between gap-2 rounded-md bg-black/15 px-2 py-1.5">
                                  <span className="min-w-0 truncate text-[10px] text-white/55">{item}</span>
                                  {hasPhoto ? (
                                    <span className="shrink-0 text-[10px] font-semibold text-emerald-300">Photo saved</span>
                                  ) : (
                                    <span className="shrink-0 text-[10px] text-amber-300/80">Needs photo</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-1 text-[10px] text-white/30">Search and select products to save package photos.</p>
                        )}
                      </div>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : config.labelyUseFoodDatabasePhotos ? (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={foodDbSearch}
                    onChange={(e) => {
                      setFoodDbSearch(e.target.value);
                      if (e.target.value.trim().length < 2) {
                        setFoodDbSearchOptions([]);
                        setFoodDbSearchStatus("idle");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (foodDbSearchOptions[0]?.label && foodDbSearchStatus === "done") {
                        addFoodListItem(foodDbSearchOptions[0].label);
                      } else {
                        void runFoodDbSearch();
                      }
                    }}
                    placeholder="Type product, then press Enter to search…"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none placeholder-white/15 focus:border-emerald-400/60"
                  />
                  {foodDbSearch.trim().length >= 2 ? (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-emerald-500/25 bg-zinc-950 shadow-xl">
                      {foodDbSearchStatus === "idle" ? (
                        <div className="px-3 py-2 text-[10px] text-white/35">Press Enter to search Open Food Facts.</div>
                      ) : foodDbSearchStatus === "loading" ? (
                        <div className="px-3 py-2 text-[10px] text-white/35">Searching Open Food Facts…</div>
                      ) : foodDbSearchOptions.length > 0 ? (
                        foodDbSearchOptions.map((option) => (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => addFoodListItem(option.label)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-emerald-500/15"
                          >
                            <span className="min-w-0 flex-1 text-[11px] leading-snug text-white/75">
                              {option.label}
                            </span>
                            <FoodDbDropdownRowThumb row={option} />
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-[10px] text-red-300/80">
                          {foodDbSearchStatus === "error" ? "Search failed. Try again." : "No database matches yet."}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                {brandItems.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {brandItems.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => removeFoodListItem(item)}
                        title="Remove from list"
                        className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-100 hover:bg-red-500/15 hover:text-red-200"
                      >
                        {item} ×
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/25 text-[10px]">
                    Select one or more database products above before generating.
                  </p>
                )}
              </div>
            ) : (
              <>
            <textarea
              value={brandItemsRaw}
              onChange={(e) => {
                setBrandItemsRaw(e.target.value);
                localStorage.setItem(storeKey("ts_brand_items"), e.target.value);
              }}
              placeholder={DEFAULT_LABELY_ITEMS}
              rows={6}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-violet-500/60 placeholder-white/15 resize-none"
            />
            <p className="text-white/25 text-[10px] mt-1">
              Snacks, drinks, frozen, supplements — be specific (brand + product type). Leave empty to use the built-in grocery starter list.
            </p>
              </>
            )}
            {config.labelyUseFoodDatabasePhotos && !isLabelyFoodDbBatchMode ? (
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/8 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/80">
                    Food database matches
                  </span>
                  <span className="text-[10px] text-white/30">
                    {foodDbSuggestionStatus === "loading" ? "Checking…" : `${brandItems.length} checked`}
                  </span>
                </div>
                {foodDbSuggestionStatus === "error" ? (
                  <p className="text-[10px] text-amber-300">Could not check Open Food Facts right now.</p>
                ) : brandItems.length > 0 ? (
                  <div className="space-y-1.5">
                    {brandItems.slice(0, 10).map((item) => {
                      const row = foodDbSuggestionsByQuery.get(item);
                      return (
                        <div key={item} className="flex items-center justify-between gap-2 rounded-md bg-black/15 px-2 py-1.5">
                          <span className="min-w-0 truncate text-[10px] text-white/55">{item}</span>
                          {!row || foodDbSuggestionStatus === "loading" ? (
                            <span className="shrink-0 text-[10px] text-white/30">Checking…</span>
                          ) : row.status === "found" || row.status === "recommend" ? (
                            <div className="flex min-w-0 shrink-0 items-center gap-1.5">
                              <span className={`text-[10px] font-semibold ${row.status === "found" ? "text-emerald-300" : "text-amber-200"}`}>
                                {row.status === "found" ? "Match" : "Try"}
                              </span>
                              <select
                                value={row.status === "found" ? row.match : row.suggestion}
                                onChange={(e) => applyFoodDbCandidate(item, e.target.value)}
                                className="max-w-[220px] rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white/80 outline-none focus:border-emerald-400/60"
                                title="Choose the database product for this line"
                              >
                                {(row.candidates?.length ? row.candidates : [row.match || row.suggestion]).filter(Boolean).map((candidate) => (
                                  <option key={candidate} value={candidate}>{candidate}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <span className="shrink-0 text-[10px] text-red-300/80">No database photo</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-white/30">Type food names to check Open Food Facts.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {/* Image slots (all brands): qty × slots per show rows + brand list for Thrifty / Valcoin AI */}
        <div className="mt-3 bg-white/4 border border-white/10 rounded-xl p-3">
          {/* SSR + first paint: plain Label only (matches Hook Captions / reference-status hydration pattern). */}
          {mounted ? (
            <div className="flex items-start justify-between gap-2 mb-1">
              <Label className="!mb-0">Image slots</Label>
              {!labelyUploadsLocked && hasWorkspacePhotos ? (
                <button
                  type="button"
                  disabled={generatingSlot !== null}
                  onClick={clearAllWorkspacePhotos}
                  title="Remove every uploaded photo from batch rows and live preview slots"
                  className="shrink-0 rounded-md border border-red-500/35 bg-red-500/10 px-2 py-1 text-[10px] font-bold tracking-wide text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                >
                  Clear all photos
                </button>
              ) : null}
            </div>
          ) : (
            <Label>Image slots</Label>
          )}
          <p className="text-white/35 text-[10px] mb-2 leading-relaxed">
            <span className="text-white/50">{batchImagesNeeded}</span> rows = <span className="text-white/50">{effectiveNumSlideshows}</span> slideshow
            {effectiveNumSlideshows !== 1 ? "s" : ""} × {batchSlotCount} photo{batchSlotCount !== 1 ? "s" : ""} each. Drag{" "}
            <span className="text-white/50">⋮⋮</span> to reorder. Drop a photo or pick a file per row.
            {labelyUploadsLocked
              ? " AI mode is on — uploads are disabled; run Generate to fill slots."
              : isLabely
              ? isLabelyScanTourFormat(config)
                ? ` Scan tour uses the first ${LABELY_SCAN_TOUR_SLOTS} rows as slides 1–${LABELY_SCAN_TOUR_SLOTS} (export: scan → Labely per slide). Enable AI-generated products for auto packshots, or upload three photos.`
                : isLabelySingleSlideFormat(config)
                ? " One row = one photo for your single Labely slide (preview analyzes slot 1). Toggle AI-generated products off if you want uploads only."
                : " Labely analyzes rows 1–6 (live preview); rows 7+ are analyzed when you run batch. Upload photos per row or use AI-generated products."
              : " Rows 1–6 match the live preview. AI uses the brand list for any row left empty when generating."}
          </p>

          <div className="mb-3 flex flex-col items-center gap-2">
            <input
              ref={bulkFileInputRef}
              type="file"
              accept={IMAGE_FILE_ACCEPT}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              disabled={generatingSlot !== null || labelyUploadsLocked}
              onChange={(e) => {
                const files = [...(e.target.files || [])];
                e.target.value = "";
                if (files.length) void handleBulkImageFiles(files, { replace: true });
              }}
            />
            <button
              type="button"
              disabled={generatingSlot !== null || labelyUploadsLocked}
              onClick={() => bulkFileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setBulkDropHover(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget)) setBulkDropHover(false);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setBulkDropHover(false);
                    if (labelyUploadsLocked) return;
                    if (e.dataTransfer.files?.length) void handleBulkImageFiles(e.dataTransfer.files, { replace: true });
                  }}
                  className={`flex aspect-square w-full max-w-[200px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-3 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                labelyUploadsLocked
                  ? ""
                  : "cursor-pointer "
              }${
                bulkDropHover
                  ? "border-violet-400 bg-violet-500/15 text-violet-100"
                  : "border-white/22 bg-white/[0.04] text-white/50 hover:border-white/40 hover:bg-white/[0.07]"
              }`}
              aria-label="Drop multiple images to randomly assign across slideshow rows, or click to choose files"
            >
              <span className="text-2xl leading-none" aria-hidden>
                ⤓
              </span>
              <span className="text-[11px] font-semibold leading-tight">Bulk drop photos</span>
              <span className="text-[9px] leading-snug text-white/35">
                Photos shuffle into random rows across slideshows (#1·1 …). Extra photos raise slideshow qty automatically.
              </span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-[min(70vh,520px)] overflow-y-auto pr-0.5">
            {Array.from({ length: batchImagesNeeded }, (_, rowIdx) => {
              const showNum = Math.floor(rowIdx / batchSlotCount) + 1;
              const slotInShow = (rowIdx % batchSlotCount) + 1;
              const url =
                (rowIdx < batchImageDataUrls.length ? batchImageDataUrls[rowIdx] : null)
                ?? (rowIdx < 6 ? config.slots[rowIdx]?.imageUrl : null);
              return (
                <div
                  key={rowIdx}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = e.dataTransfer.types?.includes?.("Files") ? "copy" : "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (isLikelyRasterImageFile(file)) {
                      if (labelyUploadsLocked) return;
                      if (isLabely) void handleLabelySlotUpload(rowIdx, file);
                      else void handleThriftyValcoinSlotFile(rowIdx, file);
                      return;
                    }
                    const raw = e.dataTransfer.getData("text/plain");
                    if (raw?.startsWith("batch-reorder:")) {
                      const from = Number(raw.slice("batch-reorder:".length));
                      if (!Number.isNaN(from)) reorderBatchRows(from, rowIdx);
                    }
                  }}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-white/6 bg-black/20 px-2 py-1.5 min-h-[40px]"
                >
                  <button
                    type="button"
                    title="Drag to reorder"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", `batch-reorder:${rowIdx}`);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="touch-none cursor-grab active:cursor-grabbing text-white/30 hover:text-white/55 text-xs font-bold px-1 shrink-0 select-none leading-none"
                    aria-label={`Drag to reorder row ${rowIdx + 1}`}
                  >
                    ⋮⋮
                  </button>
                  <span className="text-white/30 text-[9px] w-[52px] shrink-0 tabular-nums leading-tight">
                    #{showNum}·{slotInShow}
                  </span>
                  <div className="h-9 w-9 shrink-0 rounded-md overflow-hidden bg-white/5 border border-white/10">
                    {url ? <img src={url} alt="" className="h-full w-full object-contain object-center" /> : null}
                  </div>
                  <input
                    type="file"
                    accept={IMAGE_FILE_ACCEPT}
                    disabled={generatingSlot !== null || labelyUploadsLocked}
                    className="text-white/50 text-[11px] max-w-[200px] min-w-0 flex-1 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-white/10 file:text-white/80 disabled:opacity-40"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (isLabely) void handleLabelySlotUpload(rowIdx, f);
                      else void handleThriftyValcoinSlotFile(rowIdx, f);
                      e.target.value = "";
                    }}
                  />
                  {url && generatingSlot !== rowIdx ? (
                    <span className="text-emerald-400/90 text-[10px] font-medium shrink-0">Ready</span>
                  ) : null}
                  {generatingSlot === rowIdx ? (
                    <span className="text-violet-300 text-[10px] shrink-0">{isLabely ? "Analyzing…" : "Working…"}</span>
                  ) : null}
                  {aiErrors[rowIdx] ? (
                    <span className="text-red-400/90 text-[10px] shrink-0 max-w-[140px]">{aiErrors[rowIdx]}</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!isLabely ? (
            <>
              <div className="flex items-center justify-between mb-1 mt-4">
                <Label>Brand Items List</Label>
                {mounted && brandItems.length > 0 && (
                  <span className="text-violet-300 text-[10px] font-medium">{brandItems.length} item{brandItems.length > 1 ? "s" : ""}</span>
                )}
              </div>
              <textarea
                value={brandItemsRaw}
                onChange={(e) => {
                  setBrandItemsRaw(e.target.value);
                  localStorage.setItem(storeKey("ts_brand_items"), e.target.value);
                }}
                placeholder={
                  isValcoin
                    ? VALUABLE_US_COINS.slice(0, 8).join("\n")
                    : "vintage Carhartt double-knee pants\nSupreme box logo hoodie\nvintage Levi's 501\nKapital boro jacket\nvintage Nike windbreaker"
                }
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-violet-500/60 placeholder-white/15 resize-none"
              />
              <p className="text-white/25 text-[10px] mt-1">
                {isValcoin
                  ? "Coins — one per line. Each AI slot picks a different valuable US coin (or your custom list)."
                  : "Clothing only — one garment per line. Each AI slot gets a different piece from this list."}
              </p>
            </>
          ) : null}
        </div>

        <div className="mt-2 flex gap-2">
          <button onClick={handleGenerateAll} disabled={generatingSlot !== null}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
            {generatingSlot === "all"
              ? "Generating…"
              : isLabely
              ? config.labelyAiProducts
                ? "✨ Generate 1 Slideshow (AI products)"
                : "✨ Generate 1 Slideshow (analyze uploads)"
              : "✨ Generate 1 Slideshow"}
          </button>
          {generatingSlot === "all" && (
            <button
              onClick={hardStop}
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
            {!isLabelyFoodDbBatchMode ? (
            <div className="flex items-center gap-1.5">
              <span className="text-white/30 text-[11px]">qty</span>
              <input
                type="number" min={1} max={50}
                value={numSlideshows}
                onChange={(e) => setNumSlideshows(Math.max(1, Math.min(50, Number(e.target.value))))}
                className="w-14 bg-white/8 border border-white/15 rounded-lg px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-violet-500/60"
              />
            </div>
            ) : (
              <span className="text-emerald-200/80 text-[11px] font-semibold">{effectiveNumSlideshows} total</span>
            )}
          </div>
          <div className="mb-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
            <div className="text-white/45 text-[10px] font-semibold mb-1">Bulk fill rows (optional)</div>
            <p className="text-white/30 text-[10px] leading-relaxed mb-2">
              Multi-select merges into existing rows (same qty). The square above replaces from row 1 and raises qty if you drop more photos than fit.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept={IMAGE_FILE_ACCEPT}
                multiple
                disabled={generatingSlot !== null || labelyUploadsLocked}
                className="text-white/50 text-[11px] flex-1 min-w-0 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-white/10 file:text-white/80 disabled:opacity-40"
                onChange={(e) => {
                  const files = [...(e.target.files || [])];
                  e.target.value = "";
                  if (files.length) void handleBulkImageFiles(files, { replace: false });
                }}
              />
              {hasWorkspacePhotos ? (
                <button
                  type="button"
                  disabled={generatingSlot !== null || labelyUploadsLocked}
                  onClick={clearAllWorkspacePhotos}
                  className="shrink-0 text-[10px] font-semibold text-red-400/90 hover:text-red-300 disabled:opacity-40"
                >
                  Clear all photos
                </button>
              ) : null}
            </div>
            <p className="text-white/35 text-[10px] mt-1.5">
              <span className="text-violet-300/90 font-medium">{batchImageDataUrls.filter(Boolean).length}</span> /{" "}
              {batchImagesNeeded} with photos
              {!isLabely && batchImageDataUrls.some(Boolean) && batchImageDataUrls.filter(Boolean).length < batchImagesNeeded ? (
                <span className="text-amber-400/80"> · empty rows use AI in batch (Thrifty/Valcoin)</span>
              ) : null}
            </p>
          </div>
          <button
            onClick={handleGenerateBatch}
            disabled={
              generatingSlot !== null
              || (isLabelyFoodDbBatchMode && effectiveNumSlideshows <= 0)
              || (isLabely && !config.labelyAiProducts && !batchImageDataUrls.some(Boolean))
              || (!isLabely && brandItems.length === 0 && !batchImageDataUrls.some(Boolean))
            }
            className="w-full py-2.5 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
          >
            {generatingSlot === "all" ? "Generating…" : `🎬 Generate ${effectiveNumSlideshows} Slideshow${effectiveNumSlideshows > 1 ? "s" : ""}`}
          </button>
          {!isLabely && (
          <p className="text-white/25 text-[10px] mt-1.5 text-center">
            {(() => {
              const isMom = (config.outputFormat ?? "standard") === "imessageMom";
              const imgs = isMom ? 1 : 6;
              const cost = imageModel === "gpt-image-1" ? 0.015 * imgs : 0.07 * imgs;
              return `est. $${(numSlideshows * cost).toFixed(2)} if all slots are AI · less when uploads fill the queue · each goes to gallery on the right`;
            })()}
          </p>
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
        {savedSlideshows.length >= 2 ? (
          <>
            {hasSavedLabelySlideshows ? (
              <button
                type="button"
                onClick={handleFixBlankLabelyPhotos}
                disabled={isExporting}
                className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
              >
                Check / fix blank photos
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleExportAllVideos}
              disabled={isExporting}
              className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
            >
              📦 Export all gallery videos
            </button>
            <button
              type="button"
              onClick={handleExportVideo}
              disabled={isExporting}
              className="w-full py-2 rounded-xl bg-white/6 hover:bg-white/10 disabled:opacity-40 text-white/70 text-xs font-medium border border-white/10 transition-colors"
            >
              Export current workspace only
            </button>
            <p className="text-white/25 text-[10px] text-center leading-relaxed">
              {`Batch galleries (food DB mode): downloads ${GALLERY_IPHONE_DEVICE_COUNT} iPhone ZIPs, each with ${LABELY_DB_BATCH_COUNT} unique videos (one per batch). Needs at least ${GALLERY_IPHONE_DEVICE_COUNT} videos per batch. Other galleries download separate .mp4 files.`}
            </p>
          </>
        ) : (
        <button onClick={handleExportVideo} disabled={isExporting}
          className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
            🎬 Export full video (.mp4)
        </button>
        )}
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
