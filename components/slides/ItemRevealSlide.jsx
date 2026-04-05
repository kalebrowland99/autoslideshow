"use client";

import { useMemo, useState, useEffect } from "react";

export default function ItemRevealSlide({ slot, S }) {
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);
  const px = (n) => Math.round(n * S); // n is already in 1080px space

  const spentLine = slot.spentPrice ? `Spent $${slot.spentPrice}` : "Spent $?";
  const itemLine  = slot.itemName ? `(${slot.itemName})` : null;

  const captionBg    = slot.revealCaptionBg    || "#000000";
  const captionColor = slot.revealCaptionColor || "#ffffff";
  const captionSize  = slot.revealCaptionSize  ?? 72;
  const captionBold  = slot.revealCaptionBold  ?? true;
  // Random safe zones spread across the image
  const REVEAL_SAFE_ZONES = [0.06, 0.14, 0.28, 0.42, 0.56, 0.68, 0.76];
  // Estimated caption box height: padding*2 + line1 + gap + line2
  const captionBoxH = Math.round(10 * S) * 2 + Math.round(captionSize * S * 1.2) + Math.round(captionSize * 0.55 * S * 1.2) + Math.round(5 * S);
  const maxTop = H - captionBoxH - Math.round(H * 0.02);
  const [captionTop, setCaptionTop] = useState(Math.round(H * 0.42));
  const [jitter, setJitter] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const zone = REVEAL_SAFE_ZONES[Math.floor(Math.random() * REVEAL_SAFE_ZONES.length)];
    const jx = Math.round((Math.random() - 0.5) * 16 * S);
    const jy = Math.round((Math.random() - 0.5) * 16 * S);
    const raw = Math.round(H * zone) + jy;
    setCaptionTop(Math.min(raw, maxTop));
    setJitter({ x: jx, y: 0 });
  }, []);

  return (
    <div style={{ width: W, height: H, position: "relative", background: "#000", overflow: "hidden" }}>
      {/* Full-screen image */}
      {slot.imageUrl ? (
        <img
          src={slot.imageUrl}
          alt={slot.itemName || "Item"}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1c1c1c" }}>
          <svg width={px(120)} height={px(120)} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.12)" strokeWidth={0.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}

      {/* Bottom gradient scrim */}
      <div
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: "50%",
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 50%, transparent 100%)",
          pointerEvents: "none",
        }}
      />

      {/* "Spent $X" caption */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: captionTop,
          transform: `translateX(calc(-50% + ${jitter.x}px))`,
          background: captionBg,
          borderRadius: Math.round(12 * S),
          padding: `${Math.round(10 * S)}px ${Math.round(20 * S)}px`,
          maxWidth: "80%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: Math.round(4 * S),
          zIndex: 10,
          boxShadow: `0 ${Math.round(4 * S)}px ${Math.round(20 * S)}px rgba(0,0,0,0.55)`,
        }}
      >
        <span style={{
          display: "block",
          color: captionColor,
          fontSize: Math.round(captionSize * S),
          fontWeight: captionBold ? "900" : "600",
          lineHeight: 1.2,
          fontFamily: "Arial, Helvetica, sans-serif",
          letterSpacing: "-0.01em",
          textAlign: "center",
        }}>
          {spentLine}
        </span>
        {itemLine && (
          <span style={{
            display: "block",
            color: captionColor,
            fontSize: Math.round(captionSize * 0.55 * S),
            fontWeight: "600",
            lineHeight: 1.2,
            fontFamily: "Arial, Helvetica, sans-serif",
            opacity: 0.8,
            textAlign: "center",
          }}>
            {itemLine}
          </span>
        )}
      </div>
    </div>
  );
}
