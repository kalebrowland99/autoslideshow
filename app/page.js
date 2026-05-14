"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import VideoPreview from "@/components/VideoPreview";
import LabelyScanSequencePreview from "@/components/LabelyScanSequencePreview";
import ConfigPanel from "@/components/ConfigPanel";
import GalleryRail from "@/components/GalleryRail";
import { getTotalSlides } from "@/lib/slideLayout";
import {
  mergePersistedConfig,
  readHomeSession,
  writeHomeSession,
} from "@/lib/homeSessionStorage";
import { initFirebaseWebAnalytics, isFirebaseConfigured } from "@/lib/firebaseClient";
export const emptySlot = (i) => ({
  imageUrl: null,
  prompt: "",
  itemName: `Item ${i + 1}`,
  spentPrice: "",
  soldPrice: "",
  date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  matchItems: [
    { title: "", source: "eBay", price: "", inStock: true },
    { title: "", source: "Poshmark", price: "", inStock: true },
  ],
  // Reveal slide caption style (mirrors collage caption design)
  revealCaptionBg:       "#000000",
  revealCaptionColor:    "#ffffff",
  revealCaptionPosition: "bottom",   // "top" | "middle" | "bottom"
  revealCaptionSize:     72,
  revealCaptionBold:     true,
  // Thrifty slide caption (mirrors collage caption design)
  thriftyCaptionText:     "",        // auto-generated from prices if empty
  thriftyCaptionBg:       "",   // empty = randomise per render
  thriftyCaptionColor:    "",   // empty = randomise per render
  thriftyCaptionPosition: "top",     // "top" | "middle" | "bottom"
  thriftyCaptionSize:     72,
  thriftyCaptionBold:     true,
  /** iMessage mom — voicemail slide transcript (empty → auto from item name) */
  voicemailTranscript: "",
  /** iMessage mom — AI-generated text thread [{from:"mom"|"son", text:string}] (null → seeded fallback) */
  imessageThread: null,
  /** Labely (nutrition-style UI) — filled when appId is labely */
  labelyBrand: "",
  labelyScore: 0,
  labelyVerdict: "",
  labelyAnalysis: "",
  labelyAnalysisTitle: "Labely's Analysis",
  labelyLegalNote: "No lawsuits found.",
});

export const defaultConfig = {
  // Slide 1 — collage caption overlay
  captionText: "My top 6 Most Favorite\nGoodwill Finds",
  captionStyle: "tiktok",      // "tiktok" | "tickerBox"
  captionBg: "#e03030",
  captionColor: "#ffffff",
  captionPosition: "middle",
  captionBold: true,

  // 6 image slots
  slots: Array.from({ length: 6 }, (_, i) => emptySlot(i)),

  // Video settings
  slideDuration: 2,    // seconds per slide
  transitionMs: 220,   // swipe transition duration ms

  /** Shown on iMessage-mom slides (TikTok-style corner). Empty → "@mom". */
  tiktokWatermark: "",
  /** Voicemail caller ID override (iMessage mom format). Empty → dynamic contact name. */
  voicemailDisplayNumber: "",
  /** Add a random track from public/audio/ to the exported video. */
  useRandomAudio: false,
  outputFormat: "standard", // "standard" | "appOnly" | … | "labelyOnly" | "labelyScan" (Labely app)
  appId: "thrifty", // "thrifty" | "valcoin" | "labely"
  /** Headline text shown at the top of the Starter Pack slide */
  starterPackHeadline: "",
  /** Changed each generation so every export has unique pixel-level layout (anti-fingerprint). */
  jitterSeed: 0,
  /** @type {{ id: string, dataUrl: string }[]} */
  poseReferenceImages: [],

  /** Labely only: true = AI-generated packaged-food cards + product images (no uploads). false = vision + uploads (current default). */
  labelyAiProducts: false,
  /** Labely AI-products only: use Open Food Facts package photos before falling back to generated images. */
  labelyUseFoodDatabasePhotos: false,
  /** Labely DB photo mode: six isolated generation batches. */
  labelyFoodDbBatches: Array.from({ length: 6 }, (_, i) => ({
    id: `batch-${i + 1}`,
    name: `Food database batch ${i + 1}`,
    itemsRaw: "",
    slideshowCount: 1,
  })),
};

export default function Home() {
  const [config, setConfig] = useState(defaultConfig);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const refreshHandlerRef = useRef(null);
  /** Skip persisting until the first restore from localStorage has finished (avoids overwriting with defaults). */
  const skipSaveUntilHydrated = useRef(true);

  // ── Batch slideshow gallery ──────────────────────────────────────────────────
  const [savedSlideshows, setSavedSlideshows] = useState([]);
  const [activeShowIdx, setActiveShowIdx] = useState(null);
  /** Batch generator slideshow count (persisted with home session). */
  const [numSlideshows, setNumSlideshows] = useState(3);
  /** Flat queue of workspace photos across all batch rows (persisted; fixes refresh blanks). */
  const [batchImageDataUrls, setBatchImageDataUrls] = useState([]);
  /** Firebase anonymous uid once signed in; enables cloud backup saves. */
  const [cloudUid, setCloudUid] = useState(null);
  const [cloudStatus, setCloudStatus] = useState("");

  useEffect(() => {
    void initFirebaseWebAnalytics();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applySnapshot = (raw) => {
      let merged = defaultConfig;
      if (raw?.config && typeof raw.config === "object") {
        merged = mergePersistedConfig(defaultConfig, emptySlot, raw.config);
        setConfig(merged);
      }
      if (Array.isArray(raw?.savedSlideshows)) {
        setSavedSlideshows(raw.savedSlideshows);
      }
      const maxSlide = Math.max(0, getTotalSlides(merged) - 1);
      const cs = typeof raw?.currentSlide === "number" ? raw.currentSlide : 0;
      setCurrentSlide(Math.min(Math.max(0, cs), maxSlide));
      if (typeof raw?.activeShowIdx === "number" && raw.activeShowIdx >= 0) {
        const n = Array.isArray(raw.savedSlideshows) ? raw.savedSlideshows.length : 0;
        setActiveShowIdx(n > 0 ? Math.min(raw.activeShowIdx, n - 1) : null);
      } else {
        setActiveShowIdx(null);
      }
      if (typeof raw?.numSlideshows === "number" && raw.numSlideshows >= 1 && raw.numSlideshows <= 50) {
        setNumSlideshows(raw.numSlideshows);
      }
      if (Array.isArray(raw?.batchImageDataUrls)) {
        setBatchImageDataUrls(raw.batchImageDataUrls.map((x) => (typeof x === "string" && x.trim() ? x : null)));
      }
      return merged;
    };

    (async () => {
      try {
        const raw = readHomeSession();
        const localSavedAt = typeof raw?.savedAt === "number" ? raw.savedAt : 0;
        if (raw) {
          applySnapshot(raw);
        }

        if (!isFirebaseConfigured()) {
          return;
        }

        const { signInFirebaseAnonymously, loadHomeSessionRemote } = await import("@/lib/firebaseHomeSession");
        const uid = await signInFirebaseAnonymously();
        if (cancelled || !uid) {
          return;
        }
        if (!cancelled) setCloudUid(uid);

        const remote = await loadHomeSessionRemote(uid);
        if (cancelled) return;
        if (!remote) {
          setCloudStatus("Firebase backup ready");
          return;
        }
        const remoteAt = typeof remote.savedAt === "number" ? remote.savedAt : 0;
        if (remoteAt > localSavedAt) {
          const snap = {
            config: remote.config,
            savedSlideshows: remote.savedSlideshows,
            currentSlide: remote.currentSlide,
            activeShowIdx: remote.activeShowIdx,
            numSlideshows: remote.numSlideshows,
            batchImageDataUrls: remote.batchImageDataUrls,
            savedAt: remote.savedAt,
          };
          const mergedRemote = applySnapshot(snap);
          const galleryLen = Array.isArray(remote.savedSlideshows) ? remote.savedSlideshows.length : 0;
          const clampedActive =
            typeof remote.activeShowIdx === "number" && remote.activeShowIdx >= 0 && galleryLen > 0
              ? Math.min(remote.activeShowIdx, galleryLen - 1)
              : null;
          const maxSlideRemote = Math.max(0, getTotalSlides(mergedRemote) - 1);
          const clampedSlide = Math.min(
            Math.max(0, typeof remote.currentSlide === "number" ? remote.currentSlide : 0),
            maxSlideRemote
          );
          writeHomeSession({
            v: 1,
            config: mergedRemote,
            savedSlideshows: remote.savedSlideshows,
            activeShowIdx: clampedActive,
            currentSlide: clampedSlide,
            numSlideshows: remote.numSlideshows,
            batchImageDataUrls: remote.batchImageDataUrls,
            savedAt: remote.savedAt,
          });
          setCloudStatus("Loaded newer session from Firebase");
        } else {
          setCloudStatus("Firebase backup ready");
        }
      } catch (e) {
        console.warn("[firebase]", e);
        if (!cancelled) setCloudStatus("Firebase unavailable");
      } finally {
        if (!cancelled) skipSaveUntilHydrated.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (skipSaveUntilHydrated.current) return;
    const savedAt = Date.now();
    const t = window.setTimeout(() => {
      writeHomeSession({
        v: 1,
        config,
        savedSlideshows,
        activeShowIdx,
        currentSlide,
        numSlideshows,
        batchImageDataUrls,
        savedAt,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [config, savedSlideshows, activeShowIdx, currentSlide, numSlideshows, batchImageDataUrls]);

  useEffect(() => {
    if (skipSaveUntilHydrated.current || !cloudUid || !isFirebaseConfigured()) return;
    const t = window.setTimeout(async () => {
      try {
        const { saveHomeSessionRemote } = await import("@/lib/firebaseHomeSession");
        await saveHomeSessionRemote(cloudUid, {
          config,
          savedSlideshows,
          activeShowIdx,
          currentSlide,
          numSlideshows,
          batchImageDataUrls,
          savedAt: Date.now(),
        });
        setCloudStatus("Backed up to Firebase");
      } catch (e) {
        console.warn("[firebase] save", e);
        setCloudStatus("Firebase backup failed");
      }
    }, 2000);
    return () => window.clearTimeout(t);
  }, [config, savedSlideshows, activeShowIdx, currentSlide, numSlideshows, batchImageDataUrls, cloudUid]);

  const handleSlideshowSaved = useCallback((showData) => {
    setSavedSlideshows((prev) => {
      const next = [...prev, showData];
      setActiveShowIdx(next.length - 1);
      return next;
    });
  }, []);

  const loadShow = useCallback((showData, idx) => {
    const isLabelyShow = showData.appId === "labely";
    setConfig((prev) => ({
      ...prev,
      slots: showData.slots,
      captionText: isLabelyShow ? "" : showData.captionText,
      ...(showData.outputFormat != null
        ? { outputFormat: showData.outputFormat }
        : isLabelyShow
          ? { outputFormat: "labelyScan" }
          : {}),
      ...(showData.appId != null ? { appId: showData.appId } : {}),
      ...(showData.jitterSeed != null ? { jitterSeed: showData.jitterSeed } : {}),
      ...(showData.labelyOutroText != null ? { labelyOutroText: showData.labelyOutroText } : {}),
      ...(showData.labelyFoodDbBatches != null ? { labelyFoodDbBatches: showData.labelyFoodDbBatches } : {}),
    }));
    setActiveShowIdx(idx);
    setCurrentSlide(0);
  }, []);

  const totalSlides = useMemo(() => getTotalSlides(config), [config]);

  const updateConfig = useCallback((key, value) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "appId" && value === "valcoin") {
        // Valcoin supports only standard + app-only.
        if (!["standard", "appOnly"].includes(next.outputFormat ?? "standard")) {
          next.outputFormat = "standard";
        }
      }
      if (key === "appId" && value !== "labely" && prev.appId === "labely") {
        if (["labelyOnly", "labelyScan"].includes(prev.outputFormat ?? "standard")) {
          next.outputFormat = "standard";
        }
      }
      if (key === "appId" && value === "labely") {
        next.captionText = "";
        const fmt = next.outputFormat ?? "standard";
        if (!["labelyOnly", "labelyScan"].includes(fmt)) {
          next.outputFormat = "labelyScan";
        }
      }
      if (key === "outputFormat") {
        const maxSlide = Math.max(0, getTotalSlides(next) - 1);
        Promise.resolve().then(() => {
          setCurrentSlide((s) => Math.min(s, maxSlide));
        });
      }
      return next;
    });
  }, []);

  const updateSlot = useCallback((index, updates) => {
    setConfig((prev) => ({
      ...prev,
      slots: prev.slots.map((s, i) => (i === index ? { ...s, ...updates } : s)),
    }));
  }, []);

  const updateMatchItem = useCallback((slotIndex, matchIndex, updates) => {
    setConfig((prev) => ({
      ...prev,
      slots: prev.slots.map((s, i) =>
        i === slotIndex
          ? {
              ...s,
              matchItems: s.matchItems.map((m, j) =>
                j === matchIndex ? { ...m, ...updates } : m
              ),
            }
          : s
      ),
    }));
  }, []);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#0f0f0f]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="relative">
              <select
                value={config.appId ?? "thrifty"}
                onChange={(e) => {
                  const nextAppId = e.target.value;
                  updateConfig("appId", nextAppId);
                }}
                className="text-white font-bold text-lg tracking-tight bg-transparent outline-none appearance-none pr-6 cursor-pointer"
                aria-label="Select app brand"
              >
                <option value="thrifty" className="bg-[#0f0f0f] text-white">Thrifty Slideshows</option>
                <option value="valcoin" className="bg-[#0f0f0f] text-white">Valcoin Slideshows</option>
                <option value="labely" className="bg-[#0f0f0f] text-white">Labely</option>
              </select>
              <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-white/60 text-xs">▼</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isFirebaseConfigured() && cloudStatus ? (
            <span className="text-emerald-400/90 text-[11px] max-w-[200px] truncate" title={cloudStatus}>
              {cloudStatus}
            </span>
          ) : null}
          <span className="text-white/30 text-xs">
            Slide {currentSlide + 1} / {totalSlides}
          </span>
          <span className="text-white/40 text-sm">Video Generator</span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <aside className="w-[420px] border-r border-white/10 overflow-y-auto shrink-0 min-h-0">
          <ConfigPanel
            config={config}
            setConfig={setConfig}
            updateConfig={updateConfig}
            updateSlot={updateSlot}
            updateMatchItem={updateMatchItem}
            currentSlide={currentSlide}
            setCurrentSlide={setCurrentSlide}
            totalSlides={totalSlides}
            isExporting={isExporting}
            setIsExporting={setIsExporting}
            exportProgress={exportProgress}
            setExportProgress={setExportProgress}
            exportStatus={exportStatus}
            setExportStatus={setExportStatus}
            onBusyChange={setIsGenerating}
            registerRefreshSlide={(fn) => { refreshHandlerRef.current = fn; }}
            onSlideshowSaved={handleSlideshowSaved}
            onSavedSlideshowsChange={setSavedSlideshows}
            activeShowIdx={activeShowIdx}
            savedSlideshows={savedSlideshows}
            numSlideshows={numSlideshows}
            setNumSlideshows={setNumSlideshows}
            batchImageDataUrls={batchImageDataUrls}
            setBatchImageDataUrls={setBatchImageDataUrls}
          />
        </aside>

        <main className="flex-1 min-h-0 min-w-0 flex items-center justify-center p-8 overflow-auto bg-[#080808]">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <p className="text-white/40 text-xs uppercase tracking-widest">Live Preview</p>
              <LabelyScanSequencePreview
                config={config}
                currentSlide={currentSlide}
                setCurrentSlide={setCurrentSlide}
                totalSlides={totalSlides}
              />
            </div>
            <VideoPreview
              config={config}
              currentSlide={currentSlide}
              setCurrentSlide={setCurrentSlide}
              totalSlides={totalSlides}
              isGenerating={isGenerating}
              onRefreshSlide={(i) => refreshHandlerRef.current?.(i)}
            />
            <p className="text-white/30 text-xs">1080 × 1920 · {totalSlides} slides · {config.slideDuration}s each</p>
          </div>
        </main>

        {/* ── Slideshow gallery panel (scrolls inside viewport; compact when many) ─ */}
        {savedSlideshows.length > 0 && (
          <GalleryRail
            savedSlideshows={savedSlideshows}
            activeShowIdx={activeShowIdx}
            loadShow={loadShow}
          />
        )}
      </div>
    </div>
  );
}
