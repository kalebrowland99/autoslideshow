"use client";

import { useMemo } from "react";

/**
 * iOS iMessage long-press screenshot — dark mode.
 * Sizes in iPhone pts (390pt wide), scaled by IPHONE_SCALE * S.
 */

const IPHONE_SCALE = 1080 / 390;
const IOS_BLUE = "#007AFF";
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';

function slotSeed(slot) {
  const str = (slot?.itemName || "") + (slot?.spentPrice || "") + (slot?.soldPrice || "");
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return Math.abs(h);
}

function MenuIconReply({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 10l-4 4 4 4M5 14h10.5a4.5 4.5 0 100-9H5"
        stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIconSticker({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.19 0 2.34-.21 3.41-.59L20 17V12C20 6.48 16.42 2 12 2z"
        stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M15 11l-3 3-2-2" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIconSave({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v13M8 12l4 4 4-4" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIconCopy({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" />
      <path d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1"
        stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" />
    </svg>
  );
}

const MENU_ROWS = [
  { label: "Reply",       Icon: MenuIconReply },
  { label: "Add Sticker", Icon: MenuIconSticker },
  { label: "Save",        Icon: MenuIconSave },
  { label: "Copy",        Icon: MenuIconCopy },
];

const TAPBACK_ITEMS = [
  { t: "❤️", text: false },
  { t: "👍", text: false },
  { t: "👎", text: false },
  { t: "😂", text: false },
  { t: "❕", text: false },
  { t: "❓", text: false },
];

export default function IMessageMomSlide({ slot, S, config }) {
  // px() converts iPhone pts → canvas pixels
  const px = (n) => Math.round(n * IPHONE_SCALE * S);

  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);

  const watermark = (config?.tiktokWatermark ?? "").trim();

  const selectedTapback = useMemo(() => {
    const seed = slotSeed(slot);
    return seed % 5 === 0 ? 0 : 1; // mostly thumbs-up
  }, [slot]);

  // ── Layout constants (all in iPhone pts) ──────────────────────────────
  const padX       = 14;   // horizontal padding (pts)
  const padTop     = 24;   // top padding
  const padBottom  = 18;   // bottom padding
  const gapAfterTb = 10;   // gap between tapback and image
  const gapAfterImg = 10;  // gap between image and menu
  const tbH        = 46;   // tapback pill height
  const menuRowH   = 54;   // each menu row height
  const menuH      = MENU_ROWS.length * menuRowH;
  const menuRadius = 14;

  // Image fills remaining vertical space
  const totalPt = H / (IPHONE_SCALE * S);
  const imgH_pt = totalPt - padTop - tbH - gapAfterTb - gapAfterImg - menuH - padBottom;
  const imgW_pt = 390 - padX * 2;

  const tbItemSize = px(40);

  return (
    <div style={{
      width: W, height: H,
      background: "#000",
      fontFamily: FONT,
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute",
        left: 0, right: 0,
        top: px(padTop),
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        paddingLeft: px(padX),
        paddingRight: px(padX),
      }}>

        {/* ── Tapback pill ─────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: px(gapAfterTb) }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: px(4),
            padding: `${px(5)}px ${px(10)}px`,
            borderRadius: 9999,
            background: "rgba(52,52,52,0.96)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}>
            {TAPBACK_ITEMS.map((item, i) => {
              const sel = i === selectedTapback;
              return (
                <div key={i} style={{
                  width: tbItemSize,
                  height: tbItemSize,
                  borderRadius: tbItemSize / 2,
                  background: sel ? IOS_BLUE : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: px(20),
                  lineHeight: 1,
                }}>
                  {item.t}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Photo ─────────────────────────────────────────── */}
        <div style={{
          height: px(imgH_pt),
          width: px(imgW_pt),
          borderRadius: px(18),
          overflow: "hidden",
          background: "#1c1c1c",
          position: "relative",
          alignSelf: "center",
        }}>
          {slot?.imageUrl
            ? <img src={slot.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: px(14) }}>No photo</div>
          }
          {watermark && (
            <div style={{
              position: "absolute", right: px(8), bottom: px(6),
              fontSize: px(11), fontWeight: 600,
              color: "rgba(255,255,255,0.9)",
              textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            }}>
              {watermark}
            </div>
          )}
        </div>

        {/* ── Action sheet ──────────────────────────────────── */}
        <div style={{ height: px(gapAfterImg) }} />
        <div style={{
          borderRadius: px(menuRadius),
          overflow: "hidden",
          background: "rgba(38,38,38,0.97)",
          border: "0.5px solid rgba(255,255,255,0.1)",
        }}>
          {MENU_ROWS.map((row, idx) => (
            <div key={row.label}>
              {idx > 0 && <div style={{ height: 0.5, background: "rgba(80,80,80,0.8)", marginLeft: px(16) }} />}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingLeft: px(16),
                paddingRight: px(16),
                height: px(menuRowH),
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: px(12) }}>
                  <span style={{ color: "#fff", fontSize: px(17), fontWeight: 400, letterSpacing: "-0.02em" }}>
                    {row.label}
                  </span>
                </div>
                <row.Icon size={px(22)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
