// Procedural billboard sprites: enemies, pickups, projectiles, effects.
import { STYLE } from './style';
import { makeCanvas, crisp, outline, ellipse, poly, px, line, text, blob, spoly, tone, type Ctx } from './pixel';

export type EnemyKind = 'mouse' | 'bulldog' | 'chihuahua' | 'rex';
export type EnemyFrame = 'walk0' | 'walk1' | 'attack' | 'pain' | 'die0' | 'die1' | 'dead';
export const ENEMY_FRAMES: EnemyFrame[] = ['walk0', 'walk1', 'attack', 'pain', 'die0', 'die1', 'dead'];

interface Pose {
  leg: number; // -1..1 walking phase
  attack: boolean;
  pain: boolean;
  ko: boolean; // X eyes
}

function finish(c: HTMLCanvasElement, ctx: Ctx) {
  crisp(ctx, c.width, c.height);
  outline(ctx, c.width, c.height);
  return c;
}

/** Eyes with sclera, iris, pupil, glint and a furious brow (or X / squint for KO / pain). */
function eyes(ctx: Ctx, lx: number, rx: number, y: number, r: number, pose: Pose, iris = '#e83b3b', brow = '#2e222f') {
  if (pose.ko) {
    for (const x of [lx, rx]) {
      line(ctx, x - r, y - r, x + r, y + r, brow);
      line(ctx, x - r, y + r, x + r, y - r, brow);
    }
    return;
  }
  if (pose.pain) {
    for (const x of [lx, rx]) {
      ctx.strokeStyle = brow;
      ctx.lineWidth = Math.max(0.8, r * 0.45);
      ctx.beginPath();
      ctx.arc(x, y + r * 0.4, r * 0.9, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    return;
  }
  for (const [x, dir] of [[lx, 1], [rx, -1]] as [number, number][]) {
    ellipse(ctx, x, y, r, r * 0.95, '#fdf3e7');
    ellipse(ctx, x + dir * r * 0.18, y + r * 0.12, r * 0.62, r * 0.62, iris);
    ellipse(ctx, x + dir * r * 0.18, y + r * 0.12, r * 0.28, r * 0.28, '#2e222f');
    px(ctx, x - r * 0.35, y - r * 0.45, '#ffffff', Math.max(0.6, r * 0.3), Math.max(0.6, r * 0.3));
    // furious slanted brow
    poly(ctx, [x - dir * r * 1.25, y - r * 1.35, x + dir * r * 1.05, y - r * 0.45, x + dir * r * 1.05, y - r * 0.05, x - dir * r * 1.25, y - r * 0.85], brow);
  }
}

// ---------------- MOUSE (the "zombieman": weak, throws cheese) ----------------
function drawMouse(ctx: Ctx, p: Pose) {
  const fur = '#9a8aa8', furL = '#d8cce0', pink = '#f6a0b4';
  // tail
  ctx.strokeStyle = tone(pink, 0.8);
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 31);
  ctx.bezierCurveTo(28, 30, 29, 22, 25, 17);
  ctx.stroke();
  // feet
  blob(ctx, 10.5 + p.leg * 1.5, 34, 3.3, 1.7, pink);
  blob(ctx, 19.5 - p.leg * 1.5, 34, 3.3, 1.7, pink);
  // body + belly
  blob(ctx, 15, 25, 7.5, 9, fur);
  blob(ctx, 15, 27, 4.6, 6.2, furL);
  if (p.attack) {
    // arm raised, cheese wedge ready to throw
    blob(ctx, 21.5, 13, 2, 4.5, fur);
    spoly(ctx, [17, 9, 29, 9, 29, 2], '#f9c22b');
    ellipse(ctx, 25, 7, 1, 0.8, '#e6904e');
    ellipse(ctx, 27.5, 5, 0.7, 0.6, '#e6904e');
    blob(ctx, 9, 23, 2, 3, fur);
  } else {
    // hugging a piece of cheese
    blob(ctx, 9.5, 23, 2.2, 3, fur);
    blob(ctx, 20.5, 23, 2.2, 3, fur);
    spoly(ctx, [11, 26, 19, 26, 19, 21.5], '#f9c22b');
  }
  // ears
  for (const x of [6.5, 23.5]) {
    blob(ctx, x, 7, 5, 5, fur);
    blob(ctx, x, 7.3, 3.1, 3.1, pink, 1.15, 0.85);
  }
  // head + snout
  blob(ctx, 15, 13, 7.2, 6, fur);
  blob(ctx, 15, 16.3, 4, 2.7, furL);
  eyes(ctx, 12, 18, 12, 1.9, p);
  blob(ctx, 15, 15, 1.5, 1.1, '#e8577a', 1.4, 0.8);
  px(ctx, 14, 18.2, '#ffffff', 0.9, 1.8);
  px(ctx, 15.2, 18.2, '#ffffff', 0.9, 1.8);
  for (const [x0, x1] of [[11, 6], [19, 24]]) {
    line(ctx, x0, 16, x1, 15, '#4d3d5a');
    line(ctx, x0, 17, x1, 18, '#4d3d5a');
  }
}

// ---------------- BULLDOG (the "pinky": tanky melee charger) ----------------
function drawBulldog(ctx: Ctx, p: Pose) {
  const fur = '#c8925a', furL = '#f1dcbc', dark = '#7a4a2a';
  const o = p.attack ? -2 : 0;
  // stubby legs
  for (const [x, ph] of [[14, p.leg], [38, -p.leg]] as [number, number][]) {
    blob(ctx, x + ph * 2, 43, 6.5, 4.8, fur);
    blob(ctx, x + ph * 2, 45.5, 5.5, 2.3, furL);
    for (const dx of [-2, 0, 2]) line(ctx, x + ph * 2 + dx, 45, x + ph * 2 + dx, 47, tone(furL, 0.6));
  }
  // barrel body + chest
  blob(ctx, 26, 33 + o, 19.5, 12, fur);
  blob(ctx, 26, 35 + o, 10, 8.5, furL);
  // spiked collar
  spoly(ctx, [11, 24 + o, 41, 24 + o, 40, 28.5 + o, 12, 28.5 + o], '#c32454');
  for (let x = 13; x < 40; x += 4.5) spoly(ctx, [x, 24.5 + o, x + 2.4, 24.5 + o, x + 1.2, 20.5 + o], '#c7dcd0', 1.4, 0.7);
  // folded ears
  blob(ctx, 11, 8 + o, 4.5, 3.4, dark);
  blob(ctx, 41, 8 + o, 4.5, 3.4, dark);
  // big head
  blob(ctx, 26, 16 + o, 16.5, 12, fur);
  line(ctx, 21, 6 + o, 31, 6 + o, tone(fur, 0.65));
  line(ctx, 19, 8.5 + o, 23, 10 + o, tone(fur, 0.65));
  line(ctx, 33, 8.5 + o, 29, 10 + o, tone(fur, 0.65));
  // jowls
  blob(ctx, 18, 22 + o, 7.8, 5.6, furL);
  blob(ctx, 34, 22 + o, 7.8, 5.6, furL);
  eyes(ctx, 19, 33, 14 + o, 2.6, p);
  // nose
  blob(ctx, 26, 17.5 + o, 4.2, 2.7, '#3e3546', 1.6, 0.6);
  if (p.attack) {
    blob(ctx, 26, 25.5 + o, 7.8, 5.2, '#6e2727', 1.2, 0.6);
    blob(ctx, 26, 28 + o, 4.2, 2.2, '#f68181');
    for (let x = 20; x <= 31; x += 2.75) poly(ctx, [x, 21.5 + o, x + 2, 21.5 + o, x + 1, 24 + o], '#ffffff');
    poly(ctx, [21, 30 + o, 23, 30 + o, 22, 27 + o], '#ffffff');
    poly(ctx, [29, 30 + o, 31, 30 + o, 30, 27 + o], '#ffffff');
  } else {
    px(ctx, 19, 24 + o, '#45293f', 14, 1.6);
    poly(ctx, [20, 25.5 + o, 22.2, 25.5 + o, 21.1, 21.5 + o], '#ffffff');
    poly(ctx, [29.8, 25.5 + o, 32, 25.5 + o, 30.9, 21.5 + o], '#ffffff');
    px(ctx, 33, 25 + o, '#8fd3ff', 0.9, 3.5); // drool
  }
}

// ---------------- CHIHUAHUA (the "imp": fast, ranged sonic yaps) ----------------
function drawChihuahua(ctx: Ctx, p: Pose) {
  const fur = '#dba86b', furL = '#f6deb2', pink = '#f6a0b4';
  // thin trembling legs
  for (const [x, ph] of [[13, p.leg], [21, -p.leg]] as [number, number][]) {
    spoly(ctx, [x + ph, 26, x + ph + 2.2, 26, x + ph + 2, 34, x + ph + 0.2, 34], tone(fur, 0.9));
    blob(ctx, x + ph + 1.1, 34.3, 1.8, 1, furL);
  }
  blob(ctx, 17, 24, 7.5, 5.6, fur);
  blob(ctx, 17, 25.5, 4, 3.2, furL);
  // ENORMOUS ears
  spoly(ctx, [11, 11, 0.5, 0, 6, 16], fur);
  spoly(ctx, [23, 11, 33.5, 0, 28, 16], fur);
  poly(ctx, [10, 11, 3, 3, 7, 14], pink);
  poly(ctx, [24, 11, 31, 3, 27, 14], pink);
  // head + muzzle
  blob(ctx, 17, 13, 8.2, 7, fur);
  blob(ctx, 17, 17.5, 4.2, 3, furL);
  // bulging eyes
  eyes(ctx, 13, 21, 11.5, 2.9, p, '#2e222f', '#7a4a2a');
  blob(ctx, 17, 16, 1.5, 1.1, '#3e3546', 1.6, 0.6);
  if (p.attack) {
    blob(ctx, 17, 19.5, 2.6, 2, '#6e2727', 1.2, 0.7);
    for (const [a, b, c, d] of [[23, 17, 28, 15], [23, 19.5, 29, 19.5], [11, 17, 6, 15], [11, 19.5, 5, 19.5]]) line(ctx, a, b, c, d, '#ffffff');
  } else {
    line(ctx, 15.5, 19.5, 18.5, 19.5, '#45293f');
  }
  // studded pink collar
  spoly(ctx, [11.5, 18.5, 22.5, 18.5, 22, 20.5, 12, 20.5], '#f04f78');
  for (const x of [13.5, 17, 20.5]) px(ctx, x, 19, '#f9c22b', 1, 1);
}

// ---------------- REX (boss doberman, the "baron") ----------------
function drawRex(ctx: Ctx, p: Pose) {
  const black = '#3e3546', tan = '#cd683d', steel = '#9babb2';
  const o = p.attack ? -2 : 0;
  // legs + tan paws
  for (const [x, ph] of [[21, p.leg], [49, -p.leg]] as [number, number][]) {
    blob(ctx, x + ph * 3, 63, 8, 7, black);
    blob(ctx, x + ph * 3, 67, 6.5, 3, tan);
  }
  // muscular torso + tan chest markings
  blob(ctx, 35, 46 + o, 24, 16, black, 1.3, 0.7);
  blob(ctx, 35, 49 + o, 11, 9, tan);
  // armor chest plate with rivets
  spoly(ctx, [23, 38 + o, 47, 38 + o, 43, 57 + o, 27, 57 + o], steel, 1.3, 0.6);
  for (const [x, y] of [[25, 40], [45, 40], [29, 55], [41, 55]]) px(ctx, x, y + o, '#ffffff', 1.2, 1.2);
  text(ctx, 'REX', 29.5, 44 + o, '#c32454');
  // arms
  if (p.attack) {
    blob(ctx, 57, 26 + o, 5.5, 12, black, 1.3, 0.7);
    // bone held high
    px(ctx, 50, 9 + o, '#fdf3e7', 15, 3.2);
    for (const [x, y] of [[50, 9], [50, 12.5], [65, 9], [65, 12.5]]) blob(ctx, x, y + o, 2.3, 2.3, '#fdf3e7', 1.2, 0.85);
    blob(ctx, 12, 46, 5.5, 11, black, 1.3, 0.7);
  } else {
    blob(ctx, 11, 46, 5.5, 11.5, black, 1.3, 0.7);
    blob(ctx, 59, 46, 5.5, 11.5, black, 1.3, 0.7);
    blob(ctx, 11, 57, 4.5, 3, tan);
    blob(ctx, 59, 57, 4.5, 3, tan);
  }
  // gold spiked collar
  spoly(ctx, [16, 30 + o, 54, 30 + o, 53, 34.5 + o, 17, 34.5 + o], '#f9c22b');
  for (let x = 17; x < 53; x += 5) spoly(ctx, [x, 30.5 + o, x + 3, 30.5 + o, x + 1.5, 25.5 + o], '#fbff86', 1.2, 0.8);
  // tall pointy ears
  spoly(ctx, [17, 1 + o, 24, 11 + o, 15, 17 + o], black, 1.3, 0.8);
  spoly(ctx, [53, 1 + o, 46, 11 + o, 55, 17 + o], black, 1.3, 0.8);
  // head, muzzle, tan brows
  blob(ctx, 35, 19 + o, 16.5, 12, black, 1.3, 0.7);
  blob(ctx, 35, 26 + o, 8.5, 5.6, tan);
  blob(ctx, 26.5, 15.5 + o, 3, 2, tan);
  blob(ctx, 43.5, 15.5 + o, 3, 2, tan);
  // war helmet with red crest
  spoly(ctx, [21, 11 + o, 49, 11 + o, 45, 4 + o, 25, 4 + o], steel, 1.4, 0.65);
  spoly(ctx, [33, 4 + o, 37, 4 + o, 35, -2 + o], '#e83b3b');
  // glowing red eyes
  eyes(ctx, 28, 42, 17 + o, 2.6, p, '#ff2a2a');
  blob(ctx, 35, 23.5 + o, 3.8, 2.2, '#2e222f', 1.6, 0.6);
  if (p.attack) {
    blob(ctx, 35, 29 + o, 6.5, 3.4, '#6e2727', 1.2, 0.6);
    for (let x = 30; x <= 39; x += 3) poly(ctx, [x, 26.5 + o, x + 2, 26.5 + o, x + 1, 29.5 + o], '#ffffff');
  } else {
    px(ctx, 29, 28.5 + o, '#2e222f', 12, 1.2);
    poly(ctx, [30, 28.5 + o, 32, 28.5 + o, 31, 31.5 + o], '#ffffff');
    poly(ctx, [38, 28.5 + o, 40, 28.5 + o, 39, 31.5 + o], '#ffffff');
  }
  // battle scar
  line(ctx, 40, 11 + o, 44, 21 + o, '#e83b3b');
}

const DRAWERS: Record<EnemyKind, { w: number; h: number; draw: (ctx: Ctx, p: Pose) => void }> = {
  mouse: { w: 30, h: 36, draw: drawMouse },
  bulldog: { w: 52, h: 48, draw: drawBulldog },
  chihuahua: { w: 34, h: 36, draw: drawChihuahua },
  rex: { w: 70, h: 70, draw: drawRex },
};

export function enemySize(kind: EnemyKind) {
  const d = DRAWERS[kind];
  return { w: d.w, h: d.h };
}

function stars(ctx: Ctx, w: number, y: number) {
  for (const [x, c] of [[w * 0.25, '#ffd23f'], [w * 0.5, '#fff'], [w * 0.75, '#ffd23f']] as [number, string][]) {
    px(ctx, x, y - 1, c, 1, 3);
    px(ctx, x - 1, y, c, 3, 1);
  }
}

/** Build every animation frame for an enemy kind. */
export function buildEnemyFrames(kind: EnemyKind): Record<EnemyFrame, HTMLCanvasElement> {
  const { w, h, draw } = DRAWERS[kind];
  const mk = (pose: Partial<Pose>, squash = 1, tint?: string) => {
    // enemies get extra resolution in the hi-res styles: they're often seen up close
    const S = STYLE.smooth ? STYLE.art * 2 : 2;
    const [base, bctx] = makeCanvas(w, h, S);
    draw(bctx, { leg: 0, attack: false, pain: false, ko: false, ...pose });
    const [c, ctx] = makeCanvas(w, h, S);
    if (squash < 1) {
      const sh = Math.round(h * squash);
      ctx.drawImage(base, -w * (1 - squash) * 0.25, h - sh, w * (1 + (1 - squash) * 0.5), sh);
    } else ctx.drawImage(base, 0, 0, w, h);
    if (tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    finish(c, ctx);
    if (pose.ko) stars(ctx, w, h - Math.round(h * squash) + 2);
    return c;
  };
  return {
    walk0: mk({ leg: -1 }),
    walk1: mk({ leg: 1 }),
    attack: mk({ attack: true }),
    pain: mk({ pain: true }, 1, 'rgba(255,255,255,0.35)'),
    die0: mk({ ko: true, pain: true }, 0.8),
    die1: mk({ ko: true }, 0.55),
    dead: mk({ ko: true }, 0.32, 'rgba(40,20,30,0.25)'),
  };
}

// ---------------- PICKUPS / DECOR ----------------
export type ItemKind =
  | 'catnip' | 'kibble' | 'tuna' | 'box' | 'bullets' | 'shells' | 'ammobox'
  | 'shotgun' | 'chaingun' | 'key_red' | 'key_blue' | 'key_yellow'
  | 'lamp' | 'plant' | 'bowl' | 'barrel';

function item(w: number, h: number, paint: (ctx: Ctx) => void) {
  const [c, ctx] = makeCanvas(w, h);
  paint(ctx);
  return finish(c, ctx);
}

function key(color: string) {
  // a classic chunky key, easy to recognise
  return item(18, 10, (ctx) => {
    ellipse(ctx, 4.5, 5, 4, 4, color);
    ellipse(ctx, 4.5, 5, 1.6, 1.6, '#2e222f');
    px(ctx, 8, 4, color, 9, 2.5);
    px(ctx, 13, 6, color, 2, 3);
    px(ctx, 16, 6, color, 1.5, 2.5);
    px(ctx, 2, 2, '#ffffff', 2, 1);
  });
}

export function buildItems(): Record<ItemKind, HTMLCanvasElement> {
  return {
    catnip: item(14, 14, (ctx) => {
      ellipse(ctx, 7, 9, 4, 4, '#2d6a4f');
      for (const [x, y] of [[3, 6], [10, 5], [7, 3], [5, 10], [10, 10]]) ellipse(ctx, x, y, 2.5, 2, '#52b788');
      px(ctx, 6, 12, '#95d5b2', 2, 2);
    }),
    kibble: item(20, 12, (ctx) => {
      ellipse(ctx, 10, 8, 9, 4, '#e63946');
      ellipse(ctx, 10, 6, 8, 2.5, '#9c6644');
      for (const [x, y] of [[6, 5], [10, 4], [13, 6], [8, 7]]) px(ctx, x, y, '#ddb892', 2, 1);
      text(ctx, 'CAT', 4, 8, '#fff');
    }),
    tuna: item(18, 16, (ctx) => {
      ellipse(ctx, 9, 11, 8, 4, '#adb5bd');
      px(ctx, 1, 6, '#ced4da', 16, 5);
      ellipse(ctx, 9, 6, 8, 3, '#e9ecef');
      ellipse(ctx, 9, 6, 6, 2, '#f4a3a8');
      px(ctx, 2, 8, '#0077b6', 14, 2);
      // glow sparkle
      px(ctx, 15, 1, '#fff', 1, 3);
      px(ctx, 14, 2, '#fff', 3, 1);
    }),
    box: item(22, 18, (ctx) => {
      poly(ctx, [1, 6, 21, 6, 21, 17, 1, 17], '#c9a26b');
      poly(ctx, [1, 6, 6, 1, 11, 6], '#e0bb85');
      poly(ctx, [21, 6, 16, 1, 11, 6], '#b08850');
      px(ctx, 1, 10, '#a37b45', 20, 1);
      text(ctx, 'ARM', 5, 11, '#5a3a18');
    }),
    bullets: item(12, 12, (ctx) => {
      // a clip of brass bullets
      px(ctx, 2, 5, '#625565', 8, 7);
      for (const x of [3, 5.5, 8]) { px(ctx, x, 1, '#f9c22b', 1.6, 5); px(ctx, x, 1, '#fbff86', 1.6, 1.5); }
    }),
    shells: item(14, 11, (ctx) => {
      // a handful of red shotgun shells
      for (const [x, y] of [[2, 3], [6, 2], [10, 3]]) {
        px(ctx, x, y, '#e83b3b', 3, 6);
        px(ctx, x, y + 6, '#f9c22b', 3, 2);
        px(ctx, x, y, '#f68181', 1, 6);
      }
    }),
    ammobox: item(20, 14, (ctx) => {
      px(ctx, 1, 3, '#547e64', 18, 10);
      px(ctx, 1, 3, '#92a984', 18, 2);
      px(ctx, 6, 6, '#f9c22b', 8, 4);
      for (const x of [7, 9, 11]) px(ctx, x, 7, '#6e2727', 1, 2);
    }),
    shotgun: item(30, 10, (ctx) => {
      px(ctx, 2, 3, '#625565', 18, 3);
      px(ctx, 6, 6, '#9e4539', 8, 2); // pump
      px(ctx, 18, 3, '#9e4539', 10, 5); // stock
      px(ctx, 2, 3, '#9babb2', 18, 1);
    }),
    chaingun: item(30, 12, (ctx) => {
      for (const y of [3, 5, 7]) px(ctx, 1, y, y === 5 ? '#9babb2' : '#625565', 16, 1.6);
      px(ctx, 15, 2, '#3e3546', 13, 8);
      px(ctx, 20, 9, '#3e3546', 3, 3);
      px(ctx, 15, 2, '#7f708a', 13, 1.5);
    }),
    key_red: key('#e63946'),
    key_blue: key('#4361ee'),
    key_yellow: key('#ffd166'),
    lamp: item(14, 40, (ctx) => {
      px(ctx, 6, 12, '#444', 2, 26);
      ellipse(ctx, 7, 38, 5, 2, '#333');
      poly(ctx, [2, 12, 12, 12, 10, 3, 4, 3], '#ffe66d');
      px(ctx, 4, 3, '#fff7c2', 6, 2);
    }),
    plant: item(20, 34, (ctx) => {
      poly(ctx, [5, 24, 15, 24, 13, 33, 7, 33], '#c1440e');
      for (const [x, y, rx, ry] of [[10, 12, 3, 9], [5, 16, 3, 7], [15, 15, 3, 7], [10, 8, 2, 6]])
        ellipse(ctx, x, y, rx, ry, '#2d6a4f');
      px(ctx, 9, 4, '#52b788', 2, 14);
    }),
    bowl: item(18, 10, (ctx) => {
      ellipse(ctx, 9, 6, 8, 3.5, '#4361ee');
      ellipse(ctx, 9, 4, 6, 1.5, '#bde0fe');
      text(ctx, 'H2O', 4, 5, '#fff');
    }),
    barrel: item(20, 26, (ctx) => {
      // a "barrel": giant catnip spray can that explodes
      px(ctx, 3, 3, '#2a9d8f', 14, 22);
      px(ctx, 3, 3, '#5fd3c4', 2, 22);
      px(ctx, 7, 0, '#ccc', 6, 3);
      text(ctx, 'NIP', 4, 12, '#fff');
      px(ctx, 3, 19, '#e76f51', 14, 2);
    }),
  };
}

// ---------------- PROJECTILES & FX ----------------
export type FxKind = 'hairball' | 'cheese' | 'yap' | 'bone' | 'puff0' | 'puff1' | 'fur0' | 'fur1' | 'boom0' | 'boom1' | 'boom2';

export function buildFx(): Record<FxKind, HTMLCanvasElement> {
  return {
    hairball: item(10, 10, (ctx) => {
      ellipse(ctx, 5, 5, 4, 4, '#7f8c4a');
      px(ctx, 3, 3, '#c9d48a', 2, 1);
    }),
    cheese: item(12, 10, (ctx) => {
      poly(ctx, [1, 9, 11, 9, 11, 1], '#ffd23f');
      px(ctx, 7, 6, '#e0a800', 2, 2);
      px(ctx, 9, 3, '#e0a800', 1, 1);
    }),
    yap: item(16, 16, (ctx) => {
      ctx.strokeStyle = '#ff4dd2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(8, 8, 6, 0, Math.PI * 2);
      ctx.stroke();
      text(ctx, '!', 7, 6, '#fff');
    }),
    bone: item(16, 8, (ctx) => {
      px(ctx, 3, 3, '#fff', 10, 2);
      for (const [x, y] of [[3, 2], [3, 5], [13, 2], [13, 5]]) ellipse(ctx, x, y, 2, 2, '#fff');
    }),
    puff0: item(8, 8, (ctx) => ellipse(ctx, 4, 4, 3, 3, '#ddd')),
    puff1: item(8, 8, (ctx) => {
      px(ctx, 1, 1, '#aaa', 2, 2);
      px(ctx, 5, 2, '#aaa', 2, 2);
      px(ctx, 3, 5, '#aaa', 2, 2);
    }),
    fur0: item(10, 10, (ctx) => {
      ellipse(ctx, 5, 5, 4, 4, '#ff3b3b');
      px(ctx, 4, 4, '#ffd23f', 2, 2);
    }),
    fur1: item(12, 12, (ctx) => {
      for (const [x, y] of [[1, 2], [8, 1], [2, 8], [9, 9], [5, 5]]) px(ctx, x, y, '#ff6b6b', 2, 2);
    }),
    boom0: item(24, 24, (ctx) => {
      ellipse(ctx, 12, 12, 8, 8, '#fff3b0');
      ellipse(ctx, 12, 12, 5, 5, '#fff');
    }),
    boom1: item(32, 32, (ctx) => {
      ellipse(ctx, 16, 16, 14, 13, '#ff7b00');
      ellipse(ctx, 16, 16, 9, 9, '#ffd23f');
      ellipse(ctx, 14, 13, 4, 4, '#fff');
    }),
    boom2: item(32, 32, (ctx) => {
      for (const [x, y, r] of [[10, 12, 7], [20, 10, 6], [16, 20, 8], [24, 20, 5]]) ellipse(ctx, x, y, r, r, '#6c757d');
      ellipse(ctx, 16, 16, 4, 4, '#ff7b00');
    }),
  };
}
