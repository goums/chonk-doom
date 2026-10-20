// Procedural wall / floor / ceiling textures (32x32, tiled with NearestFilter).
import { makeCanvas, noise, px, rng, text, ellipse, poly, line, pastel, inkFrame, paletteize, type Ctx } from './pixel';
import { STYLE } from './style';

export const TEX = 32;

type Painter = (ctx: Ctx, r: () => number) => void;

function tex(seed: number, paint: Painter, grit = 18): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TEX, TEX);
  paint(ctx, rng(seed));
  if (grit) noise(ctx, TEX, TEX, grit, seed + 7);
  paletteize(ctx);
  return c;
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (STYLE.pixel) {
    // hue shifting: shadows drift to cool purple, highlights to warm yellow
    if (k < 1) {
      const t = 1 - k;
      r = r * k + 46 * t; g = g * k + 34 * t; b = b * k + 64 * t;
    } else {
      const t = Math.min(1, k - 1);
      r += (255 - r) * t * 0.9; g += (240 - g) * t * 0.8; b += (190 - b) * t * 0.5;
    }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

const brick = (base: string, mortar: string, seed: number) =>
  tex(seed, (ctx, r) => {
    px(ctx, 0, 0, mortar, TEX, TEX);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let col = -1; col < 3; col++) {
        const x = col * 16 + off;
        ctx.fillStyle = shade(base, 0.8 + r() * 0.35);
        ctx.fillRect(x + 1, row * 8 + 1, 15, 7);
        px(ctx, x + 1, row * 8 + 1, shade(base, 1.3), 15, 1);
        px(ctx, x + 1, row * 8 + 7, shade(base, 0.6), 15, 1);
      }
    }
  });

function wallpaper(seed: number, bg: string, stripe: string, motif: string) {
  return tex(seed, (ctx) => {
    px(ctx, 0, 0, bg, TEX, TEX);
    for (let x = 0; x < TEX; x += 8) px(ctx, x, 0, stripe, 2, TEX);
    // little fish motifs (Le Chonk's interior design taste)
    for (const [fx, fy] of [[3, 6], [19, 22]]) {
      ellipse(ctx, fx + 4, fy + 2, 3, 2, motif);
      poly(ctx, [fx, fy + 2, fx - 2, fy, fx - 2, fy + 4], motif);
      px(ctx, fx + 6, fy + 1, '#222');
    }
    px(ctx, 0, 28, shade(bg, 0.5), TEX, 4); // baseboard
    px(ctx, 0, 28, shade(bg, 0.75), TEX, 1);
  }, 12);
}

function woodPanel(seed: number, base: string) {
  return tex(seed, (ctx, r) => {
    px(ctx, 0, 0, base, TEX, TEX);
    for (let x = 0; x < TEX; x += 8) {
      px(ctx, x, 0, shade(base, 0.55), 1, TEX);
      px(ctx, x + 1, 0, shade(base, 1.2), 1, TEX);
      for (let i = 0; i < 4; i++) {
        const y = Math.floor(r() * TEX);
        px(ctx, x + 2 + Math.floor(r() * 5), y, shade(base, 0.7), 1, 3 + Math.floor(r() * 5));
      }
    }
    px(ctx, 0, 0, shade(base, 0.6), TEX, 2);
  }, 14);
}

function tiles(seed: number, a: string, b: string, grout: string) {
  return tex(seed, (ctx) => {
    px(ctx, 0, 0, grout, TEX, TEX);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        px(ctx, x * 8 + 1, y * 8 + 1, (x + y) % 2 ? a : b, 7, 7);
        px(ctx, x * 8 + 1, y * 8 + 1, 'rgba(255,255,255,0.35)', 3, 1);
      }
  }, 8);
}

function stone(seed: number, base: string) {
  return tex(seed, (ctx, r) => {
    px(ctx, 0, 0, shade(base, 0.45), TEX, TEX);
    const rows = [0, 9, 17, 25, 32];
    for (let i = 0; i < 4; i++) {
      let x = -Math.floor(r() * 10);
      while (x < TEX) {
        const w = 8 + Math.floor(r() * 10);
        const h = rows[i + 1] - rows[i] - 1;
        ctx.fillStyle = shade(base, 0.75 + r() * 0.4);
        ctx.fillRect(x + 1, rows[i] + 1, w - 1, h);
        px(ctx, x + 1, rows[i] + 1, shade(base, 1.25), w - 1, 1);
        x += w;
      }
    }
  }, 22);
}

function slime(seed: number) {
  return tex(seed, (ctx, r) => {
    const s = stone(seed + 1, '#4a5a44');
    ctx.drawImage(s, 0, 0, TEX, TEX);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(r() * TEX);
      const len = 4 + Math.floor(r() * 18);
      px(ctx, x, 0, '#62d13a', 2, len);
      px(ctx, x, len, '#3f9a22', 2, 2);
    }
  }, 10);
}

function metal(seed: number, base: string) {
  return tex(seed, (ctx) => {
    px(ctx, 0, 0, base, TEX, TEX);
    for (const [x, y] of [[2, 2], [28, 2], [2, 28], [28, 28], [15, 2], [15, 28]]) {
      px(ctx, x, y, shade(base, 1.5), 2, 2);
      px(ctx, x + 1, y + 1, shade(base, 0.4), 1, 1);
    }
    px(ctx, 0, 0, shade(base, 1.3), TEX, 1);
    px(ctx, 0, 31, shade(base, 0.5), TEX, 1);
    px(ctx, 0, 15, shade(base, 0.6), TEX, 2);
    // hazard stripes
    for (let x = -8; x < TEX; x += 8) poly(ctx, [x, 20, x + 4, 20, x + 8, 26, x + 4, 26], '#e8c020');
    px(ctx, 0, 20, 'rgba(0,0,0,0.25)', TEX, 1);
  }, 16);
}

function door(seed: number, base: string, stripe: string | null, label: string) {
  return tex(seed, (ctx) => {
    px(ctx, 0, 0, shade(base, 0.5), TEX, TEX);
    px(ctx, 2, 0, base, 28, TEX);
    px(ctx, 4, 3, shade(base, 0.8), 24, 11);
    px(ctx, 4, 17, shade(base, 0.8), 24, 12);
    px(ctx, 4, 3, shade(base, 1.25), 24, 1);
    px(ctx, 4, 17, shade(base, 1.25), 24, 1);
    if (stripe) {
      px(ctx, 2, 14, stripe, 28, 3);
      px(ctx, 0, 0, stripe, 2, TEX);
      px(ctx, 30, 0, stripe, 2, TEX);
    }
    // paw print knob
    ellipse(ctx, 25, 16, 1.6, 1.6, '#f4d35e');
    if (label) text(ctx, label, 16 - label.length * 2, 7, '#fff', 1, '#000');
  }, 10);
}

function exitSwitch(seed: number, on: boolean) {
  return tex(seed, (ctx) => {
    const m = metal(seed + 3, '#5a5f73');
    ctx.drawImage(m, 0, 0, TEX, TEX);
    px(ctx, 6, 3, '#111', 20, 9);
    text(ctx, 'EXIT', 8, 5, on ? '#4f4' : '#f33');
    // big paw switch
    px(ctx, 11, 14, '#222', 10, 14);
    px(ctx, 12, on ? 15 : 21, on ? '#4f4' : '#f33', 8, 6);
  }, 0);
}

function techPanel(seed: number) {
  return tex(seed, (ctx, r) => {
    px(ctx, 0, 0, '#2b2d42', TEX, TEX);
    for (let y = 2; y < 30; y += 6)
      for (let x = 2; x < 30; x += 4) px(ctx, x, y, r() > 0.5 ? '#ff5e8a' : r() > 0.5 ? '#5ef3ff' : '#40415a', 2, 2);
    px(ctx, 0, 0, '#8d99ae', TEX, 1);
    px(ctx, 0, 31, '#111', TEX, 1);
  }, 6);
}

function fridge(seed: number) {
  return tex(seed, (ctx) => {
    px(ctx, 0, 0, '#e8eef2', TEX, TEX);
    px(ctx, 0, 12, '#9aa5ad', TEX, 1);
    px(ctx, 26, 4, '#9aa5ad', 2, 6);
    px(ctx, 26, 16, '#9aa5ad', 2, 10);
    // magnets
    ellipse(ctx, 8, 6, 2, 2, '#ff4d6d');
    px(ctx, 12, 20, '#ffd166', 5, 4);
    poly(ctx, [5, 24, 9, 22, 9, 26], '#4cc9f0');
  }, 6);
}

function bookshelf(seed: number) {
  return tex(seed, (ctx, r) => {
    px(ctx, 0, 0, '#5c3a1e', TEX, TEX);
    const colors = ['#c1121f', '#003049', '#f77f00', '#588157', '#7b2cbf', '#e9c46a'];
    for (let s = 0; s < 3; s++) {
      const y = 1 + s * 10;
      let x = 1;
      while (x < 31) {
        const w = 2 + Math.floor(r() * 3);
        const h = 6 + Math.floor(r() * 3);
        px(ctx, x, y + 9 - h, colors[Math.floor(r() * colors.length)], w, h);
        x += w + (r() > 0.8 ? 1 : 0);
      }
      px(ctx, 0, y + 8, '#3b2412', TEX, 2);
    }
  }, 10);
}

function poster(seed: number) {
  // "WANTED" poster of a dog on a wood wall
  return tex(seed, (ctx) => {
    ctx.drawImage(woodPanel(seed + 1, '#8a5a32'), 0, 0, TEX, TEX);
    px(ctx, 5, 3, '#f1e3c6', 22, 26);
    text(ctx, 'BAD', 10, 5, '#a00');
    ellipse(ctx, 16, 18, 6, 5, '#b07a4a');
    ellipse(ctx, 11, 14, 2, 3, '#6b4423');
    ellipse(ctx, 21, 14, 2, 3, '#6b4423');
    px(ctx, 13, 17, '#000', 2, 2);
    px(ctx, 18, 17, '#000', 2, 2);
    px(ctx, 15, 21, '#000', 3, 2);
    line(ctx, 6, 4, 26, 28, '#c00');
  }, 0);
}

// ---- floors & ceilings ----
function carpet(seed: number, a: string, b: string) {
  return tex(seed, (ctx, r) => {
    px(ctx, 0, 0, a, TEX, TEX);
    for (let i = 0; i < 140; i++) px(ctx, r() * TEX, r() * TEX, r() > 0.5 ? b : shade(a, 0.8));
    // diamond pattern
    for (let i = 0; i < 16; i++) {
      px(ctx, 16 + i, i, b);
      px(ctx, 16 - i, i, b);
      px(ctx, i, 16 + i, b);
      px(ctx, 31 - i, 16 + i, b);
    }
  }, 10);
}

function woodFloor(seed: number) {
  return tex(seed, (ctx, r) => {
    for (let y = 0; y < TEX; y += 4) {
      const off = Math.floor(r() * 24);
      px(ctx, 0, y, shade('#a0692f', 0.85 + r() * 0.3), TEX, 4);
      px(ctx, 0, y + 3, '#5a3a18', TEX, 1);
      px(ctx, off, y, '#5a3a18', 1, 3);
    }
  }, 12);
}

function concrete(seed: number, base: string) {
  return tex(seed, (ctx, r) => {
    px(ctx, 0, 0, base, TEX, TEX);
    for (let i = 0; i < 30; i++) px(ctx, r() * TEX, r() * TEX, shade(base, 0.7), 1 + Math.floor(r() * 2), 1);
    px(ctx, 0, 0, shade(base, 0.75), TEX, 1);
    px(ctx, 0, 0, shade(base, 0.75), 1, TEX);
  }, 26);
}

function water(seed: number) {
  return tex(seed, (ctx, r) => {
    px(ctx, 0, 0, '#2a6b3a', TEX, TEX);
    for (let i = 0; i < 20; i++) px(ctx, r() * TEX, r() * TEX, '#58c35a', 3 + Math.floor(r() * 4), 1);
  }, 12);
}

function plaster(seed: number, base: string) {
  return tex(seed, (ctx, r) => {
    px(ctx, 0, 0, base, TEX, TEX);
    for (let i = 0; i < 40; i++) px(ctx, r() * TEX, r() * TEX, shade(base, 0.85));
  }, 10);
}

function ceilLight(seed: number) {
  return tex(seed, (ctx) => {
    ctx.drawImage(plaster(seed, '#b9b2a6'), 0, 0, TEX, TEX);
    px(ctx, 6, 6, '#777', 20, 20);
    px(ctx, 8, 8, '#fffbe0', 16, 16);
    px(ctx, 8, 8, '#ffffff', 16, 2);
  }, 0);
}

function beams(seed: number) {
  return tex(seed, (ctx) => {
    ctx.drawImage(plaster(seed, '#8f8574'), 0, 0, TEX, TEX);
    px(ctx, 0, 12, '#6b4423', TEX, 8);
    px(ctx, 0, 12, '#8a5a32', TEX, 1);
  }, 10);
}

export interface TextureSet {
  walls: Record<string, HTMLCanvasElement>;
  flats: Record<string, HTMLCanvasElement>;
}

/** Wall chars used in level maps -> texture. Doors/switches are also walls. */
export function buildTextures(): TextureSet {
  const set = buildRaw();
  for (const c of [...Object.values(set.walls), ...Object.values(set.flats)]) pastel(c);
  Object.values(set.walls).forEach((c, i) => inkFrame(c, 100 + i));
  return set;
}

function buildRaw(): TextureSet {
  return {
    walls: {
      '#': brick('#b5452f', '#5b4a44', 1),
      B: brick('#4a6fa5', '#2c2f3a', 2),
      W: wallpaper(3, '#7b4fa8', '#9467c4', '#ffb347'),
      w: wallpaper(4, '#2e8b7a', '#3aa892', '#ffd6e0'),
      P: woodPanel(5, '#8a5a32'),
      T: tiles(6, '#e9f5f2', '#4ecdc4', '#7a8b8a'),
      S: stone(7, '#7d7a8c'),
      G: slime(8),
      M: metal(9, '#6c7a89'),
      C: techPanel(10),
      F: fridge(11),
      K: bookshelf(12),
      O: poster(13),
      // doors
      D: door(20, '#9c6b3e', null, ''),
      R: door(21, '#9c6b3e', '#e63946', 'R'),
      U: door(22, '#9c6b3e', '#4361ee', 'B'),
      Y: door(23, '#9c6b3e', '#ffd166', 'Y'),
      // exit switch (off/on)
      E: exitSwitch(30, false),
      e: exitSwitch(30, true),
    },
    flats: {
      carpet: carpet(40, '#9b2335', '#d4a017'),
      bluecarpet: carpet(41, '#274c77', '#e7ecef'),
      wood: woodFloor(42),
      checker: tiles(43, '#f4f1de', '#e07a5f', '#555'),
      concrete: concrete(44, '#7a7672'),
      water: water(45),
      plaster: plaster(46, '#c9c1b1'),
      light: ceilLight(47),
      beams: beams(48),
      darkconcrete: concrete(49, '#4f4a52'),
      metal: metal(50, '#4a5260'),
    },
  };
}
