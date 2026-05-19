import { catalogueImageSrc } from "@/lib/numistaImageClient";

const OUT_W = 1080;
const OUT_H = 1920;

function loadRasterImage(src) {
  return new Promise((resolve) => {
    if (!src || typeof src !== "string") {
      resolve(null);
      return;
    }
    const loadSrc = catalogueImageSrc(src) || src;
    const im = new Image();
    im.referrerPolicy = "no-referrer";
    if (!loadSrc.startsWith("/")) im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = loadSrc;
  });
}

function hashUnit(seed, id) {
  const h = (Math.imul((seed | 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul((id + 1) * 40503, 2246822519)) >>> 0;
  return h / 0xffffffff;
}

function imageVariation(seed, { maxScale = 1.034 } = {}) {
  const scale = Math.min(maxScale, 1.012 + hashUnit(seed, 1) * 0.022);
  const tx = (hashUnit(seed, 2) - 0.5) * 0.024;
  const ty = (hashUnit(seed, 3) - 0.5) * 0.024;
  const brightness = 0.975 + hashUnit(seed, 4) * 0.05;
  const contrast = 0.975 + hashUnit(seed, 5) * 0.05;
  const saturation = 0.965 + hashUnit(seed, 6) * 0.08;
  const hue = (hashUnit(seed, 7) - 0.5) * 4;
  return { scale, tx, ty, brightness, contrast, saturation, hue };
}

function drawContain(ctx, img, cw, ch, variationSeed = 0, opts = {}) {
  const maxScale = opts.maxScale ?? 1.034;
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
  const v = imageVariation(variationSeed, { maxScale });
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

/**
 * Programmatic Valcoin scan-tour slide (black field + contained coin) when DOM capture fails.
 * @param {string} imageUrl
 * @param {number} [variationSeed]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderValcoinCoinSlideCanvas(imageUrl, variationSeed = 0) {
  const c = document.createElement("canvas");
  c.width = OUT_W;
  c.height = OUT_H;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, OUT_W, OUT_H);
  const img = await loadRasterImage(imageUrl);
  if (img?.width) drawContain(ctx, img, OUT_W, OUT_H, variationSeed, { maxScale: 0.9 });
  return c;
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
 * @param {"fullscreen" | "coin"} [opts.productLayout]
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
  productLayout = "fullscreen",
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

  const coinMaxScale = 0.88;
  const out = [];

  function drawProductBackground(ctx) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    if (!productImg?.width) {
      drawPlaceholderBg(ctx, OUT_W, OUT_H);
      return;
    }
    if (productLayout === "coin") {
      const inset = Math.min(box.w, box.h) * 0.1;
      const innerW = box.w - 2 * inset;
      const innerH = box.h - 2 * inset;
      ctx.save();
      ctx.translate(box.x + inset, box.y + inset);
      drawContain(ctx, productImg, innerW, innerH, imageVariationSeed, { maxScale: coinMaxScale });
      ctx.restore();
    } else {
      drawContain(ctx, productImg, OUT_W, OUT_H, imageVariationSeed);
    }
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

  for (let h = 0; h < holdFrames; h++) {
    out.push(labelyCanvas);
  }

  return out;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
