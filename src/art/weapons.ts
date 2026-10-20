// First-person weapon sprites: Le Chonk's chonky orange paws holding the arsenal.
import { makeCanvas, crisp, outline, ellipse, poly, px, line, text, type Ctx } from './pixel';

export type WeaponId = 'claws' | 'hairball' | 'shotgun' | 'laser';
export type WeaponFrame = 'idle' | 'fire0' | 'fire1';

export const WEAPON_W = 160;
export const WEAPON_H = 100;

const ORANGE = '#FF8204';
const ORANGE_D = '#FA500F';
const PINK = '#ff8fab';

/** A paw seen from above, entering from the bottom of the screen. */
function paw(ctx: Ctx, x: number, y: number, s = 1, padsUp = false, claws = false) {
  ellipse(ctx, x, y + 30 * s, 15 * s, 30 * s, ORANGE); // arm
  ellipse(ctx, x, y, 17 * s, 14 * s, ORANGE); // paw
  for (const dx of [-6, 0, 6]) line(ctx, x + dx * s, y + 6 * s, x + dx * s, y + 28 * s, ORANGE_D); // tabby stripes
  if (padsUp) {
    ellipse(ctx, x, y + 3 * s, 7 * s, 5 * s, PINK);
    for (const [dx, dy] of [[-10, -6], [-4, -10], [4, -10], [10, -6]]) ellipse(ctx, x + dx * s, y + dy * s, 3 * s, 3 * s, PINK);
  } else {
    for (const dx of [-8, -3, 3, 8]) line(ctx, x + dx * s, y - 12 * s, x + dx * s, y - 7 * s, ORANGE_D);
  }
  if (claws) {
    for (const dx of [-11, -4, 4, 11]) poly(ctx, [x + dx * s - 1.5, y - 12 * s, x + dx * s + 1.5, y - 12 * s, x + dx * s, y - 22 * s], '#f8f9fa');
  }
}

function flash(ctx: Ctx, x: number, y: number, r: number, c1: string, c2: string) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    poly(ctx, [x, y, x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6, x + Math.cos(a + 0.4) * r, y + Math.sin(a + 0.4) * r], c1);
  }
  ellipse(ctx, x, y, r * 0.8, r * 0.8, c2);
  ellipse(ctx, x, y, r * 0.4, r * 0.4, '#fff');
}

function drawClaws(ctx: Ctx, f: WeaponFrame) {
  if (f === 'idle') {
    paw(ctx, 30, 82);
    paw(ctx, 130, 82);
  } else if (f === 'fire0') {
    paw(ctx, 30, 86);
    paw(ctx, 118, 40, 1.15, true, true);
  } else {
    paw(ctx, 30, 86);
    paw(ctx, 68, 46, 1.15, true, true);
    // swipe trail
    for (let i = 0; i < 3; i++) line(ctx, 100 - i * 4, 20 + i * 6, 140 - i * 4, 34 + i * 6, '#ffffffaa');
  }
}

function drawHairball(ctx: Ctx, f: WeaponFrame) {
  const k = f === 'fire0' ? 4 : f === 'fire1' ? 2 : 0;
  const y = 40 + k;
  // chunky toy blaster: pink body, green tank of hairballs
  poly(ctx, [62, y + 60, 98, y + 60, 92, y + 20, 68, y + 20], '#ff4d9d');
  px(ctx, 70, y + 4, '#ff4d9d', 20, 22);
  px(ctx, 74, y - 4, '#7b2cbf', 12, 10); // barrel
  px(ctx, 74, y - 4, '#9d4edd', 3, 10);
  ellipse(ctx, 80, y + 30, 10, 8, '#7f8c4a');
  ellipse(ctx, 77, y + 27, 3, 2, '#b5c47a');
  px(ctx, 70, y + 12, '#fff', 2, 10);
  if (f === 'fire0') flash(ctx, 80, y - 8, 10, '#d9ed92', '#99d98c');
  paw(ctx, 50, 86 + k, 0.9);
  paw(ctx, 110, 86 + k, 0.9);
}

function drawShotgun(ctx: Ctx, f: WeaponFrame) {
  const k = f === 'fire0' ? 6 : f === 'fire1' ? 10 : 0;
  const y = 34 + k;
  // double barrel made of sardine tins
  px(ctx, 66, y, '#adb5bd', 12, 50);
  px(ctx, 82, y, '#adb5bd', 12, 50);
  px(ctx, 66, y, '#e9ecef', 3, 50);
  px(ctx, 82, y, '#e9ecef', 3, 50);
  ellipse(ctx, 72, y, 6, 3, '#343a40');
  ellipse(ctx, 88, y, 6, 3, '#343a40');
  px(ctx, 62, y + 34, '#4361ee', 36, 12);
  text(ctx, 'SARDINE', 66, y + 38, '#fff');
  px(ctx, 64, y + 46, '#8a5a32', 32, 30);
  px(ctx, 64, y + 46, '#a0692f', 32, 3);
  if (f === 'fire0') {
    flash(ctx, 72, y - 6, 12, '#ffd166', '#ff7b00');
    flash(ctx, 88, y - 6, 12, '#ffd166', '#ff7b00');
  }
  paw(ctx, 52, 88 + k * 0.5, 0.95);
  paw(ctx, 108, f === 'fire1' ? 96 : 88, 0.95);
}

function drawLaser(ctx: Ctx, f: WeaponFrame) {
  const k = f === 'idle' ? 0 : f === 'fire0' ? 2 : 1;
  const y = 44 + k;
  if (f !== 'idle') {
    // the beam itself, converging to the crosshair
    poly(ctx, [77, y, 83, y, 81, 0, 79, 0], '#ff0054');
    px(ctx, 79, 0, '#fff', 2, y);
  }
  px(ctx, 74, y, '#e5e5e5', 12, 46);
  px(ctx, 74, y, '#ffffff', 3, 46);
  px(ctx, 72, y + 20, '#ff006e', 16, 8);
  px(ctx, 76, y - 3, '#333', 8, 4);
  if (f !== 'idle') ellipse(ctx, 80, y - 2, 4, 4, '#ff5d8f');
  paw(ctx, 64, 86 + k, 0.9);
  paw(ctx, 100, 88 + k, 0.85, false, f === 'fire0');
}

const DRAW: Record<WeaponId, (ctx: Ctx, f: WeaponFrame) => void> = {
  claws: drawClaws,
  hairball: drawHairball,
  shotgun: drawShotgun,
  laser: drawLaser,
};

export function buildWeapons(): Record<WeaponId, Record<WeaponFrame, HTMLCanvasElement>> {
  const out = {} as Record<WeaponId, Record<WeaponFrame, HTMLCanvasElement>>;
  for (const id of Object.keys(DRAW) as WeaponId[]) {
    out[id] = {} as Record<WeaponFrame, HTMLCanvasElement>;
    for (const f of ['idle', 'fire0', 'fire1'] as WeaponFrame[]) {
      const [c, ctx] = makeCanvas(WEAPON_W, WEAPON_H);
      DRAW[id](ctx, f);
      crisp(ctx, WEAPON_W, WEAPON_H, 90);
      outline(ctx, WEAPON_W, WEAPON_H, [40, 18, 6]);
      out[id][f] = c;
    }
  }
  return out;
}
