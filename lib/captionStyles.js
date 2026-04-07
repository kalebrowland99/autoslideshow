/** TikTok-style: white text + black outline. S = display/export scale factor. */

export const TIKTOK_FONT_FAMILY = "'TikTok Sans', system-ui, sans-serif";

export function tiktokTextShadow(S) {
  const w = Math.max(0.5, Math.round(1.15 * S * 10) / 10);
  const dirs = [
    [w, 0],
    [-w, 0],
    [0, w],
    [0, -w],
    [w, w],
    [w, -w],
    [-w, w],
    [-w, -w],
  ];
  return dirs.map(([x, y]) => `${x}px ${y}px 0 #000`).join(", ");
}

export function tiktokCaptionTextStyle(S, { fontSize, fontWeight = "800", letterSpacing = "0.04em" }) {
  const strokeW = Math.max(0.5, Math.round(0.85 * S * 10) / 10);
  return {
    display: "block",
    color: "#ffffff",
    fontSize,
    fontWeight,
    lineHeight: 1.2,
    fontFamily: TIKTOK_FONT_FAMILY,
    letterSpacing,
    textAlign: "center",
    WebkitTextStroke: `${strokeW}px #000000`,
    paintOrder: "stroke fill",
    textShadow: tiktokTextShadow(S),
  };
}
