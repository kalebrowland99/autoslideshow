"use client";

/**
 * "Starter Pack" list slide — white background, headline at top, 2×2 card grid.
 * Cards fade in one-by-one per phase:
 *   phase 0 → headline only
 *   phase 1 → card 1 visible
 *   phase 2 → cards 1-2 visible
 *   phase 3 → cards 1-3 visible
 *   phase 4 → all 4 cards visible (card 4 is always "Thrifty")
 *
 * Pass phase=-1 (or omit) to show all cards at once (static preview).
 */

import { makeJitter } from "@/lib/jitter";

const FONT = '"TikTok Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

// Bookmark SVG icon for card header
function BookmarkIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
    </svg>
  );
}

/**
 * Single card in the grid.
 * visible=true → fully rendered, visible=false → transparent placeholder (keeps grid spacing).
 */
function StarterCard({ title, imageUrl, headerBg = "#1c1c1e", headerH, cardW, cardH, fontSize, visible }) {
  const imageH = cardH - headerH;

  return (
    <div style={{
      width: cardW,
      height: cardH,
      borderRadius: 8,
      overflow: "hidden",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.35s ease",
      flexShrink: 0,
      background: "#e5e5ea",
    }}>
      {/* Dark header with title + bookmark */}
      <div style={{
        width: "100%",
        height: headerH,
        background: headerBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: Math.round(cardW * 0.05),
        paddingRight: Math.round(cardW * 0.05),
        boxSizing: "border-box",
        gap: 8,
      }}>
        <span style={{
          color: "#fff",
          fontSize,
          fontWeight: 600,
          fontFamily: FONT,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          letterSpacing: "-0.01em",
        }}>
          {title}
        </span>
        <BookmarkIcon size={Math.round(fontSize * 1.1)} />
      </div>

      {/* Image */}
      <div style={{ width: "100%", height: imageH, overflow: "hidden", background: "#d1d1d6", position: "relative" }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          /* Subtle grey placeholder while no image */
          <div style={{ width: "100%", height: "100%", background: "#c7c7cc" }} />
        )}
      </div>
    </div>
  );
}

export default function StarterPackSlide({ config, S, phase = -1 }) {
  const J = makeJitter(config?.jitterSeed ?? 0);

  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);

  // ── Layout ───────────────────────────────────────────────────────────────
  const padH     = Math.round((56 + J(90, 4)) * S);   // horizontal padding
  const padTop   = Math.round((60 + J(91, 4)) * S);   // top padding above headline
  const headlineGap = Math.round((36 + J(92, 3)) * S); // gap between headline and grid
  const gridGap  = Math.round((14 + J(93, 2)) * S);   // gap between cards
  const headerH  = Math.round((62 + J(94, 2)) * S);   // card dark header height

  const gridW    = W - padH * 2;
  const cardW    = Math.round((gridW - gridGap) / 2);

  // Headline area: measure ~3 lines at scaledFontSize
  const headlineFontSize = Math.round((46 + J(95, 2)) * S);
  const headlineLineH    = Math.round(headlineFontSize * 1.28);
  const maxHeadlineLines = 4;
  const headlineAreaH    = headlineLineH * maxHeadlineLines + Math.round(8 * S); // a little slack

  // Grid fills remaining height
  const gridH    = H - padTop - headlineAreaH - headlineGap - Math.round(24 * S);
  const cardH    = Math.round((gridH - gridGap) / 2);

  // Card font size
  const cardFontSize = Math.round((22 + J(96, 1)) * S);

  // ── Data ─────────────────────────────────────────────────────────────────
  const headline = (config?.starterPackHeadline ?? "").trim() || "starter pack";
  const slots    = config?.slots ?? [];
  const items = [
    { title: slots[0]?.itemName || "Item 1", imageUrl: slots[0]?.imageUrl ?? null },
    { title: slots[1]?.itemName || "Item 2", imageUrl: slots[1]?.imageUrl ?? null },
    { title: slots[2]?.itemName || "Item 3", imageUrl: slots[2]?.imageUrl ?? null },
    { title: "Thrifty",                       imageUrl: "/thrifty.png" },
  ];

  // phase -1 = show all (preview / static export)
  // phase  0 = headline only
  // phase  1-4 = cards 1–N visible
  const visibleCount = phase < 0 ? 4 : phase;

  // Rotate card header colours slightly per generation
  const HEADER_COLORS = ["#1c1c1e", "#2c2c2e", "#1a1a2e", "#0d0d0d", "#1e1e28"];
  const headerBg = HEADER_COLORS[(config?.jitterSeed ?? 0) % HEADER_COLORS.length];

  return (
    <div style={{
      width: W, height: H,
      background: "#ffffff",
      fontFamily: FONT,
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      paddingLeft: padH,
      paddingRight: padH,
      paddingTop: padTop,
      boxSizing: "border-box",
    }}>

      {/* ── Headline — never fades, always static ─────────────────────────── */}
      <div style={{
        width: "100%",
        minHeight: headlineAreaH,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: headlineFontSize,
          fontWeight: 700,
          color: "#000000",
          lineHeight: 1.28,
          letterSpacing: "-0.02em",
          fontFamily: FONT,
          display: "block",
        }}>
          {headline}
        </span>
      </div>

      {/* Gap */}
      <div style={{ height: headlineGap, flexShrink: 0 }} />

      {/* ── 2×2 card grid ────────────────────────────────────────────────── */}
      <div style={{
        width: gridW,
        height: gridH,
        display: "grid",
        gridTemplateColumns: `${cardW}px ${cardW}px`,
        gridTemplateRows: `${cardH}px ${cardH}px`,
        gap: gridGap,
        flexShrink: 0,
      }}>
        {items.map((item, i) => (
          <StarterCard
            key={i}
            title={item.title}
            imageUrl={item.imageUrl}
            headerBg={headerBg}
            headerH={headerH}
            cardW={cardW}
            cardH={cardH}
            fontSize={cardFontSize}
            visible={i < visibleCount}
          />
        ))}
      </div>
    </div>
  );
}
