"use client";

export default function LabelyShelfIntroSlide({ slot, S }) {
  const W = Math.round(1080 * S);
  const H = Math.round(1920 * S);

  return (
    <div style={{ width: W, height: H, position: "relative", background: "#000", overflow: "hidden" }}>
      {slot?.labelyShelfImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot.labelyShelfImageUrl}
          alt={slot.itemName || "Grocery shelf scene"}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(180deg,#111,#000)",
            color: "rgba(255,255,255,0.25)",
            fontSize: Math.round(15 * S),
            fontFamily: "Arial, sans-serif",
          }}
        >
          Grocery aisle scene
        </div>
      )}
    </div>
  );
}
