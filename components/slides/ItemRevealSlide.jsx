"use client";

import { useMemo } from "react";
import { exportImgCrossOrigin } from "../exportImg";

// Same color palette used by ThriftySlide captions
const REVEAL_CAPTION_COMBOS = [
  { bg: "#000000", color: "#ffffff" },
  { bg: "#e03030", color: "#ffffff" },
  { bg: "#1a5cbf", color: "#ffffff" },
  { bg: "#1a8a3a", color: "#ffffff" },
  { bg: "#7c22cc", color: "#ffffff" },
  { bg: "#d4a017", color: "#000000" },
  { bg: "#ffffff", color: "#000000" },
  { bg: "#111111", color: "#f5e642" },
  { bg: "#e05c20", color: "#ffffff" },
  { bg: "#0d7377", color: "#ffffff" },
];

// Stable seeded PRNG — same output for same seed, no re-randomisation on re-render
function seededRand(seed) {
  const x = Math.sin(seed + 3.14) * 10000;
  return x - Math.floor(x);
}

// Derive a numeric seed from the slot's content so each slot gets
// consistent (but unique) randomisation that survives export re-renders
function slotSeed(slot) {
  const str = (slot.itemName || "") + (slot.spentPrice || "") + (slot.soldPrice || "");
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return Math.abs(h);
}

export default function ItemRevealSlide({ slot, S, captionSize: globalCaptionSize }) {
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);
  const px = (n) => Math.round(n * S);

  const spentLine = (slot.spentPrice ? `spent $${slot.spentPrice}` : "spent $?");
  const itemLine  = slot.itemName ? `(${slot.itemName.toLowerCase()})` : null;

  const captionSize = globalCaptionSize ?? slot.revealCaptionSize ?? 72;

  // All random values derived from a stable seed — same layout every render/export
  const seed = useMemo(() => slotSeed(slot), [slot.itemName, slot.spentPrice, slot.soldPrice]);

  const REVEAL_SAFE_ZONES = [0.06, 0.14, 0.28, 0.42, 0.56, 0.68, 0.76];
  const captionBoxH = Math.round(10 * S) * 2 + Math.round(captionSize * S * 1.2) * 2 + Math.round(5 * S);
  const maxTop = H - captionBoxH - Math.round(H * 0.02);

  const combo = useMemo(() => REVEAL_CAPTION_COMBOS[Math.floor(seededRand(seed)     * REVEAL_CAPTION_COMBOS.length)], [seed]);
  const zoneIdx = useMemo(() => Math.floor(seededRand(seed + 1) * REVEAL_SAFE_ZONES.length), [seed]);
  const jitterX = useMemo(() => Math.round((seededRand(seed + 2) - 0.5) * 16 * S),  [seed, S]);
  const jitterY = useMemo(() => Math.round((seededRand(seed + 3) - 0.5) * 16 * S),  [seed, S]);
  const tilt    = useMemo(() => ((seededRand(seed + 4) - 0.5) * 4).toFixed(2),       [seed]); // ±2 deg
  const captionTop = useMemo(() => {
    const raw = Math.round(H * REVEAL_SAFE_ZONES[zoneIdx]) + jitterY;
    return Math.min(raw, maxTop);
  }, [seed, H, maxTop, zoneIdx, jitterY]);

  return (
    <div style={{ width: W, height: H, position: "relative", background: "#000", overflow: "hidden" }}>
      {/* Full-screen image */}
      {slot.imageUrl ? (
        <img
          data-export-image=""
          src={slot.imageUrl}
          alt={slot.itemName || "Item"}
          crossOrigin={exportImgCrossOrigin(slot.imageUrl)}
          decoding="async"
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
        data-export-scrim=""
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: "50%",
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 50%, transparent 100%)",
          pointerEvents: "none",
        }}
      />

      {/* "spent $X (item name)" caption — flex-centered wrapper avoids calc() in html2canvas */}
      <div
        style={{
          position: "absolute",
          left: 0,
          width: W,
          top: captionTop,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
      <div
        style={{
          marginLeft: jitterX,
          transform: `rotate(${tilt}deg)`,
          background: combo.bg,
          borderRadius: Math.round(12 * S),
          padding: `${Math.round(10 * S)}px ${Math.round(20 * S)}px`,
          maxWidth: Math.round(W * 0.8),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: Math.round(4 * S),
          boxShadow: `0 ${Math.round(4 * S)}px ${Math.round(20 * S)}px rgba(0,0,0,0.55)`,
        }}
      >
        <span style={{
          display: "block",
          color: combo.color,
          fontSize: Math.round(captionSize * S),
          fontWeight: "800",
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
            color: combo.color,
            fontSize: Math.round(captionSize * S),
            fontWeight: "800",
            lineHeight: 1.2,
            fontFamily: "Arial, Helvetica, sans-serif",
            letterSpacing: "-0.01em",
            textAlign: "center",
          }}>
            {itemLine}
          </span>
        )}
      </div>
      </div>
    </div>
  );
}
