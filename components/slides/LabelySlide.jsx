"use client";

import { useMemo } from "react";
import { BAD_LABELY_SCORE, BAD_LABELY_VERDICT, MAX_BAD_LABELY_SCORE, MIN_BAD_LABELY_SCORE, clampLabelyScore } from "@/lib/labelyRating";

const IPHONE_SCALE = 1080 / 390;

/**
 * Colors sampled 1:1 from the Figma export (JPEG in repo assets).
 * Page bg / neutrals / pantry / share / mint card edge taken from pixel averages.
 */
const C = {
  pageBg: "#F4F0E6",
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
  /** Onboarding-ish green button */
  ctaBg: "#2F5A41",
  ctaText: "#F6F2E9",
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
    <span
      style={{
        fontSize: px(13),
        lineHeight: 1.15,
        color: C.textBody,
        whiteSpace: "pre-line",
      }}
    >
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} style={{ color: C.title, fontWeight: 700, lineHeight: 1.15 }}>{p.s}</strong>
        ) : (
          <span key={i}>{p.s}</span>
        )
      )}
    </span>
  );
}

function hashUnit(seed, id) {
  const h = (Math.imul((seed | 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul((id + 1) * 40503, 2246822519)) >>> 0;
  return h / 0xffffffff;
}

function productImageStyle(config, itemIndex) {
  const seed = (config?.jitterSeed ?? 0) + itemIndex * 9973;
  const scale = 1.012 + hashUnit(seed, 1) * 0.022;
  const tx = (hashUnit(seed, 2) - 0.5) * 2.4;
  const ty = (hashUnit(seed, 3) - 0.5) * 2.4;
  const brightness = 0.975 + hashUnit(seed, 4) * 0.05;
  const contrast = 0.975 + hashUnit(seed, 5) * 0.05;
  const saturation = 0.965 + hashUnit(seed, 6) * 0.08;
  const hue = (hashUnit(seed, 7) - 0.5) * 4;
  return {
    transform: `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) scale(${scale.toFixed(4)})`,
    filter: `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturation.toFixed(3)}) hue-rotate(${hue.toFixed(2)}deg)`,
  };
}

export default function LabelySlide({ slot, S, config, itemIndex = 0 }) {
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);
  const px = (n) => Math.round(n * IPHONE_SCALE * S);
  const gutter = px(22);

  const name = (slot.itemName || "").trim() || "Product";
  const brand = (slot.labelyBrand || "").trim();
  const storedScore = clampLabelyScore(slot.labelyScore);
  const score = storedScore >= MIN_BAD_LABELY_SCORE && storedScore <= MAX_BAD_LABELY_SCORE ? storedScore : BAD_LABELY_SCORE;
  const verdict = BAD_LABELY_VERDICT;
  const analysis =
    (slot.labelyAnalysis || "").trim()
    || "Generate this slide from the sidebar to add a clean-ingredient analysis.";
  const colors = scoreColors(score);
  const seedOils = "Dangerous";
  const additives = "Cancerous";
  const productStyle = productImageStyle(config, itemIndex);

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
      <div style={{ flexShrink: 0, paddingLeft: gutter, paddingRight: gutter, paddingTop: px(18) }}>
        <div style={{ paddingLeft: px(10), paddingRight: px(10) }}>
          <div style={{ display: "flex", alignItems: "center", gap: px(16) }}>
            <div
              style={{
                width: px(70),
                height: px(70),
                borderRadius: px(18),
                overflow: "hidden",
                background: "#ffffff",
                boxShadow: `0 ${px(6)}px ${px(16)}px rgba(0,0,0,0.10)`,
                flexShrink: 0,
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
                    transformOrigin: "center",
                    ...productStyle,
                  }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg,#e8e3d8,#f8f5ee)" }} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: px(20), fontWeight: 700, color: C.title, lineHeight: 1.15, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {name}
              </div>
              {brand ? (
                <div style={{ marginTop: px(4), fontSize: px(14), color: C.textMuted, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {brand}
                </div>
              ) : null}

              <div style={{ marginTop: px(10), display: "flex", alignItems: "center", gap: px(8) }}>
                <div style={{ fontSize: px(16), fontWeight: 800, color: "#2F5A41", fontVariantNumeric: "tabular-nums" }}>
                  {score}/100
                </div>
                <div style={{ fontSize: px(14), color: "#2F5A41", fontWeight: 600 }}>
                  {verdict === "Great" ? "Excellent" : verdict}
                </div>
                <span style={{ width: px(10), height: px(10), borderRadius: "50%", background: colors.dot, display: "inline-block" }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          paddingLeft: gutter,
          paddingRight: gutter,
          paddingBottom: px(28),
        }}
      >
        <div style={{ flex: 1, minHeight: 0, marginTop: px(16), paddingLeft: px(10), paddingRight: px(10), display: "flex", flexDirection: "column" }}>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: "#ffffff",
              borderRadius: px(18),
              paddingTop: px(10),
              paddingLeft: px(16),
              paddingRight: px(16),
              paddingBottom: px(12),
              boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
              border: "1px solid rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <img
                src="/labely/labely-logo2.png"
                alt="Labely"
                style={{
                  height: px(136),
                  width: "auto",
                  display: "block",
                  objectFit: "contain",
                }}
              />
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                marginTop: px(6),
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <AnalysisBody text={analysis} px={px} />
            </div>
          </div>
        </div>

        <div style={{ flexShrink: 0, marginTop: px(18), paddingLeft: px(10), paddingRight: px(10), display: "flex", flexDirection: "column", gap: px(12) }}>
          {/* Seed oils */}
          <div style={{ background: "#ffffff", borderRadius: px(14), padding: `${px(12)}px ${px(14)}px`, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: px(10), minWidth: 0 }}>
              <div style={{ width: px(22), height: px(22), borderRadius: px(10), background: "#EEF4F0", flexShrink: 0 }} />
              <div style={{ fontSize: px(15), fontWeight: 700, color: "#274B36" }}>Seed Oils</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: px(10), flexShrink: 0 }}>
              <div style={{ padding: `${px(6)}px ${px(12)}px`, borderRadius: px(999), background: "#FFE9E2", color: "#B23A2D", fontSize: px(12), fontWeight: 700 }}>
                {seedOils}
              </div>
              <span style={{ width: px(8), height: px(8), borderRadius: "50%", background: "#FF6B35" }} />
            </div>
          </div>

          {/* Additives */}
          <div style={{ background: "#ffffff", borderRadius: px(14), padding: `${px(12)}px ${px(14)}px`, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: px(10), minWidth: 0 }}>
              <div style={{ width: px(22), height: px(22), borderRadius: px(10), background: "#EEF4F0", flexShrink: 0 }} />
              <div style={{ fontSize: px(15), fontWeight: 700, color: "#274B36" }}>Additives</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: px(10), flexShrink: 0 }}>
              <div style={{ padding: `${px(6)}px ${px(12)}px`, borderRadius: px(999), background: "#FFE9E2", color: "#B23A2D", fontSize: px(12), fontWeight: 700 }}>
                {additives}
              </div>
              <span style={{ width: px(8), height: px(8), borderRadius: "50%", background: "#FF6B35" }} />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
