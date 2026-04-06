"use client";

import { useMemo, useEffect, useRef } from "react";
import { exportImgCrossOrigin } from "../exportImg";
import { buildSoldRows } from "./thriftySoldRows";

/**
 * ThriftySlide — pixel-faithful recreation of SongEditView.
 * Randomizes status-bar (time, signal, wifi, battery) and sold-listing
 * sources on every mount to dodge TikTok duplicate-content filters.
 *
 * Scaling: IPHONE_SCALE = 1080/390 maps iPhone pts → TikTok pixels.
 */

const IPHONE_SCALE = 1080 / 390;

const SOURCES = ["eBay", "Poshmark", "Mercari", "Depop", "Grailed", "StockX", "Vestiaire", "thredUP"];

// ── Seeded PRNG (stable per mount) ──────────────────────────────────────────
function rand(seed) {
  const x = Math.sin(seed + 1.7) * 10000;
  return x - Math.floor(x);
}

function randInt(seed, min, max) {
  return Math.floor(rand(seed) * (max - min + 1)) + min;
}

// ── Random time string ───────────────────────────────────────────────────────
function randomTime(seed) {
  const h = randInt(seed,     7, 11);
  const m = randInt(seed + 1, 0, 59);
  return `${h}:${String(m).padStart(2, "0")}`;
}

// ── Random past date (within ~8 months before Apr 4 2026) ────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function randomPastDate(seed) {
  // Pick a day between 1–240 days before Apr 4, 2026
  const daysBack = randInt(seed + 10, 1, 240);
  const base = new Date(2026, 3, 4);           // Apr 4 2026
  base.setDate(base.getDate() - daysBack);
  const mon = MONTHS[base.getMonth()];
  return `${mon} ${base.getDate()}, ${base.getFullYear()}`;
}

// ── Canvas confetti (mirrors Thrifty iOS confettiCannon) ─────────────────────
const CONFETTI_COLORS = ["#ef4444","#f59e0b","#3b82f6","#22c55e","#a855f7","#ec4899","#f97316","#06b6d4"];

function fireConfetti(canvas) {
  if (!canvas) return;
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d");

  // Two burst origins: badge area (~38% down) and price card (~50% down)
  const origins = [
    { x: W * 0.5, y: H * 0.38 },
    { x: W * 0.5, y: H * 0.50 },
  ];

  const NUM = 40;
  const rng = () => Math.random();

  const particles = Array.from({ length: NUM }, (_, i) => {
    const o = origins[i % origins.length];
    const angle = rng() * Math.PI * 2;
    const speed = 3 + rng() * (H * 0.05);
    return {
      x: o.x + (rng() - 0.5) * W * 0.06,
      y: o.y,
      vx: Math.cos(angle) * speed * 0.25,
      vy: -(rng() * speed * 0.35 + speed * 0.1),
      color: CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length)],
      w: 2 + rng() * 4,
      h: 1.5 + rng() * 3,
      rot: rng() * Math.PI * 2,
      rotV: (rng() - 0.5) * 0.25,
      opacity: 1,
      offscreen: false,
      shape: rng() > 0.45 ? "rect" : "circle",
    };
  });

  let rafId;
  function tick() {
    ctx.clearRect(0, 0, W, H);
    let any = false;
    for (const p of particles) {
      if (p.offscreen) continue;
      any = true;
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += H * 0.0008;   // gravity proportional to canvas height
      p.vx *= 0.985;
      p.rot += p.rotV;
      // Mark offscreen once fully past bottom (no opacity fade)
      if (p.y > H + 20) { p.offscreen = true; continue; }

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (any) rafId = requestAnimationFrame(tick);
  }

  tick();
  return () => cancelAnimationFrame(rafId);
}

export default function ThriftySlide({ slot, S, captionSize: globalCaptionSize }) {
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);
  const px = (n) => Math.round(n * IPHONE_SCALE * S);

  const canvasRef = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const cleanup = fireConfetti(canvasRef.current);
      return cleanup;
    }, 300);
    return () => clearTimeout(t);
  }, []);  // fires once per mount = once per slide-in

  // Stable seed derived from slot content — same layout every render & export
  // (no useEffect/Math.random so the output never changes between preview and video)
  const seed = useMemo(() => {
    const str = (slot.itemName || "") + (slot.spentPrice || "") + (slot.soldPrice || "");
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return Math.abs(h) % 9999;
  }, [slot.itemName, slot.spentPrice, slot.soldPrice]);
  const statusBar = useMemo(() => ({
    time:        randomTime(seed),
    signalBars:  randInt(seed + 2, 2, 4),
    wifiStrength:randInt(seed + 3, 1, 3),
    batteryPct:  randInt(seed + 4, 22, 97),
    date:        randomPastDate(seed),
  }), [seed]);

  // Randomise which two sources appear in the sold rows
  const [src1, src2] = useMemo(() => {
    const pool = [...SOURCES];
    const a = pool.splice(randInt(seed + 5, 0, pool.length - 1), 1)[0];
    const b = pool.splice(randInt(seed + 6, 0, pool.length - 1), 1)[0];
    return [a, b];
  }, [seed]);

  const soldPrice  = slot.soldPrice ? `$${slot.soldPrice}` : "$—";
  const itemName   = slot.itemName || "Untitled Item";
  const date       = slot.date || statusBar.date;

  // Varied caption phrasings — picked by seed so each slide gets a different one
  const CAPTION_TEMPLATES = [
    (s, r) => `found for $${s} → resell $${r} 💰`,
    (s, r) => `thrifted $${s} · flip for $${r} 🤑`,
    (s, r) => `paid $${s} · listed at $${r} 💸`,
    (s, r) => `scored for $${s} → asking $${r} 🔥`,
    (s, r) => `grabbed for $${s} · (worth $${r}) 💰`,
    (s, r) => `$${s} find → $${r} resale 🏷️`,
    (s, r) => `cost me $${s} · resell $${r} 💵`,
  ];
  const captionText = (() => {
    const sold  = parseFloat(slot.soldPrice);
    const spent = parseFloat(slot.spentPrice);
    if (!isNaN(sold) && !isNaN(spent) && sold > spent) {
      const template = CAPTION_TEMPLATES[randInt(seed + 40, 0, CAPTION_TEMPLATES.length - 1)];
      return template(slot.spentPrice, slot.soldPrice);
    }
    if (slot.soldPrice) return `resell for $${slot.soldPrice} 💰`;
    return null;
  })();

  // Randomised caption colors
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
  const randomCombo = useMemo(
    () => CAPTION_COMBOS[randInt(seed + 30, 0, CAPTION_COMBOS.length - 1)],
    [seed]
  );
  // Per-mount jitter + tilt (stable per render, dodges TikTok pattern detection)
  const captionJitter = useMemo(() => ({
    x:   Math.round((rand(seed + 20) - 0.5) * 16 * S),
    y:   Math.round((rand(seed + 21) - 0.5) * 16 * S),
    rot: ((rand(seed + 22) - 0.5) * 4).toFixed(2), // ±2 degrees
  }), [seed, S]);

  // Random safe zones — avoids logo (H×0.05-0.18) and price card (H×0.38-0.54)
  // Max zone capped so caption box never overflows the bottom edge
  const THRIFTY_SAFE_ZONES = [0.22, 0.30, 0.60, 0.68, 0.75];
  const captionBoxHeight = Math.round(10 * S) * 2 + Math.round(60 * S * 1.2);
  const maxCaptionTop = H - captionBoxHeight - Math.round(H * 0.02);
  const rawCaptionTop = Math.round(H * THRIFTY_SAFE_ZONES[randInt(seed + 50, 0, THRIFTY_SAFE_ZONES.length - 1)]) + captionJitter.y;
  const captionTop = Math.min(rawCaptionTop, maxCaptionTop);

  const soldRows = buildSoldRows(slot, src1, src2);

  return (
    <div style={{ width: W, height: H, background: "#ffffff", overflow: "hidden",
      position: "relative", fontFamily: "Arial, Helvetica, sans-serif",
      display: "flex", flexDirection: "column" }}>

      {/* Floating caption — flex-centered wrapper avoids calc() in html2canvas */}
      {captionText && (
        <div style={{
          position: "absolute",
          left: 0,
          width: W,
          top: captionTop,
          display: "flex",
          justifyContent: "center",
          zIndex: 100,
          pointerEvents: "none",
        }}>
          <div style={{
            marginLeft: captionJitter.x,
            transform: `rotate(${captionJitter.rot}deg)`,
            background: randomCombo.bg,
            borderRadius: Math.round(12 * S),
            padding: `${Math.round(10 * S)}px ${Math.round(20 * S)}px`,
            maxWidth: Math.round(W * 0.8),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 ${Math.round(4 * S)}px ${Math.round(20 * S)}px rgba(0,0,0,0.55)`,
          }}>
            <span style={{
              display: "block",
              color: randomCombo.color,
              fontSize: Math.round((globalCaptionSize ?? 60) * S),
              fontWeight: "800",
              lineHeight: 1.2,
              fontFamily: "Arial, Helvetica, sans-serif",
              letterSpacing: "-0.01em",
              textAlign: "center",
            }}>
              {captionText}
            </span>
          </div>
        </div>
      )}

      {/* Confetti canvas — sits on top, pointer-events off so clicks pass through */}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ position: "absolute", inset: 0, zIndex: 9999, pointerEvents: "none" }}
      />

      <StatusBar px={px} values={statusBar} />

      {/* ── HEADER ── */}
      <div style={{ background: "#fff", flexShrink: 0,
        paddingLeft: px(20), paddingRight: px(20),
        paddingTop: px(20), paddingBottom: px(20) }}>

        {/* Nav row */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: px(16) }}>
          {/* Back arrow */}
          <div style={{ width: px(44), height: px(44), display: "flex", alignItems: "center" }}>
            <svg width={px(22)} height={px(22)} viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="#111" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* "thrifty" — large serif logo */}
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", minHeight: px(44) }}>
            <span style={{
              display: "block",
              fontSize: px(42),
              fontWeight: "900",
              color: "#7B4F2E",
              fontFamily: "Georgia, 'Times New Roman', serif",
              letterSpacing: "-1px",
              lineHeight: 1.02,
            }}>
              thrifty
            </span>
          </div>

          {/* Ellipsis */}
          <svg width={px(22)} height={px(22)} viewBox="0 0 24 24" fill="#111">
            <circle cx="5"  cy="12" r="1.8"/>
            <circle cx="12" cy="12" r="1.8"/>
            <circle cx="19" cy="12" r="1.8"/>
          </svg>
        </div>

        {/* Item row: thumbnail + name/date */}
        <div style={{ display: "flex", gap: px(16), alignItems: "flex-start" }}>
          <div style={{ width: px(120), height: px(120), borderRadius: px(16), overflow: "hidden",
            flexShrink: 0, background: "#e8e8e8",
            boxShadow: `0 ${px(2)}px ${px(4)}px rgba(0,0,0,0.1)` }}>
            {slot.imageUrl ? (
              <img
                data-export-image=""
                src={slot.imageUrl}
                alt={itemName}
                crossOrigin={exportImgCrossOrigin(slot.imageUrl)}
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: px(4) }}>
                <svg width={px(32)} height={px(32)} fill="none" viewBox="0 0 24 24" stroke="#bbb" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span style={{ color: "#bbb", fontSize: px(10), fontWeight: "500" }}>No photo</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: px(8) }}>
            <div style={{ position: "relative", background: "rgba(0,0,0,0.05)", borderRadius: px(8),
              minHeight: px(46), display: "flex", alignItems: "center",
              paddingTop: px(10), paddingBottom: px(10), paddingLeft: px(12), paddingRight: px(34) }}>
              <span style={{ fontSize: px(18), fontWeight: "700", color: "#000", lineHeight: 1.1, display: "block" }}>
                {itemName}
              </span>
              <svg style={{ position: "absolute", top: "50%", right: px(8), transform: "translateY(-50%)" }}
                width={px(13)} height={px(13)} fill="none" viewBox="0 0 24 24"
                stroke="rgba(0,0,0,0.3)" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </div>
            <span style={{ display: "block", fontSize: px(14), fontWeight: "500", color: "#888", lineHeight: 1.15 }}>{date}</span>
          </div>
        </div>

      </div>

      <div style={{ height: px(1), background: "#f0f0f0", flexShrink: 0 }} />

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, background: "rgba(0,0,0,0.03)", overflow: "hidden",
        display: "flex", flexDirection: "column", gap: px(16),
        paddingTop: px(16), paddingBottom: px(16) }}>

        {/* Thrifty Price card */}
        <div style={{ background: "#fff", borderRadius: px(12),
          boxShadow: `0 ${px(2)}px ${px(8)}px rgba(0,0,0,0.05)`,
          marginLeft: px(16), marginRight: px(16),
          paddingTop: px(20), paddingBottom: px(20),
          display: "flex", flexDirection: "column", alignItems: "center", gap: px(6) }}>
          <div style={{ display: "flex", alignItems: "center", gap: px(6) }}>
            <span style={{ display: "block", fontSize: px(14), fontWeight: "500", color: "#888", lineHeight: 1.1,
              letterSpacing: px(1), textTransform: "uppercase" }}>Thrifty Price</span>
            <div style={{ width: px(18), height: px(18), borderRadius: "50%", background: "#3b82f6",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: px(11), fontWeight: "700" }}>i</span>
            </div>
          </div>
          <span style={{ display: "block", fontSize: px(56), fontWeight: "700", letterSpacing: "-1px", lineHeight: 0.96,
            color: slot.soldPrice ? "#000" : "#aaa" }}>
            {soldPrice}
          </span>
        </div>

        {/* Sold card */}
        <div style={{ background: "#fff", borderRadius: px(16),
          boxShadow: `0 ${px(2)}px ${px(8)}px rgba(0,0,0,0.05)`,
          marginLeft: px(16), marginRight: px(16), padding: px(16) }}>

          <div style={{ display: "flex", alignItems: "center", gap: px(8), marginBottom: px(10) }}>
            <svg width={px(18)} height={px(18)} viewBox="0 0 24 24" fill="#ef4444">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            <span style={{ fontSize: px(18), fontWeight: "600", color: "#111" }}>Sold</span>
          </div>

          <p style={{ fontSize: px(14), fontWeight: "500", color: "#888", lineHeight: 1.2, margin: `0 0 ${px(8)}px 0` }}>
            Recently Sold on {src1}, {src2}{" "}&amp; more:
          </p>

          {soldRows.map((row, i) => (
            <SoldRow key={i} row={row}
              last={i === soldRows.length - 1} px={px} />
          ))}

          {soldRows.some((r) => r.price) && (
            <>
              <div style={{ height: px(1), background: "#f0f0f0", margin: `${px(6)}px 0` }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: px(14), fontWeight: "500", color: "#888" }}>
                  Sold Average ({soldRows.filter((r) => r.price).length} items):
                </span>
                <span style={{ fontSize: px(16), fontWeight: "700", color: "#ef4444" }}>
                  {(() => {
                    const prices = soldRows.filter((r) => r.price).map((r) => parseFloat(r.price)).filter((v) => !isNaN(v));
                    if (!prices.length) return "N/A";
                    return `$${(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)}`;
                  })()}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── iOS Status Bar — fully random ────────────────────────────────────────────
function StatusBar({ px, values }) {
  const { time, signalBars, wifiStrength, batteryPct } = values;
  const batteryFill = Math.round((batteryPct / 100) * 15); // 0-15px fill width
  const batteryColor = batteryPct < 25 ? "#ef4444" : "#111";

  return (
    <div style={{ height: px(44), background: "#fff", display: "flex", alignItems: "center",
      justifyContent: "space-between", paddingLeft: px(24), paddingRight: px(24), flexShrink: 0 }}>
      <span style={{ fontSize: px(15), fontWeight: "700", color: "#111" }}>{time}</span>
      <div style={{ display: "flex", alignItems: "center", gap: px(5) }}>

        {/* Signal bars — show signalBars out of 4 */}
        <svg width={px(17)} height={px(12)} viewBox="0 0 18 12" fill="none">
          <rect x="0" y="8" width="3" height="4" rx="0.5" fill={signalBars >= 1 ? "#111" : "rgba(0,0,0,0.2)"}/>
          <rect x="5" y="5" width="3" height="7" rx="0.5" fill={signalBars >= 2 ? "#111" : "rgba(0,0,0,0.2)"}/>
          <rect x="10" y="2" width="3" height="10" rx="0.5" fill={signalBars >= 3 ? "#111" : "rgba(0,0,0,0.2)"}/>
          <rect x="15" y="0" width="3" height="12" rx="0.5" fill={signalBars >= 4 ? "#111" : "rgba(0,0,0,0.2)"}/>
        </svg>

        {/* WiFi — show wifiStrength arcs out of 3 */}
        <svg width={px(15)} height={px(11)} viewBox="0 0 20 13" fill="none">
          <path d="M10 11.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
            fill={wifiStrength >= 1 ? "#111" : "rgba(0,0,0,0.2)"}/>
          <path d="M6.2 8.2C7.3 7.1 8.6 6.5 10 6.5s2.7.6 3.8 1.7"
            stroke={wifiStrength >= 2 ? "#111" : "rgba(0,0,0,0.2)"}
            strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          <path d="M3 5C5.1 2.9 7.4 1.8 10 1.8s4.9 1.1 7 3.2"
            stroke={wifiStrength >= 3 ? "#111" : "rgba(0,0,0,0.2)"}
            strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        </svg>

        {/* Battery — variable fill */}
        <svg width={px(25)} height={px(12)} viewBox="0 0 25 12" fill="none">
          {/* Shell */}
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="#111" strokeWidth="1"/>
          {/* Fill */}
          <rect x="1.5" y="1.5" width={batteryFill} height="9" rx="2.5" fill={batteryColor}/>
          {/* Nub */}
          <path d="M23 4v4" stroke="#111" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}

// ── Sold listing row ─────────────────────────────────────────────────────────
function SoldRow({ row, last, px }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: px(8),
      paddingTop: px(6), paddingBottom: px(6),
      borderBottom: last ? "none" : `${px(1)}px solid #f5f5f5` }}>

      {/* Thumbnail — grey placeholder box */}
      <div style={{ width: px(80), height: px(80), borderRadius: px(8), overflow: "hidden",
        flexShrink: 0, background: "#e8e8e8",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={px(28)} height={px(28)} fill="none" viewBox="0 0 24 24" stroke="#bbb" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      {/* Title + source */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ display: "block", fontSize: px(14), fontWeight: "500", color: "#000",
          lineHeight: 1.15, margin: `0 0 ${px(4)}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.title || "Sold listing"}
        </p>
        <div style={{ display: "flex", gap: px(6) }}>
          <span style={{ fontSize: px(12), color: "#3b82f6" }}>{row.source || "eBay"}</span>
          <span style={{ fontSize: px(12), color: "#ef4444", fontWeight: "500" }}>• Sold</span>
        </div>
      </div>

      {/* Price + chevron */}
      <div style={{ display: "flex", alignItems: "center", gap: px(3), flexShrink: 0 }}>
        <span style={{ fontSize: px(15), fontWeight: "700", color: "#000" }}>
          {row.price ? `$${row.price}` : "—"}
        </span>
        <svg width={px(11)} height={px(11)} viewBox="0 0 24 24" fill="none"
          stroke="rgba(0,0,0,0.25)" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </div>
  );
}
