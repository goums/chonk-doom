// 2D overlay: weapon view, status bar with Le Chonk's face, messages, automap, agent ruler.
import { SCREEN_W, SCREEN_H, BAR_H, VIEW_H, HFOV } from '../engine/renderer';
import { text, textWidth, px, makeCanvas, noise, type Ctx } from '../art/pixel';
import { buildFaces, FACE_W, FACE_H, type Expression } from '../art/face';
import { buildWeapons, WEAPON_W, WEAPON_H, type WeaponFrame } from '../art/weapons';
import { buildItems } from '../art/sprites';
import { World, WEAPONS, WALL_CHARS, type KeyColor } from './world';

const faces = buildFaces();
const weapons = buildWeapons();
const items = buildItems();

const barBg = (() => {
  const [c, ctx] = makeCanvas(SCREEN_W, BAR_H);
  ctx.fillStyle = '#4a3f4f';
  ctx.fillRect(0, 0, SCREEN_W, BAR_H);
  noise(ctx, SCREEN_W, BAR_H, 30, 99);
  ctx.fillStyle = '#7d6b85';
  ctx.fillRect(0, 0, SCREEN_W, 1);
  ctx.fillStyle = '#211a24';
  ctx.fillRect(0, BAR_H - 1, SCREEN_W, 1);
  return c;
})();

function panel(ctx: Ctx, x: number, w: number) {
  ctx.fillStyle = '#2a2230';
  ctx.fillRect(x + 1, VIEW_H + 3, w - 2, BAR_H - 6);
  ctx.fillStyle = '#16111a';
  ctx.fillRect(x + 1, VIEW_H + 3, w - 2, 1);
  ctx.fillStyle = '#6e5e77';
  ctx.fillRect(x + 1, VIEW_H + BAR_H - 4, w - 2, 1);
}

function bigNum(ctx: Ctx, n: string, cx: number, y: number, color = '#ff3b3b') {
  const w = textWidth(n, 3);
  text(ctx, n, Math.round(cx - w / 2), y, color, 3, '#3a0a0a');
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
  const p = w.player;

  // ---- weapon ----
  if (!p.dead) {
    const wid = p.pendingWeapon && p.switchT < 0.125 ? p.pendingWeapon : p.weapon;
    const def = WEAPONS[p.weapon];
    let frame: WeaponFrame = 'idle';
    const ft = p.fireT;
    if (def.id === 'laser') frame = ft < 0.05 ? 'fire0' : ft < 0.1 ? 'fire1' : 'idle';
    else if (ft < def.cooldown * 0.3) frame = 'fire0';
    else if (ft < def.cooldown * 0.75) frame = 'fire1';
    const bx = Math.cos(p.bob) * 6 * Math.min(1, p.moving);
    const by = Math.abs(Math.sin(p.bob)) * 5 * Math.min(1, p.moving);
    const sw = p.pendingWeapon ? Math.sin(Math.max(0, p.switchT) * Math.PI * 4) * 40 : 0;
    ctx.drawImage(weapons[wid][frame], Math.round(SCREEN_W / 2 - WEAPON_W / 2 + bx), Math.round(VIEW_H - WEAPON_H + 8 + by + Math.abs(sw)));
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

  // ---- messages ----
  if (opt.showMessages) {
    let y = 3;
    for (const m of w.messages) {
      if (w.time - m.t > 3.5) continue;
      text(ctx, m.text.slice(0, 94), 3, y, '#ffe066', 1, '#000');
      y += 7;
    }
  }
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
    ctx.fillStyle = '#000a';
    ctx.fillRect(x - 2, 14, bw + 4, 10);
    ctx.fillStyle = '#7a0010';
    ctx.fillRect(x, 16, bw, 6);
    ctx.fillStyle = '#ff2040';
    ctx.fillRect(x, 16, Math.round((bw * boss.hp) / 1400), 6);
    text(ctx, 'REX', x - 16, 16, '#fff', 1, '#000');
  }

  // ---- status bar ----
  ctx.drawImage(barBg, 0, VIEW_H);
  const ammoType = WEAPONS[p.weapon].ammo;
  panel(ctx, 0, 60);
  bigNum(ctx, ammoType ? String(p.ammo[ammoType]) : '--', 30, VIEW_H + 7);
  text(ctx, 'AMMO', 22, VIEW_H + 29, '#d8c8e0');
  panel(ctx, 60, 76);
  bigNum(ctx, `${Math.max(0, p.hp)}%`, 98, VIEW_H + 7);
  text(ctx, 'HEALTH', 86, VIEW_H + 29, '#d8c8e0');
  panel(ctx, 128, 44);
  text(ctx, 'ARMS', 143, VIEW_H + 29, '#d8c8e0');
  ['claws', 'hairball', 'shotgun', 'laser'].forEach((id, i) => {
    const has = p.weapons.has(id as never);
    const cur = p.weapon === id;
    text(ctx, String(i + 1), 133 + i * 10, VIEW_H + 10, cur ? '#fff' : has ? '#ffd23f' : '#5a4c60', 2);
  });
  // face
  ctx.fillStyle = '#1a1220';
  ctx.fillRect(172, VIEW_H + 2, 42, BAR_H - 4);
  const face = faces.get(faceAnim.pick(w))!;
  ctx.drawImage(face, 193 - FACE_W / 2, VIEW_H + (BAR_H - FACE_H) / 2);
  panel(ctx, 214, 72);
  bigNum(ctx, `${p.armor}%`, 250, VIEW_H + 7);
  text(ctx, 'ARMOR', 240, VIEW_H + 29, '#d8c8e0');
  panel(ctx, 286, 20);
  (['red', 'blue', 'yellow'] as KeyColor[]).forEach((k, i) => {
    if (p.keys.has(k)) ctx.drawImage(items[`key_${k}` as const], 288, VIEW_H + 4 + i * 11, 16, 14);
  });
  panel(ctx, 306, 78);
  const rows: [string, number, number][] = [
    ['HAIR', p.ammo.hairballs, 200],
    ['SARD', p.ammo.sardines, 50],
    ['BATT', p.ammo.battery, 300],
  ];
  rows.forEach(([n, v, m], i) => {
    const y = VIEW_H + 7 + i * 9;
    text(ctx, n, 312, y, '#d8c8e0');
    text(ctx, `${v}/${m}`, 334, y, '#ffd23f');
  });
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
      text(ctx, s, x - Math.floor(textWidth(s) / 2), VIEW_H - 6, deg === 0 ? '#ff4d6d' : '#fff');
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

export function drawTitle(ctx: Ctx, t: number, lines: string[], selected: number, footer: string[]) {
  ctx.fillStyle = '#120a14';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  // starfield of paw prints
  for (let i = 0; i < 40; i++) {
    const x = (i * 97 + t * 12 * ((i % 3) + 1)) % SCREEN_W;
    const y = (i * 53) % SCREEN_H;
    px(ctx, x, y, i % 5 ? '#3a2a44' : '#6a4a74', 2, 2);
  }
  const l = getLogo();
  ctx.drawImage(l, (SCREEN_W - 300) / 2, 18 + Math.sin(t * 2) * 2);
  const sub = 'LE CHONK VS THE DOGS OF HELL';
  text(ctx, sub, (SCREEN_W - textWidth(sub)) / 2, 72, '#ffd23f', 1, '#000');
  // the chonk himself
  const face = faces.get(`0_${Math.floor(t) % 3 === 0 ? -1 : Math.floor(t) % 3 === 1 ? 0 : 1}_grin`)!;
  ctx.drawImage(face, SCREEN_W / 2 - 30, 82, 60, 60);
  lines.forEach((s, i) => {
    const sel = i === selected;
    const y = 150 + i * 13;
    const col = sel ? '#fff' : '#b8a6c4';
    text(ctx, s, (SCREEN_W - textWidth(s, 2)) / 2, y, col, 2, '#000');
    if (sel && Math.floor(t * 4) % 2) text(ctx, '>', (SCREEN_W - textWidth(s, 2)) / 2 - 14, y, '#ff7b00', 2);
  });
  footer.forEach((s, i) => text(ctx, s, (SCREEN_W - textWidth(s)) / 2, SCREEN_H - 18 + i * 7, '#7d6b85'));
}

export function drawIntermission(ctx: Ctx, w: World, nextName: string | null, t: number) {
  ctx.fillStyle = '#1a0d1f';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const title = `${w.level.name} COMPLETE`;
  text(ctx, title, (SCREEN_W - textWidth(title, 3)) / 2, 24, '#ff7b00', 3, '#000');
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
    text(ctx, k, 90, 64 + i * 22, '#ffd23f', 2, '#000');
    text(ctx, v, 230, 64 + i * 22, '#fff', 2, '#000');
  });
  ctx.drawImage(faces.get('0_0_grin')!, 330, 70, 40, 40);
  if (nextName) {
    const n = `ENTERING ${nextName}`;
    text(ctx, n, (SCREEN_W - textWidth(n, 2)) / 2, 190, '#b8a6c4', 2, '#000');
  }
  const c = 'PRESS SPACE / USE TO CONTINUE';
  if (Math.floor(t * 2) % 2) text(ctx, c, (SCREEN_W - textWidth(c)) / 2, 222, '#7d6b85');
}

export function drawVictory(ctx: Ctx, t: number, stats: string[]) {
  ctx.fillStyle = '#0d1a10';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const s = 'THE HOUSE IS SAFE!';
  text(ctx, s, (SCREEN_W - textWidth(s, 3)) / 2, 20, '#9ef01a', 3, '#000');
  ctx.drawImage(faces.get(`0_0_${Math.floor(t * 2) % 2 ? 'happy' : 'grin'}`)!, SCREEN_W / 2 - 32, 50, 64, 64);
  stats.forEach((l, i) => text(ctx, l, (SCREEN_W - textWidth(l)) / 2, 130 + i * 9, '#fff', 1, '#000'));
  const c = 'LE CHONK CAN FINALLY NAP. PRESS SPACE.';
  text(ctx, c, (SCREEN_W - textWidth(c)) / 2, 222, '#7d6b85');
}

export function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
