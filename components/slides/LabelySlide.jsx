"use client";

import { useMemo } from "react";
import { clampLabelyScore, ratingLabelFromScore } from "@/lib/labelyRating";

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

function seedOilsBadge(analysis) {
  const t = String(analysis || "").toLowerCase();
  if (!t.trim()) return "Unknown";
  if (/seed oil|canola|soybean|sunflower|safflower|corn oil|cottonseed|grapeseed/.test(t)) return "Present";
  if (/no seed oils|seed oils: none|avocado oil|olive oil|coconut oil/.test(t)) return "None";
  return "Unknown";
}

function additivesBadge(analysis) {
  const t = String(analysis || "").toLowerCase();
  if (!t.trim()) return "Unknown";
  if (/no additives|no gums|no preservatives/.test(t)) return "No additives";
  if (/additive|preservative|emulsifier|gum|stabilizer|artificial flavor/.test(t)) return "Multiple";
  return "Some";
}

function processingBadge(score) {
  const s = clampLabelyScore(score);
  if (s >= 81) return "Low";
  if (s >= 61) return "Moderate";
  if (s >= 46) return "Moderate";
  return "High";
}

export default function LabelySlide({ slot, S }) {
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);
  const px = (n) => Math.round(n * IPHONE_SCALE * S);
  const gutter = px(22);

  const name = (slot.itemName || "").trim() || "Product";
  const brand = (slot.labelyBrand || "").trim();
  const score = clampLabelyScore(slot.labelyScore ?? 0);
  const verdict = (slot.labelyVerdict || "").trim() || ratingLabelFromScore(score);
  const analysis =
    (slot.labelyAnalysis || "").trim()
    || "Generate this slide from the sidebar to add a clean-ingredient analysis.";
  const colors = scoreColors(score);
  const seedOils = seedOilsBadge(analysis);
  const processing = processingBadge(score);
  const additives = additivesBadge(analysis);

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
        <div style={{ display: "flex", justifyContent: "center" }}>
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

        <div style={{ marginTop: px(10), paddingLeft: px(10), paddingRight: px(10) }}>
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
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
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
              padding: px(16),
              boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
              border: "1px solid rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: px(10), flexShrink: 0 }}>
              <img
                src="/labely/labely-says.png"
                alt=""
                style={{
                  width: px(52),
                  height: px(52),
                  borderRadius: px(10),
                  display: "block",
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
              <div style={{ fontSize: px(14), fontWeight: 800, color: "#2F5A41" }}>
                Dr. Labely says
              </div>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                marginTop: px(10),
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
              <div style={{ padding: `${px(6)}px ${px(12)}px`, borderRadius: px(999), background: "#EEF4F0", color: "#2F5A41", fontSize: px(12), fontWeight: 700 }}>
                {seedOils}
              </div>
              <span style={{ width: px(8), height: px(8), borderRadius: "50%", background: seedOils === "None" ? "#34C759" : seedOils === "Present" ? "#FF6B35" : "#FFB01A" }} />
            </div>
          </div>

          {/* Processing Profile */}
          <div style={{ background: "#ffffff", borderRadius: px(14), padding: `${px(12)}px ${px(14)}px`, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: px(10), minWidth: 0 }}>
              <div style={{ width: px(22), height: px(22), borderRadius: px(10), background: "#FFF2E6", flexShrink: 0 }} />
              <div style={{ fontSize: px(15), fontWeight: 700, color: "#274B36" }}>Processing Profile</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: px(10), flexShrink: 0 }}>
              <div style={{ padding: `${px(6)}px ${px(12)}px`, borderRadius: px(999), background: processing === "Low" ? "#EEF4F0" : processing === "Moderate" ? "#FFF2E6" : "#FFE9E2", color: processing === "High" ? "#B23A2D" : "#2F5A41", fontSize: px(12), fontWeight: 700 }}>
                {processing}
              </div>
              <span style={{ width: px(8), height: px(8), borderRadius: "50%", background: processing === "Low" ? "#34C759" : processing === "Moderate" ? "#FFB01A" : "#FF6B35" }} />
            </div>
          </div>

          {/* Additives */}
          <div style={{ background: "#ffffff", borderRadius: px(14), padding: `${px(12)}px ${px(14)}px`, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: px(10), minWidth: 0 }}>
              <div style={{ width: px(22), height: px(22), borderRadius: px(10), background: "#EEF4F0", flexShrink: 0 }} />
              <div style={{ fontSize: px(15), fontWeight: 700, color: "#274B36" }}>Additives</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: px(10), flexShrink: 0 }}>
              <div style={{ padding: `${px(6)}px ${px(12)}px`, borderRadius: px(999), background: additives === "No additives" ? "#EEF4F0" : additives === "Multiple" ? "#FFE9E2" : "#FFF2E6", color: additives === "Multiple" ? "#B23A2D" : "#2F5A41", fontSize: px(12), fontWeight: 700 }}>
                {additives}
              </div>
              <span style={{ width: px(8), height: px(8), borderRadius: "50%", background: additives === "No additives" ? "#34C759" : additives === "Multiple" ? "#FF6B35" : "#FFB01A" }} />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
