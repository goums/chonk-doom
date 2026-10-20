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
    px(ctx, 0, 0, '#9babb2', TEX, TEX);
    px(ctx, 0, 12, '#625565', TEX, 1);
    px(ctx, 26, 4, '#625565', 2, 6);
    px(ctx, 26, 16, '#625565', 2, 10);
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


// ---- DOOM-inspired painters ----
function marble(seed: number, base: string, vein: string) {
  // green marble with veins and a gold trim (like DOOM's MARBLE walls)
  return tex(seed, (ctx, r) => {
    px(ctx, 0, 0, base, TEX, TEX);
    for (let i = 0; i < 5; i++) {
      let x = r() * TEX, y = 0;
      while (y < TEX) {
        const nx = x + (r() - 0.5) * 6, ny = y + 3 + r() * 3;
        line(ctx, x, y, nx, ny, i % 2 ? vein : shade(base, 0.7));
        x = nx; y = ny;
      }
    }
    px(ctx, 0, 0, '#ab947a', TEX, 2);
    px(ctx, 0, 30, '#ab947a', TEX, 2);
    px(ctx, 0, 1, '#4c3e24', TEX, 1);
  }, 10);
}

function startan(seed: number, base: string) {
  // brown tech panel (a nod to DOOM's STARTAN): panel seams, a light strip, rivets
  return tex(seed, (ctx) => {
    px(ctx, 0, 0, base, TEX, TEX);
    px(ctx, 0, 0, shade(base, 1.25), TEX, 1);
    for (const x of [0, 16]) {
      px(ctx, x, 0, shade(base, 0.6), 1, TEX);
      px(ctx, x + 1, 0, shade(base, 1.15), 1, TEX);
    }
    px(ctx, 0, 11, shade(base, 0.6), TEX, 1);
    px(ctx, 0, 12, shade(base, 1.15), TEX, 1);
    px(ctx, 3, 4, '#3e3546', 10, 4);
    px(ctx, 4, 5, '#f9c22b', 8, 2);
    px(ctx, 19, 4, '#3e3546', 10, 4);
    px(ctx, 20, 5, '#4d9be6', 3, 2);
    for (const [x, y] of [[3, 15], [12, 15], [19, 15], [28, 15], [3, 28], [28, 28]]) px(ctx, x, y, shade(base, 1.4), 1, 1);
  }, 14);
}

function doomDoor(seed: number, stripe: string | null) {
  // big riveted metal door; locked doors get a colored stripe on each side (like DOORRED / DOORBLU)
  return tex(seed, (ctx) => {
    const base = '#625565';
    px(ctx, 0, 0, shade(base, 0.6), TEX, TEX);
    px(ctx, 3, 0, base, 26, TEX);
    for (const y of [4, 13, 22]) {
      px(ctx, 6, y, shade(base, 0.75), 20, 7);
      px(ctx, 6, y, shade(base, 1.3), 20, 1);
    }
    px(ctx, 13, 14, '#9babb2', 6, 5);
    px(ctx, 14, 15, '#3e3546', 4, 3);
    for (const [x, y] of [[4, 2], [27, 2], [4, 29], [27, 29]]) px(ctx, x, y, '#c7dcd0', 1, 1);
    if (stripe) {
      px(ctx, 0, 0, stripe, 3, TEX);
      px(ctx, 29, 0, stripe, 3, TEX);
      px(ctx, 0, 0, shade(stripe, 1.3), 1, TEX);
      px(ctx, 13, 15, stripe, 6, 3);
    }
  }, 10);
}

function doomExit(seed: number, on: boolean) {
  return tex(seed, (ctx) => {
    ctx.drawImage(startan(seed + 1, '#7f708a'), 0, 0, TEX, TEX);
    px(ctx, 5, 2, '#2e222f', 22, 9);
    text(ctx, 'EXIT', 8, 4, on ? '#1ebc73' : '#e83b3b');
    px(ctx, 11, 15, '#2e222f', 10, 13);
    px(ctx, 12, on ? 16 : 22, on ? '#1ebc73' : '#e83b3b', 8, 5);
    px(ctx, 12, on ? 16 : 22, on ? '#91db69' : '#f68181', 8, 1);
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
      px(ctx, 0, y, shade('#7a4a2a', 0.85 + r() * 0.3), TEX, 4);
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
    ctx.drawImage(plaster(seed, '#6b6370'), 0, 0, TEX, TEX);
    px(ctx, 6, 6, '#777', 20, 20);
    px(ctx, 8, 8, '#fffbe0', 16, 16);
    px(ctx, 8, 8, '#ffffff', 16, 2);
  }, 0);
}

function beams(seed: number) {
  return tex(seed, (ctx) => {
    ctx.drawImage(plaster(seed, '#5e5458'), 0, 0, TEX, TEX);
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
  // DOOM-like palette: browns, greys, greens, dark reds; a few colorful details for readability
  return {
    walls: {
      '#': brick('#7a3a2e', '#3e3546', 1), // dark red-brown brick
      B: stone(2, '#6b6878'), // grey stone blocks
      W: marble(3, '#374e4a', '#547e64'), // green marble (living room)
      w: startan(4, '#966c6c'), // brown tech panels
      P: woodPanel(5, '#5e3a24'), // dark wood
      T: tiles(6, '#9babb2', '#7f8a90', '#3e3546'), // grimy grey tiles (kitchen)
      S: stone(7, '#6e5e50'), // brown stone (basement)
      G: slime(8), // green slime (nukage)
      M: metal(9, '#5a5560'), // rusty support metal with hazard stripes
      C: techPanel(10), // computer panels
      F: fridge(11),
      K: bookshelf(12),
      O: poster(13),
      // doors (DOOM-style metal doors, colored stripes = key color)
      D: doomDoor(20, null),
      R: doomDoor(21, '#e83b3b'),
      U: doomDoor(22, '#4d9be6'),
      Y: doomDoor(23, '#f9c22b'),
      // exit switch (off/on)
      E: doomExit(30, false),
      e: doomExit(30, true),
    },
    flats: {
      carpet: carpet(40, '#6e2727', '#9e4539'), // dark red carpet
      bluecarpet: carpet(41, '#323353', '#484a77'),
      wood: woodFloor(42),
      checker: tiles(43, '#625565', '#7f708a', '#3e3546'), // stone floor tiles
      concrete: concrete(44, '#5e5458'),
      water: water(45),
      plaster: plaster(46, '#6b6370'), // grey ceiling
      light: ceilLight(47),
      beams: beams(48),
      darkconcrete: concrete(49, '#3e3546'),
      metal: metal(50, '#4a4a55'),
    },
  };
}
