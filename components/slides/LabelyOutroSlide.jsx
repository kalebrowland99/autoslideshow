"use client";

export default function LabelyOutroSlide({ config, S }) {
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);
  const text = String(config?.labelyOutroText || "").trim()
    || "Just found 2 cancerous foods in my cabinet. I had no idea this was probably shortening my lifespan. The app I use is called Labely.";

  return (
    <div
      style={{
        width: W,
        height: H,
        background: "#000",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: Math.round(86 * S),
        textAlign: "center",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: Math.round(48 * S),
          lineHeight: 1.25,
          fontWeight: 700,
          maxWidth: "100%",
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}
