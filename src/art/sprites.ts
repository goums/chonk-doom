// Procedural billboard sprites: enemies, pickups, projectiles, effects.
import { makeCanvas, crisp, outline, ellipse, poly, px, line, text, type Ctx } from './pixel';

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

function angryEyes(ctx: Ctx, lx: number, rx: number, y: number, r: number, pose: Pose, iris = '#ff2020') {
  if (pose.ko) {
    for (const x of [lx, rx]) {
      line(ctx, x - r, y - r, x + r, y + r, '#111');
      line(ctx, x - r, y + r, x + r, y - r, '#111');
    }
    return;
  }
  if (pose.pain) {
    line(ctx, lx - r, y, lx + r, y - 1, '#111');
    line(ctx, rx - r, y - 1, rx + r, y, '#111');
    return;
  }
  ellipse(ctx, lx, y, r, r, '#fff');
  ellipse(ctx, rx, y, r, r, '#fff');
  ellipse(ctx, lx + 0.5, y + 0.5, r * 0.55, r * 0.55, iris);
  ellipse(ctx, rx - 0.5, y + 0.5, r * 0.55, r * 0.55, iris);
  // furious brows
  ctx.lineWidth = Math.max(1, r * 0.7);
  ctx.strokeStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(lx - r - 1, y - r - 1);
  ctx.lineTo(lx + r, y - r * 0.2);
  ctx.moveTo(rx + r + 1, y - r - 1);
  ctx.lineTo(rx - r, y - r * 0.2);
  ctx.stroke();
}

// ---------------- MOUSE ----------------
function drawMouse(ctx: Ctx, p: Pose) {
  const grey = '#8d8d9a', dark = '#5d5d6a', pink = '#ff9eb5';
  // tail
  ctx.strokeStyle = pink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(17, 24);
  ctx.quadraticCurveTo(24, 22, 22, 14);
  ctx.stroke();
  // feet
  ellipse(ctx, 8 + p.leg * 1.5, 27, 2.5, 1.4, pink);
  ellipse(ctx, 16 - p.leg * 1.5, 27, 2.5, 1.4, pink);
  // body
  ellipse(ctx, 12, 19, 6, 7.5, grey);
  ellipse(ctx, 12, 20, 3.8, 5.5, '#c9c3d0');
  // arms
  if (p.attack) {
    px(ctx, 16, 6, grey, 2, 8);
    poly(ctx, [13, 1, 22, 3, 17, 7], '#ffd23f'); // cheese wedge!
    px(ctx, 16, 3, '#e0a800');
    px(ctx, 19, 4, '#e0a800');
  } else {
    ellipse(ctx, 7, 18, 1.5, 3, dark);
    ellipse(ctx, 17, 18, 1.5, 3, dark);
  }
  // ears
  ellipse(ctx, 6, 5, 3.8, 3.8, grey);
  ellipse(ctx, 18, 5, 3.8, 3.8, grey);
  ellipse(ctx, 6, 5, 2.3, 2.3, pink);
  ellipse(ctx, 18, 5, 2.3, 2.3, pink);
  // head
  ellipse(ctx, 12, 10, 5.5, 4.8, grey);
  angryEyes(ctx, 10, 14, 9, 1.4, p);
  px(ctx, 11, 12, pink, 2, 1.5); // nose
  px(ctx, 11, 14, '#fff', 1, 2); // buck teeth
  px(ctx, 12, 14, '#fff', 1, 2);
  line(ctx, 6, 12, 9, 12, '#333');
  line(ctx, 15, 12, 18, 12, '#333');
}

// ---------------- BULLDOG ----------------
function drawBulldog(ctx: Ctx, p: Pose) {
  const fur = '#b07a4a', dark = '#7a4e2a', white = '#f1e9da';
  const o = p.attack ? -2 : 0; // lunge up
  // legs
  ellipse(ctx, 12 + p.leg * 2, 40, 5, 4, fur);
  ellipse(ctx, 36 - p.leg * 2, 40, 5, 4, fur);
  ellipse(ctx, 12 + p.leg * 2, 42, 5, 2, white);
  ellipse(ctx, 36 - p.leg * 2, 42, 5, 2, white);
  // body
  ellipse(ctx, 24, 31 + o, 17, 11, fur);
  ellipse(ctx, 24, 33 + o, 9, 8, white);
  // collar with spikes
  px(ctx, 11, 23 + o, '#d62828', 26, 3);
  for (let x = 12; x < 37; x += 4) poly(ctx, [x, 23 + o, x + 2, 23 + o, x + 1, 20 + o], '#dfe6ee');
  // ears
  poly(ctx, [10, 7 + o, 16, 5 + o, 13, 12 + o], dark);
  poly(ctx, [38, 7 + o, 32, 5 + o, 35, 12 + o], dark);
  // head
  ellipse(ctx, 24, 14 + o, 14, 10, fur);
  ellipse(ctx, 24, 18 + o, 11, 6, white);
  // wrinkles
  line(ctx, 18, 7 + o, 22, 9 + o, dark);
  line(ctx, 30, 7 + o, 26, 9 + o, dark);
  angryEyes(ctx, 18, 30, 12 + o, 2.2, p);
  ellipse(ctx, 24, 15 + o, 3.5, 2.2, '#1b1b1b'); // nose
  px(ctx, 23, 14 + o, '#666', 1, 1);
  if (p.attack) {
    ellipse(ctx, 24, 21 + o, 7, 4.5, '#5a0f14');
    ellipse(ctx, 24, 23 + o, 4, 2, '#e5677a'); // tongue
    for (let x = 18; x <= 29; x += 3) poly(ctx, [x, 17 + o, x + 2, 17 + o, x + 1, 20 + o], '#fff');
  } else {
    // underbite with fangs
    px(ctx, 17, 20 + o, '#5a0f14', 14, 2);
    poly(ctx, [18, 21 + o, 20, 21 + o, 19, 17 + o], '#fff');
    poly(ctx, [28, 21 + o, 30, 21 + o, 29, 17 + o], '#fff');
    // drool
    px(ctx, 31, 21 + o, '#bfe9ff', 1, 4);
  }
}

// ---------------- CHIHUAHUA ----------------
function drawChihuahua(ctx: Ctx, p: Pose) {
  const fur = '#e0b07a', dark = '#a9744a', pink = '#ff9eb5';
  // thin legs
  px(ctx, 11 + p.leg, 24, fur, 2, 8);
  px(ctx, 19 - p.leg, 24, fur, 2, 8);
  // body
  ellipse(ctx, 16, 22, 7, 5, fur);
  // ENORMOUS ears
  poly(ctx, [10, 9, 1, 0, 6, 13], fur);
  poly(ctx, [22, 9, 31, 0, 26, 13], fur);
  poly(ctx, [9, 9, 3, 2, 7, 12], pink);
  poly(ctx, [23, 9, 29, 2, 25, 12], pink);
  // head
  ellipse(ctx, 16, 12, 7, 6, fur);
  ellipse(ctx, 16, 16, 3.5, 2.5, dark);
  // bulging eyes
  if (p.ko || p.pain) angryEyes(ctx, 12, 20, 11, 2, p);
  else {
    ellipse(ctx, 12, 11, 2.8, 2.8, '#fff');
    ellipse(ctx, 20, 11, 2.8, 2.8, '#fff');
    px(ctx, 12, 11, '#e00', 1, 1);
    px(ctx, 20, 11, '#e00', 1, 1);
    line(ctx, 9, 7, 14, 9, '#5a3a20');
    line(ctx, 23, 7, 18, 9, '#5a3a20');
  }
  px(ctx, 15, 15, '#111', 2, 1);
  if (p.attack) {
    ellipse(ctx, 16, 18, 2.5, 2, '#5a0f14');
    // yap shout lines
    line(ctx, 22, 17, 27, 15, '#fff');
    line(ctx, 22, 19, 28, 19, '#fff');
    line(ctx, 10, 17, 5, 15, '#fff');
  }
  // studded pink collar
  px(ctx, 11, 17, '#ff4d9d', 10, 2);
}

// ---------------- REX (boss doberman) ----------------
function drawRex(ctx: Ctx, p: Pose) {
  const black = '#2a2228', tan = '#b5651d', steel = '#9aa7b4';
  const o = p.attack ? -2 : 0;
  // legs
  ellipse(ctx, 18 + p.leg * 3, 58, 7, 6, black);
  ellipse(ctx, 46 - p.leg * 3, 58, 7, 6, black);
  ellipse(ctx, 18 + p.leg * 3, 61, 6, 2.5, tan);
  ellipse(ctx, 46 - p.leg * 3, 61, 6, 2.5, tan);
  // muscular body
  ellipse(ctx, 32, 42 + o, 22, 15, black);
  ellipse(ctx, 32, 44 + o, 11, 10, tan);
  // armor chest plate
  poly(ctx, [20, 34 + o, 44, 34 + o, 40, 52 + o, 24, 52 + o], steel);
  px(ctx, 22, 35 + o, '#dfe6ee', 20, 1);
  text(ctx, 'REX', 26, 40 + o, '#d62828');
  // arms
  if (p.attack) {
    px(ctx, 50, 12 + o, black, 6, 22);
    // bone held up
    px(ctx, 47, 6 + o, '#fff', 14, 3);
    ellipse(ctx, 47, 6 + o, 2, 2, '#fff');
    ellipse(ctx, 47, 9 + o, 2, 2, '#fff');
    ellipse(ctx, 61, 6 + o, 2, 2, '#fff');
    ellipse(ctx, 61, 9 + o, 2, 2, '#fff');
  } else {
    ellipse(ctx, 10, 42, 5, 10, black);
    ellipse(ctx, 54, 42, 5, 10, black);
  }
  // gold spiked collar
  px(ctx, 14, 28 + o, '#f4c430', 36, 4);
  for (let x = 15; x < 50; x += 5) poly(ctx, [x, 28 + o, x + 3, 28 + o, x + 1.5, 24 + o], '#fff3b0');
  // tall pointy ears
  poly(ctx, [16, 2 + o, 22, 10 + o, 14, 16 + o], black);
  poly(ctx, [48, 2 + o, 42, 10 + o, 50, 16 + o], black);
  // head
  ellipse(ctx, 32, 17 + o, 15, 11, black);
  ellipse(ctx, 32, 23 + o, 8, 5, tan);
  ellipse(ctx, 23, 14 + o, 3, 2, tan);
  ellipse(ctx, 41, 14 + o, 3, 2, tan);
  // helmet
  poly(ctx, [19, 9 + o, 45, 9 + o, 41, 3 + o, 23, 3 + o], steel);
  px(ctx, 31, 0 + o, '#d62828', 2, 4);
  angryEyes(ctx, 25, 39, 15 + o, 2.4, p, '#ff0000');
  ellipse(ctx, 32, 21 + o, 3.5, 2, '#000');
  if (p.attack) {
    ellipse(ctx, 32, 26 + o, 6, 3, '#5a0f14');
    for (let x = 27; x <= 36; x += 3) poly(ctx, [x, 24 + o, x + 2, 24 + o, x + 1, 27 + o], '#fff');
  } else {
    px(ctx, 26, 26 + o, '#000', 12, 1);
    poly(ctx, [27, 26 + o, 29, 26 + o, 28, 29 + o], '#fff');
    poly(ctx, [35, 26 + o, 37, 26 + o, 36, 29 + o], '#fff');
  }
  // scar
  line(ctx, 37, 10 + o, 41, 19 + o, '#c0392b');
}

const DRAWERS: Record<EnemyKind, { w: number; h: number; draw: (ctx: Ctx, p: Pose) => void }> = {
  mouse: { w: 24, h: 30, draw: drawMouse },
  bulldog: { w: 48, h: 46, draw: drawBulldog },
  chihuahua: { w: 32, h: 34, draw: drawChihuahua },
  rex: { w: 64, h: 66, draw: drawRex },
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
    const [base, bctx] = makeCanvas(w, h);
    draw(bctx, { leg: 0, attack: false, pain: false, ko: false, ...pose });
    const [c, ctx] = makeCanvas(w, h);
    if (squash < 1) {
      const sh = Math.round(h * squash);
      ctx.drawImage(base, -w * (1 - squash) * 0.25, h - sh, w * (1 + (1 - squash) * 0.5), sh);
    } else ctx.drawImage(base, 0, 0);
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
  | 'catnip' | 'kibble' | 'tuna' | 'box' | 'hairballs' | 'sardines' | 'battery'
  | 'shotgun' | 'laser' | 'key_red' | 'key_blue' | 'key_yellow'
  | 'lamp' | 'plant' | 'bowl' | 'barrel';

function item(w: number, h: number, paint: (ctx: Ctx) => void) {
  const [c, ctx] = makeCanvas(w, h);
  paint(ctx);
  return finish(c, ctx);
}

function key(color: string) {
  // a cat collar with a bell = keycard
  return item(16, 14, (ctx) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(8, 6, 6, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ellipse(ctx, 8, 10, 2.5, 2.5, '#ffd23f');
    px(ctx, 7, 11, '#8a6d00', 2, 1);
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
    hairballs: item(14, 10, (ctx) => {
      for (const [x, y] of [[4, 6], [10, 6], [7, 3]]) {
        ellipse(ctx, x, y, 3, 3, '#7f8c4a');
        px(ctx, x - 1, y - 1, '#b5c47a');
      }
    }),
    sardines: item(16, 10, (ctx) => {
      px(ctx, 1, 2, '#adb5bd', 14, 7);
      px(ctx, 1, 2, '#e9ecef', 14, 1);
      px(ctx, 2, 4, '#ff4d6d', 12, 3);
      poly(ctx, [4, 5, 10, 4, 10, 6], '#dee2e6');
      poly(ctx, [10, 5, 13, 3, 13, 7], '#dee2e6');
    }),
    battery: item(10, 16, (ctx) => {
      px(ctx, 1, 3, '#222', 8, 12);
      px(ctx, 1, 3, '#f4c430', 8, 5);
      px(ctx, 3, 1, '#bbb', 4, 2);
      px(ctx, 4, 9, '#f4c430', 2, 4);
    }),
    shotgun: item(30, 12, (ctx) => {
      px(ctx, 2, 3, '#4361ee', 20, 3);
      px(ctx, 2, 6, '#4361ee', 20, 3);
      px(ctx, 18, 3, '#8a5a32', 10, 7);
      poly(ctx, [6, 4, 12, 3, 12, 7], '#ccc');
    }),
    laser: item(26, 10, (ctx) => {
      px(ctx, 2, 3, '#e5e5e5', 18, 4);
      px(ctx, 20, 2, '#ff006e', 4, 6);
      px(ctx, 8, 2, '#ff006e', 2, 1);
      px(ctx, 0, 4, '#ff0000', 2, 2);
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
