// First-person weapon sprites: Le Chonk's chonky orange paws holding a classic DOOM arsenal.
import { makeCanvas, crisp, outline, ellipse, poly, px, line, blob, type Ctx } from './pixel';

export type WeaponId = 'fist' | 'pistol' | 'shotgun' | 'chaingun';
export type WeaponFrame = 'idle' | 'fire0' | 'fire1';

export const WEAPON_W = 160;
export const WEAPON_H = 100;

const ORANGE = '#FF8204';
const ORANGE_D = '#d4520f';
const SOCK = '#fdcbb0';
const SOCK_D = '#cf8f7a';
const BEAN = '#f68181';

/**
 * Le Chonk's paw: an orange tabby arm coming from the bottom of the screen, ending in a cream "sock"
 * with four toe bumps (very recognisably a cat). `beans` shows the pink pads + claws (punching).
 */
function paw(ctx: Ctx, x: number, y: number, s = 1, beans = false, claws = false, arm = true) {
  // arm with tabby stripes
  if (arm) blob(ctx, x + 2 * s, y + 30 * s, 12.5 * s, 26 * s, ORANGE, 1.15, 0.72);
  if (arm) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + 2 * s, y + 30 * s, 12.5 * s, 26 * s, 0, 0, Math.PI * 2);
    ctx.clip();
    for (const dy of [14, 22, 30]) poly(ctx, [x - 14 * s, y + dy * s, x + 16 * s, y + (dy - 5) * s, x + 16 * s, y + (dy - 2) * s, x - 14 * s, y + (dy + 3) * s], ORANGE_D);
    ctx.restore();
  }
  // cream sock (the paw itself)
  blob(ctx, x, y + 4 * s, 12.5 * s, 9.5 * s, SOCK, 1.1, 0.78);
  // four toe bumps
  const toes = [-7.5, -2.5, 2.5, 7.5];
  toes.forEach((dx, i) => {
    const ty = y - 3 * s + (i === 0 || i === 3 ? 1.8 * s : 0);
    blob(ctx, x + dx * s, ty, 3.1 * s, 3.4 * s, SOCK, 1.1, 0.8);
    if (beans) blob(ctx, x + dx * s, ty + 0.6 * s, 1.6 * s, 1.7 * s, BEAN, 1.1, 0.85);
    if (claws) poly(ctx, [x + dx * s - 1 * s, ty - 2.8 * s, x + dx * s + 1 * s, ty - 2.8 * s, x + dx * s, ty - 7 * s], '#ffffff');
  });
  // toe separations
  for (const dx of [-5, 0, 5]) line(ctx, x + dx * s, y - 1.5 * s, x + dx * s, y + 2 * s, SOCK_D);
  if (beans) blob(ctx, x, y + 6 * s, 5.5 * s, 4 * s, BEAN, 1.15, 0.85); // big main pad
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
  // Le Chonk punches: the paw flies forward, pink beans and claws out
  if (f === 'idle') {
    paw(ctx, 38, 68, 1.05);
    paw(ctx, 122, 68, 1.05);
  } else if (f === 'fire0') {
    paw(ctx, 32, 84, 1.0);
    paw(ctx, 94, 36, 1.35, true, true);
  } else {
    paw(ctx, 32, 84, 1.0);
    paw(ctx, 110, 56, 1.2, true, false);
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
  paw(ctx, 69, 70 + k, 0.62);
  paw(ctx, 91, 72 + k, 0.62);
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
  paw(ctx, 80, 41 + y + pump, 0.55, false, false, false); // front paw wrapped on the pump (arm hidden behind the gun)
  paw(ctx, 98, 80 + k * 0.5, 0.7);
}

function drawChaingun(ctx: Ctx, f: WeaponFrame) {
  const k = f === 'fire0' ? 3 : f === 'fire1' ? 1 : 0;
  const spin = f === 'fire1' ? 1 : 0;
  const y = k;
  if (f !== 'idle') flash(ctx, 80, 34 + y, f === 'fire0' ? 13 : 9, '#f9c22b', '#fb6b1d');
  // chunky housing
  poly(ctx, [56, 100, 104, 100, 98, 64 + y, 62, 64 + y], STEEL_D);
  poly(ctx, [56, 100, 61, 100, 66, 64 + y, 62, 64 + y], STEEL);
  px(ctx, 62, 74 + y, STEEL, 36, 3);
  // rotating barrel drum (short, thick, like DOOM's)
  ellipse(ctx, 80, 64 + y, 17, 6, STEEL);
  const xs = [69, 76.5, 83.5, 91];
  xs.forEach((x, i) => {
    const lit = (i + spin) % 2 === 0;
    poly(ctx, [x - 3.4, 64 + y, x + 3.4, 64 + y, x + 2.6, 40 + y, x - 2.6, 40 + y], lit ? STEEL_L : STEEL);
    ellipse(ctx, x, 40 + y, 2.6, 1.3, DARK);
  });
  ellipse(ctx, 80, 46 + y, 15.5, 3.5, STEEL_D); // front clamp ring
  px(ctx, 65, 45 + y, STEEL, 30, 2);
  paw(ctx, 60, 78, 0.7);
  paw(ctx, 100, 78, 0.7);
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
