"use client";

import { useState, useCallback, useRef } from "react";
import VideoPreview from "@/components/VideoPreview";
import ConfigPanel from "@/components/ConfigPanel";

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
});

export const defaultConfig = {
  // Slide 1 — collage caption overlay
  captionText: "My top 6 Most Favorite\nGoodwill Finds",
  captionBg: "#e03030",
  captionColor: "#ffffff",
  captionSize: 72, // in 1080px space — at preview (×0.28) = ~20px, at export (×1) = 72px
  captionPosition: "middle",
  captionBold: true,

  // 6 image slots
  slots: Array.from({ length: 6 }, (_, i) => emptySlot(i)),

  // Video settings
  slideDuration: 2,    // seconds per slide
  transitionMs: 220,   // swipe transition duration ms
};

export default function Home() {
  const [config, setConfig] = useState(defaultConfig);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const refreshHandlerRef = useRef(null);

  // Total slides = 1 (collage) + 6 × 2 (reveal + thrifty)
  const totalSlides = 1 + config.slots.length * 2;

  const updateConfig = useCallback((key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
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
      </div>
    </div>
  );
}
