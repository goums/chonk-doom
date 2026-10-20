// 2D overlay: weapon view, status bar with Le Chonk's face, messages, automap, agent ruler.
import { SCREEN_W, SCREEN_H, BAR_H, VIEW_H, HFOV } from '../engine/renderer';
import { text, textWidth, px, makeCanvas, noise, type Ctx } from '../art/pixel';
import { STYLE } from '../art/style';
import { buildFaces, FACE_W, FACE_H, type Expression } from '../art/face';
import { buildWeapons, WEAPON_W, WEAPON_H, type WeaponFrame } from '../art/weapons';
import { buildItems } from '../art/sprites';
import { World, WEAPONS, WEAPON_ORDER, WALL_CHARS, ENEMIES, type KeyColor, type MsgKind } from './world';

/** Style-dependent HUD colors. */
const C = STYLE.pixel
  ? { label: '#9babb2', value: '#fbb954', num: '#ffffff', numShadow: '#2e222f', armsCur: '#ffffff', armsHas: '#fbb954', armsNo: '#625565', menu: '#c7dcd0', menuSel: '#ffffff', shadow: '#2e222f', dim: '#7f708a', accent: '#fb6b1d' }
  : STYLE.ink
  ? { label: '#6b3b22', value: '#2b1d17', num: '#d62828', numShadow: '', armsCur: '#d62828', armsHas: '#2b1d17', armsNo: '#c9b39a', menu: '#6b3b22', menuSel: '#2b1d17', shadow: '', dim: '#8a5a3a', accent: '#d62828' }
  : { label: '#d8c8e0', value: '#ffd23f', num: '#ff3b3b', numShadow: '#3a0a0a', armsCur: '#fff', armsHas: '#ffd23f', armsNo: '#5a4c60', menu: '#b8a6c4', menuSel: '#fff', shadow: '#000', dim: '#7d6b85', accent: '#ff7b00' };

// Art is built lazily (after web fonts are loaded, so smooth-mode text renders correctly).
let faces: ReturnType<typeof buildFaces>;
let weapons: ReturnType<typeof buildWeapons>;
let items: ReturnType<typeof buildItems>;
let barBg: HTMLCanvasElement;

export function initHudArt() {
  if (faces) return;
  faces = buildFaces();
  weapons = buildWeapons();
  items = buildItems();
  const [c, ctx] = makeCanvas(SCREEN_W, BAR_H);
  if (STYLE.ink) {
    // a wooden stage plank
    ctx.fillStyle = '#c98b52';
    ctx.fillRect(0, 0, SCREEN_W, BAR_H);
    for (let y = 0; y < BAR_H; y += 10) { ctx.fillStyle = 'rgba(90,50,20,0.25)'; ctx.fillRect(0, y, SCREEN_W, 0.7); }
    noise(ctx, SCREEN_W, BAR_H, 0, 77);
    ctx.fillStyle = STYLE.inkColor;
    ctx.fillRect(0, 0, SCREEN_W, 1.2);
  } else if (STYLE.smooth) {
    const g = ctx.createLinearGradient(0, 0, 0, BAR_H);
    g.addColorStop(0, '#3b2a4a');
    g.addColorStop(1, '#241a2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SCREEN_W, BAR_H);
    ctx.fillStyle = 'rgba(255,175,0,0.55)';
    ctx.fillRect(0, 0, SCREEN_W, 0.6);
  } else {
    // modern pixel: flat deep purple with a crisp highlight line
    ctx.fillStyle = '#2e222f';
    ctx.fillRect(0, 0, SCREEN_W, BAR_H);
    ctx.fillStyle = '#625565';
    ctx.fillRect(0, 0, SCREEN_W, 1);
    ctx.fillStyle = '#3e3546';
    ctx.fillRect(0, 1, SCREEN_W, 1);
  }
  barBg = c;
}

function panel(ctx: Ctx, x: number, w: number) {
  if (STYLE.ink) {
    ctx.fillStyle = '#f6e7cf';
    ctx.beginPath();
    ctx.roundRect(x + 2, VIEW_H + 4, w - 4, BAR_H - 8, 3);
    ctx.fill();
    ctx.strokeStyle = STYLE.inkColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    return;
  }
  if (STYLE.smooth) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.roundRect(x + 2, VIEW_H + 4, w - 4, BAR_H - 8, 4);
    ctx.fill();
    return;
  }
  pixelCard(ctx, x + 2, VIEW_H + 4, w - 4, BAR_H - 7, '#3e3546', '#625565');
}

/** A chunky pixel card with notched (rounded) corners and a top highlight. */
function pixelCard(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, light: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = light;
  ctx.fillRect(x + 1, y, w - 2, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
}

function heart(ctx: Ctx, x: number, y: number, c: string) {
  ctx.fillStyle = c;
  for (const [dx, dy, w] of [[1, 0, 2], [5, 0, 2], [0, 1, 8], [0, 2, 8], [1, 3, 6], [2, 4, 4], [3, 5, 2]]) ctx.fillRect(x + dx, y + dy, w, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(x + 1, y + 1, 1, 1);
}

function shield(ctx: Ctx, x: number, y: number, c: string) {
  ctx.fillStyle = c;
  for (const [dx, dy, w] of [[0, 0, 8], [0, 1, 8], [0, 2, 8], [1, 3, 6], [1, 4, 6], [2, 5, 4], [3, 6, 2]]) ctx.fillRect(x + dx, y + dy, w, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x + 1, y + 1, 2, 1);
}

function pawIcon(ctx: Ctx, x: number, y: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x + 2, y + 4, 5, 4);
  ctx.fillRect(x + 3, y + 3, 3, 1);
  for (const [dx, dy] of [[0, 1], [3, 0], [6, 0], [8, 2]]) ctx.fillRect(x + dx, y + dy, 2, 2);
}

/** Numbers: in the pixel style they use Press Start 2P, whose digits are unambiguous (5 vs S, 0 vs O). */
function numText(ctx: Ctx, n: string, x: number, y: number, color: string, size: number, align: 'left' | 'center' = 'left') {
  if (!STYLE.pixel) {
    const w = textWidth(n, size);
    text(ctx, n, align === 'center' ? Math.round(x - w / 2) : x, y, color, size, C.numShadow || undefined);
    return;
  }
  ctx.save();
  ctx.font = `${Math.round(size * 4.8)}px 'Press Start 2P', monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  ctx.fillStyle = C.numShadow || '#000';
  ctx.fillText(n, x + 0.6, y + 1.6);
  ctx.fillStyle = color;
  ctx.fillText(n, x, y + 1);
  ctx.restore();
}

function bigNum(ctx: Ctx, n: string, cx: number, y: number, color = C.num, size = 3) {
  numText(ctx, n, cx, y, color, size, 'center');
}

/** Face state machine, kept per-HUD so the idle glance looks natural. */
class FaceAnim {
  look: -1 | 0 | 1 = 0;
  nextLook = 0;
  blinkT = 0;
  pick(w: World): string {
    const p = w.player;
    if (p.dead) return 'dead';
    const tier = p.hp >= 80 ? 0 : p.hp >= 60 ? 1 : p.hp >= 40 ? 2 : p.hp >= 20 ? 3 : 4;
    let expr: Expression = 'normal';
    let look = this.look;
    const since = w.time - p.lastDmgT;
    if (p.faceEvent) expr = p.faceEvent.kind;
    else if (since < 0.7) {
      expr = 'ouch';
      const r = p.lastDmgFrom;
      look = Math.abs(r) < 0.5 || Math.abs(r) > 2.6 ? 0 : r > 0 ? 1 : -1;
    } else if (p.firingFor > 1.2) expr = 'angry';
    else {
      if (w.time > this.nextLook) {
        this.look = ([-1, 0, 0, 1] as const)[Math.floor(Math.random() * 4)];
        this.nextLook = w.time + 0.6 + Math.random() * 1.2;
        if (Math.random() < 0.25) this.blinkT = w.time + 0.12;
      }
      look = this.look;
      if (w.time < this.blinkT) expr = 'blink';
    }
    return `${tier}_${look}_${expr}`;
  }
}
const faceAnim = new FaceAnim();

export interface HudOptions {
  automap: boolean;
  ruler: boolean; // agent angle ruler
  agentBanner?: string;
  showMessages: boolean;
}

export function drawHud(ctx: Ctx, w: World, opt: HudOptions) {
  initHudArt();
  const p = w.player;

  // ---- weapon ----
  if (!p.dead) {
    const wid = p.pendingWeapon && p.switchT < 0.125 ? p.pendingWeapon : p.weapon;
    const def = WEAPONS[p.weapon];
    let frame: WeaponFrame = 'idle';
    const ft = p.fireT;
    if (def.id === 'chaingun') frame = ft < 0.05 ? 'fire0' : ft < 0.1 ? 'fire1' : 'idle';
    else if (ft < def.cooldown * 0.3) frame = 'fire0';
    else if (ft < def.cooldown * 0.75) frame = 'fire1';
    const bx = Math.cos(p.bob) * 6 * Math.min(1, p.moving);
    const by = Math.abs(Math.sin(p.bob)) * 5 * Math.min(1, p.moving);
    const sw = p.pendingWeapon ? Math.sin(Math.max(0, p.switchT) * Math.PI * 4) * 40 : 0;
    ctx.drawImage(weapons[wid][frame], Math.round(SCREEN_W / 2 - WEAPON_W / 2 + bx), Math.round(VIEW_H - WEAPON_H + 8 + by + Math.abs(sw)), WEAPON_W, WEAPON_H);
  }

  // crosshair
  px(ctx, SCREEN_W / 2 - 3, VIEW_H / 2, '#fffb', 2, 1);
  px(ctx, SCREEN_W / 2 + 2, VIEW_H / 2, '#fffb', 2, 1);
  px(ctx, SCREEN_W / 2, VIEW_H / 2 - 3, '#fffb', 1, 2);
  px(ctx, SCREEN_W / 2, VIEW_H / 2 + 2, '#fffb', 1, 2);

  // ---- screen flashes ----
  if (p.dmgFlash > 0) {
    ctx.fillStyle = `rgba(255,0,0,${Math.min(0.55, p.dmgFlash * 0.6)})`;
    ctx.fillRect(0, 0, SCREEN_W, VIEW_H);
  }
  if (p.pickupFlash > 0) {
    ctx.fillStyle = `rgba(255,230,120,${p.pickupFlash * 0.25})`;
    ctx.fillRect(0, 0, SCREEN_W, VIEW_H);
  }
  if (p.dead) {
    ctx.fillStyle = 'rgba(120,0,0,0.45)';
    ctx.fillRect(0, 0, SCREEN_W, VIEW_H);
  }

  if (opt.automap) drawAutomap(ctx, w);
  if (opt.ruler) drawRuler(ctx);

  // ---- notifications: bold friendly toasts ----
  const bossUp = w.enemies.some((e) => e.id === w.bossId && e.state !== 'idle' && e.hp > 0);
  if (opt.showMessages) drawToasts(ctx, w, bossUp ? 28 : 8);
  if (opt.agentBanner) {
    const s = opt.agentBanner;
    const tw = textWidth(s, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(SCREEN_W - tw - 8, 2, tw + 6, 9);
    text(ctx, s, SCREEN_W - tw - 5, 4, '#ff9ec7');
  }

  // ---- boss health bar ----
  const boss = w.enemies.find((e) => e.id === w.bossId);
  if (boss && boss.state !== 'idle' && boss.hp > 0) {
    const bw = 160;
    const x = (SCREEN_W - bw) / 2;
    ctx.fillStyle = 'rgba(46,34,47,0.9)';
    ctx.fillRect(x - 24, 6, bw + 28, 14);
    ctx.fillStyle = '#6e2727';
    ctx.fillRect(x, 10, bw, 6);
    ctx.fillStyle = '#e83b3b';
    ctx.fillRect(x, 10, Math.round((bw * boss.hp) / ENEMIES.rex.hp), 6);
    text(ctx, 'REX', x - 21, 8.5, '#fff', 1.3);
  }

  // ---- status bar: HEALTH · ARMOR · FACE · WEAPON + AMMO · KEYS ----
  ctx.drawImage(barBg, 0, VIEW_H, SCREEN_W, BAR_H);
  const L = 1.15; // label text size
  const top = VIEW_H + 6;
  // health
  panel(ctx, 2, 92);
  heart(ctx, 10, top + 4, p.hp > 25 ? '#e83b3b' : '#ae2334');
  bigNum(ctx, `${Math.max(0, p.hp)}`, 52, top, p.hp > 25 ? C.num : '#e83b3b', 2.6);
  text(ctx, 'HEALTH', 52 - textWidth('HEALTH', L) / 2, VIEW_H + 27, C.label, L);
  // armor
  panel(ctx, 94, 78);
  shield(ctx, 102, top + 4, '#4d9be6');
  bigNum(ctx, `${p.armor}`, 140, top, C.num, 2.6);
  text(ctx, 'ARMOR', 140 - textWidth('ARMOR', L) / 2, VIEW_H + 27, C.label, L);
  // face
  if (STYLE.ink) {
    ctx.fillStyle = '#ffe2b8';
    ctx.beginPath();
    ctx.roundRect(173, VIEW_H + 2, 40, BAR_H - 4, 6);
    ctx.fill();
    ctx.strokeStyle = STYLE.inkColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  } else if (STYLE.smooth) {
    ctx.fillStyle = 'rgba(255,130,4,0.18)';
    ctx.beginPath();
    ctx.roundRect(173, VIEW_H + 2, 40, BAR_H - 4, 6);
    ctx.fill();
  } else {
    pixelCard(ctx, 174, VIEW_H + 3, 38, BAR_H - 5, '#45293f', '#6b3e75');
  }
  const face = faces.get(faceAnim.pick(w))!;
  ctx.drawImage(face, 193 - FACE_W / 2, VIEW_H + (BAR_H - FACE_H) / 2, FACE_W, FACE_H);
  // weapon + ammo
  const def = WEAPONS[p.weapon];
  panel(ctx, 214, 128);
  if (def.ammo === 'bullets') ctx.drawImage(items.bullets, 222, top + 1, 14, 14);
  else if (def.ammo === 'shells') ctx.drawImage(items.shells, 221, top + 2, 16, 12);
  else pawIcon(ctx, 224, top + 4, '#fb6b1d');
  const ammoTxt = def.ammo ? String(p.ammo[def.ammo]) : '∞';
  const low = def.ammo && p.ammo[def.ammo] < 10;
  numText(ctx, ammoTxt, 244, top, low ? '#e83b3b' : C.value, 2.6);
  text(ctx, `${def.slot} · ${def.name}`, 222, VIEW_H + 27, C.label, L);
  // owned weapon slots
  WEAPON_ORDER.forEach((id, i) => {
    const has = p.weapons.has(id), cur = p.weapon === id;
    numText(ctx, String(i + 1), 296 + i * 11, top + 2, cur ? C.armsCur : has ? C.armsHas : C.armsNo, 1.4);
  });
  // keys
  panel(ctx, 342, 40);
  (['red', 'blue', 'yellow'] as KeyColor[]).forEach((k, i) => {
    if (p.keys.has(k)) ctx.drawImage(items[`key_${k}` as const], 353, VIEW_H + 6 + i * 10, 18, 10);
    else { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(355, VIEW_H + 9 + i * 10, 14, 4); }
  });
}

const TOAST: Record<MsgKind, { icon: string; color: string }> = {
  health: { icon: '❤', color: '#1ebc73' },
  armor: { icon: '🛡', color: '#4d9be6' },
  ammo: { icon: '🔫', color: '#fbb954' },
  weapon: { icon: '⭐', color: '#f04f78' },
  key: { icon: '🔑', color: '#f9c22b' },
  warn: { icon: '⚠', color: '#e83b3b' },
  secret: { icon: '✨', color: '#a884f3' },
  boss: { icon: '🏆', color: '#f9c22b' },
  info: { icon: '🐾', color: '#c7dcd0' },
};

/** Big, bold, friendly notifications that slide in at the top of the view. */
function drawToasts(ctx: Ctx, w: World, y0: number) {
  const live = w.messages.filter((m) => w.time - m.t < 3);
  let y = y0;
  for (const m of live.slice(-3)) {
    const age = w.time - m.t;
    const t = TOAST[m.kind];
    const alpha = age > 2.5 ? Math.max(0, (3 - age) * 2) : 1;
    const slide = age < 0.15 ? (1 - age / 0.15) * -12 : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    const toastFont = STYLE.pixel ? `7px 'Press Start 2P', monospace` : `700 ${STYLE.ink ? 12 : 10}px '${STYLE.font}', system-ui, sans-serif`;
    ctx.font = toastFont;
    ctx.textBaseline = 'middle';
    const label = STYLE.pixel ? m.text.toUpperCase() : m.text;
    const tw = ctx.measureText(label).width;
    const bw = tw + 30, bh = 16;
    const x = Math.round((SCREEN_W - bw) / 2), yy = Math.round(y + slide);
    const col = m.kind === 'key' && /red|blue|yellow/.exec(label) ? { red: '#e83b3b', blue: '#4d9be6', yellow: '#f9c22b' }[/red|blue|yellow/.exec(label)![0] as 'red'] : t.color;
    if (STYLE.ink) {
      ctx.fillStyle = '#fff7ea';
      ctx.beginPath(); ctx.roundRect(x, yy, bw, bh, 7); ctx.fill();
      ctx.strokeStyle = STYLE.inkColor; ctx.lineWidth = 1; ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(46,34,47,0.92)';
      ctx.beginPath(); ctx.roundRect(x, yy, bw, bh, STYLE.pixel ? 3 : 8); ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(x + 2, yy + 3, 2, bh - 6);
    }
    ctx.font = `10px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
    ctx.fillStyle = col;
    ctx.fillText(t.icon, x + 8, yy + bh / 2 + 0.5);
    ctx.font = toastFont;
    ctx.fillStyle = STYLE.ink ? STYLE.inkColor : '#ffffff';
    ctx.fillText(label, x + 22, yy + bh / 2 + 0.5);
    ctx.restore();
    y += bh + 3;
  }
}

/** Degree ruler across the top of the view so a vision model can measure turns precisely. */
export function drawRuler(ctx: Ctx) {
  const cx = SCREEN_W / 2;
  const f = cx / Math.tan(HFOV / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, VIEW_H - 13, SCREEN_W, 13);
  for (let deg = -45; deg <= 45; deg += 5) {
    const x = Math.round(cx + Math.tan((deg * Math.PI) / 180) * f);
    const major = deg % 15 === 0;
    px(ctx, x, VIEW_H - (major ? 13 : 9), deg === 0 ? '#ff4d6d' : '#fff', 1, major ? 6 : 3);
    if (major) {
      const s = deg > 0 ? `+${deg}` : String(deg);
      numText(ctx, s, x, VIEW_H - 6.8, deg === 0 ? '#ff4d6d' : '#fff', 1.15, 'center');
    }
  }
}

export function drawAutomap(ctx: Ctx, w: World, opts: { full?: boolean; x?: number; y?: number; cell?: number } = {}) {
  const cell = opts.cell ?? Math.floor(Math.min((SCREEN_W - 20) / w.W, (VIEW_H - 20) / w.H));
  const ox = opts.x ?? Math.floor((SCREEN_W - cell * w.W) / 2);
  const oy = opts.y ?? Math.floor((VIEW_H - cell * w.H) / 2);
  ctx.fillStyle = 'rgba(10,6,14,0.82)';
  ctx.fillRect(ox - 4, oy - 4, cell * w.W + 8, cell * w.H + 8);
  for (let y = 0; y < w.H; y++)
    for (let x = 0; x < w.W; x++) {
      if (!opts.full && !w.explored[y * w.W + x]) continue;
      const c = w.grid[y][x];
      const d = w.door(x, y);
      let col: string | null = null;
      if (d) col = d.secret ? (d.open > 0 ? '#555' : '#c33') : d.key ? { red: '#ff4d4d', blue: '#4d7cff', yellow: '#ffd23f' }[d.key] : '#c8a060';
      else if (c === 'E' || c === 'e') col = '#4f4';
      else if (WALL_CHARS.has(c)) col = '#c33';
      else col = '#2a2030';
      if (d?.secret && d.open === 0) col = '#c33';
      ctx.fillStyle = col;
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
  for (const it of w.items) {
    if (it.taken || !w.explored[Math.floor(it.y) * w.W + Math.floor(it.x)]) continue;
    ctx.fillStyle = it.kind.startsWith('key') ? '#fff' : '#3c9';
    ctx.fillRect(ox + it.x * cell - 1, oy + it.y * cell - 1, 2, 2);
  }
  const p = w.player;
  const sx = ox + p.x * cell, sy = oy + p.y * cell;
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(sx - 1, sy - 1, 3, 3);
  for (let i = 1; i < 5; i++) ctx.fillRect(Math.round(sx + Math.cos(p.angle) * i), Math.round(sy + Math.sin(p.angle) * i), 1, 1);
}

// ---------------- full screens ----------------
let logo: HTMLCanvasElement | null = null;
function getLogo() {
  if (logo) return logo;
  if (STYLE.smooth) {
    const [c, ctx] = makeCanvas(300, 60);
    const word = 'CHONK DOOM';
    ctx.font = `700 40px ${STYLE.font}, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (STYLE.ink) {
      ctx.font = `400 46px '${STYLE.font}', system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = STYLE.inkColor;
      ctx.strokeText(word, 151, 6);
    } else {
      ctx.fillStyle = 'rgba(60,10,0,0.5)';
      ctx.fillText(word, 152, 9);
    }
    const g = ctx.createLinearGradient(0, 6, 0, 50);
    for (const [o, col] of [[0, '#FFD800'], [0.3, '#FFAF00'], [0.55, '#FF8205'], [0.78, '#FA500F'], [1, '#E10500']] as [number, string][]) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.fillText(word, 150, 6);
    logo = c;
    return c;
  }
  const [c, ctx] = makeCanvas(300, 60);
  const word = 'CHONK DOOM';
  for (let i = 0; i < 4; i++) text(ctx, word, 150 - textWidth(word, 7) / 2 + i, 6 + i, ['#5a0f14', '#8a1a10', '#c2410c', '#c2410c'][i], 7);
  text(ctx, word, 150 - textWidth(word, 7) / 2, 4, '#ff7b00', 7);
  // gradient fill (classic Doom logo look)
  const img = ctx.getImageData(0, 0, 300, 60);
  for (let y = 0; y < 60; y++)
    for (let x = 0; x < 300; x++) {
      const i = (y * 300 + x) * 4;
      if (img.data[i] === 255 && img.data[i + 1] === 123) {
        const k = (y - 4) / 35;
        img.data[i] = 255;
        img.data[i + 1] = Math.round(220 - k * 170);
        img.data[i + 2] = Math.round(60 - k * 50);
      }
    }
  ctx.putImageData(img, 0, 0);
  logo = c;
  return c;
}

// ---- storybook stage: watercolor sunburst, red curtains, wooden floor ----
let stage: HTMLCanvasElement | null = null;
function getStage() {
  if (stage) return stage;
  const [c, ctx] = makeCanvas(SCREEN_W, SCREEN_H);
  const cx = SCREEN_W / 2, cy = 105;
  ctx.fillStyle = '#fbd9a6';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const cols = ['#f6a6a0', '#fcd08a', '#f8b49a', '#fde3a7'];
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * 500, cy + Math.sin(a0) * 500);
    ctx.lineTo(cx + Math.cos(a1) * 500, cy + Math.sin(a1) * 500);
    ctx.fill();
  }
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
  glow.addColorStop(0, 'rgba(255,246,220,0.95)');
  glow.addColorStop(1, 'rgba(255,246,220,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  noise(ctx, SCREEN_W, SCREEN_H, 0, 4242);
  // wooden stage floor
  const fy = 196;
  ctx.fillStyle = '#d39a62';
  ctx.fillRect(0, fy, SCREEN_W, SCREEN_H - fy);
  for (let x = -20; x < SCREEN_W + 20; x += 28) {
    ctx.strokeStyle = 'rgba(80,40,15,0.45)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx + (x - cx) * 0.6, fy);
    ctx.lineTo(x, SCREEN_H);
    ctx.stroke();
  }
  ctx.strokeStyle = STYLE.inkColor;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(SCREEN_W, fy); ctx.stroke();
  // curtains
  const curtain = (x0: number, dir: number) => {
    ctx.fillStyle = '#c92a2a';
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + dir * 58, 0);
    ctx.quadraticCurveTo(x0 + dir * 30, 110, x0 + dir * 44, SCREEN_H);
    ctx.lineTo(x0, SCREEN_H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = STYLE.inkColor;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.strokeStyle = '#8f1d1d';
    ctx.lineWidth = 0.9;
    for (const k of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(x0 + dir * 58 * k, 8);
      ctx.quadraticCurveTo(x0 + dir * 40 * k, 120, x0 + dir * 44 * k, SCREEN_H);
      ctx.stroke();
    }
    // golden tie-back
    ctx.fillStyle = '#f2b134';
    ctx.beginPath();
    ctx.ellipse(x0 + dir * 30, 120, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = STYLE.inkColor;
    ctx.stroke();
  };
  curtain(0, 1);
  curtain(SCREEN_W, -1);
  // scalloped valance
  ctx.fillStyle = '#b02121';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let x = 0; x <= SCREEN_W; x += 32) ctx.quadraticCurveTo(x + 16, 22, x + 32, 8);
  ctx.lineTo(SCREEN_W, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = STYLE.inkColor;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  stage = c;
  return c;
}

const CONFETTI = ['#e63946', '#4cc9f0', '#ffd166', '#06d6a0', '#ff8fab', '#7b2cbf'];
function confetti(ctx: Ctx, t: number) {
  for (let i = 0; i < 34; i++) {
    const x = (i * 71.3 + Math.sin(t + i) * 8) % SCREEN_W;
    const y = ((i * 37 + t * (14 + (i % 5) * 4)) % (SCREEN_H + 20)) - 10;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 2 + i);
    ctx.fillStyle = CONFETTI[i % CONFETTI.length];
    ctx.fillRect(-1.5, -0.8, 3, 1.6);
    ctx.restore();
  }
}

/** Background for full screens (title / intermission / victory). */
function screenBg(ctx: Ctx, t: number, color: string) {
  if (STYLE.ink) {
    ctx.drawImage(getStage(), 0, 0, SCREEN_W, SCREEN_H);
    confetti(ctx, t);
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  for (let i = 0; i < 40; i++) {
    const x = (i * 97 + t * 12 * ((i % 3) + 1)) % SCREEN_W;
    const y = (i * 53) % SCREEN_H;
    px(ctx, x, y, i % 5 ? '#3a2a44' : '#6a4a74', 2, 2);
  }
}

export function drawTitle(ctx: Ctx, t: number, lines: string[], selected: number, footer: string[]) {
  initHudArt();
  screenBg(ctx, t, '#120a14');
  const l = getLogo();
  ctx.drawImage(l, (SCREEN_W - 300) / 2, 22 + Math.sin(t * 2) * 2, 300, 60);
  // the chonk himself
  const face = faces.get(`0_${Math.floor(t) % 3 === 0 ? -1 : Math.floor(t) % 3 === 1 ? 0 : 1}_grin`)!;
  ctx.drawImage(face, SCREEN_W / 2 - 32, 80, 64, 64);
  lines.forEach((s, i) => {
    const sel = i === selected;
    const y = 150 + i * 13;
    const col = sel ? C.menuSel : C.menu;
    text(ctx, s, (SCREEN_W - textWidth(s, 2)) / 2, y, col, 2, C.shadow || undefined);
    if (sel && Math.floor(t * 4) % 2) text(ctx, '>', (SCREEN_W - textWidth(s, 2)) / 2 - 14, y, C.accent, 2);
  });
  footer.forEach((s, i) => text(ctx, s, (SCREEN_W - textWidth(s)) / 2, SCREEN_H - 18 + i * 7, C.dim));
}

export function drawIntermission(ctx: Ctx, w: World, nextName: string | null, t: number) {
  initHudArt();
  screenBg(ctx, t, '#1a0d1f');
  const title = `${w.level.name} COMPLETE`;
  text(ctx, title, (SCREEN_W - textWidth(title, 3)) / 2, 30, C.accent, 3, C.shadow || undefined);
  const s = w.stats;
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 100) + '%';
  const rows: [string, string][] = [
    ['KILLS', pct(s.kills, s.totalKills)],
    ['ITEMS', pct(s.items, s.totalItems)],
    ['SECRET', pct(s.secrets, s.totalSecrets)],
    ['TIME', fmtTime(w.time)],
    ['PAR', fmtTime(w.level.par)],
  ];
  rows.forEach(([k, v], i) => {
    if (t < i * 0.35) return;
    text(ctx, k, 90, 64 + i * 22, STYLE.ink ? C.label : '#ffd23f', 2, C.shadow || undefined);
    text(ctx, v, 230, 64 + i * 22, C.menuSel, 2, C.shadow || undefined);
  });
  ctx.drawImage(faces.get('0_0_grin')!, 330, 70, 40, 40);
  if (nextName) {
    const n = `ENTERING ${nextName}`;
    text(ctx, n, (SCREEN_W - textWidth(n, 2)) / 2, 180, C.menu, 2, C.shadow || undefined);
  }
  const c = 'PRESS SPACE TO CONTINUE';
  if (Math.floor(t * 2) % 2) text(ctx, c, (SCREEN_W - textWidth(c)) / 2, 222, C.dim);
}

export function drawVictory(ctx: Ctx, t: number, stats: string[]) {
  initHudArt();
  screenBg(ctx, t, '#0d1a10');
  const s = 'THE HOUSE IS SAFE!';
  text(ctx, s, (SCREEN_W - textWidth(s, 3)) / 2, 26, STYLE.ink ? C.accent : '#9ef01a', 3, C.shadow || undefined);
  ctx.drawImage(faces.get(`0_0_${Math.floor(t * 2) % 2 ? 'happy' : 'grin'}`)!, SCREEN_W / 2 - 32, 50, 64, 64);
  stats.forEach((l, i) => text(ctx, l, (SCREEN_W - textWidth(l)) / 2, 130 + i * 9, C.menuSel, 1, C.shadow || undefined));
  const c = 'LE CHONK CAN FINALLY NAP. PRESS SPACE.';
  text(ctx, c, (SCREEN_W - textWidth(c)) / 2, 222, C.dim);
}

export function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
