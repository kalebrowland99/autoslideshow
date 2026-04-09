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

// TikTok music-note logo
function TikTokLogo({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M38.4 10.56A10.72 10.72 0 0 1 32 8v8.32a18.72 18.72 0 0 0 6.4 1.12V26a26.56 26.56 0 0 1-15.36-4.8V38a13.6 13.6 0 1 1-13.6-13.6 13.44 13.44 0 0 1 3.2.4V34a5.6 5.6 0 1 0 3.84 5.28V8h8.32a10.72 10.72 0 0 0 8 10.24v-7.68Z" fill="white"/>
      {/* Cyan accent */}
      <path d="M36.48 9.28A10.72 10.72 0 0 1 30.08 6.72v8.32a18.72 18.72 0 0 0 6.4 1.12V24.64a26.56 26.56 0 0 1-15.36-4.8V36.64a13.6 13.6 0 1 1-13.6-13.6 13.44 13.44 0 0 1 3.2.4V32.64a5.6 5.6 0 1 0 3.84 5.28V6.72h8.32a10.72 10.72 0 0 0 8 10.24V9.28Z" fill="#25f4ee" opacity="0.6"/>
    </svg>
  );
}

// Deterministic Fisher-Yates shuffle using a seed integer
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b) ^ (Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 16)) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Single card in the grid.
 * type: "ai" | "thrifty" | "lilyclaire"
 * visible=true → fully rendered, visible=false → transparent placeholder.
 */
function StarterCard({
  title,
  imageUrl,
  type = "ai",
  headerBg = "#1c1c1e",
  headerH,
  cardW,
  cardH,
  fontSize,
  visible,
}) {
  const imageH = cardH - headerH;

  // Thrifty logo: contain + padding
  const isThrifty = type === "thrifty";
  const isLilyClaire = type === "lilyclaire";
  const padPx = isThrifty ? Math.round(Math.min(cardW, imageH) * 0.14) : 0;

  // TikTok card body bg
  const bodyBg = isLilyClaire ? "#000000" : "#ffffff";

  return (
    <div style={{
      width: cardW,
      height: cardH,
      borderRadius: 8,
      overflow: "hidden",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.35s ease",
      flexShrink: 0,
      background: "#ffffff",
    }}>
      {/* Dark header */}
      <div style={{
        width: "100%",
        height: headerH,
        background: isLilyClaire ? "#fe2c55" : headerBg,
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

      {/* Body */}
      <div style={{
        width: "100%",
        height: imageH,
        overflow: "hidden",
        background: bodyBg,
        position: "relative",
        boxSizing: "border-box",
        padding: padPx > 0 ? padPx : 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: Math.round(imageH * 0.06),
      }}>
        {isLilyClaire ? (
          /* TikTok-branded card */
          <>
            <TikTokLogo size={Math.round(imageH * 0.38)} />
            <span style={{
              color: "#ffffff",
              fontSize: Math.round(fontSize * 0.95),
              fontWeight: 700,
              fontFamily: FONT,
              letterSpacing: "-0.01em",
              textAlign: "center",
            }}>
              @lily_claire
            </span>
            <span style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: Math.round(fontSize * 0.75),
              fontFamily: FONT,
              textAlign: "center",
            }}>
              on TikTok
            </span>
          </>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: isThrifty ? "contain" : "cover",
              objectPosition: "center",
              display: "block",
            }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#ffffff", position: "relative" }}>
            {visible && (
              <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(0,0,0,0.35)",
                fontSize: Math.max(10, Math.round(fontSize * 0.8)),
                fontWeight: 600,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                fontFamily: FONT,
              }}>
                loading…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StarterPackSlide({ config, S, phase = -1 }) {
  const J = makeJitter(config?.jitterSeed ?? 0);

  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);

  // Black letterbox bars (top + bottom) — matches TikTok-style reference
  const barTop    = Math.round((0.065 + J(97, 1) * 0.002) * H);
  const barBottom = Math.round((0.065 + J(98, 1) * 0.002) * H);
  const contentH  = H - barTop - barBottom;

  // ── Layout (inside white content area only) ──────────────────────────────
  const padH     = Math.round((56 + J(90, 4)) * S);   // horizontal padding
  const padTop   = Math.round((48 + J(91, 4)) * S);   // top padding above headline
  const headlineGap = Math.round((32 + J(92, 3)) * S); // gap between headline and grid
  const gridGap  = Math.round((14 + J(93, 2)) * S);   // gap between cards
  const headerH  = Math.round((62 + J(94, 2)) * S);   // card dark header height

  const gridW    = W - padH * 2;
  const cardW    = Math.round((gridW - gridGap) / 2);

  // Headline area: measure ~3 lines at scaledFontSize
  const headlineFontSize = Math.round((46 + J(95, 2)) * S);
  const headlineLineH    = Math.round(headlineFontSize * 1.28);
  const maxHeadlineLines = 4;
  const headlineAreaH    = headlineLineH * maxHeadlineLines + Math.round(8 * S);

  // Grid fills remaining height inside white panel
  const gridH    = contentH - padTop - headlineAreaH - headlineGap - Math.round(20 * S);
  const cardH    = Math.round((gridH - gridGap) / 2);

  // Card font size
  const cardFontSize = Math.round((22 + J(96, 1)) * S);

  // ── Data ─────────────────────────────────────────────────────────────────
  const headline = (config?.starterPackHeadline ?? "").trim() || "pov: you thrift full time";
  const slots    = config?.slots ?? [];

  // 4 cards: 2 AI-generated + lily claire + Thrifty (shuffled each generation)
  const baseItems = [
    { title: slots[0]?.itemName || "thrift find",  imageUrl: slots[0]?.imageUrl ?? null, type: "ai" },
    { title: slots[1]?.itemName || "the move",     imageUrl: slots[1]?.imageUrl ?? null, type: "ai" },
    { title: "lily claire on tiktok",               imageUrl: null,                       type: "lilyclaire" },
    { title: "Thrifty",                             imageUrl: "/thrifty.png",             type: "thrifty" },
  ];

  // Shuffle positions — changes each generation via jitterSeed
  const items = seededShuffle(baseItems, config?.jitterSeed ?? 0);

  // phase -1 = show all (preview / static export)
  // phase  0 = headline only
  // phase  1-4 = cards 1–N visible
  const visibleCount = phase < 0 ? 4 : phase;

  // Rotate card header colours slightly per generation
  const HEADER_COLORS = ["#1c1c1e", "#2c2c2e", "#1a1a2e", "#0d0d0d", "#1e1e28"];
  const headerBg = HEADER_COLORS[(config?.jitterSeed ?? 0) % HEADER_COLORS.length];

  return (
    <div style={{
      width: W,
      height: H,
      background: "#000000",
      fontFamily: FONT,
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      boxSizing: "border-box",
    }}>
      <div style={{ height: barTop, flexShrink: 0, background: "#000000" }} />

      {/* White content band — headline + grid only here */}
      <div style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingLeft: padH,
        paddingRight: padH,
        paddingTop: padTop,
        boxSizing: "border-box",
        overflow: "hidden",
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
              key={item.type + item.title}
              title={item.title}
              imageUrl={item.imageUrl}
              type={item.type}
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

      <div style={{ height: barBottom, flexShrink: 0, background: "#000000" }} />
    </div>
  );
}
