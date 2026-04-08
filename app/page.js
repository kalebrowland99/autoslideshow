"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import VideoPreview from "@/components/VideoPreview";
import ConfigPanel from "@/components/ConfigPanel";
import { getTotalSlides } from "@/lib/slideLayout";

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
  outputFormat: "standard", // "standard" | "appOnly" | "posePerson" | "imessageMom"
  /** Changed each generation so every export has unique pixel-level layout (anti-fingerprint). */
  jitterSeed: 0,
  /** @type {{ id: string, dataUrl: string }[]} */
  poseReferenceImages: [],
};

export default function Home() {
  const [config, setConfig] = useState(defaultConfig);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const refreshHandlerRef = useRef(null);

  // ── Batch slideshow gallery ──────────────────────────────────────────────────
  const [savedSlideshows, setSavedSlideshows] = useState([]);
  const [activeShowIdx, setActiveShowIdx] = useState(null);

  const handleSlideshowSaved = useCallback((showData) => {
    setSavedSlideshows((prev) => {
      const next = [...prev, showData];
      setActiveShowIdx(next.length - 1);
      return next;
    });
  }, []);

  const loadShow = useCallback((showData, idx) => {
    setConfig((prev) => ({
      ...prev,
      slots: showData.slots,
      captionText: showData.captionText,
      ...(showData.outputFormat != null ? { outputFormat: showData.outputFormat } : {}),
    }));
    setActiveShowIdx(idx);
    setCurrentSlide(0);
  }, []);

  const totalSlides = useMemo(() => getTotalSlides(config), [config]);

  const updateConfig = useCallback((key, value) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
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
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-white font-bold text-lg tracking-tight">Thrifty Slideshows</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/30 text-xs">
            Slide {currentSlide + 1} / {totalSlides}
          </span>
          <span className="text-white/40 text-sm">Video Generator</span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[420px] border-r border-white/10 overflow-y-auto shrink-0">
          <ConfigPanel
            config={config}
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
            savedSlideshows={savedSlideshows}
          />
        </aside>

        <main className="flex-1 flex items-center justify-center p-8 overflow-auto bg-[#080808]">
          <div className="flex flex-col items-center gap-4">
            <p className="text-white/40 text-xs uppercase tracking-widest">Live Preview</p>
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

        {/* ── Slideshow gallery panel ─────────────────────────────────────────── */}
        {savedSlideshows.length > 0 && (
          <aside className="w-[252px] border-l border-white/10 overflow-y-auto shrink-0 bg-[#0a0a0a]">
            <div className="p-3">
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-[#0a0a0a] py-1 z-10">
                <span className="text-white/50 text-[11px] font-semibold uppercase tracking-wider">
                  Slideshows
                </span>
                <span className="text-violet-400 text-[11px] font-semibold">
                  {savedSlideshows.length} ready
                </span>
              </div>
              <div className="space-y-2.5">
                {savedSlideshows.map((show, idx) => (
                  <button
                    key={idx}
                    onClick={() => loadShow(show, idx)}
                    className={`w-full rounded-xl overflow-hidden border transition-all text-left ${
                      activeShowIdx === idx
                        ? "border-violet-500 ring-1 ring-violet-500/40"
                        : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    {show.previewScreenshot ? (
                      <div className="bg-black/80">
                        <div className="relative bg-black" style={{ aspectRatio: "9 / 16" }}>
                          <img
                            src={show.previewScreenshot}
                            alt={show.captionText ? `Preview of ${show.captionText}` : `Preview of slideshow ${idx + 1}`}
                            className="w-full h-full object-cover block"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-px bg-black/60">
                        {show.slots.map((slot, i) => (
                          <div key={i} className="relative overflow-hidden bg-zinc-900" style={{ aspectRatio: "3/4" }}>
                            {slot.imageUrl
                              ? <img src={slot.imageUrl} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center">
                                  <span className="text-white/15 text-[10px]">{i + 1}</span>
                                </div>
                            }
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Card footer */}
                    <div className="px-2.5 py-2 bg-zinc-900/80">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-semibold ${activeShowIdx === idx ? "text-violet-400" : "text-white/30"}`}>
                          #{idx + 1}
                        </span>
                        {activeShowIdx === idx && (
                          <span className="text-[9px] text-violet-400 font-medium">● active</span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/60 truncate mt-0.5 leading-tight">
                        {show.captionText || `Slideshow ${idx + 1}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
