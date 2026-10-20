// The game simulation: deterministic, fixed-timestep, renderer-agnostic.
// Both the human controls and Le Chonk's agent harness drive it through `Intent`.
import type { LevelDef } from './levels';
import type { EnemyKind, EnemyFrame, ItemKind } from '../art/sprites';
import type { WeaponId } from '../art/weapons';
import { sfx, type SfxId } from '../audio/audio';

export const DT = 1 / 60;
const TAU = Math.PI * 2;

export const WALL_CHARS = new Set('#BWwPTSGMCFKOEe'.split(''));
export const DOOR_KEYS: Record<string, KeyColor | null> = { D: null, R: 'red', U: 'blue', Y: 'yellow' };
export type KeyColor = 'red' | 'blue' | 'yellow';

export interface Intent {
  forward: number; // -1..1
  strafe: number; // -1..1 (positive = right)
  turn: number; // radians this tick (positive = right / clockwise)
  fire: boolean;
  use: boolean; // edge-triggered by the caller
  weapon: WeaponId | null;
  run: boolean;
}

export const emptyIntent = (): Intent => ({ forward: 0, strafe: 0, turn: 0, fire: false, use: false, weapon: null, run: false });

export interface WeaponDef {
  id: WeaponId;
  slot: number;
  name: string;
  ammo: AmmoType | null;
  cooldown: number;
  pellets: number;
  spread: number; // radians
  dmg: [number, number];
  range: number;
  sound: SfxId;
}
export type AmmoType = 'bullets' | 'shells';

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fist: { id: 'fist', slot: 1, name: 'FIST', ammo: null, cooldown: 0.42, pellets: 1, spread: 0, dmg: [14, 26], range: 1.25, sound: 'claws' },
  pistol: { id: 'pistol', slot: 2, name: 'LASER PISTOL', ammo: null, cooldown: 0.36, pellets: 1, spread: 0.008, dmg: [11, 17], range: 45, sound: 'laser' }, // unlimited energy
  shotgun: { id: 'shotgun', slot: 3, name: 'SHOTGUN', ammo: 'shells', cooldown: 0.9, pellets: 7, spread: 0.1, dmg: [7, 12], range: 30, sound: 'shotgun' },
  chaingun: { id: 'chaingun', slot: 4, name: 'CHAINGUN', ammo: 'bullets', cooldown: 0.11, pellets: 1, spread: 0.02, dmg: [10, 14], range: 45, sound: 'pistol' },
};
export const WEAPON_ORDER: WeaponId[] = ['fist', 'pistol', 'shotgun', 'chaingun'];
/** Player-facing ammo names. */
export const AMMO_NAME: Record<AmmoType, string> = { bullets: 'BULLETS', shells: 'SHELLS' };
export const AMMO_MAX: Record<AmmoType, number> = { bullets: 200, shells: 50 };

interface EnemyDef {
  hp: number;
  speed: number;
  radius: number;
  scale: number; // sprite height in tiles
  painChance: number;
  melee: [number, number] | null;
  meleeRange: number;
  ranged: { proj: ProjKind; dmg: [number, number]; speed: number; count: number; spread: number } | null;
  cooldown: number;
  windup: number;
  sight: SfxId;
  pain: SfxId;
  die: SfxId;
  name: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  mouse: { name: 'Angry Mouse', hp: 20, speed: 2.6, radius: 0.22, scale: 0.55, painChance: 1, melee: [3, 6], meleeRange: 0.8, ranged: { proj: 'cheese', dmg: [5, 9], speed: 7, count: 1, spread: 0 }, cooldown: 1.6, windup: 0.35, sight: 'squeak', pain: 'squeak', die: 'squeakDie' },
  chihuahua: { name: 'Chihuahua', hp: 30, speed: 3.6, radius: 0.25, scale: 0.6, painChance: 0.8, melee: null, meleeRange: 0, ranged: { proj: 'yap', dmg: [8, 13], speed: 9, count: 1, spread: 0 }, cooldown: 1.3, windup: 0.3, sight: 'yap', pain: 'yap', die: 'barkDie' },
  bulldog: { name: 'Bulldog', hp: 90, speed: 2.3, radius: 0.38, scale: 0.85, painChance: 0.4, melee: [12, 20], meleeRange: 1.05, ranged: null, cooldown: 0.9, windup: 0.3, sight: 'bark', pain: 'bark', die: 'barkDie' },
  rex: { name: 'REX the Doberman', hp: 900, speed: 2.1, radius: 0.6, scale: 1.6, painChance: 0.08, melee: [25, 35], meleeRange: 1.5, ranged: { proj: 'bone', dmg: [14, 22], speed: 10, count: 3, spread: 0.18 }, cooldown: 1.4, windup: 0.45, sight: 'growl', pain: 'growl', die: 'barkDie' },
};

export type EnemyState = 'idle' | 'chase' | 'attack' | 'pain' | 'dying' | 'dead';
export type ProjKind = 'cheese' | 'yap' | 'bone';

let nextId = 1;

/** 'a Bulldog' / 'an Angry Mouse' (bosses keep their name). */
function an(name: string, cap = false) {
  if (name.startsWith('REX')) return name;
  const art = /^[AEIOU]/i.test(name) ? 'an' : 'a';
  return `${cap ? art[0].toUpperCase() + art.slice(1) : art} ${name}`;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number; y: number;
  hp: number;
  state: EnemyState;
  t: number; // time in current state
  cd: number; // attack cooldown
  walk: number; // walk anim phase
  hurtFlash: number;
  strafeDir: number;
}

export interface Item { id: number; kind: ItemKind; x: number; y: number; taken: boolean }
export interface Decor { id: number; kind: 'lamp' | 'plant' | 'bowl' | 'barrel'; x: number; y: number; hp: number; dead: boolean; blocking: boolean }
export interface Projectile { id: number; kind: ProjKind; x: number; y: number; vx: number; vy: number; dmg: number; from: number; alive: boolean }
export interface Fx { id: number; kind: 'puff' | 'fur' | 'boom'; x: number; y: number; z: number; t: number; ttl: number }
export interface Door { x: number; y: number; ch: string; key: KeyColor | null; open: number; opening: boolean; secret: boolean; wallTex: string }

export type MsgKind = 'health' | 'armor' | 'ammo' | 'weapon' | 'key' | 'warn' | 'secret' | 'boss' | 'info';

export interface GameEvent { t: number; type: string; text: string; data?: Record<string, unknown> }

export interface PlayerState {
  x: number; y: number; angle: number;
  hp: number; armor: number;
  ammo: Record<AmmoType, number>;
  weapons: Set<WeaponId>;
  weapon: WeaponId;
  pendingWeapon: WeaponId | null;
  switchT: number;
  keys: Set<KeyColor>;
  cd: number;
  fireT: number; // time since last shot (for weapon animation)
  bob: number;
  moving: number;
  dmgFlash: number;
  pickupFlash: number;
  lastDmgFrom: number; // relative angle (radians) of last damage source, NaN if none
  lastDmgT: number;
  faceEvent: { kind: 'ouch' | 'grin' | 'happy'; t: number } | null;
  firingFor: number;
  dead: boolean;
}

export interface Inventory {
  hp: number; armor: number; ammo: Record<AmmoType, number>; weapons: WeaponId[]; weapon: WeaponId;
}

export const START_INVENTORY: Inventory = {
  hp: 100, armor: 0, ammo: { bullets: 50, shells: 0 }, weapons: ['fist', 'pistol'], weapon: 'pistol',
};

/** Difficulty levels: damage taken multiplier and enemy aggression (attack frequency). */
export const SKILLS = [
  { name: 'EASY', dmg: 0.5, aggro: 0.7 },
  { name: 'MEDIUM', dmg: 1, aggro: 1 },
  { name: 'HARD', dmg: 1.5, aggro: 1.3 },
];

export class World {
  level: LevelDef;
  W: number; H: number;
  grid: string[][]; // static tile chars ('.' for floor after entity extraction)
  floorTex: string[][];
  ceilTex: string[][];
  doors = new Map<string, Door>();
  enemies: Enemy[] = [];
  items: Item[] = [];
  decor: Decor[] = [];
  projectiles: Projectile[] = [];
  fx: Fx[] = [];
  player: PlayerState;
  time = 0;
  events: GameEvent[] = [];
  explored: Uint8Array; // 1 = seen
  flow: Int16Array; // BFS distance from player (for enemy pathing)
  flowT = 0;
  exitPressed = false;
  completeT = -1;
  stats = { kills: 0, totalKills: 0, items: 0, totalItems: 0, secrets: 0, totalSecrets: 0, shots: 0, hits: 0, damageTaken: 0 };
  skill: number;
  rand: () => number;
  messages: { text: string; t: number; kind: MsgKind }[] = [];
  bossId = -1;
  private bumpT = -99;

  constructor(level: LevelDef, inv: Inventory, skill = 1, seed = 1234) {
    this.level = level;
    this.skill = skill;
    let s = seed >>> 0;
    this.rand = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.H = level.map.length;
    this.W = level.map[0].length;
    this.grid = [];
    this.floorTex = [];
    this.ceilTex = [];
    this.explored = new Uint8Array(this.W * this.H);
    this.flow = new Int16Array(this.W * this.H).fill(-1);
    let px = 1.5, py = 1.5, pa = 0;
    const itemMap: Record<string, ItemKind> = {
      n: 'catnip', k: 'kibble', t: 'tuna', a: 'box', h: 'bullets', s: 'shells', b: 'ammobox',
      '2': 'shotgun', '3': 'chaingun', r: 'key_red', u: 'key_blue', y: 'key_yellow',
    };
    const enemyMap: Record<string, EnemyKind> = { m: 'mouse', c: 'chihuahua', d: 'bulldog', X: 'rex' };
    for (let y = 0; y < this.H; y++) {
      const row: string[] = [];
      const fr: string[] = [];
      const cr: string[] = [];
      for (let x = 0; x < this.W; x++) {
        const c = level.map[y][x];
        let tile = c;
        const area = level.areas.find((a) => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1);
        fr.push(area?.floor ?? level.floor);
        cr.push(area?.ceil ?? level.ceil);
        if ('^>v<'.includes(c)) {
          px = x + 0.5; py = y + 0.5;
          pa = { '>': 0, v: Math.PI / 2, '<': Math.PI, '^': -Math.PI / 2 }[c]!;
          tile = '.';
        } else if (c in enemyMap) {
          const kind = enemyMap[c];
          this.enemies.push({ id: nextId++, kind, x: x + 0.5, y: y + 0.5, hp: ENEMIES[kind].hp, state: 'idle', t: 0, cd: 0.5 + this.rand(), walk: this.rand() * 4, hurtFlash: 0, strafeDir: this.rand() > 0.5 ? 1 : -1 });
          if (kind === 'rex') this.bossId = this.enemies[this.enemies.length - 1].id;
          tile = '.';
        } else if (c in itemMap) {
          this.items.push({ id: nextId++, kind: itemMap[c], x: x + 0.5, y: y + 0.5, taken: false });
          tile = '.';
        } else if ('Lpox'.includes(c)) {
          const kind = ({ L: 'lamp', p: 'plant', o: 'bowl', x: 'barrel' } as const)[c as 'L' | 'p' | 'o' | 'x'];
          this.decor.push({ id: nextId++, kind, x: x + 0.5, y: y + 0.5, hp: 20, dead: false, blocking: kind !== 'bowl' });
          tile = '.';
        } else if (c in DOOR_KEYS) {
          this.doors.set(`${x},${y}`, { x, y, ch: c, key: DOOR_KEYS[c], open: 0, opening: false, secret: false, wallTex: c });
        } else if (c === '%') {
          // secret wall: borrow the texture of the wall on its left (or right)
          const left = level.map[y][x - 1];
          const right = level.map[y][x + 1];
          const tex = WALL_CHARS.has(left) ? left : WALL_CHARS.has(right) ? right : '#';
          this.doors.set(`${x},${y}`, { x, y, ch: '%', key: null, open: 0, opening: false, secret: true, wallTex: tex });
          this.stats.totalSecrets++;
        }
        row.push(tile);
      }
      this.grid.push(row);
      this.floorTex.push(fr);
      this.ceilTex.push(cr);
    }
    this.stats.totalKills = this.enemies.length;
    this.stats.totalItems = this.items.length;
    this.player = {
      x: px, y: py, angle: pa,
      hp: inv.hp, armor: inv.armor, ammo: { ...inv.ammo },
      weapons: new Set(inv.weapons), weapon: inv.weapon, pendingWeapon: null, switchT: 0,
      keys: new Set(), cd: 0, fireT: 99, bob: 0, moving: 0, dmgFlash: 0, pickupFlash: 0,
      lastDmgFrom: NaN, lastDmgT: -99, faceEvent: null, firingFor: 0, dead: false,
    };
    this.updateFlow();
    this.updateExplored();
    this.event('level', `Entered ${level.id} · ${level.name} (${level.subtitle}). ${level.objective}`);
  }

  inventory(): Inventory {
    const p = this.player;
    return { hp: Math.max(1, Math.min(100, p.hp)), armor: p.armor, ammo: { ...p.ammo }, weapons: [...p.weapons], weapon: p.weapon };
  }

  // ---------------- map queries ----------------
  tile(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return '#';
    return this.grid[y][x];
  }

  door(x: number, y: number) {
    return this.doors.get(`${x},${y}`);
  }

  /** Solid for movement (walls, closed/closing doors). */
  solid(x: number, y: number) {
    const c = this.tile(x, y);
    if (WALL_CHARS.has(c)) return true;
    const d = this.door(x, y);
    if (d) return d.open < 0.9;
    return false;
  }

  /** Opaque for line-of-sight / hitscan. */
  opaque(x: number, y: number) {
    const c = this.tile(x, y);
    if (WALL_CHARS.has(c)) return true;
    const d = this.door(x, y);
    if (d) return d.open < 0.6;
    return false;
  }

  /** DDA raycast. Returns distance to first opaque tile along angle, plus tile hit. */
  castRay(ox: number, oy: number, ang: number, maxDist = 64) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let mx = Math.floor(ox), my = Math.floor(oy);
    const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let sdx = (dx < 0 ? ox - mx : mx + 1 - ox) * ddx;
    let sdy = (dy < 0 ? oy - my : my + 1 - oy) * ddy;
    let dist = 0;
    let side = 0;
    const passed: number[] = [];
    while (dist < maxDist) {
      passed.push(my * this.W + mx);
      if (sdx < sdy) { dist = sdx; sdx += ddx; mx += sx; side = 0; }
      else { dist = sdy; sdy += ddy; my += sy; side = 1; }
      if (this.opaque(mx, my)) return { dist, tx: mx, ty: my, side, passed };
    }
    return { dist: maxDist, tx: mx, ty: my, side, passed };
  }

  hasLOS(ax: number, ay: number, bx: number, by: number) {
    const d = Math.hypot(bx - ax, by - ay);
    const r = this.castRay(ax, ay, Math.atan2(by - ay, bx - ax), d + 0.01);
    return r.dist >= d - 0.01;
  }

  // ---------------- events / messages ----------------
  event(type: string, text: string, data?: Record<string, unknown>) {
    this.events.push({ t: this.time, type, text, data });
    if (this.events.length > 400) this.events.splice(0, 100);
  }

  msg(text: string, kind: MsgKind = 'info') {
    this.messages.push({ text, t: this.time, kind });
    if (this.messages.length > 3) this.messages.shift();
  }

  play(id: SfxId, x: number, y: number, vol = 1) {
    const p = this.player;
    const d = Math.hypot(x - p.x, y - p.y);
    const rel = Math.atan2(y - p.y, x - p.x) - p.angle;
    sfx(id, vol / (1 + d * 0.18), Math.sin(rel) * Math.min(1, d / 2));
  }

  // ---------------- simulation ----------------
  tick(intent: Intent) {
    this.time += DT;
    const p = this.player;
    if (!p.dead && this.completeT < 0) this.updatePlayer(intent);
    else if (p.dead) { p.dmgFlash = Math.max(0, p.dmgFlash - DT); }
    for (const d of this.doors.values()) {
      if (d.opening && d.open < 1) d.open = Math.min(1, d.open + DT * (d.secret ? 0.8 : 2.2));
    }
    this.flowT -= DT;
    if (this.flowT <= 0) { this.updateFlow(); this.flowT = 0.25; }
    for (const e of this.enemies) this.updateEnemy(e);
    this.separateEnemies();
    for (const pr of this.projectiles) this.updateProjectile(pr);
    this.projectiles = this.projectiles.filter((pr) => pr.alive);
    for (const f of this.fx) f.t += DT;
    this.fx = this.fx.filter((f) => f.t < f.ttl);
    if (Math.floor(this.time * 60) % 6 === 0) this.updateExplored();
  }

  private updatePlayer(it: Intent) {
    const p = this.player;
    p.angle = (p.angle + it.turn) % TAU;
    if (p.angle < 0) p.angle += TAU;
    const speed = it.run ? 6 : 4;
    const fx = Math.cos(p.angle), fy = Math.sin(p.angle);
    const rx = -fy, ry = fx; // right vector (clockwise, y down)
    let mx = fx * it.forward + rx * it.strafe;
    let my = fy * it.forward + ry * it.strafe;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const before = [p.x, p.y];
    this.moveCircle(p, mx * speed * DT, my * speed * DT, 0.24, true);
    const moved = Math.hypot(p.x - before[0], p.y - before[1]);
    p.moving = moved / DT / speed;
    p.bob += moved * 2.2;

    // timers
    p.cd = Math.max(0, p.cd - DT);
    p.fireT += DT;
    p.dmgFlash = Math.max(0, p.dmgFlash - DT * 1.8);
    p.pickupFlash = Math.max(0, p.pickupFlash - DT * 3);
    if (p.faceEvent && this.time - p.faceEvent.t > 1.2) p.faceEvent = null;

    // weapon switching
    if (it.weapon && it.weapon !== p.weapon && p.weapons.has(it.weapon)) {
      p.pendingWeapon = it.weapon;
      p.switchT = 0.25;
    }
    if (p.pendingWeapon) {
      p.switchT -= DT;
      if (p.switchT <= 0) {
        p.weapon = p.pendingWeapon;
        p.pendingWeapon = null;
        this.event('weapon', `Switched to ${WEAPONS[p.weapon].name}.`);
      }
    }

    if (it.fire && !p.pendingWeapon) {
      p.firingFor += DT;
      if (p.cd <= 0) this.fire();
    } else p.firingFor = 0;

    if (it.use) this.use();
    else if (it.forward > 0 && moved < speed * DT * 0.3 && this.time - this.bumpT > 0.6) {
      // walking into a door or the exit switch uses it (no extra key needed)
      const r = this.castRay(p.x, p.y, p.angle, 0.75);
      if (r.dist < 0.75 && (this.door(r.tx, r.ty) && !this.door(r.tx, r.ty)!.secret || this.tile(r.tx, r.ty) === 'E')) {
        this.bumpT = this.time;
        this.use();
      }
    }
    this.pickups();
  }

  /** Circle-vs-grid movement with axis-separated sliding. */
  moveCircle(o: { x: number; y: number }, dx: number, dy: number, r: number, isPlayer: boolean) {
    const blocked = (x: number, y: number) => {
      const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solid(tx, ty)) return true;
      for (const d of this.decor) if (d.blocking && !d.dead && Math.abs(d.x - x) < r + 0.25 && Math.abs(d.y - y) < r + 0.25) {
        if (Math.hypot(d.x - o.x, d.y - o.y) < Math.hypot(d.x - x, d.y - y)) continue; // allow moving away
        return true;
      }
      if (isPlayer) {
        for (const e of this.enemies) {
          if (e.state === 'dead' || e.state === 'dying') continue;
          const rr = r + ENEMIES[e.kind].radius;
          const dn = Math.hypot(e.x - x, e.y - y);
          if (dn < rr && dn < Math.hypot(e.x - o.x, e.y - o.y)) return true;
        }
      }
      return false;
    };
    // sub-step to avoid tunnelling
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.1) || 1;
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps, sy = dy / steps;
      if (!blocked(o.x + sx, o.y)) o.x += sx;
      if (!blocked(o.x, o.y + sy)) o.y += sy;
    }
  }

  private fire() {
    const p = this.player;
    const w = WEAPONS[p.weapon];
    if (w.ammo && p.ammo[w.ammo] <= 0) {
      sfx('noAmmo', 0.6);
      p.cd = 0.3;
      // auto-switch to best weapon with ammo
      const best = [...WEAPON_ORDER].reverse().find((id) => p.weapons.has(id) && (!WEAPONS[id].ammo || p.ammo[WEAPONS[id].ammo!] > 0));
      if (best && best !== p.weapon) { p.pendingWeapon = best; p.switchT = 0.25; this.msg(`Out of ${AMMO_NAME[w.ammo].toLowerCase()}!`, 'warn'); this.event('ammo', `Out of ${AMMO_NAME[w.ammo].toLowerCase()}, switching to ${WEAPONS[best].name}.`); }
      return;
    }
    if (w.ammo) p.ammo[w.ammo]--;
    p.cd = w.cooldown;
    p.fireT = 0;
    this.stats.shots++;
    sfx(w.sound, w.id === 'chaingun' ? 0.7 : 1);
    this.wakeByNoise(w.id === 'fist' ? 3 : 14);
    let hitAny = false;
    for (let i = 0; i < w.pellets; i++) {
      const ang = p.angle + (this.rand() - 0.5) * 2 * w.spread;
      const dmg = w.dmg[0] + Math.floor(this.rand() * (w.dmg[1] - w.dmg[0] + 1));
      if (this.hitscan(p.x, p.y, ang, w.range, dmg, w.id === 'fist')) hitAny = true;
    }
    if (hitAny) this.stats.hits++;
    if (w.id === 'fist' && hitAny) sfx('clawHit', 0.8);
  }

  /** Player hitscan. Returns true if an enemy was hit. */
  private hitscan(ox: number, oy: number, ang: number, range: number, dmg: number, melee: boolean) {
    const wall = this.castRay(ox, oy, ang, range);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let best: { t: number; e?: Enemy; d?: Decor } | null = null;
    const test = (cx: number, cy: number, r: number) => {
      const fx = cx - ox, fy = cy - oy;
      const t = fx * dx + fy * dy;
      if (t < 0) return -1;
      const perp = Math.abs(fx * dy - fy * dx);
      return perp <= r ? t : -1;
    };
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'dying') continue;
      // forgiving hit tolerance (like DOOM's generous hitboxes), so close-range shots connect
      const t = test(e.x, e.y, ENEMIES[e.kind].radius + (melee ? 0.25 : 0.16));
      if (t >= 0 && t < wall.dist && t <= range && (!best || t < best.t)) best = { t, e };
    }
    for (const d of this.decor) {
      if (d.kind !== 'barrel' || d.dead) continue;
      const t = test(d.x, d.y, 0.3);
      if (t >= 0 && t < wall.dist && t <= range && (!best || t < best.t)) best = { t, d };
    }
    if (best?.e) {
      this.damageEnemy(best.e, dmg);
      this.spawnFx('fur', ox + dx * (best.t - 0.1), oy + dy * (best.t - 0.1), 0.45);
      return true;
    }
    if (best?.d) {
      this.damageBarrel(best.d, dmg);
      return false;
    }
    if (!melee && wall.dist < range) {
      this.spawnFx('puff', ox + dx * (wall.dist - 0.05), oy + dy * (wall.dist - 0.05), 0.5);
    }
    return false;
  }

  private damageBarrel(d: Decor, dmg: number) {
    d.hp -= dmg;
    if (d.hp <= 0 && !d.dead) {
      d.dead = true;
      this.spawnFx('boom', d.x, d.y, 0.5);
      this.play('explode', d.x, d.y, 1.4);
      this.event('explosion', 'A catnip spray barrel exploded!');
      // radius damage
      for (const e of this.enemies) {
        if (e.state === 'dead' || e.state === 'dying') continue;
        const dist = Math.hypot(e.x - d.x, e.y - d.y);
        if (dist < 2.5 && this.hasLOS(d.x, d.y, e.x, e.y)) this.damageEnemy(e, Math.round(90 * (1 - dist / 2.5)));
      }
      const p = this.player;
      const pd = Math.hypot(p.x - d.x, p.y - d.y);
      if (pd < 2.5 && this.hasLOS(d.x, d.y, p.x, p.y)) this.damagePlayer(Math.round(60 * (1 - pd / 2.5)), d.x, d.y, 'a barrel explosion');
      for (const o of this.decor) if (o !== d && o.kind === 'barrel' && !o.dead && Math.hypot(o.x - d.x, o.y - d.y) < 2.2) this.damageBarrel(o, 100);
    }
  }

  damageEnemy(e: Enemy, dmg: number) {
    const def = ENEMIES[e.kind];
    e.hp -= dmg;
    e.hurtFlash = 0.12;
    if (e.state === 'idle') { e.state = 'chase'; e.t = 0; }
    if (e.hp <= 0) {
      e.state = 'dying';
      e.t = 0;
      this.stats.kills++;
      this.play(def.die, e.x, e.y);
      this.event('kill', `Killed ${an(def.name)}.`, { kind: e.kind, id: e.id });
      if (e.kind === 'rex') {
        this.msg('Rex is defeated! The house is safe!', 'boss');
        this.event('boss', 'REX the Doberman is defeated!');
      }
      // mice drop bullets, chihuahuas shells, dogs kibble
      if (this.rand() < 0.35) this.items.push({ id: nextId++, kind: e.kind === 'mouse' ? 'bullets' : e.kind === 'chihuahua' ? 'shells' : 'kibble', x: e.x, y: e.y, taken: false });
      return;
    }
    if (this.rand() < def.painChance && e.state !== 'attack') {
      e.state = 'pain';
      e.t = 0;
      this.play(def.pain, e.x, e.y, 0.7);
    }
  }

  damagePlayer(dmg: number, sx: number, sy: number, source: string) {
    const p = this.player;
    if (p.dead || this.completeT >= 0) return;
    dmg = Math.round(dmg * SKILLS[this.skill].dmg);
    let absorbed = 0;
    if (p.armor > 0) {
      absorbed = Math.min(p.armor, Math.floor(dmg / 3));
      p.armor -= absorbed;
    }
    const real = dmg - absorbed;
    p.hp -= real;
    this.stats.damageTaken += real;
    p.dmgFlash = Math.min(1, p.dmgFlash + real / 30);
    let rel = Math.atan2(sy - p.y, sx - p.x) - p.angle;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    p.lastDmgFrom = rel;
    p.lastDmgT = this.time;
    if (real >= 20) p.faceEvent = { kind: 'ouch', t: this.time };
    const dirWord = Math.abs(rel) < 0.6 ? 'in FRONT' : Math.abs(rel) > 2.4 ? 'BEHIND you' : rel > 0 ? 'your RIGHT' : 'your LEFT';
    this.event('damage', `Took ${real} damage from ${source} (${dirWord}). Health ${Math.max(0, p.hp)}.`, { amount: real, rel_deg: Math.round((rel * 180) / Math.PI) });
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      sfx('meowDeath', 1);
      this.event('death', `Le Chonk was killed by ${source}.`);
      this.msg('Le Chonk fainted! Press Space to retry', 'warn');
    } else sfx('meow', Math.min(1, 0.4 + real / 25));
  }

  private use() {
    const p = this.player;
    // check the tile directly in front, up to 1.6 tiles away
    const r = this.castRay(p.x, p.y, p.angle, 1.6);
    if (r.dist >= 1.6) {
      this.event('use', 'Nothing to use here (nothing within reach in front of you).');
      return;
    }
    const c = this.tile(r.tx, r.ty);
    const d = this.door(r.tx, r.ty);
    if (d && !d.opening) {
      if (d.key && !p.keys.has(d.key)) {
        sfx('locked', 0.8);
        this.msg(`Locked! Find the ${d.key} key`, 'warn');
        this.event('locked', `This door is locked. You need the ${d.key.toUpperCase()} key.`);
        return;
      }
      d.opening = true;
      if (d.secret) {
        this.stats.secrets++;
        sfx('secret', 1);
        this.msg('Secret passage found!', 'secret');
        this.event('secret', 'Found a secret passage!');
      } else {
        this.play('door', d.x + 0.5, d.y + 0.5);
        this.event('door', `Opened a ${d.key ? d.key + ' ' : ''}door.`);
      }
      this.wakeByNoise(6);
      return;
    }
    if (c === 'E') {
      this.grid[r.ty][r.tx] = 'e';
      sfx('switch', 1);
      this.exitPressed = true;
      this.completeT = this.time;
      this.event('exit', 'Pressed the EXIT switch. Level complete!');
      return;
    }
    this.event('use', 'That is just a wall.');
  }

  private pickups() {
    const p = this.player;
    for (const it of this.items) {
      if (it.taken || Math.hypot(it.x - p.x, it.y - p.y) > 0.75) continue;
      let ok = true;
      let text = '';
      let sound: SfxId = 'pickup';
      const ammo = (t: AmmoType, n: number) => {
        if (p.ammo[t] >= AMMO_MAX[t]) return false;
        p.ammo[t] = Math.min(AMMO_MAX[t], p.ammo[t] + n);
        return true;
      };
      let kind: MsgKind = 'ammo';
      switch (it.kind) {
        case 'catnip': ok = p.hp < 100; if (ok) p.hp = Math.min(100, p.hp + 10); text = '+10 health · catnip'; kind = 'health'; break;
        case 'kibble': ok = p.hp < 100; if (ok) p.hp = Math.min(100, p.hp + 25); text = '+25 health · kibble'; kind = 'health'; break;
        case 'tuna': p.hp = Math.min(200, p.hp + 100); text = '+100 health · TUNA!'; sound = 'bigPickup'; kind = 'health'; break;
        case 'box': ok = p.armor < 100; if (ok) p.armor = 100; text = 'Armor 100 · cardboard box'; sound = 'bigPickup'; kind = 'armor'; break;
        case 'bullets': ok = ammo('bullets', 15); text = '+15 bullets'; break;
        case 'shells': ok = ammo('shells', 6); text = '+6 shells'; break;
        case 'ammobox': ok = ammo('bullets', 50); text = '+50 bullets · ammo box'; break;
        case 'shotgun': case 'chaingun': {
          const wid = it.kind as WeaponId;
          const t: AmmoType = wid === 'shotgun' ? 'shells' : 'bullets';
          if (p.weapons.has(wid)) { ok = ammo(t, wid === 'shotgun' ? 8 : 20); text = `+${wid === 'shotgun' ? 8 : 20} ${t}`; break; }
          p.weapons.add(wid); ammo(t, wid === 'shotgun' ? 8 : 20); p.pendingWeapon = wid; p.switchT = 0.2;
          text = `New weapon: ${WEAPONS[wid].name} (${WEAPONS[wid].slot})`; sound = 'weaponPickup'; kind = 'weapon'; p.faceEvent = { kind: 'grin', t: this.time }; break;
        }
        case 'key_red': case 'key_blue': case 'key_yellow': {
          const col = it.kind.slice(4) as KeyColor;
          p.keys.add(col); text = `Got the ${col} key!`; sound = 'key'; kind = 'key'; break;
        }
        default: ok = false;
      }
      if (!ok) continue;
      it.taken = true;
      this.stats.items++;
      p.pickupFlash = 1;
      if (it.kind === 'catnip' || it.kind === 'kibble' || it.kind === 'tuna') p.faceEvent = { kind: 'happy', t: this.time };
      sfx(sound, 0.9);
      this.msg(text, kind);
      this.event('pickup', text + '.', { kind: it.kind });
    }
  }

  private wakeByNoise(radius: number) {
    // sound travels through open tiles: use the flow field (BFS distance from player)
    for (const e of this.enemies) {
      if (e.state !== 'idle') continue;
      const d = this.flow[Math.floor(e.y) * this.W + Math.floor(e.x)];
      if (d >= 0 && d <= radius) this.wake(e);
    }
  }

  private wake(e: Enemy) {
    e.state = 'chase';
    e.t = 0;
    e.cd = 0.4 + this.rand() * 0.8;
    this.play(ENEMIES[e.kind].sight, e.x, e.y, 0.8);
    this.event('alert', `${an(ENEMIES[e.kind].name, true)} noticed you!`, { kind: e.kind, id: e.id });
  }

  private updateFlow() {
    const p = this.player;
    this.flow.fill(-1);
    const sx = Math.floor(p.x), sy = Math.floor(p.y);
    const q = [sy * this.W + sx];
    this.flow[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % this.W, y = (i / this.W) | 0;
      const dist = this.flow[i];
      if (dist > 60) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const ni = ny * this.W + nx;
        if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H || this.flow[ni] >= 0) continue;
        if (this.solid(nx, ny)) continue;
        this.flow[ni] = dist + 1;
        q.push(ni);
      }
    }
  }

  private updateEnemy(e: Enemy) {
    const def = ENEMIES[e.kind];
    const p = this.player;
    e.t += DT;
    e.hurtFlash = Math.max(0, e.hurtFlash - DT);
    if (e.state === 'dead') return;
    if (e.state === 'dying') {
      if (e.t > 0.5) e.state = 'dead';
      return;
    }
    const dx = p.x - e.x, dy = p.y - e.y;
    const dist = Math.hypot(dx, dy);
    const los = dist < 24 && this.hasLOS(e.x, e.y, p.x, p.y);
    const aggro = SKILLS[this.skill].aggro;

    if (e.state === 'idle') {
      if (los && !p.dead) {
        // field of view check: idle enemies face random direction; just use distance & LOS
        if (dist < 14) this.wake(e);
      }
      return;
    }
    if (e.state === 'pain') {
      if (e.t > 0.22) { e.state = 'chase'; e.t = 0; }
      return;
    }
    if (p.dead) return;
    e.cd -= DT * aggro;

    if (e.state === 'attack') {
      if (e.t >= def.windup) {
        // resolve attack
        if (def.melee && dist <= def.meleeRange + 0.15) {
          const dmg = def.melee[0] + Math.floor(this.rand() * (def.melee[1] - def.melee[0] + 1));
          this.damagePlayer(dmg, e.x, e.y, `${an(def.name)} bite`);
          this.play(e.kind === 'mouse' ? 'squeak' : 'bark', e.x, e.y);
        } else if (def.ranged && los) {
          const r = def.ranged;
          const base = Math.atan2(dy, dx);
          for (let i = 0; i < r.count; i++) {
            const a = base + (r.count > 1 ? (i - (r.count - 1) / 2) * r.spread : (this.rand() - 0.5) * 0.06);
            const dmg = r.dmg[0] + Math.floor(this.rand() * (r.dmg[1] - r.dmg[0] + 1));
            this.projectiles.push({ id: nextId++, kind: r.proj, x: e.x + Math.cos(a) * def.radius, y: e.y + Math.sin(a) * def.radius, vx: Math.cos(a) * r.speed, vy: Math.sin(a) * r.speed, dmg, from: e.id, alive: true });
          }
          this.play(e.kind === 'chihuahua' ? 'yap' : 'throw', e.x, e.y);
        }
        e.state = 'chase';
        e.t = 0;
        e.cd = def.cooldown * (0.7 + this.rand() * 0.6);
      }
      return;
    }

    // chase
    e.walk += DT * def.speed * 2.2;
    if (e.cd <= 0) {
      if (def.melee && dist <= def.meleeRange) { e.state = 'attack'; e.t = 0; return; }
      if (def.ranged && los && dist < 18 && dist > (def.melee ? def.meleeRange : 0) && this.rand() < 0.04 * aggro) { e.state = 'attack'; e.t = 0; return; }
    }
    // movement: direct when visible, else follow BFS flow field
    let mx = 0, my = 0;
    const keepDistance = def.ranged && !def.melee && los && dist < 4;
    if (los && dist > def.meleeRange * 0.8 && !keepDistance) {
      mx = dx / dist; my = dy / dist;
      // ranged enemies strafe a bit so they're harder to hit
      if (def.ranged && dist > 3) {
        if (this.rand() < 0.01) e.strafeDir *= -1;
        mx += (-dy / dist) * 0.6 * e.strafeDir;
        my += (dx / dist) * 0.6 * e.strafeDir;
      }
    } else if (keepDistance) {
      mx = (-dy / dist) * e.strafeDir; my = (dx / dist) * e.strafeDir;
      if (this.rand() < 0.02) e.strafeDir *= -1;
    } else if (!los) {
      const tx = Math.floor(e.x), ty = Math.floor(e.y);
      const here = this.flow[ty * this.W + tx];
      let best = here, bx = 0, by = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = this.flow[(ty + oy) * this.W + tx + ox];
        if (v >= 0 && (best < 0 || v < best)) { best = v; bx = ox; by = oy; }
      }
      if (best >= 0 && best < 40) {
        // steer towards the centre of the next tile
        const cx = tx + bx + 0.5 - e.x, cy = ty + by + 0.5 - e.y;
        const l = Math.hypot(cx, cy) || 1;
        mx = cx / l; my = cy / l;
      } else if (here < 0 || here > 40) {
        // lost track: go back to sleep-ish
        if (e.t > 6) { e.state = 'idle'; e.t = 0; }
      }
    }
    const l = Math.hypot(mx, my);
    if (l > 0) {
      this.moveCircle(e, (mx / l) * def.speed * DT, (my / l) * def.speed * DT, def.radius, false);
    }
    // open doors on the way (unlocked only)
    if (this.rand() < 0.05) {
      const tx = Math.floor(e.x + mx * 0.8), ty = Math.floor(e.y + my * 0.8);
      const d = this.door(tx, ty);
      if (d && !d.key && !d.secret && !d.opening) { d.opening = true; this.play('door', d.x + 0.5, d.y + 0.5, 0.6); }
    }
  }

  private separateEnemies() {
    const live = this.enemies.filter((e) => e.state !== 'dead' && e.state !== 'dying');
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const rr = ENEMIES[a.kind].radius + ENEMIES[b.kind].radius;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < rr && d > 1e-4) {
          const push = (rr - d) / 2;
          this.moveCircle(a, (-dx / d) * push, (-dy / d) * push, ENEMIES[a.kind].radius, false);
          this.moveCircle(b, (dx / d) * push, (dy / d) * push, ENEMIES[b.kind].radius, false);
        }
      }
  }

  private updateProjectile(pr: Projectile) {
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      pr.x += (pr.vx * DT) / steps;
      pr.y += (pr.vy * DT) / steps;
      if (this.opaque(Math.floor(pr.x), Math.floor(pr.y))) {
        pr.alive = false;
        this.spawnFx('puff', pr.x - pr.vx * 0.01, pr.y - pr.vy * 0.01, 0.5);
        return;
      }
      const p = this.player;
      if (!p.dead && Math.hypot(p.x - pr.x, p.y - pr.y) < 0.3) {
        pr.alive = false;
        const src = this.enemies.find((e) => e.id === pr.from);
        const name = { cheese: 'a flying cheese wedge', yap: 'a sonic YAP', bone: "Rex's bone" }[pr.kind];
        this.damagePlayer(pr.dmg, src?.x ?? pr.x - pr.vx, src?.y ?? pr.y - pr.vy, name + (src ? ` (${ENEMIES[src.kind].name})` : ''));
        return;
      }
    }
  }

  spawnFx(kind: Fx['kind'], x: number, y: number, z: number) {
    this.fx.push({ id: nextId++, kind, x, y, z, t: 0, ttl: kind === 'boom' ? 0.6 : 0.3 });
  }

  /** Mark tiles inside the player's view as explored (for the automap and the agent). */
  updateExplored() {
    const p = this.player;
    const fov = (75 * Math.PI) / 180;
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const a = p.angle - fov / 2 + (fov * i) / n;
      const r = this.castRay(p.x, p.y, a, 20);
      for (const idx of r.passed) this.explored[idx] = 1;
      if (r.tx >= 0 && r.ty >= 0 && r.tx < this.W && r.ty < this.H) this.explored[r.ty * this.W + r.tx] = 1;
    }
    // always know your immediate surroundings
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.explored[y * this.W + x] = 1;
  }

  enemyFrame(e: Enemy): EnemyFrame {
    switch (e.state) {
      case 'attack': return 'attack';
      case 'pain': return 'pain';
      case 'dying': return e.t < 0.2 ? 'die0' : 'die1';
      case 'dead': return 'dead';
      case 'chase': return Math.floor(e.walk) % 2 ? 'walk1' : 'walk0';
      default: return Math.floor(this.time * 1.5 + e.id) % 2 ? 'walk1' : 'walk0';
    }
  }

  get complete() {
    return this.completeT >= 0 && this.time - this.completeT > 0.8;
  }

  get liveEnemies() {
    return this.enemies.filter((e) => e.state !== 'dead' && e.state !== 'dying');
  }
}
