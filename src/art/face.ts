// Le Chonk's Doom-style status-bar face. Reacts to health, damage direction,
// pickups and shooting, exactly like the classic marine mugshot.
import { makeCanvas, crisp, outline, ellipse, poly, px, line, type Ctx } from './pixel';

export const FACE_W = 30;
export const FACE_H = 30;

export type Expression = 'normal' | 'ouch' | 'grin' | 'angry' | 'happy' | 'dead' | 'blink';

// Mistral / Le Chonk brand palette
const ORANGE = '#FF8204';
const ORANGE_D = '#FA500F';
const RED = '#E51300';
const YELLOW = '#FEC63A';
const DARK = '#171722';
const CREAM = '#fff1d6';

function drawFace(ctx: Ctx, tier: number, look: -1 | 0 | 1, expr: Expression) {
  const cx = 15;
  // ears (left ear gets notched when beaten up)
  poly(ctx, [3, 12, 5, 1, 12, 7], ORANGE);
  poly(ctx, [27, 12, 25, 1, 18, 7], ORANGE);
  poly(ctx, [5, 10, 6, 4, 10, 7], '#ffb3c1');
  poly(ctx, [25, 10, 24, 4, 20, 7], '#ffb3c1');
  // CHONKY head: very wide
  ellipse(ctx, cx, 17, 14, 11.5, ORANGE);
  // cheek fluff
  poly(ctx, [1, 18, -1, 22, 3, 21], ORANGE);
  poly(ctx, [29, 18, 31, 22, 27, 21], ORANGE);
  // tabby "M" stripes
  line(ctx, 11, 7, 12, 11, ORANGE_D);
  line(ctx, 15, 6, 15, 10, ORANGE_D);
  line(ctx, 19, 7, 18, 11, ORANGE_D);
  line(ctx, 2, 15, 6, 16, ORANGE_D);
  line(ctx, 28, 15, 24, 16, ORANGE_D);
  // muzzle
  ellipse(ctx, cx, 22, 7, 5, CREAM);

  // ---- eyes ----
  const ex = [9, 21];
  const ey = 15;
  const pupil = look * 1.5;
  if (expr === 'dead') {
    for (const x of ex) {
      line(ctx, x - 2, ey - 2, x + 2, ey + 2, '#222');
      line(ctx, x - 2, ey + 2, x + 2, ey - 2, '#222');
    }
  } else if (expr === 'happy' || expr === 'blink') {
    for (const x of ex) {
      line(ctx, x - 2, ey, x, ey - 2, '#222');
      line(ctx, x, ey - 2, x + 2, ey, '#222');
    }
  } else if (expr === 'grin') {
    for (const x of ex) {
      ellipse(ctx, x, ey, 3, 2, YELLOW);
      px(ctx, x - 1 + pupil, ey - 1, '#111', 2, 3);
      line(ctx, x - 3, ey - 3, x + 3, ey - 2, '#5a2a0a');
    }
  } else {
    const big = expr === 'ouch';
    const r = big ? 3.4 : 3;
    for (const x of ex) {
      ellipse(ctx, x, ey, r, r, YELLOW);
      const pw = big ? 1 : tier >= 3 ? 1 : 2;
      px(ctx, x - pw / 2 + pupil, ey - 2, DARK, pw, 4);
      px(ctx, x + 1, ey - 2, '#fff', 1, 1);
    }
    // eyelids droop as health drops
    if (tier >= 2 && !big) {
      for (const x of ex) px(ctx, x - 3, ey - 3, ORANGE_D, 7, tier >= 4 ? 3 : 2);
    }
    if (expr === 'angry') {
      line(ctx, 5, 10, 11, 13, '#3a1a05');
      line(ctx, 25, 10, 19, 13, '#3a1a05');
      line(ctx, 5, 11, 11, 14, '#3a1a05');
      line(ctx, 25, 11, 19, 14, '#3a1a05');
    }
  }

  // nose
  poly(ctx, [13, 19, 17, 19, 15, 21], '#ff6b8b');

  // ---- mouth ----
  if (expr === 'ouch') {
    ellipse(ctx, cx, 25, 3, 2.5, '#5a0f14');
    px(ctx, 14, 23, '#fff', 1, 1);
    px(ctx, 16, 23, '#fff', 1, 1);
  } else if (expr === 'grin' || expr === 'angry') {
    px(ctx, 9, 23, '#5a0f14', 12, 3);
    for (let x = 9; x < 21; x += 2) px(ctx, x, 23, '#fff', 1, expr === 'angry' ? 2 : 1);
    poly(ctx, [10, 23, 12, 23, 11, 26], '#fff');
    poly(ctx, [18, 23, 20, 23, 19, 26], '#fff');
  } else if (expr === 'dead') {
    line(ctx, 12, 23, 18, 23, '#5a0f14');
    ellipse(ctx, 16, 25, 1.5, 2, '#ff6b8b'); // tongue out
  } else if (expr === 'happy') {
    line(ctx, 11, 22, 15, 24, '#5a0f14');
    line(ctx, 15, 24, 19, 22, '#5a0f14');
  } else {
    // classic cat ":3" mouth, flattens when hurt
    if (tier <= 1) {
      line(ctx, 12, 22, 14, 23, '#5a0f14');
      line(ctx, 15, 22, 15, 22, '#5a0f14');
      line(ctx, 16, 23, 18, 22, '#5a0f14');
    } else {
      line(ctx, 12, 23, 18, tier >= 3 ? 24 : 23, '#5a0f14');
    }
  }
  // Mistral-red bandana with a golden bell (Le Chonk's signature look)
  if (expr !== 'dead') {
    poly(ctx, [5, 27, 25, 27, 22, 30, 8, 30], RED);
    px(ctx, 14, 28, YELLOW, 2, 2);
  }
  // whiskers
  for (const dy of [0, 2]) {
    line(ctx, 0, 20 + dy, 7, 21 + dy / 2, '#fff');
    line(ctx, 30, 20 + dy, 23, 21 + dy / 2, '#fff');
  }

  // ---- battle damage per health tier ----
  if (tier >= 1) {
    line(ctx, 22, 9, 25, 12, '#b5179e'); // scratch
    line(ctx, 23, 9, 26, 12, '#e5383b');
  }
  if (tier >= 2) {
    // ear notch + fur tufts
    ctx.clearRect(5, 2, 2, 3);
    for (const [x, y] of [[3, 25], [26, 9], [4, 9]]) px(ctx, x, y, ORANGE_D, 2, 2);
    ellipse(ctx, 21, 18, 2, 1, '#7b2cbf'); // bruise
  }
  if (tier >= 3) {
    // bandage across the head
    poly(ctx, [7, 5, 23, 9, 22, 12, 6, 8], '#f8f9fa');
    px(ctx, 13, 7, '#e5383b', 3, 2);
    px(ctx, 8, 19, '#e5383b', 1, 4); // blood drip
  }
  if (tier >= 4) {
    px(ctx, 6, 13, '#2b2d42', 7, 5); // black eye
    px(ctx, 25, 24, '#e5383b', 1, 3);
  }
}

/** Face cache keyed by `${tier}_${look}_${expr}`. tier: 0 (healthy) .. 4 (nearly dead). */
export function buildFaces(): Map<string, HTMLCanvasElement> {
  const m = new Map<string, HTMLCanvasElement>();
  const exprs: Expression[] = ['normal', 'ouch', 'grin', 'angry', 'happy', 'blink'];
  for (let tier = 0; tier <= 4; tier++)
    for (const look of [-1, 0, 1] as const)
      for (const e of exprs) {
        const [c, ctx] = makeCanvas(FACE_W, FACE_H);
        drawFace(ctx, tier, look, e);
        crisp(ctx, FACE_W, FACE_H);
        outline(ctx, FACE_W, FACE_H, [40, 18, 6]);
        m.set(`${tier}_${look}_${e}`, c);
      }
  const [c, ctx] = makeCanvas(FACE_W, FACE_H);
  drawFace(ctx, 4, 0, 'dead');
  crisp(ctx, FACE_W, FACE_H);
  outline(ctx, FACE_W, FACE_H, [40, 18, 6]);
  m.set('dead', c);
  return m;
}
