"use client";

import { useMemo } from "react";
import { getLabelyLawsuitBadgeLabel } from "@/lib/labelyLawsuitBadge";
import { clampLabelyScore, ratingLabelFromScore } from "@/lib/labelyRating";

const IPHONE_SCALE = 1080 / 390;

/**
 * Colors sampled 1:1 from the Figma export (JPEG in repo assets).
 * Page bg / neutrals / pantry / share / mint card edge taken from pixel averages.
 */
const C = {
  pageBg: "#F9F9F9",
  cardBg: "#FFFFFF",
  title: "#1A1A1A",
  textMuted: "#8E8E93",
  textBody: "#3C3C43",
  /** Share pill — cool light gray */
  shareBg: "#EFEFEF",
  shareBorder: "#DCDCE0",
  shareIcon: "#5C5C5C",
  /** Add to Pantry — sage green */
  pantryBorderSage: "#6B9080",
  pantryBgSage: "#EEF4F0",
  pantryTextSage: "#3D5C4E",
  /** Lawsuits badge — warm brown (pairs with wordmark) */
  lawsuitBorder: "#8B5A2B",
  lawsuitBg: "#FAF4EF",
  lawsuitText: "#5C3D1E",
  /** Analysis card — white + pale mint edge / glow */
  cardBorderMint: "#C9E8DE",
  cardShadowMint: "0 4px 28px rgba(122, 195, 170, 0.28)",
  /** Thrifty / Valcoin app wordmark — ThriftySlide `brand.appLower` */
  wordmarkFont: `Georgia, "Times New Roman", serif`,
  wordmarkColor: "#7B4F2E",
};

function scoreColors(score) {
  const s = clampLabelyScore(score);
  if (s <= 20) {
    return {
      dot: "#E54D42",
      scoreColor: C.title,
      verdictColor: C.textMuted,
    };
  }
  if (s <= 45) {
    return {
      dot: "#FF6B35",
      scoreColor: C.title,
      verdictColor: C.textMuted,
    };
  }
  if (s <= 60) {
    return {
      dot: "#FFB01A",
      scoreColor: C.title,
      verdictColor: C.textMuted,
    };
  }
  if (s <= 80) {
    return {
      dot: "#9CCC65",
      scoreColor: C.title,
      verdictColor: C.textMuted,
    };
  }
  return {
    dot: "#34C759",
    scoreColor: C.title,
    verdictColor: C.textMuted,
  };
}

/** Renders **bold** in analysis as strong (plain text otherwise). */
function AnalysisBody({ text, px }) {
  const parts = useMemo(() => {
    const t = text || "";
    const out = [];
    const re = /\*\*([^*]+)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (m.index > last) out.push({ bold: false, s: t.slice(last, m.index) });
      out.push({ bold: true, s: m[1] });
      last = m.index + m[0].length;
    }
    if (last < t.length) out.push({ bold: false, s: t.slice(last) });
    return out.length ? out : [{ bold: false, s: t }];
  }, [text]);

  return (
    <span style={{ fontSize: px(16), lineHeight: 1.5, color: C.textBody }}>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} style={{ color: C.title, fontWeight: 700 }}>{p.s}</strong>
        ) : (
          <span key={i}>{p.s}</span>
        )
      )}
    </span>
  );
}

function ShareGlyph({ px: pxFn, stroke }) {
  const s = stroke || C.shareIcon;
  return (
    <svg width={pxFn(20)} height={pxFn(20)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v10" stroke={s} strokeWidth="2" strokeLinecap="round" />
      <path d="M8.5 6.5 12 3l3.5 3.5" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke={s} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Bookmark / save icon for Add to Pantry */
function SaveGlyph({ px: pxFn, stroke, icon = 20 }) {
  const s = stroke || C.title;
  return (
    <svg width={pxFn(icon)} height={pxFn(icon)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h10a2 2 0 012 2v16l-7-4-7 4V5a2 2 0 012-2z"
        stroke={s}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LabelySlide({ slot, S }) {
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);
  const px = (n) => Math.round(n * IPHONE_SCALE * S);
  const gutter = px(22);
  const bw = Math.max(2, Math.round(2 * IPHONE_SCALE * S));

  const name = (slot.itemName || "").trim() || "Product";
  const brand = (slot.labelyBrand || "").trim();
  const score = clampLabelyScore(slot.labelyScore ?? 0);
  const verdict = (slot.labelyVerdict || "").trim() || ratingLabelFromScore(score);
  const analysis =
    (slot.labelyAnalysis || "").trim()
    || "Generate this slide from the sidebar to add a clean-ingredient analysis.";
  const lawsuitBadgeLabel = useMemo(
    () =>
      getLabelyLawsuitBadgeLabel(
        `${slot.itemName || ""}|${slot.labelyBrand || ""}|${slot.labelyScore ?? 0}`
      ),
    [slot.itemName, slot.labelyBrand, slot.labelyScore]
  );
  const colors = scoreColors(score);

  return (
    <div
      style={{
        width: W,
        height: H,
        background: C.pageBg,
        overflow: "hidden",
        position: "relative",
        fontFamily: "Arial, Helvetica, sans-serif",
        display: "flex",
        flexDirection: "column",
        color: C.title,
      }}
    >
      <div style={{ flexShrink: 0, paddingLeft: gutter, paddingRight: gutter, paddingTop: px(88) }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: px(16) }}>
          <div
            style={{
              position: "relative",
              width: px(118),
              height: px(118),
              borderRadius: px(16),
              overflow: "hidden",
              flexShrink: 0,
              background: "#0a0a0a",
              boxShadow: `0 ${px(6)}px ${px(16)}px rgba(0,0,0,0.12)`,
            }}
          >
            {slot.imageUrl ? (
              <img
                src={slot.imageUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center",
                  display: "block",
                }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg,#2a2a2a,#0a0a0a)" }} />
            )}
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              paddingTop: px(2),
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "auto",
                bottom: 0,
                right: 0,
                display: "flex",
                alignItems: "center",
                gap: px(6),
                height: px(36),
                paddingLeft: px(14),
                paddingRight: px(14),
                borderRadius: px(999),
                border: `1px solid ${C.shareBorder}`,
                background: C.shareBg,
              }}
            >
              <span style={{ fontSize: px(12), fontWeight: 600, letterSpacing: "0.08em", color: C.shareIcon, whiteSpace: "nowrap" }}>SHARE</span>
              <ShareGlyph px={px} stroke={C.shareIcon} />
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: px(22),
                lineHeight: 1.2,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: C.title,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                wordBreak: "break-word",
              }}
            >
              {name}
            </h1>
            {brand ? (
              <p
                style={{
                  margin: `${px(6)}px 0 0 0`,
                  fontSize: px(16),
                  fontWeight: 400,
                  letterSpacing: "0.01em",
                  color: C.textMuted,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  wordBreak: "break-word",
                }}
              >
                {brand}
              </p>
            ) : null}

            <div
              style={{
                marginTop: px(16),
                display: "flex",
                alignItems: "flex-start",
                gap: px(4),
                maxWidth: "100%",
                paddingRight: px(102),
              }}
            >
              <span
                style={{
                  marginTop: px(6),
                  width: px(12),
                  height: px(12),
                  borderRadius: "50%",
                  background: colors.dot,
                  flexShrink: 0,
                }}
                aria-hidden
              />
              <div style={{ display: "flex", flexDirection: "column", gap: px(1), minWidth: 0, lineHeight: 1 }}>
                <span
                  style={{
                    fontSize: px(20),
                    fontWeight: 600,
                    color: colors.scoreColor,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                  }}
                >
                  {score}/100
                </span>
                <span
                  style={{
                    fontSize: px(11),
                    color: colors.verdictColor,
                    fontWeight: 400,
                    lineHeight: 1.15,
                    wordBreak: "break-word",
                  }}
                >
                  {verdict}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: px(22),
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: px(10),
          }}
        >
          <div
            style={{
              flexShrink: 0,
              height: px(44),
              paddingLeft: px(20),
              paddingRight: px(20),
              borderRadius: px(999),
              border: `${bw}px solid ${C.pantryBorderSage}`,
              background: C.pantryBgSage,
              color: C.pantryTextSage,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: px(7),
              fontSize: px(15),
              fontWeight: 700,
              letterSpacing: "0.01em",
            }}
          >
          <span>Add to Pantry</span>
          <SaveGlyph px={px} stroke={C.pantryTextSage} icon={17} />
        </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: px(44),
              paddingLeft: px(16),
              paddingRight: px(16),
              borderRadius: px(999),
              border: `${bw}px solid ${C.lawsuitBorder}`,
              background: C.lawsuitBg,
              color: C.lawsuitText,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: px(13),
              fontWeight: 700,
              letterSpacing: "0.01em",
            }}
          >
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {lawsuitBadgeLabel}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          marginLeft: gutter,
          marginRight: gutter,
          marginTop: px(24),
          marginBottom: px(40),
          borderRadius: px(20),
          background: C.cardBg,
          border: `1px solid ${C.cardBorderMint}`,
          boxShadow: C.cardShadowMint,
          padding: px(22),
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", flexShrink: 0, minWidth: 0 }}>
          <div
            style={{
              fontFamily: C.wordmarkFont,
              fontSize: px(36),
              fontWeight: 900,
              color: C.wordmarkColor,
              letterSpacing: px(-0.5),
              lineHeight: 0.95,
              textAlign: "center",
            }}
          >
            labely
          </div>
        </div>
        <div style={{ marginTop: px(18), overflowY: "auto", flex: 1, minHeight: 0 }}>
          <AnalysisBody text={analysis} px={px} />
        </div>
      </div>
    </div>
  );
}
