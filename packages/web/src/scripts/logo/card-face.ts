/**
 * Canvas artwork for the /logo cards: the category gradient, the white
 * die-cut rim and a little grain, painted once per card and uploaded as a
 * texture. Molecules are a separate shader layer so they can be "drawn on".
 */

import { CARD_H, CARD_R, CARD_W } from "./card-geometry";

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace("#", "");
  const full = value.length === 3 ? value.replace(/./g, "$&$&") : value;
  const int = Number.parseInt(full, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));

function toOklch([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

function fromOklch([L, C, H]: Rgb): Rgb {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    clamp01(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/**
 * Lightness / chroma nudge with the painter's hue shift: lit areas lean
 * toward yellow, shaded areas away from it (so blue lifts to cyan and
 * pink lifts to coral, like the logo artwork).
 */
export function shade(rgb: Rgb, dL: number, dC: number, hueShift: number): Rgb {
  const [L, C, H] = toOklch(rgb);
  const towardYellow = Math.sign(((100 - H + 540) % 360) - 180) || 1;
  return fromOklch([L + dL, Math.max(0, C + dC), H + towardYellow * hueShift]);
}

export const css = ([r, g, b]: Rgb, alpha = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;

const FACE_WIDTH = 768;

function roundedRect(ctx: CanvasRenderingContext2D, inset: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, Math.max(0, radius - inset));
}

function addGrain(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    data[i] = data[i]! + n;
    data[i + 1] = data[i + 1]! + n;
    data[i + 2] = data[i + 2]! + n;
  }
  ctx.putImageData(image, 0, 0);
}

/** Front: diagonal category gradient (light top-right → deep bottom-left), sheen, white rim. */
export function paintFace(color: Rgb): HTMLCanvasElement {
  const width = FACE_WIDTH;
  const height = Math.round(FACE_WIDTH * (CARD_H / CARD_W));
  const radius = (CARD_R / CARD_W) * width;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const light = shade(color, 0.07, 0.005, 9);
  const deep = shade(color, -0.07, 0.012, -7);
  const base = ctx.createLinearGradient(width, 0, 0, height);
  base.addColorStop(0, css(light));
  base.addColorStop(0.5, css(color));
  base.addColorStop(1, css(deep));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Soft top glow, as if lit from above the fan.
  const glow = ctx.createRadialGradient(width * 0.7, height * 0.08, 0, width * 0.7, height * 0.08, height * 0.75);
  glow.addColorStop(0, "rgba(255,255,255,0.16)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Inner edge falloff gives the face some depth under the rim.
  ctx.save();
  roundedRect(ctx, 0, width, height, radius);
  ctx.clip();
  ctx.shadowColor = css(shade(color, -0.22, 0.02, -10), 0.35);
  ctx.shadowBlur = width * 0.07;
  ctx.lineWidth = width * 0.06;
  ctx.strokeStyle = "rgba(0,0,0,1)";
  roundedRect(ctx, -width * 0.03, width, height, radius);
  ctx.stroke();
  ctx.restore();

  addGrain(ctx, width, height, 7);

  // Die-cut white rim with a faint inner bevel line.
  const rimWidth = width * 0.016;
  const rim = ctx.createLinearGradient(0, 0, width * 0.3, height);
  rim.addColorStop(0, "rgba(255,255,255,0.98)");
  rim.addColorStop(1, "rgba(255,255,255,0.82)");
  ctx.lineWidth = rimWidth;
  ctx.strokeStyle = rim;
  roundedRect(ctx, rimWidth / 2, width, height, radius);
  ctx.stroke();
  ctx.lineWidth = width * 0.004;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  roundedRect(ctx, rimWidth * 1.6, width, height, radius);
  ctx.stroke();

  return canvas;
}

/** Back: deep version of the colour with fine concentric guilloché rings. */
export function paintBack(color: Rgb): HTMLCanvasElement {
  const width = FACE_WIDTH / 2;
  const height = Math.round(width * (CARD_H / CARD_W));
  const radius = (CARD_R / CARD_W) * width;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, css(shade(color, -0.1, 0, 6)));
  base.addColorStop(1, css(shade(color, -0.2, 0.01, -6)));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let r = 6; r < height; r += 7) {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.lineWidth = width * 0.016;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  roundedRect(ctx, ctx.lineWidth / 2, width, height, radius);
  ctx.stroke();
  return canvas;
}
