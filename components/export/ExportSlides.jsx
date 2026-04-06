"use client";

import { useMemo } from "react";
import { exportImgCrossOrigin } from "../exportImg";
import { buildSoldRows } from "../slides/thriftySoldRows";

const W = 1080;
const H = 1920;

/** Collage — same data as preview; flat caption (no transform / jitter). */
export function ExportCollageSlide({ config }) {
  const {
    captionText,
    captionBg,
    captionColor,
    captionSize,
    captionPosition,
    captionBold,
    slots,
  } = config;

  const gap = 3;
  const captionTop =
    captionPosition === "top"
      ? Math.round(H * 0.1)
      : captionPosition === "bottom"
        ? Math.round(H * 0.74)
        : Math.round(H * 0.42);

  return (
    <div style={{ width: W, height: H, position: "relative", background: "#111", overflow: "hidden" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
          gap,
          background: "#111",
        }}
      >
        {slots.map((slot, i) => (
          <div key={i} style={{ overflow: "hidden", position: "relative", background: "#1c1c1c" }}>
            {slot.imageUrl ? (
              <img
                data-export-image=""
                src={slot.imageUrl}
                alt=""
                crossOrigin={exportImgCrossOrigin(slot.imageUrl)}
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.2)",
                  fontFamily: "Arial, sans-serif",
                  fontSize: 28,
                  fontWeight: 700,
                }}
              >
                {i + 1}
              </div>
            )}
          </div>
        ))}
      </div>

      {captionText ? (
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
              background: captionBg,
              borderRadius: 12,
              padding: "10px 20px",
              maxWidth: Math.round(W * 0.85),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              border: "1px solid rgba(0,0,0,0.25)",
            }}
          >
            {captionText.split("\n").map((line, idx) => (
              <span
                key={idx}
                style={{
                  display: "block",
                  color: captionColor,
                  fontSize: captionSize,
                  fontWeight: captionBold ? 900 : 600,
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
      ) : null}
    </div>
  );
}

const REVEAL_COMBOS = [
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

function seededRand(seed) {
  const x = Math.sin(seed + 3.14) * 10000;
  return x - Math.floor(x);
}

function slotSeed(slot) {
  const str = (slot.itemName || "") + (slot.spentPrice || "") + (slot.soldPrice || "");
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return Math.abs(h);
}

/** Reveal — full-bleed img + caption; no gradient, no transform. */
export function ExportRevealSlide({ slot, captionSize: globalCaptionSize }) {
  const spentLine = slot.spentPrice ? `spent $${slot.spentPrice}` : "spent $?";
  const itemLine = slot.itemName ? `(${slot.itemName.toLowerCase()})` : null;
  const size = globalCaptionSize ?? slot.revealCaptionSize ?? 72;

  const seed = useMemo(() => slotSeed(slot), [slot.itemName, slot.spentPrice, slot.soldPrice]);
  const REVEAL_SAFE_ZONES = [0.06, 0.14, 0.28, 0.42, 0.56, 0.68, 0.76];
  const captionBoxH = 10 * 2 + Math.round(size * 1.2) * 2 + 5;
  const maxTop = H - captionBoxH - Math.round(H * 0.02);

  const combo = useMemo(
    () => REVEAL_COMBOS[Math.floor(seededRand(seed) * REVEAL_COMBOS.length)],
    [seed]
  );
  const zoneIdx = useMemo(() => Math.floor(seededRand(seed + 1) * REVEAL_SAFE_ZONES.length), [seed]);
  const captionTop = useMemo(() => {
    const raw = Math.round(H * REVEAL_SAFE_ZONES[zoneIdx]);
    return Math.min(raw, maxTop);
  }, [zoneIdx, maxTop]);

  return (
    <div style={{ width: W, height: H, position: "relative", background: "#000", overflow: "hidden" }}>
      {slot.imageUrl ? (
        <img
          data-export-image=""
          src={slot.imageUrl}
          alt=""
          crossOrigin={exportImgCrossOrigin(slot.imageUrl)}
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1c1c1c",
            color: "rgba(255,255,255,0.15)",
            fontFamily: "Arial, sans-serif",
            fontSize: 24,
          }}
        >
          No image
        </div>
      )}

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
            background: combo.bg,
            borderRadius: 12,
            padding: "10px 20px",
            maxWidth: Math.round(W * 0.85),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            border: "1px solid rgba(0,0,0,0.2)",
          }}
        >
          <span
            style={{
              display: "block",
              color: combo.color,
              fontSize: size,
              fontWeight: 800,
              lineHeight: 1.2,
              fontFamily: "Arial, Helvetica, sans-serif",
              textAlign: "center",
            }}
          >
            {spentLine}
          </span>
          {itemLine ? (
            <span
              style={{
                display: "block",
                color: combo.color,
                fontSize: size,
                fontWeight: 800,
                lineHeight: 1.2,
                fontFamily: "Arial, Helvetica, sans-serif",
                textAlign: "center",
              }}
            >
              {itemLine}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const SOURCES = ["eBay", "Poshmark", "Mercari", "Depop", "Grailed", "StockX", "Vestiaire", "thredUP"];

function rand(seed) {
  const x = Math.sin(seed + 1.7) * 10000;
  return x - Math.floor(x);
}

function randInt(seed, min, max) {
  return Math.floor(rand(seed) * (max - min + 1)) + min;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function randomPastDate(seed) {
  const daysBack = randInt(seed + 10, 1, 240);
  const base = new Date(2026, 3, 4);
  base.setDate(base.getDate() - daysBack);
  const mon = MONTHS[base.getMonth()];
  return `${mon} ${base.getDate()}, ${base.getFullYear()}`;
}

const CAPTION_TEMPLATES = [
  (s, r) => `found for $${s} → resell $${r} 💰`,
  (s, r) => `thrifted $${s} · flip for $${r} 🤑`,
  (s, r) => `paid $${s} · listed at $${r} 💸`,
  (s, r) => `scored for $${s} → asking $${r} 🔥`,
  (s, r) => `grabbed for $${s} · (worth $${r}) 💰`,
  (s, r) => `$${s} find → $${r} resale 🏷️`,
  (s, r) => `cost me $${s} · resell $${r} 💵`,
];

const CAPTION_COMBOS = [
  { bg: "#e03030", color: "#ffffff" },
  { bg: "#1a5cbf", color: "#ffffff" },
  { bg: "#1a8a3a", color: "#ffffff" },
  { bg: "#7c22cc", color: "#ffffff" },
  { bg: "#e05c20", color: "#ffffff" },
  { bg: "#000000", color: "#ffffff" },
  { bg: "#ffffff", color: "#000000" },
  { bg: "#d4a017", color: "#000000" },
  { bg: "#ec4899", color: "#ffffff" },
  { bg: "#0891b2", color: "#ffffff" },
];

const IPHONE_SCALE = 1080 / 390;

/** Thrifty-style data screen — no canvas, status bar, or transforms. */
export function ExportThriftySlide({ slot, captionSize: globalCaptionSize }) {
  const px = (n) => Math.round(n * IPHONE_SCALE);

  const seed = useMemo(() => {
    const str = (slot.itemName || "") + (slot.spentPrice || "") + (slot.soldPrice || "");
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return Math.abs(h) % 9999;
  }, [slot.itemName, slot.spentPrice, slot.soldPrice]);

  const statusBar = useMemo(
    () => ({
      date: randomPastDate(seed),
    }),
    [seed]
  );

  const [src1, src2] = useMemo(() => {
    const pool = [...SOURCES];
    const a = pool.splice(randInt(seed + 5, 0, pool.length - 1), 1)[0];
    const b = pool.splice(randInt(seed + 6, 0, pool.length - 1), 1)[0];
    return [a, b];
  }, [seed]);

  const soldPrice = slot.soldPrice ? `$${slot.soldPrice}` : "$—";
  const itemName = slot.itemName || "Untitled Item";
  const date = slot.date || statusBar.date;

  const captionText = (() => {
    const sold = parseFloat(slot.soldPrice);
    const spent = parseFloat(slot.spentPrice);
    if (!Number.isNaN(sold) && !Number.isNaN(spent) && sold > spent) {
      const template = CAPTION_TEMPLATES[randInt(seed + 40, 0, CAPTION_TEMPLATES.length - 1)];
      return template(slot.spentPrice, slot.soldPrice);
    }
    if (slot.soldPrice) return `resell for $${slot.soldPrice} 💰`;
    return null;
  })();

  const randomCombo = useMemo(
    () => CAPTION_COMBOS[randInt(seed + 30, 0, CAPTION_COMBOS.length - 1)],
    [seed]
  );

  const soldRows = useMemo(() => buildSoldRows(slot, src1, src2), [slot, src1, src2]);

  const capSize = globalCaptionSize ?? 60;

  const prices = soldRows.filter((r) => r.price).map((r) => parseFloat(r.price)).filter((v) => !Number.isNaN(v));
  const avgSold =
    prices.length > 0 ? `$${(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)}` : null;

  return (
    <div
      style={{
        width: W,
        height: H,
        background: "#ffffff",
        overflow: "hidden",
        position: "relative",
        fontFamily: "Arial, Helvetica, sans-serif",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {captionText ? (
        <div
          style={{
            flexShrink: 0,
            padding: `${px(12)}px ${px(16)}px`,
            background: randomCombo.bg,
            borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <span
            style={{
              display: "block",
              color: randomCombo.color,
              fontSize: capSize,
              fontWeight: 800,
              lineHeight: 1.2,
              textAlign: "center",
            }}
          >
            {captionText}
          </span>
        </div>
      ) : null}

      <div
        style={{
          flexShrink: 0,
          paddingLeft: px(20),
          paddingRight: px(20),
          paddingTop: px(20),
          paddingBottom: px(16),
        }}
      >
        <div
          style={{
            fontSize: px(42),
            fontWeight: 900,
            color: "#7B4F2E",
            fontFamily: "Georgia, 'Times New Roman', serif",
            textAlign: "center",
            marginBottom: px(16),
          }}
        >
          thrifty
        </div>

        <div style={{ display: "flex", gap: px(16), alignItems: "flex-start" }}>
          <div
            style={{
              width: px(120),
              height: px(120),
              borderRadius: px(16),
              overflow: "hidden",
              flexShrink: 0,
              background: "#e8e8e8",
            }}
          >
            {slot.imageUrl ? (
              <img
                data-export-image=""
                src={slot.imageUrl}
                alt=""
                crossOrigin={exportImgCrossOrigin(slot.imageUrl)}
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                background: "rgba(0,0,0,0.05)",
                borderRadius: px(8),
                padding: `${px(10)}px ${px(12)}px`,
                marginBottom: px(8),
              }}
            >
              <span style={{ fontSize: px(18), fontWeight: 700, color: "#000", lineHeight: 1.15, display: "block" }}>
                {itemName}
              </span>
            </div>
            <span style={{ fontSize: px(14), fontWeight: 500, color: "#888", display: "block" }}>{date}</span>
          </div>
        </div>
      </div>

      <div style={{ height: px(1), background: "#f0f0f0", flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: "rgba(0,0,0,0.03)",
          padding: `${px(16)}px ${px(16)}px ${px(24)}px`,
          display: "flex",
          flexDirection: "column",
          gap: px(16),
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: px(12),
            padding: `${px(20)}px`,
            textAlign: "center",
            border: "1px solid #eee",
          }}
        >
          <span
            style={{
              fontSize: px(14),
              fontWeight: 500,
              color: "#888",
              letterSpacing: px(1),
              textTransform: "uppercase",
              display: "block",
              marginBottom: px(6),
            }}
          >
            Thrifty Price
          </span>
          <span style={{ fontSize: px(56), fontWeight: 700, color: slot.soldPrice ? "#000" : "#aaa", display: "block" }}>
            {soldPrice}
          </span>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: px(16),
            padding: px(16),
            border: "1px solid #eee",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span style={{ fontSize: px(18), fontWeight: 600, color: "#111", display: "block", marginBottom: px(8) }}>
            Sold
          </span>
          <p style={{ fontSize: px(14), color: "#888", margin: `0 0 ${px(8)}px`, lineHeight: 1.2 }}>
            Recently Sold on {src1}, {src2} &amp; more:
          </p>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {soldRows.map((row, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: px(8),
                  paddingTop: px(6),
                  paddingBottom: px(6),
                  borderBottom: i === soldRows.length - 1 ? "none" : `${px(1)}px solid #f5f5f5`,
                }}
              >
                <div
                  style={{
                    width: px(80),
                    height: px(80),
                    borderRadius: px(8),
                    background: "#e8e8e8",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: px(14),
                      fontWeight: 500,
                      color: "#000",
                      lineHeight: 1.15,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.title || "Sold listing"}
                  </p>
                  <div style={{ display: "flex", gap: px(6), marginTop: px(4) }}>
                    <span style={{ fontSize: px(12), color: "#3b82f6" }}>{row.source || "eBay"}</span>
                    <span style={{ fontSize: px(12), color: "#ef4444", fontWeight: 500 }}>• Sold</span>
                  </div>
                </div>
                <span style={{ fontSize: px(15), fontWeight: 700, color: "#000", flexShrink: 0 }}>
                  {row.price ? `$${row.price}` : "—"}
                </span>
              </div>
            ))}
          </div>
          {avgSold ? (
            <div
              style={{
                marginTop: px(8),
                paddingTop: px(8),
                borderTop: `${px(1)}px solid #f0f0f0`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: px(14), color: "#888" }}>Sold average ({prices.length} items):</span>
              <span style={{ fontSize: px(16), fontWeight: 700, color: "#ef4444" }}>{avgSold}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
