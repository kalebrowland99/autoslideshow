"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getFontEmbedCSS, toCanvas } from "html-to-image";
import { buildLabelyScanFrameSequence } from "@/lib/labelyScanExport";
import { getSlideInfo, isLabelyScanTourFormat } from "@/lib/slideLayout";
import { DISPLAY_SCALE } from "./VideoPreview";

const EXPORT_CAPTURE_PIXEL_RATIO = 1080 / Math.round(1080 * DISPLAY_SCALE);

/** Fallback pack shot when the slot has no image (matches export placeholder behavior). */
const SAMPLE_SCAN_PRODUCT_IMAGE = "/labely/references/IMG_0076.jpg";

const waitForPreviewPaint = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function waitForFonts() {
  if (!document.fonts?.ready) return;
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
}

async function waitForImagesDecoded(root) {
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
        }),
    ),
  );
  await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
}

function getCaptureNode() {
  return document.getElementById("video-preview-root");
}

export default function LabelyScanSequencePreview({ config, currentSlide, setCurrentSlide, totalSlides }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);
  const playTimerRef = useRef(null);

  const canPreview =
    isLabelyScanTourFormat(config) &&
    (config?.appId ?? "thrifty") === "labely" &&
    totalSlides >= 2;

  const stopPlayback = useCallback(() => {
    if (playTimerRef.current != null) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const handleClose = useCallback(() => {
    stopPlayback();
    setOpen(false);
    setLoading(false);
  }, [stopPlayback]);

  const handlePlay = useCallback(async () => {
    if (!canPreview || open || loading) return;
    const root = getCaptureNode();
    if (!root) return;

    const prevSlide = currentSlide;
    let targetIdx = currentSlide;
    const curInfo = getSlideInfo(config, currentSlide);
    if (curInfo.type !== "labely") {
      targetIdx = 1;
    }
    if (targetIdx < 1) targetIdx = 1;
    if (targetIdx > totalSlides - 1) targetIdx = 1;

    const info = getSlideInfo(config, targetIdx);
    if (info.type !== "labely") {
      return;
    }

    setLoading(true);
    setOpen(true);

    try {
      flushSync(() => setCurrentSlide(targetIdx));
      await waitForPreviewPaint();
      await new Promise((r) => setTimeout(r, 100));
      await waitForFonts();
      await waitForImagesDecoded(root);

      const fontEmbedCSS = await getFontEmbedCSS(root).catch(() => undefined);
      const labelyCanvas = await toCanvas(root, {
        backgroundColor: "#ffffff",
        pixelRatio: EXPORT_CAPTURE_PIXEL_RATIO,
        cacheBust: true,
        includeQueryParams: true,
        ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
      });

      const slot = info.slot ?? config.slots?.[targetIdx - 1] ?? config.slots?.[0];
      let productDataUrl = typeof slot?.imageUrl === "string" ? slot.imageUrl.trim() : "";
      if (!productDataUrl) productDataUrl = SAMPLE_SCAN_PRODUCT_IMAGE;

      const seq = await buildLabelyScanFrameSequence({
        productDataUrl,
        labelyCanvas,
        scanSec: 1.35,
        revealSec: 0.52,
        holdSec: config.slideDuration,
        fps: 30,
        imageVariationSeed: (config.jitterSeed ?? 0) + (info.itemIndex ?? targetIdx) * 9973,
      });

      flushSync(() => setCurrentSlide(prevSlide));
      await waitForPreviewPaint();

      const canvas = canvasRef.current;
      if (!canvas || seq.length === 0) {
        setLoading(false);
        return;
      }

      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      let i = 0;
      const fps = 30;
      stopPlayback();
      playTimerRef.current = window.setInterval(() => {
        if (i >= seq.length) {
          stopPlayback();
          return;
        }
        ctx.drawImage(seq[i], 0, 0, 1080, 1920);
        i++;
      }, 1000 / fps);

      setLoading(false);
    } catch (e) {
      console.error("[LabelyScanSequencePreview]", e);
      flushSync(() => setCurrentSlide(prevSlide));
      setLoading(false);
      setOpen(false);
    }
  }, [canPreview, config, currentSlide, loading, open, setCurrentSlide, stopPlayback, totalSlides]);

  return (
    <>
      <button
        type="button"
        onClick={handlePlay}
        disabled={!canPreview || loading || open}
        title={
          canPreview
            ? "Play scan → slide-up → confetti (matches downloaded Labely scan export)"
            : "Switch to Labely + grocery scan format with at least 2 slides"
        }
        className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/18 disabled:opacity-35 disabled:cursor-not-allowed border border-white/15 text-white transition-colors"
        aria-label="Play Labely scan export preview"
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
        ) : (
          <span className="text-lg leading-none pl-0.5">▶</span>
        )}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Labely scan export preview"
        >
          <div className="relative flex flex-col items-center gap-3 max-w-[min(96vw,520px)]">
            <div className="flex items-center justify-between gap-3 w-full text-white/80 text-xs">
              <span className="font-semibold uppercase tracking-wider text-white/50">
                Scan → slide-up → confetti
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
            <div className="relative w-full">
              <canvas
                ref={canvasRef}
                width={1080}
                height={1920}
                className="w-full max-h-[min(78vh,820px)] h-auto rounded-2xl shadow-2xl border border-white/10 bg-black"
              />
              {loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/55 text-white/70 text-sm font-medium">
                  <span className="w-8 h-8 border-2 border-white/25 border-t-white rounded-full animate-spin" />
                  Building preview…
                </div>
              ) : null}
            </div>
            <p className="text-white/35 text-[10px] text-center leading-relaxed max-w-sm">
              Same sequence as video export for this Labely card (sample shelf photo if no pack image).
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
