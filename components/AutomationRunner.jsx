"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ConfigPanel from "@/components/ConfigPanel";
import VideoPreview from "@/components/VideoPreview";
import LabelyScanSequencePreview from "@/components/LabelyScanSequencePreview";
import GalleryRail from "@/components/GalleryRail";
import AutomationProgressPanel from "@/components/AutomationProgressPanel";
import { AppNav, PreviewFrame } from "@/components/ui/acme-hero";
import { defaultConfig, emptySlot } from "@/app/page";
import { getTotalSlides, normalizeValcoinOutputFormat, LABELY_SCAN_TOUR_SLOTS } from "@/lib/slideLayout";
import { markFarmJobFailed, setFarmJobStatus } from "@/lib/farmBridge";
import { clearAutomationLog, appendAutomationLog } from "@/lib/automationLog";
import { savedShowMatchesApp } from "@/lib/showAppId";

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
  const slideshowsPerSlot = useMemo(() => {
    const n = Number(params.get("slideshowsPerSlot"));
    return Number.isFinite(n) && n > 0 ? Math.min(200, Math.round(n)) : 3;
  }, [params]);

  const [config, setConfig] = useState(defaultConfig);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedSlideshows, setSavedSlideshows] = useState([]);
  const [activeShowIdx, setActiveShowIdx] = useState(null);
  const [numSlideshows, setNumSlideshows] = useState(slideshowsPerSlot);
  const [batchImageDataUrls, setBatchImageDataUrls] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const refreshHandlerRef = useRef(null);

  const farmUpload = useMemo(
    () => ({ farmUrl, jobId, secret, slots }),
    [farmUrl, jobId, secret, slots],
  );

  const totalSlides = useMemo(() => getTotalSlides(config), [config]);
  const isLabely = brand === "labely";

  useEffect(() => {
    setNumSlideshows(slideshowsPerSlot);
  }, [slideshowsPerSlot]);

  const bootLoggedRef = useRef(false);
  useEffect(() => {
    if (bootLoggedRef.current) return;
    bootLoggedRef.current = true;
    clearAutomationLog();
    appendAutomationLog(`Automation started · brand ${brand} · job ${jobId || "—"}`);
    if (slots.length) {
      appendAutomationLog(`Farm slots: ${slots.join(", ")}`);
    }
    appendAutomationLog(`${slideshowsPerSlot} slideshow(s) per slot configured`);
  }, [brand, jobId, slots, slideshowsPerSlot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!jobId || !farmUrl) {
          throw new Error("Missing jobId or farmUrl query params");
        }
        setLoadError("");
        setFarmJobStatus("Loading farm defaults…");
        const res = await fetch(`/api/farm/defaults?brand=${encodeURIComponent(brand)}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        if (brand === "labely") {
          setFarmJobStatus(
            data.source === "brave"
              ? "Brave picked unhealthy American foods — starting batch…"
              : "Defaults loaded — starting batch…",
          );
        } else {
          setFarmJobStatus("Defaults loaded — starting batch…");
        }
        setConfig((prev) => ({
          ...prev,
          ...(data.config || {}),
          appId: brand,
          ...(brand === "labely" ? { outputFormat: "labelyScan", labelyAiProducts: true, labelyUseBraveImages: true } : {}),
          ...(brand === "valcoin"
            ? { outputFormat: normalizeValcoinOutputFormat(data.config?.outputFormat) }
            : {}),
          slots: (prev.slots ?? []).map((slot, i) => ({
            ...emptySlot(i),
            ...(slot || {}),
          })),
        }));
        setReady(true);
        setFarmJobStatus(`Defaults loaded for ${brand} — generating slideshows…`);
      } catch (err) {
        const msg = err?.message || String(err);
        setLoadError(msg);
        markFarmJobFailed(msg);
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

  const handleSlideshowSaved = useCallback((showData) => {
    setSavedSlideshows((prev) => {
      const next = [...prev, showData];
      setActiveShowIdx(next.length - 1);
      return next;
    });
    appendAutomationLog("Slideshow saved to gallery.", "success");
  }, []);

  const loadShow = useCallback((showData, idx) => {
    const isLabelyShow = showData.appId === "labely";
    const isValcoinShow = showData.appId === "valcoin";
    setConfig((prev) => ({
      ...prev,
      slots: showData.slots,
      captionText: "",
      ...(isLabelyShow
        ? { outputFormat: "labelyScan" }
        : isValcoinShow
          ? {
              outputFormat: normalizeValcoinOutputFormat(
                showData.outputFormat ?? prev.outputFormat,
              ),
            }
          : showData.outputFormat != null
            ? { outputFormat: showData.outputFormat }
            : {}),
      ...(showData.appId != null ? { appId: showData.appId } : {}),
      ...(showData.jitterSeed != null ? { jitterSeed: showData.jitterSeed } : {}),
      ...(showData.labelyOutroText != null ? { labelyOutroText: showData.labelyOutroText } : {}),
      ...(isLabelyShow
        ? { labelyScanSlotCount: showData.labelyScanSlotCount ?? LABELY_SCAN_TOUR_SLOTS }
        : showData.labelyScanSlotCount != null
          ? { labelyScanSlotCount: showData.labelyScanSlotCount }
          : {}),
    }));
    setActiveShowIdx(idx);
    setCurrentSlide(0);
    setBatchImageDataUrls([]);
  }, []);

  const galleryEntries = useMemo(() => {
    return savedSlideshows
      .map((show, origIdx) => ({ show, origIdx }))
      .filter(({ show }) => savedShowMatchesApp(show, brand));
  }, [savedSlideshows, brand]);

  const automationSubtitle = [
    jobId ? `Job ${jobId}` : null,
    slots.length ? `slots ${slots.join(", ")}` : null,
    farmUrl
      ? (() => {
          try {
            return new URL(farmUrl).host;
          } catch {
            return farmUrl;
          }
        })()
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="container mx-auto max-w-6xl px-4 pb-10">
      <AppNav
        automationMode
        automationTitle={`Farm automation · ${brand}`}
        automationSubtitle={automationSubtitle}
        appId={brand}
        currentSlide={currentSlide}
        totalSlides={totalSlides}
        isExporting={isExporting}
        isGenerating={isGenerating}
      />

      <main className="relative py-8 md:py-10">
        <AutomationProgressPanel loading={!ready && !loadError} />

        {loadError ? (
          <div className="page-banner rounded-xl px-4 py-3 text-sm text-destructive">{loadError}</div>
        ) : null}

        {!ready && !loadError ? (
          <div className="dash-card p-8 text-center text-sm text-muted-foreground">
            Preparing {brand} defaults…
          </div>
        ) : ready ? (
          <div className="grid items-start gap-5 md:gap-6 lg:grid-cols-5">
            <div className="dash-card max-h-[calc(100vh-6rem)] overflow-y-auto p-4 md:p-5 lg:col-span-2">
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
                onSlideshowSaved={handleSlideshowSaved}
                onSavedSlideshowsChange={setSavedSlideshows}
                activeShowIdx={activeShowIdx}
                savedSlideshows={savedSlideshows}
                numSlideshows={numSlideshows}
                setNumSlideshows={setNumSlideshows}
                batchImageDataUrls={batchImageDataUrls}
                setBatchImageDataUrls={setBatchImageDataUrls}
                persistHomeSessionNow={async () => {}}
                farmUpload={farmUpload}
                autoRunBatch={ready}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-5 md:gap-6 lg:col-span-3">
              <div className="dash-card flex items-center justify-center p-4 md:p-5">
                <PreviewFrame
                  subtitle={`${totalSlides} slides · ${config.slideDuration}s each`}
                  meta="1080 × 1920"
                >
                  <div className="flex flex-col items-center gap-3">
                    {isLabely ? (
                      <LabelyScanSequencePreview
                        config={config}
                        currentSlide={currentSlide}
                        setCurrentSlide={setCurrentSlide}
                        totalSlides={totalSlides}
                      />
                    ) : null}
                    <VideoPreview
                      config={config}
                      currentSlide={currentSlide}
                      setCurrentSlide={setCurrentSlide}
                      totalSlides={totalSlides}
                      isGenerating={isGenerating}
                      onRefreshSlide={(i) => refreshHandlerRef.current?.(i)}
                    />
                  </div>
                </PreviewFrame>
              </div>

              {galleryEntries.length > 0 ? (
                <GalleryRail
                  entries={galleryEntries}
                  activeShowIdx={activeShowIdx}
                  loadShow={loadShow}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
