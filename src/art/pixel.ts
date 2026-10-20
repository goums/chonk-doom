// Tiny helpers to draw art procedurally, in two styles:
//  - retro: crisp low-res pixel art (hard alpha, 1px outlines, grit)
//  - smooth: the same drawing code at 4x resolution with anti-aliased vector shapes
// Everything in CHONK DOOM is generated at runtime: no external art assets.
import { STYLE } from './style';

export type Ctx = CanvasRenderingContext2D;

/** Canvas whose drawing space is w×h logical units (backed by w*S × h*S pixels in smooth mode). */
export function makeCanvas(w: number, h: number, scale?: number): [HTMLCanvasElement, Ctx] {
  const S = scale ?? STYLE.art;
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

// Resurrect 64 by Kerrie Lake (lospec.com/palette-list/resurrect-64): a modern, friendly, hue-shifted palette.
const RESURRECT_64 = '2e222f 3e3546 625565 966c6c ab947a 694f62 7f708a 9babb2 c7dcd0 ffffff 6e2727 b33831 ea4f36 f57d4a ae2334 e83b3b fb6b1d f79617 f9c22b 7a3045 9e4539 cd683d e6904e fbb954 4c3e24 676633 a2a947 d5e04b fbff86 165a4c 239063 1ebc73 91db69 cddf6c 313638 374e4a 547e64 92a984 b2ba90 0b5e65 0b8a8f 0eaf9b 30e1b9 8ff8e2 323353 484a77 4d65b4 4d9be6 8fd3ff 45293f 6b3e75 905ea9 a884f3 eaaded 753c54 a24b6f cf657f ed8099 831c5d c32454 f04f78 f68181 fca790 fdcbb0'
  .split(' ')
  .map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const nearestCache = new Map<number, number>();
function nearest(r: number, g: number, b: number) {
  const key = (r << 16) | (g << 8) | b;
  let best = nearestCache.get(key);
  if (best !== undefined) return best;
  let bd = Infinity;
  best = 0;
  for (let i = 0; i < RESURRECT_64.length; i++) {
    const p = RESURRECT_64[i];
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const rm = (r + p[0]) / 2; // "redmean" perceptual weighting
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bd) { bd = d; best = i; }
  }
  nearestCache.set(key, best);
  return best;
}

/** Pixel style: snap every opaque pixel to the shared palette, for a cohesive modern look. */
export function paletteize(ctx: Ctx, w = ctx.canvas.width, h = ctx.canvas.height) {
  if (!STYLE.pixel) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const p = RESURRECT_64[nearest(d[i], d[i + 1], d[i + 2])];
    d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2];
  }
  ctx.putImageData(img, 0, 0);
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
  paletteize(ctx, w, h);
}

/** Add a 1px outline around opaque pixels. Pixel style uses a *selective, colored* outline:
 *  a darker, purple-shifted shade of the neighbouring pixel instead of flat black. */
export function outline(ctx: Ctx, w: number, h: number, color: [number, number, number] = [20, 12, 18]) {
  if (STYLE.ink) return softOutline(ctx, [43, 29, 23], 1, 1.1);
  if (STYLE.smooth) return softOutline(ctx, color);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 0) continue;
      const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].find(([nx, ny]) => op(nx, ny));
      if (nb) {
        if (STYLE.pixel) {
          const j = (nb[1] * w + nb[0]) * 4;
          // hue-shifted darkening: darker, cooler, a bit more purple
          d[i] = src[j] * 0.38 + 18;
          d[i + 1] = src[j + 1] * 0.3 + 10;
          d[i + 2] = src[j + 2] * 0.42 + 30;
        } else {
          d[i] = color[0];
          d[i + 1] = color[1];
          d[i + 2] = color[2];
        }
        d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  paletteize(ctx, w, h);
}

/** Per-pixel noise to give surfaces a gritty Doom-ish texture. */
export function noise(ctx: Ctx, w: number, h: number, amount: number, seed: number) {
  if (STYLE.ink) return watercolor(ctx, w, h, seed);
  if (STYLE.smooth) return;
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (r() - 0.5) * amount * (STYLE.pixel ? 0.5 : 1);
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function px(ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1) {
  ctx.fillStyle = color;
  if (STYLE.smooth) {
    ctx.fillRect(x, y, w, h);
    if (STYLE.ink && w >= 3 && h >= 3 && w * h < 400) {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      inkStroke(ctx, 0.4);
    }
  } else ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Smooth mode: a thin, soft dark contour around the drawn shape (keeps sprites readable). */
function softOutline(ctx: Ctx, color: [number, number, number], alpha = 0.55, radius = 0.6) {
  const c = ctx.canvas;
  const [tmp, t] = rawCanvas(c.width, c.height);
  t.drawImage(c, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
  t.fillRect(0, 0, c.width, c.height);
  const r = Math.max(1, Math.round(ctx.getTransform().a * radius));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  const dirs = STYLE.ink ? 12 : 4;
  for (let i = 0; i < dirs; i++) {
    const a = (i / dirs) * Math.PI * 2;
    ctx.drawImage(tmp, Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r));
  }
  ctx.restore();
}

/** Storybook mode: watercolor wash (soft pigment blotches + paper grain) over what is drawn. */
export function watercolor(ctx: Ctx, w: number, h: number, seed: number) {
  const r = rng(seed * 7 + 3);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 9; i++) {
    const x = r() * w, y = r() * h, rad = (0.2 + r() * 0.45) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() > 0.5;
    g.addColorStop(0, dark ? 'rgba(120,60,40,0.10)' : 'rgba(255,250,235,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  // paper grain
  for (let i = 0; i < w * h * 0.25; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(60,30,20,0.06)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(r() * w, r() * h, 0.6, 0.6);
  }
  ctx.restore();
}

/** Storybook mode: a slightly wobbly ink frame around a texture (makes 3D edges look drawn). */
export function inkFrame(c: HTMLCanvasElement, seed: number) {
  if (!STYLE.ink) return c;
  const ctx = c.getContext('2d')!;
  const r = rng(seed);
  const W = c.width, H = c.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = STYLE.inkColor;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, W / 40);
  const j = () => (r() - 0.5) * W * 0.012;
  ctx.beginPath();
  ctx.moveTo(1 + j(), 1 + j());
  ctx.lineTo(W / 2 + j(), 1 + j());
  ctx.lineTo(W - 1 + j(), 1 + j());
  ctx.lineTo(W - 1 + j(), H / 2 + j());
  ctx.lineTo(W - 1 + j(), H - 1 + j());
  ctx.lineTo(W / 2 + j(), H - 1 + j());
  ctx.lineTo(1 + j(), H - 1 + j());
  ctx.lineTo(1 + j(), H / 2 + j());
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  return c;
}

function inkStroke(ctx: Ctx, width = 0.5) {
  if (!STYLE.ink) return;
  ctx.strokeStyle = STYLE.inkColor;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Smooth mode: soften a texture towards a pastel version of itself. */
export function pastel(c: HTMLCanvasElement, k = 0.22) {
  if (!STYLE.smooth) return c;
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = STYLE.ink ? `rgba(255,232,200,${k * 0.9})` : `rgba(255,246,236,${k})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
  return c;
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  ctx.fill();
  if (rx >= 1.4 && ry >= 1.4) inkStroke(ctx, Math.min(0.6, Math.max(rx, ry) * 0.12));
}

export function poly(ctx: Ctx, pts: number[], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
  inkStroke(ctx, 0.45);
}

export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string) {
  if (STYLE.smooth) {
    ctx.strokeStyle = color;
    ctx.lineWidth = STYLE.ink ? 0.9 : 1;
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

function smoothFont(scale: number) {
  return `${STYLE.fontWeight} ${STYLE.fontScale * scale}px '${STYLE.font}', system-ui, sans-serif`;
}

export function text(ctx: Ctx, s: string, x: number, y: number, color: string, scale = 1, shadow?: string) {
  s = s.toUpperCase();
  if (ctx.getTransform().a >= 2) {
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
/** Width of HUD text (the HUD composite is always hi-res, so text is the vector font). */
export function textWidth(s: string, scale = 1) {
  if (!measureCtx) measureCtx = rawCanvas(1, 1)[1];
  measureCtx.font = smoothFont(scale);
  return measureCtx.measureText(s.toUpperCase()).width;
}
