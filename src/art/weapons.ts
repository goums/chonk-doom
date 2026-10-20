// First-person weapon sprites: Le Chonk's chonky orange paws holding a classic DOOM arsenal.
import { makeCanvas, crisp, outline, ellipse, poly, px, line, type Ctx } from './pixel';

export type WeaponId = 'fist' | 'pistol' | 'shotgun' | 'chaingun';
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

const STEEL = '#625565', STEEL_L = '#9babb2', STEEL_D = '#3e3546', DARK = '#2e222f';
const WOOD = '#9e4539', WOOD_L = '#cd683d', WOOD_D = '#6e2727';

function drawFist(ctx: Ctx, f: WeaponFrame) {
  // Le Chonk punches with his paws (pads out, claws out when hitting)
  if (f === 'idle') {
    paw(ctx, 34, 84);
    paw(ctx, 126, 84);
  } else if (f === 'fire0') {
    paw(ctx, 30, 88);
    paw(ctx, 100, 44, 1.2, true, true);
  } else {
    paw(ctx, 30, 88);
    paw(ctx, 112, 60, 1.1, true, false);
  }
}

function drawPistol(ctx: Ctx, f: WeaponFrame) {
  const k = f === 'fire0' ? 5 : f === 'fire1' ? 2 : 0;
  const y = k;
  if (f === 'fire0') flash(ctx, 80, 30 + y, 11, '#f9c22b', '#fb6b1d');
  // grip + frame
  poly(ctx, [68, 100, 92, 100, 89, 60 + y, 71, 60 + y], STEEL_D);
  // slide, seen from behind
  poly(ctx, [70, 64 + y, 90, 64 + y, 86, 40 + y, 74, 40 + y], STEEL);
  poly(ctx, [70, 64 + y, 74, 64 + y, 76, 40 + y, 74, 40 + y], STEEL_L);
  px(ctx, 76, 46 + y, DARK, 8, 2); // ejection port
  ellipse(ctx, 80, 41 + y, 3, 1.6, DARK); // muzzle
  px(ctx, 79, 36 + y, DARK, 2, 4); // front sight
  paw(ctx, 66, 76 + k, 0.6);
  paw(ctx, 94, 76 + k, 0.6);
}

function drawShotgun(ctx: Ctx, f: WeaponFrame) {
  const k = f === 'fire0' ? 7 : f === 'fire1' ? 4 : 0;
  const pump = f === 'fire1' ? 7 : 0;
  const y = k;
  if (f === 'fire0') flash(ctx, 80, 14 + y, 14, '#f9c22b', '#fb6b1d');
  // wooden stock
  poly(ctx, [60, 100, 100, 100, 92, 64 + y, 68, 64 + y], WOOD);
  poly(ctx, [60, 100, 66, 100, 72, 64 + y, 68, 64 + y], WOOD_L);
  line(ctx, 80, 70 + y, 82, 98, WOOD_D);
  // receiver
  poly(ctx, [69, 68 + y, 91, 68 + y, 88, 48 + y, 72, 48 + y], STEEL_D);
  // long barrel + magazine tube
  poly(ctx, [74, 50 + y, 86, 50 + y, 83, 18 + y, 77, 18 + y], STEEL);
  poly(ctx, [74, 50 + y, 77, 50 + y, 78.5, 18 + y, 77, 18 + y], STEEL_L);
  ellipse(ctx, 80, 18.5 + y, 3, 1.5, DARK);
  // pump (slides back after a shot)
  poly(ctx, [71, 46 + y + pump, 89, 46 + y + pump, 87, 34 + y + pump, 73, 34 + y + pump], WOOD);
  for (let i = 0; i < 3; i++) px(ctx, 74, 37 + y + pump + i * 3, WOOD_D, 12, 1);
  paw(ctx, 80, 56 + y + pump, 0.6); // front paw on the pump
  paw(ctx, 98, 84 + k * 0.5, 0.65);
}

function drawChaingun(ctx: Ctx, f: WeaponFrame) {
  const k = f === 'fire0' ? 3 : f === 'fire1' ? 1 : 0;
  const spin = f === 'fire1' ? 1 : 0;
  const y = k;
  if (f !== 'idle') flash(ctx, 80, 20 + y, f === 'fire0' ? 13 : 9, '#f9c22b', '#fb6b1d');
  // housing
  poly(ctx, [54, 100, 106, 100, 99, 62 + y, 61, 62 + y], STEEL_D);
  px(ctx, 60, 70 + y, STEEL, 40, 3);
  // rotating barrel cluster
  const xs = [67, 73, 81, 87];
  xs.forEach((x, i) => {
    const lit = (i + spin) % 2 === 0;
    poly(ctx, [x - 2.5, 62 + y, x + 2.5, 62 + y, x + 1.5, 26 + y, x - 1.5, 26 + y], lit ? STEEL_L : STEEL);
    ellipse(ctx, x, 26 + y, 1.6, 1, DARK);
  });
  px(ctx, 63, 54 + y, STEEL_L, 34, 4); // rear ring
  px(ctx, 65, 32 + y, STEEL, 30, 3); // front ring
  paw(ctx, 58, 84, 0.68);
  paw(ctx, 102, 84, 0.68);
}

/** Scale a drawing about the bottom-centre of the weapon canvas (guns are drawn small, shown chunky). */
const scaled = (k: number, dy: number, draw: (ctx: Ctx, f: WeaponFrame) => void) => (ctx: Ctx, f: WeaponFrame) => {
  ctx.save();
  ctx.translate(80, 100 + dy);
  ctx.scale(k, k);
  ctx.translate(-80, -100);
  draw(ctx, f);
  ctx.restore();
};

const DRAW: Record<WeaponId, (ctx: Ctx, f: WeaponFrame) => void> = {
  fist: drawFist,
  pistol: scaled(1.65, 22, drawPistol),
  shotgun: scaled(1.3, 14, drawShotgun),
  chaingun: scaled(1.3, 16, drawChaingun),
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
