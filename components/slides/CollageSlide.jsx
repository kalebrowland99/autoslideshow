"use client";

import { useMemo, useState, useEffect } from "react";

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

  // Small per-mount jitter — initialised to 0 for SSR, randomised client-side
  const [jitter, setJitter] = useState({ x: 0, y: 0 });
  useEffect(() => {
    setJitter({
      x: Math.round((Math.random() - 0.5) * 16 * S),
      y: Math.round((Math.random() - 0.5) * 16 * S),
    });
  }, []);

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
                src={slot.imageUrl}
                alt={`Slot ${i + 1}`}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <EmptyCell index={i} S={S} />
            )}
          </div>
        ))}
      </div>

      {/* Caption overlay — all sizes in 1080px space × S */}
      {captionText && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: captionTop + jitter.y,
            transform: `translateX(calc(-50% + ${jitter.x}px))`,
            background: captionBg,
            borderRadius: Math.round(12 * S),
            padding: `${Math.round(10 * S)}px ${Math.round(20 * S)}px`,
            maxWidth: "80%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: Math.round(2 * S),
            zIndex: 10,
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
              {line}
            </span>
          ))}
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
