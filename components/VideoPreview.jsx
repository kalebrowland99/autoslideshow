"use client";

import CollageSlide from "./slides/CollageSlide";
import ItemRevealSlide from "./slides/ItemRevealSlide";
import ThriftySlide from "./slides/ThriftySlide";
import FullBleedSlide from "./slides/FullBleedSlide";
import IMessageMomSlide from "./slides/IMessageMomSlide";
import VoicemailMomSlide from "./slides/VoicemailMomSlide";
import IMessageTextSlide from "./slides/IMessageTextSlide";
import StarterPackSlide from "./slides/StarterPackSlide";
import PovThriftFullTimeSlide from "./slides/PovThriftFullTimeSlide";
import { getSlideInfo } from "@/lib/slideLayout";

// At 0.28 scale → 1080×1920 renders as ~302×538px in browser
export const DISPLAY_SCALE = 0.28;

export { getSlideInfo };

function SlideRenderer({ config, info, S }) {
  return (
    <>
      {info.type === "collage" && <CollageSlide config={config} S={S} />}
      {info.type === "reveal" && <ItemRevealSlide slot={info.slot} S={S} config={config} />}
      {info.type === "thrifty" && <ThriftySlide slot={info.slot} S={S} config={config} />}
      {info.type === "fullBleed" && <FullBleedSlide slot={info.slot} S={S} />}
      {info.type === "imessage"     && <IMessageMomSlide  slot={info.slot} S={S} config={config} />}
      {info.type === "voicemail"    && <VoicemailMomSlide slot={info.slot} S={S} config={config} />}
      {info.type === "imessageText" && <IMessageTextSlide  slot={info.slot} S={S} config={config} />}
      {info.type === "starterPack"  && <StarterPackSlide config={config} S={S} phase={config._spPhase ?? -1} />}
      {info.type === "povThriftFullTime" && <PovThriftFullTimeSlide config={config} S={S} phase={config._povPhase ?? -1} />}
    </>
  );
}

export default function VideoPreview({ config, currentSlide, setCurrentSlide, totalSlides, isGenerating, onRefreshSlide }) {
  const S = DISPLAY_SCALE;
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);

  const info = getSlideInfo(config, currentSlide);

  const fmt = config.outputFormat ?? "standard";

  const slideLabel = () => {
    if (fmt === "posePerson") {
      return `Pose ${currentSlide + 1}`;
    }
    if (currentSlide === 0) return "Collage";
    if (fmt === "appOnly") {
      return `Item ${currentSlide} — App`;
    }
    if (fmt === "imessageMom") {
      if (currentSlide === 0) return "iMessage (photo)";
      if (currentSlide === 1) return "Voicemail";
      if (currentSlide === 2) return "iMessage (texts)";
      return "Thrifty Price";
    }
    if (fmt === "starterPack") return "Starter Pack";
    if (fmt === "povThriftFullTime") return "POV: thrift full time";
    const item = Math.floor((currentSlide - 1) / 2) + 1;
    const type = (currentSlide - 1) % 2 === 0 ? "Reveal" : "Thrifty Price";
    return `Item ${item} — ${type}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {/* Slide label */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentSlide((s) => Math.max(0, s - 1))}
          disabled={currentSlide === 0}
          className="w-7 h-7 rounded-full bg-white/8 hover:bg-white/15 disabled:opacity-20 flex items-center justify-center text-white text-sm transition-colors"
        >
          ←
        </button>
        <span className="text-white/50 text-xs min-w-[140px] text-center">{slideLabel()}</span>
        <button
          onClick={() => setCurrentSlide((s) => Math.min(totalSlides - 1, s + 1))}
          disabled={currentSlide === totalSlides - 1}
          className="w-7 h-7 rounded-full bg-white/8 hover:bg-white/15 disabled:opacity-20 flex items-center justify-center text-white text-sm transition-colors"
        >
          →
        </button>
      </div>

      {/* Slide frame */}
      <div
        style={{
          width: W,
          height: H,
          borderRadius: Math.round(20 * S),
          boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <div
          id="video-preview-root"
          style={{ width: "100%", height: "100%", borderRadius: "inherit", overflow: "hidden", position: "relative" }}
        >
          <SlideRenderer config={config} info={info} S={S} />
        </div>

        {/* Per-slide AI refresh button */}
        <button
          onClick={() => !isGenerating && onRefreshSlide?.(currentSlide)}
          disabled={isGenerating}
          title={isGenerating ? "Generating…" : "Regenerate with AI"}
          style={{
            position: "absolute",
            bottom: Math.round(14 * S),
            right: Math.round(14 * S),
            width: Math.round(64 * S),
            height: Math.round(64 * S),
            borderRadius: "50%",
            background: isGenerating ? "rgba(109,40,217,0.85)" : "rgba(30,30,30,0.75)",
            border: "1.5px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isGenerating ? "default" : "pointer",
            fontSize: Math.round(26 * S),
            zIndex: 20,
            boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
            transition: "background 0.2s",
          }}
        >
          {isGenerating ? (
            <div style={{
              width: Math.round(16 * S),
              height: Math.round(16 * S),
              border: `${Math.round(2 * S)}px solid rgba(255,255,255,0.3)`,
              borderTop: `${Math.round(2 * S)}px solid #fff`,
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }} />
          ) : "🔄"}
        </button>
      </div>

      {/* Slide dots */}
      <div className="flex gap-1 flex-wrap justify-center max-w-[340px]">
        {Array.from({ length: totalSlides }).map((_, i) => {
          const isCollage = fmt !== "posePerson" && fmt !== "imessageMom" && i === 0;
          const isReveal =
            fmt === "standard" && i > 0 && (i - 1) % 2 === 0;
          const momPhoto = false;
          const momMsg     = fmt === "imessageMom" && i === 0;
          const momVm      = fmt === "imessageMom" && i === 1;
          const momTxt     = fmt === "imessageMom" && i === 2;
          const momThrifty = fmt === "imessageMom" && i === 3;
          const isPose = fmt === "posePerson";
          const dotColor = isPose
            ? "bg-sky-400"
            : momPhoto
            ? "bg-slate-400"
            : momMsg
            ? "bg-fuchsia-400"
            : momVm
            ? "bg-amber-400"
            : momTxt
            ? "bg-pink-400"
            : momThrifty
            ? "bg-emerald-400"
            : isCollage
            ? "bg-violet-500"
            : isReveal
            ? "bg-orange-400"
            : "bg-emerald-400";
          return (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentSlide
                  ? `${dotColor} scale-125`
                  : "bg-white/20 hover:bg-white/40"
              }`}
            />
          );
        })}
      </div>
      {fmt === "posePerson" ? (
        <div className="flex gap-4 text-xs text-white/30">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block"/>Pose</span>
        </div>
      ) : (
        <div className="flex gap-4 text-xs text-white/30 flex-wrap justify-center">
          {fmt === "imessageMom" ? (
            <>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-fuchsia-400 inline-block"/>iMessage</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>Voicemail</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-400 inline-block"/>Text reply</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/>Thrifty</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block"/>Collage</span>
              {fmt === "standard" && (
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block"/>Reveal</span>
              )}
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/>Thrifty</span>
            </>
          )}
        </div>
      )}

    </div>
  );
}
