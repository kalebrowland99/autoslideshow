"use client";

import { useMemo } from "react";
import { exportImgCrossOrigin } from "../exportImg";

export default function CollageSlide({ config, S }) {
  const {
    captionText,
    captionBg,
    captionColor,
    captionSize,
    captionPosition,
    captionBold,
    slots,
  } = config;

  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);
  const gap = Math.round(3 * S);

  const captionTop =
    captionPosition === "top"
      ? Math.round(H * 0.1)
      : captionPosition === "bottom"
      ? Math.round(H * 0.74)
      : Math.round(H * 0.42);

  // Jitter + tilt derived from caption text — stable across renders and export
  const jitter = useMemo(() => {
    const str = captionText || "default";
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    const r1 = ((h & 0xffff) / 0xffff) - 0.5;
    const r2 = (((h >>> 16) & 0xffff) / 0xffff) - 0.5;
    const h2 = Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0;
    const r3 = (h2 / 0xffffffff) - 0.5; // -0.5 to 0.5 → ±2 degrees
    return { x: Math.round(r1 * 16 * S), y: Math.round(r2 * 16 * S), rot: r3 * 4 };
  }, [captionText, S]);

  return (
    <div style={{ width: W, height: H, position: "relative", background: "#111", overflow: "hidden" }}>
      {/* 2×3 grid */}
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
          gap: `${gap}px`,
          background: "#111",
        }}
      >
        {slots.map((slot, i) => (
          <div key={i} style={{ overflow: "hidden", position: "relative", background: "#1c1c1c" }}>
            {slot.imageUrl ? (
              <img
                data-export-image=""
                src={slot.imageUrl}
                alt={`Slot ${i + 1}`}
                crossOrigin={exportImgCrossOrigin(slot.imageUrl)}
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <EmptyCell index={i} S={S} />
            )}
          </div>
        ))}
      </div>

      {/* Caption overlay — flex-centered wrapper avoids calc() in html2canvas */}
      {captionText && (
        <div
          style={{
            position: "absolute",
            left: 0,
            width: W,
            top: captionTop + jitter.y,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <div
            style={{
              marginLeft: jitter.x,
              transform: `rotate(${jitter.rot.toFixed(2)}deg)`,
              background: captionBg,
              borderRadius: Math.round(12 * S),
              padding: `${Math.round(10 * S)}px ${Math.round(20 * S)}px`,
              maxWidth: Math.round(W * 0.8),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: Math.round(2 * S),
              boxShadow: `0 ${Math.round(4 * S)}px ${Math.round(20 * S)}px rgba(0,0,0,0.55)`,
            }}
          >
            {captionText.split("\n").map((line, i) => (
              <span
                key={i}
                style={{
                  display: "block",
                  color: captionColor,
                  fontSize: Math.round(captionSize * S),
                  fontWeight: captionBold ? "900" : "600",
                  lineHeight: 1.2,
                  fontFamily: "Arial, Helvetica, sans-serif",
                  letterSpacing: "-0.01em",
                  textAlign: "center",
                }}
              >
                {line.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyCell({ index, S }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: Math.round(6 * S),
        border: `1px dashed rgba(255,255,255,0.1)`,
      }}
    >
      <svg width={Math.round(28 * S)} height={Math.round(28 * S)} fill="none" viewBox="0 0 24 24"
        stroke="rgba(255,255,255,0.15)" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span style={{ color: "rgba(255,255,255,0.15)", fontSize: Math.round(11 * S), fontFamily: "Arial", fontWeight: "600" }}>
        {index + 1}
      </span>
    </div>
  );
}
