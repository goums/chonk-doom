// Tiny helpers to draw art procedurally, in two styles:
//  - retro: crisp low-res pixel art (hard alpha, 1px outlines, grit)
//  - smooth: the same drawing code at 4x resolution with anti-aliased vector shapes
// Everything in CHONK DOOM is generated at runtime: no external art assets.
import { STYLE } from './style';

export type Ctx = CanvasRenderingContext2D;

/** Canvas whose drawing space is w×h logical units (backed by w*S × h*S pixels in smooth mode). */
export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const S = STYLE.art;
  const c = document.createElement('canvas');
  c.width = Math.round(w * S);
  c.height = Math.round(h * S);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = STYLE.smooth;
  ctx.scale(S, S);
  return [c, ctx];
}

/** Canvas with an exact pixel size (no style scaling). */
export function rawCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = STYLE.smooth;
  return [c, ctx];
}

/** Deterministic PRNG (mulberry32) so textures look the same every run. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Remove anti-aliasing: hard alpha threshold so sprites stay pixel-crisp. */
export function crisp(ctx: Ctx, w: number, h: number, threshold = 110) {
  if (STYLE.smooth) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < threshold) {
      d[i + 3] = 0;
    } else {
      // un-premultiply-ish: push partially transparent pixels to opaque
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Add a 1px dark outline around opaque pixels (classic sprite look). */
export function outline(ctx: Ctx, w: number, h: number, color: [number, number, number] = [20, 12, 18]) {
  if (STYLE.smooth) return softOutline(ctx, color);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 0) continue;
      if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) {
        d[i] = color[0];
        d[i + 1] = color[1];
        d[i + 2] = color[2];
        d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Per-pixel noise to give surfaces a gritty Doom-ish texture. */
export function noise(ctx: Ctx, w: number, h: number, amount: number, seed: number) {
  if (STYLE.smooth) return;
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (r() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function px(ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1) {
  ctx.fillStyle = color;
  if (STYLE.smooth) ctx.fillRect(x, y, w, h);
  else ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Smooth mode: a thin, soft dark contour around the drawn shape (keeps sprites readable). */
function softOutline(ctx: Ctx, color: [number, number, number]) {
  const c = ctx.canvas;
  const [tmp, t] = rawCanvas(c.width, c.height);
  t.drawImage(c, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},0.55)`;
  t.fillRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  const r = Math.max(1, Math.round(STYLE.art * 0.6));
  for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) ctx.drawImage(tmp, dx, dy);
  ctx.restore();
}

/** Smooth mode: soften a texture towards a pastel version of itself. */
export function pastel(c: HTMLCanvasElement, k = 0.22) {
  if (!STYLE.smooth) return c;
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(255,246,236,${k})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
  return c;
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

export function poly(ctx: Ctx, pts: number[], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}

export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string) {
  if (STYLE.smooth) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, y0 + 0.5);
    ctx.lineTo(x1 + 0.5, y1 + 0.5);
    ctx.stroke();
    return;
  }
  // Bresenham for crisp lines
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Flip a canvas horizontally. */
export function mirror(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = rawCanvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Tint every opaque pixel towards a color (used for pain flashes). */
export function tinted(src: HTMLCanvasElement, rgb: [number, number, number], k: number): HTMLCanvasElement {
  const [c, ctx] = rawCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    d[i] = d[i] * (1 - k) + rgb[0] * k;
    d[i + 1] = d[i + 1] * (1 - k) + rgb[1] * k;
    d[i + 2] = d[i + 2] * (1 - k) + rgb[2] * k;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 3x5 pixel font for the HUD (digits, letters, a few symbols). */
const FONT: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', A: '010101111101101', B: '110101110101110',
  C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101',
  O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010',
  W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
  '%': '101001010100101', ':': '000010000010000', '.': '000000000000010', '-': '000000111000000',
  '!': '010010010000010', '/': '001001010100100', '?': '111001010000010', ' ': '000000000000000',
  "'": '010010000000000', ',': '000000000010100', '+': '000010111010000', '>': '100010001010100',
  '<': '001010100010001', '(': '010100100100010', ')': '010001001001010', '#': '101111101111101',
};

const SMOOTH_FONT_PX = 6.2; // logical px per text "scale" unit in smooth mode
function smoothFont(scale: number) {
  return `600 ${SMOOTH_FONT_PX * scale}px ${STYLE.font}, system-ui, sans-serif`;
}

export function text(ctx: Ctx, s: string, x: number, y: number, color: string, scale = 1, shadow?: string) {
  s = s.toUpperCase();
  if (STYLE.smooth) {
    ctx.save();
    ctx.font = smoothFont(scale);
    ctx.textBaseline = 'top';
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.globalAlpha = 0.55;
      ctx.fillText(s, x + scale * 0.5, y + scale * 0.5 - scale * 0.6);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y - scale * 0.6);
    ctx.restore();
    return;
  }
  if (shadow) text(ctx, s, x + scale, y + scale, shadow, scale);
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT['?'];
    for (let i = 0; i < 15; i++) {
      if (g[i] === '1') ctx.fillRect(cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale);
    }
    cx += 4 * scale;
  }
}

let measureCtx: Ctx | null = null;
export function textWidth(s: string, scale = 1) {
  if (STYLE.smooth) {
    if (!measureCtx) measureCtx = rawCanvas(1, 1)[1];
    measureCtx.font = smoothFont(scale);
    return measureCtx.measureText(s.toUpperCase()).width;
  }
  return s.length * 4 * scale - scale;
}
