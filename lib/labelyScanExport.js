const OUT_W = 1080;
const OUT_H = 1920;

function loadRasterImage(src) {
  return new Promise((resolve) => {
    if (!src || typeof src !== "string") {
      resolve(null);
      return;
    }
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

function hashUnit(seed, id) {
  const h = (Math.imul((seed | 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul((id + 1) * 40503, 2246822519)) >>> 0;
  return h / 0xffffffff;
}

function imageVariation(seed) {
  const scale = 1.012 + hashUnit(seed, 1) * 0.022;
  const tx = (hashUnit(seed, 2) - 0.5) * 0.024;
  const ty = (hashUnit(seed, 3) - 0.5) * 0.024;
  const brightness = 0.975 + hashUnit(seed, 4) * 0.05;
  const contrast = 0.975 + hashUnit(seed, 5) * 0.05;
  const saturation = 0.965 + hashUnit(seed, 6) * 0.08;
  const hue = (hashUnit(seed, 7) - 0.5) * 4;
  return { scale, tx, ty, brightness, contrast, saturation, hue };
}

function drawContain(ctx, img, cw, ch, variationSeed = 0) {
  const ir = img.width / img.height;
  const cr = cw / ch;
  let dw;
  let dh;
  let dx;
  let dy;
  if (ir > cr) {
    dw = cw;
    dh = dw / ir;
    dx = 0;
    dy = (ch - dh) / 2;
  } else {
    dh = ch;
    dw = dh * ir;
    dx = (cw - dw) / 2;
    dy = 0;
  }
  const v = imageVariation(variationSeed);
  const scaledW = dw * v.scale;
  const scaledH = dh * v.scale;
  const scaledX = dx - (scaledW - dw) / 2 + cw * v.tx;
  const scaledY = dy - (scaledH - dh) / 2 + ch * v.ty;

  ctx.save();
  ctx.filter = `brightness(${v.brightness.toFixed(3)}) contrast(${v.contrast.toFixed(3)}) saturate(${v.saturation.toFixed(3)}) hue-rotate(${v.hue.toFixed(2)}deg)`;
  ctx.drawImage(img, scaledX, scaledY, scaledW, scaledH);
  ctx.restore();
}

function drawPlaceholderBg(ctx, cw, ch) {
  const g = ctx.createLinearGradient(0, 0, cw, ch);
  g.addColorStop(0, "#2a2824");
  g.addColorStop(1, "#0f0e0c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}

/**
 * Scan viewfinder stroke + sweeping horizontal beam (inside frame).
 */
function drawScanOverlay(ctx, box, tScan) {
  const { x, y, w, h } = box;
  const rr = Math.min(44, Math.min(w, h) * 0.06);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";

  strokeRoundRectPath(ctx, x, y, w, h, rr);
  ctx.stroke();

  const inset = Math.max(10, h * 0.02);
  const innerTop = y + inset;
  const innerBot = y + h - inset;
  const innerH = Math.max(12, innerBot - innerTop);
  const beamY = innerTop + tScan * innerH;

  const grad = ctx.createLinearGradient(x, beamY - 6, x, beamY + 6);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.92)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.92)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(x + rr, beamY - 6, w - 2 * rr, 12);
  ctx.restore();
}

function strokeRoundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** How long we sample canvas-confetti over the Labely hold (export fps). */
const CONFETTI_SECONDS = 1.55;

const CONFETTI_HEX_PALETTE_BASE = [
  "#E53935",
  "#FB8C00",
  "#FDD835",
  "#43A047",
  "#1E88E5",
  "#8E24AA",
  "#FF7043",
  "#EC407A",
  "#26C6DA",
  "#AB47BC",
];

function confettiColorsFromSeed(seed) {
  const shift = Math.floor(hashUnit(seed ^ 0xc0fefa, 404) * CONFETTI_HEX_PALETTE_BASE.length);
  const out = [];
  for (let i = 0; i < CONFETTI_HEX_PALETTE_BASE.length; i++) {
    out.push(CONFETTI_HEX_PALETTE_BASE[(shift + i) % CONFETTI_HEX_PALETTE_BASE.length]);
  }
  return out;
}

function cloneCanvas(src) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

function waitNextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/**
 * Record Labely + catdad/canvas-confetti composite frames for video export.
 */
async function captureCanvasConfettiHoldFrames({
  labelyCanvas,
  fps,
  confettiFrames,
  variationSeed,
}) {
  const { default: confetti } = await import("canvas-confetti");
  const seed = (variationSeed | 0) ^ 0x30ff371;

  const overlay = document.createElement("canvas");
  overlay.width = OUT_W;
  overlay.height = OUT_H;

  const shoot = confetti.create(overlay, {
    resize: false,
    disableForReducedMotion: false,
  });

  shoot.reset();

  const particleCount = 240 + Math.floor(hashUnit(seed, 501) * 90);
  const startVelocity = 46 + hashUnit(seed, 502) * 22;
  const ox = 0.5 + (hashUnit(seed, 503) - 0.5) * 0.06;
  const oy = 0.46 + (hashUnit(seed, 504) - 0.5) * 0.06;

  shoot({
    particleCount,
    spread: 360,
    startVelocity,
    gravity: 1.05,
    decay: 0.9,
    ticks: Math.min(450, Math.max(220, Math.round(CONFETTI_SECONDS * fps * 2.4))),
    origin: { x: ox, y: oy },
    shapes: ["square", "circle"],
    scalar: 1.05,
    colors: confettiColorsFromSeed(seed),
    disableForReducedMotion: false,
  });

  const composite = document.createElement("canvas");
  composite.width = OUT_W;
  composite.height = OUT_H;
  const cctx = composite.getContext("2d");

  const frames = [];
  const frameMs = 1000 / fps;

  for (let h = 0; h < confettiFrames; h++) {
    if (h > 0) {
      await new Promise((r) => setTimeout(r, frameMs));
    }
    await waitNextPaint();
    cctx.drawImage(labelyCanvas, 0, 0, OUT_W, OUT_H);
    cctx.drawImage(overlay, 0, 0, OUT_W, OUT_H);
    frames.push(cloneCanvas(composite));
  }

  shoot.reset();
  return frames;
}

/**
 * Fullscreen scan intro + sliding Labely composite for video export (1080×1920).
 *
 * @param {object} opts
 * @param {string} [opts.productDataUrl]
 * @param {HTMLCanvasElement} opts.labelyCanvas
 * @param {number} [opts.scanSec]
 * @param {number} [opts.revealSec]
 * @param {number} [opts.holdSec]
 * @param {number} [opts.fps]
 * @param {number} [opts.imageVariationSeed]
 * @returns {Promise<HTMLCanvasElement[]>}
 */
export async function buildLabelyScanFrameSequence({
  productDataUrl,
  labelyCanvas,
  scanSec = 1.35,
  revealSec = 0.5,
  holdSec = 4,
  fps = 30,
  imageVariationSeed = 0,
}) {
  const productImg = await loadRasterImage(productDataUrl?.trim?.() ?? "");

  const scanFrames = Math.max(12, Math.round(scanSec * fps));
  const revealFrames = Math.max(10, Math.round(revealSec * fps));
  const holdFrames = Math.max(Math.round(holdSec * fps), fps);

  const padX = OUT_W * 0.065;
  const padYT = OUT_H * 0.165;
  const boxW = OUT_W - 2 * padX;
  const boxH = OUT_H * 0.495;
  const box = { x: padX, y: padYT, w: boxW, h: boxH };

  const out = [];

  function drawProductBackground(ctx) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    if (productImg && productImg.width) drawContain(ctx, productImg, OUT_W, OUT_H, imageVariationSeed);
    else drawPlaceholderBg(ctx, OUT_W, OUT_H);
  }

  for (let i = 0; i < scanFrames; i++) {
    const t = scanFrames <= 1 ? 1 : i / (scanFrames - 1);
    const beamT = easeInOutQuad(t);

    const c = document.createElement("canvas");
    c.width = OUT_W;
    c.height = OUT_H;
    const ctx = c.getContext("2d");
    drawProductBackground(ctx);
    drawScanOverlay(ctx, box, beamT);
    out.push(c);
  }

  for (let i = 0; i < revealFrames; i++) {
    const t = revealFrames <= 1 ? 1 : i / (revealFrames - 1);
    const eased = 1 - Math.pow(1 - t, 3);

    const c = document.createElement("canvas");
    c.width = OUT_W;
    c.height = OUT_H;
    const ctx = c.getContext("2d");
    drawProductBackground(ctx);

    ctx.fillStyle = `rgba(14,13,17,${0.12 + eased * 0.28})`;
    ctx.fillRect(0, 0, OUT_W, OUT_H);

    ctx.save();
    const offset = Math.round((1 - eased) * OUT_H);
    ctx.translate(0, offset);
    ctx.drawImage(labelyCanvas, 0, 0, OUT_W, OUT_H);
    ctx.restore();

    out.push(c);
  }

  const confettiFrames = Math.min(holdFrames, Math.ceil(CONFETTI_SECONDS * fps));
  const confettiSnapshots = await captureCanvasConfettiHoldFrames({
    labelyCanvas,
    fps,
    confettiFrames,
    variationSeed: imageVariationSeed,
  });

  for (let h = 0; h < holdFrames; h++) {
    if (h < confettiFrames) {
      out.push(confettiSnapshots[h]);
    } else {
      out.push(labelyCanvas);
    }
  }

  return out;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
