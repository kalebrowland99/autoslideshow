"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ConfigPanel from "@/components/ConfigPanel";
import VideoPreview from "@/components/VideoPreview";
import { defaultConfig, emptySlot } from "@/app/page";
import { getTotalSlides, normalizeValcoinOutputFormat } from "@/lib/slideLayout";
import { markFarmJobFailed, setFarmJobStatus } from "@/lib/farmBridge";

export default function AutomationRunner() {
  const params = useSearchParams();
  const jobId = params.get("jobId") || "";
  const brand = params.get("brand") || "labely";
  const farmUrl = params.get("farmUrl") || "";
  const secret = params.get("secret") || "";
  const slots = useMemo(
    () => String(params.get("slots") || "").split(",").map((s) => s.trim()).filter(Boolean),
    [params],
  );

  const [config, setConfig] = useState(defaultConfig);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedSlideshows, setSavedSlideshows] = useState([]);
  const [numSlideshows, setNumSlideshows] = useState(3);
  const [batchImageDataUrls, setBatchImageDataUrls] = useState([]);
  const [ready, setReady] = useState(false);
  const refreshHandlerRef = useRef(null);

  const farmUpload = useMemo(
    () => ({ farmUrl, jobId, secret, slots }),
    [farmUrl, jobId, secret, slots],
  );

  const totalSlides = useMemo(() => getTotalSlides(config), [config]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!jobId || !farmUrl) {
          throw new Error("Missing jobId or farmUrl query params");
        }
        setFarmJobStatus("Loading farm defaults…");
        const res = await fetch(`/api/farm/defaults?brand=${encodeURIComponent(brand)}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        setConfig((prev) => ({
          ...prev,
          ...(data.config || {}),
          slots: (prev.slots ?? []).map((slot, i) => ({
            ...emptySlot(i),
            ...(slot || {}),
          })),
        }));
        setReady(true);
        setFarmJobStatus(`Defaults loaded for ${brand} — generating slideshows…`);
      } catch (err) {
        markFarmJobFailed(err?.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brand, farmUrl, jobId]);

  const updateConfig = useCallback((key, value) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "appId" && value === "valcoin") {
        next.outputFormat = normalizeValcoinOutputFormat(next.outputFormat);
      }
      if (key === "outputFormat" && next.appId === "valcoin") {
        next.outputFormat = normalizeValcoinOutputFormat(value);
      }
      if (key === "appId" && value === "labely") {
        next.outputFormat = "labelyScan";
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
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#0f0f0f] text-white">
      <header className="border-b border-white/10 px-6 py-3 shrink-0">
        <div className="text-sm font-semibold">Farm automation · {brand}</div>
        <div className="text-white/50 text-xs mt-1">
          Job {jobId || "—"} · slots {slots.join(", ") || "—"}
        </div>
        {exportStatus ? (
          <div className="text-emerald-400/90 text-xs mt-2 truncate">{exportStatus}</div>
        ) : null}
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <aside className="w-[380px] border-r border-white/10 overflow-y-auto shrink-0 min-h-0 p-2">
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
            registerRefreshSlide={(fn) => {
              refreshHandlerRef.current = fn;
            }}
            onSlideshowSaved={() => {}}
            onSavedSlideshowsChange={setSavedSlideshows}
            savedSlideshows={savedSlideshows}
            numSlideshows={numSlideshows}
            setNumSlideshows={setNumSlideshows}
            batchImageDataUrls={batchImageDataUrls}
            setBatchImageDataUrls={setBatchImageDataUrls}
            persistHomeSessionNow={async () => {}}
            farmUpload={farmUpload}
            autoRunBatch={ready}
          />
        </aside>

        <main className="flex-1 min-h-0 min-w-0 flex items-center justify-center p-6 overflow-auto bg-[#080808]">
          <VideoPreview
            config={config}
            currentSlide={currentSlide}
            setCurrentSlide={setCurrentSlide}
            totalSlides={totalSlides}
            isGenerating={isGenerating}
            onRefreshSlide={(i) => refreshHandlerRef.current?.(i)}
          />
        </main>
      </div>
    </div>
  );
}
