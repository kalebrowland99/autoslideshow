"use client";

/**
 * POV: you thrift full time
 * - Black top/bottom bars
 * - Middle white band with static headline
 * - Bottom strip of 5 struggle tiles that dissolve in sequentially via export phases
 *
 * phase:
 *  -1: show all tiles (preview)
 *   0: headline only
 *   1..5: show first N tiles
 */

import { makeJitter } from "@/lib/jitter";

const FONT = '"TikTok Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

function BookmarkIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
    </svg>
  );
}

function Tile({ title, imageUrl, visible, w, h, headerH, fontSize, headerBg }) {
  const imageH = h - headerH;
  return (
    <div style={{
      width: w,
      height: h,
      borderRadius: 8,
      overflow: "hidden",
      background: "#ffffff",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.35s ease",
    }}>
      <div style={{
        width: "100%",
        height: headerH,
        background: headerBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: Math.round(w * 0.06),
        paddingRight: Math.round(w * 0.06),
        boxSizing: "border-box",
        gap: 8,
      }}>
        <span style={{
          color: "#fff",
          fontSize,
          fontWeight: 650,
          lineHeight: 1.15,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          letterSpacing: "-0.01em",
          fontFamily: FONT,
        }}>{title}</span>
        <BookmarkIcon size={Math.round(fontSize * 1.1)} />
      </div>

      <div style={{ width: "100%", height: imageH, background: "#ffffff" }}>
        {imageUrl ? (
          <img src={imageUrl} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#ffffff" }} />
        )}
      </div>
    </div>
  );
}

export default function PovThriftFullTimeSlide({ config, S, phase = -1 }) {
  const J = makeJitter(config?.jitterSeed ?? 0);
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);

  const barTop    = Math.round((0.065 + J(140, 1) * 0.002) * H);
  const barBottom = Math.round((0.065 + J(141, 1) * 0.002) * H);
  const contentH  = H - barTop - barBottom;

  const padH      = Math.round((56 + J(142, 4)) * S);
  const padTop    = Math.round((48 + J(143, 4)) * S);
  const headlineGap = Math.round((18 + J(144, 2)) * S);
  const stripGap  = Math.round((12 + J(145, 2)) * S);

  const headlineFontSize = Math.round((48 + J(146, 2)) * S);
  const headlineLineH    = Math.round(headlineFontSize * 1.18);
  const headlineAreaH    = headlineLineH * 3 + Math.round(10 * S);

  const stripH     = Math.round((contentH - padTop - headlineAreaH - headlineGap - Math.round(18 * S)));
  const tileH      = Math.min(stripH, Math.round(520 * S));
  const tileW      = Math.round((W - padH * 2 - stripGap * 4) / 5);
  const headerH    = Math.round((60 + J(147, 2)) * S);
  const tileFont   = Math.round((20 + J(148, 1)) * S);

  const headline = (config?.povThriftHeadline ?? "").trim() || "pov: you thrift full time";
  const slots = config?.slots ?? [];

  const items = [
    { title: slots[0]?.itemName || "germ-x",          imageUrl: slots[0]?.imageUrl ?? null },
    { title: slots[1]?.itemName || "mask",            imageUrl: slots[1]?.imageUrl ?? null },
    { title: slots[2]?.itemName || "goodwill bins",   imageUrl: slots[2]?.imageUrl ?? null },
    { title: slots[3]?.itemName || "the line",        imageUrl: slots[3]?.imageUrl ?? null },
    { title: slots[4]?.itemName || "depop sales",     imageUrl: slots[4]?.imageUrl ?? null },
  ];

  const visibleCount = phase < 0 ? items.length : phase;
  const HEADER_COLORS = ["#1c1c1e", "#2c2c2e", "#101014", "#0d0d0d"];
  const headerBg = HEADER_COLORS[(config?.jitterSeed ?? 0) % HEADER_COLORS.length];

  return (
    <div style={{ width: W, height: H, background: "#000", fontFamily: FONT, overflow: "hidden" }}>
      <div style={{ height: barTop, background: "#000" }} />

      <div style={{
        height: contentH,
        background: "#fff",
        paddingLeft: padH,
        paddingRight: padH,
        paddingTop: padTop,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "hidden",
      }}>
        <div style={{ minHeight: headlineAreaH, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <span style={{
            fontSize: headlineFontSize,
            fontWeight: 800,
            color: "#000",
            lineHeight: 1.18,
            letterSpacing: "-0.02em",
            fontFamily: FONT,
            display: "block",
          }}>{headline}</span>
        </div>

        <div style={{ height: headlineGap }} />

        <div style={{
          width: "100%",
          height: tileH,
          display: "grid",
          gridTemplateColumns: `repeat(5, ${tileW}px)`,
          gap: stripGap,
          alignItems: "start",
          justifyContent: "center",
        }}>
          {items.map((it, i) => (
            <Tile
              key={i}
              title={it.title}
              imageUrl={it.imageUrl}
              visible={i < visibleCount}
              w={tileW}
              h={tileH}
              headerH={headerH}
              fontSize={tileFont}
              headerBg={headerBg}
            />
          ))}
        </div>
      </div>

      <div style={{ height: barBottom, background: "#000" }} />
    </div>
  );
}

