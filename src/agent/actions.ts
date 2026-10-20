// Turns Le Chonk's discrete decisions into per-tick game intents.
// The world is frozen while the model thinks; time only advances while an action executes.
import { World, emptyIntent, WEAPONS, WEAPON_ORDER, WALL_CHARS, DT, type Intent } from '../game/world';
import { visibleEnemies } from './perception';

export type ActionType = 'turn' | 'move' | 'strafe' | 'attack' | 'shoot' | 'use' | 'go_to' | 'explore' | 'weapon' | 'wait';

export interface Action {
  type: ActionType;
  degrees?: number;
  tiles?: number;
  shots?: number;
  x?: number;
  y?: number;
  slot?: number;
  seconds?: number;
}

export interface ActionResult {
  action: Action;
  outcome: string;
  interrupted: boolean;
  ticks: number;
}

const TURN_SPEED = (300 * Math.PI) / 180; // rad/s
const RAD = Math.PI / 180;

function angDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** Tiles the player can walk through, as far as they know (explored, no walls, unlocked doors). */
function passableFn(w: World) {
  const p = w.player;
  return (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w.W || y >= w.H || !w.explored[y * w.W + x]) return false;
    const d = w.door(x, y);
    if (d) return d.secret ? d.open > 0.5 : !d.key || p.keys.has(d.key);
    if (WALL_CHARS.has(w.grid[y][x])) return false;
    if (w.decor.some((o) => o.blocking && !o.dead && Math.floor(o.x) === x && Math.floor(o.y) === y)) return false;
    return true;
  };
}

/** Shortest known path to the nearest "frontier" tile (a passable tile next to unexplored space), or null. */
export function pathToFrontier(w: World): [number, number][] | null {
  const p = w.player;
  const passable = passableFn(w);
  const sx = Math.floor(p.x), sy = Math.floor(p.y);
  const prev = new Int32Array(w.W * w.H).fill(-1);
  const start = sy * w.W + sx;
  prev[start] = start;
  const q = [start];
  const isFrontier = (x: number, y: number) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < w.W && ny < w.H && !w.explored[ny * w.W + nx];
    });
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % w.W, y = (i / w.W) | 0;
    if (i !== start && Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > 1.2 && isFrontier(x, y)) {
      const path: [number, number][] = [];
      for (let j = i; j !== start; j = prev[j]) path.push([j % w.W, (j / w.W) | 0]);
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * w.W + nx;
      if (!passable(nx, ny) || prev[ni] >= 0) continue;
      prev[ni] = i;
      q.push(ni);
    }
  }
  return null;
}

/** BFS over explored, passable tiles. Unlocked doors count as passable (auto-opened on the way). */
export function findPath(w: World, tx: number, ty: number): [number, number][] | null {
  const p = w.player;
  const sx = Math.floor(p.x), sy = Math.floor(p.y);
  if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) return null;
  const passable = passableFn(w);
  if (!passable(tx, ty)) return null;
  const prev = new Int32Array(w.W * w.H).fill(-1);
  const start = sy * w.W + sx;
  prev[start] = start;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (i === ty * w.W + tx) break;
    const x = i % w.W, y = (i / w.W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * w.W + nx;
      if (nx < 0 || ny < 0 || nx >= w.W || ny >= w.H || prev[ni] >= 0 || !passable(nx, ny)) continue;
      prev[ni] = i;
      q.push(ni);
    }
  }
  const goal = ty * w.W + tx;
  if (prev[goal] < 0) return null;
  const path: [number, number][] = [];
  for (let i = goal; i !== start; i = prev[i]) path.push([i % w.W, (i / w.W) | 0]);
  path.reverse();
  return path;
}

/** One running action. `step` returns an intent, or null when finished. */
export class ActionExecution {
  ticks = 0;
  done = false;
  outcome = '';
  interrupted = false;
  private hp0: number;
  private seen0: Set<number>;
  private state: Record<string, number> = {};
  private path: [number, number][] | null = null;

  constructor(private w: World, public action: Action, private interruptible: boolean) {
    this.hp0 = w.player.hp;
    this.seen0 = new Set(visibleEnemies(w).map((e) => e.id));
    const a = action;
    const p = w.player;
    if (a.type === 'turn' || a.type === 'attack') {
      const deg = Math.max(-180, Math.min(180, Number(a.degrees ?? 0)));
      this.state.target = p.angle + deg * RAD;
      this.state.deg = deg;
    }
    if (a.type === 'move' || a.type === 'strafe') {
      this.state.dist = Math.max(-8, Math.min(8, Number(a.tiles ?? 1)));
      this.state.x0 = p.x;
      this.state.y0 = p.y;
      this.state.stuck = 0;
    }
    if (a.type === 'shoot' || a.type === 'attack') this.state.shots = Math.max(1, Math.min(12, Math.round(Number(a.shots ?? 1))));
    if (a.type === 'explore') {
      this.state.legs = 0;
      this.state.steps = 0;
      this.state.stuck = 0;
      this.state.lx = p.x;
      this.state.ly = p.y;
      this.state.items0 = this.seenItems();
      this.state.maxSteps = Math.max(4, Math.min(40, Number(a.tiles ?? 24)));
    }
    if (a.type === 'go_to') {
      const tx = Math.round(Number(a.x)), ty = Math.round(Number(a.y));
      this.path = findPath(w, tx, ty);
      const c = w.tile(tx, ty);
      const door = w.door(tx, ty);
      if (!this.path && w.explored[ty * w.W + tx] && (c === 'E' || door || WALL_CHARS.has(c))) {
        // target is a wall-like tile (EXIT switch, locked door, wall): walk to the best tile in front of it, then face it
        let best: [number, number][] | null = null;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const pth = findPath(w, tx + dx, ty + dy);
          if (pth && (!best || pth.length < best.length)) best = pth;
        }
        if (best) {
          this.path = best;
          this.state.face = 1;
          this.state.fx = tx;
          this.state.fy = ty;
          this.state.press = c === 'E' || (door && !door.secret) ? 1 : 0;
        }
      }
      if (!this.path) this.finish(`No known path to (${a.x},${a.y}). Target must be an explored tile you can reach; locked doors need their key.`);
      else if (!this.path.length && !this.state.face) {
        if (Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) > 0.25) this.path = [[tx, ty]]; // step to the tile centre
        else this.finish('You are already there.');
      }
      this.state.stuck = 0;
      this.state.lx = p.x;
      this.state.ly = p.y;
    }
  }

  finish(outcome: string, interrupted = false) {
    if (this.done) return;
    this.done = true;
    this.outcome = outcome;
    this.interrupted = interrupted;
  }

  /** Common interrupt check for movement-type actions. */
  private checkInterrupt(): boolean {
    const w = this.w;
    if (w.player.dead) { this.finish('You died.', true); return true; }
    if (w.completeT >= 0) { this.finish('Level complete!', true); return true; }
    if (!this.interruptible) return false;
    if (w.player.hp < this.hp0) {
      this.finish(`INTERRUPTED: you took ${this.hp0 - w.player.hp} damage.`, true);
      return true;
    }
    const now = visibleEnemies(w);
    const fresh = now.filter((e) => !this.seen0.has(e.id));
    if (fresh.length) {
      this.finish(`INTERRUPTED: ${fresh.length} new enemy(s) came into view.`, true);
      return true;
    }
    return false;
  }

  step(): Intent | null {
    if (this.done) return null;
    const w = this.w;
    const p = w.player;
    const it = emptyIntent();
    this.ticks++;
    if (this.ticks > 60 * 12) {
      this.finish('Timed out.');
      return null;
    }
    if (p.dead) { this.finish('You died.', true); return null; }
    if (w.completeT >= 0) { this.finish('Level complete!', true); return null; }
    const a = this.action;
    switch (a.type) {
      case 'turn':
      case 'attack': {
        if (a.type === 'attack' && this.state.turned) return this.shootStep(it);
        const diff = angDiff(this.state.target, p.angle);
        const stepA = Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * DT);
        it.turn = stepA;
        if (Math.abs(diff) < 1e-3) {
          if (a.type === 'turn') { this.finish(`Turned ${this.state.deg}°.`); return null; }
          this.state.turned = 1;
          return this.shootStep(it);
        }
        return it;
      }
      case 'shoot':
        return this.shootStep(it);
      case 'move':
      case 'strafe': {
        if (this.checkInterrupt()) return null;
        const dist = this.state.dist;
        const moved = Math.hypot(p.x - this.state.x0, p.y - this.state.y0);
        if (moved >= Math.abs(dist) - 0.02) { this.finish(`Moved ${moved.toFixed(1)} tiles.`); return null; }
        if (a.type === 'move') it.forward = Math.sign(dist);
        else it.strafe = Math.sign(dist);
        // slow down near the end for precision
        const remain = Math.abs(dist) - moved;
        if (remain < 0.07) { it.forward *= 0.3; it.strafe *= 0.3; }
        if (p.moving < 0.08 && this.ticks > 3) this.state.stuck++;
        else this.state.stuck = 0;
        if (this.state.stuck > 6) { this.finish(`BLOCKED after ${moved.toFixed(1)} tiles by ${this.blocker(a.type === 'move' ? Math.sign(dist) : 0, a.type === 'strafe' ? Math.sign(dist) : 0)}.`, true); return null; }
        return it;
      }
      case 'use':
        if (this.ticks === 1) { it.use = true; return it; }
        if (this.ticks > 30) {
          const last = w.events[w.events.length - 1];
          this.finish(last && last.t >= w.time - 0.6 ? last.text : 'Used.');
          return null;
        }
        return it;
      case 'weapon': {
        const id = WEAPON_ORDER[Math.max(0, Math.min(3, Math.round(Number(a.slot ?? 2)) - 1))];
        if (!p.weapons.has(id)) { this.finish(`You don't have weapon ${a.slot}.`); return null; }
        if (this.ticks === 1) { it.weapon = id; return it; }
        if (!p.pendingWeapon) { this.finish(`Now holding ${WEAPONS[id].name}.`); return null; }
        return it;
      }
      case 'wait': {
        const secs = Math.max(0.1, Math.min(4, Number(a.seconds ?? 1)));
        if (this.checkInterrupt()) return null;
        if (this.ticks * DT >= secs) { this.finish(`Waited ${secs}s.`); return null; }
        return it;
      }
      case 'go_to':
        return this.goToStep(it);
      case 'explore':
        return this.exploreStep(it);
    }
    this.finish('Unknown action.');
    return null;
  }

  private shootStep(it: Intent): Intent | null {
    const w = this.w;
    const p = w.player;
    const def = WEAPONS[p.weapon];
    if (def.ammo && p.ammo[def.ammo] <= 0 && !p.pendingWeapon) {
      this.finish(`Out of ${def.ammo}! (${this.state.fired ?? 0} shots fired)`);
      return null;
    }
    const k0 = w.stats.kills;
    if (this.state.k0 === undefined) { this.state.k0 = k0; this.state.h0 = w.stats.hits; this.state.fired = 0; }
    if ((this.state.fired ?? 0) >= this.state.shots && p.cd <= 0.0001) {
      const kills = w.stats.kills - this.state.k0;
      const hits = w.stats.hits - this.state.h0;
      const turned = this.action.type === 'attack' ? `Turned ${this.state.deg}°, then fired` : 'Fired';
      this.finish(`${turned} ${this.state.fired} shot(s) with ${def.name}: ${hits} hit(s), ${kills} kill(s).`);
      return null;
    }
    if (p.cd <= 0 && !p.pendingWeapon && (this.state.fired ?? 0) < this.state.shots) {
      it.fire = true;
      this.state.fired = (this.state.fired ?? 0) + 1;
    }
    if (p.dead) { this.finish('You died.', true); return null; }
    return it;
  }

  /** Describe what is in the way of a movement direction (forward/strafe signs). */
  private blocker(fwd: number, side: number) {
    const w = this.w;
    const p = w.player;
    const ang = p.angle + (side ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : fwd < 0 ? Math.PI : 0);
    const ax = p.x + Math.cos(ang) * 0.7, ay = p.y + Math.sin(ang) * 0.7;
    const e = w.liveEnemies.find((x) => Math.hypot(x.x - ax, x.y - ay) < 0.8);
    if (e) return `an enemy (${e.kind}) in the way`;
    const d = w.decor.find((o) => o.blocking && !o.dead && Math.hypot(o.x - ax, o.y - ay) < 0.8);
    if (d) return d.kind === 'barrel' ? 'an explosive barrel (not an item: shoot it from afar or walk around it)' : `a ${d.kind} (decoration, walk around it)`;
    const tx = Math.floor(ax), ty = Math.floor(ay);
    const door = w.door(tx, ty);
    if (door) return door.key && !p.keys.has(door.key) ? `the locked ${door.key.toUpperCase()} door` : 'a closed door (walk into it or use it)';
    if (w.tile(tx, ty) === 'E') return 'the EXIT switch (use it to finish the level!)';
    return `a wall at (${tx},${ty})`;
  }

  private seenItems() {
    const w = this.w;
    return w.items.filter((i) => !i.taken && w.explored[Math.floor(i.y) * w.W + Math.floor(i.x)]).length;
  }

  private goToStep(it: Intent): Intent | null {
    if (this.state.pressT) return this.pressStep(it);
    if (this.checkInterrupt()) return null;
    const r = this.followPath(it);
    if (r === 'arrived') {
      if (this.state.face) { this.state.pressT = 1; return this.pressStep(it); }
      this.finish(`Arrived at (${this.action.x},${this.action.y}).`);
      return null;
    }
    return r === 'blocked' ? null : it;
  }

  /** After go_to a switch/door: turn to face it, press use, report what happened. */
  private pressStep(it: Intent): Intent | null {
    const w = this.w;
    const p = w.player;
    const want = Math.atan2(this.state.fy + 0.5 - p.y, this.state.fx + 0.5 - p.x);
    const diff = angDiff(want, p.angle);
    if (Math.abs(diff) > 0.02 && this.state.pressT === 1) {
      it.turn = Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * DT);
      return it;
    }
    if (!this.state.press) { this.finish(`Arrived next to (${this.state.fx},${this.state.fy}), facing it.`); return null; }
    if (this.state.pressT === 1) { this.state.pressT = 2; this.state.pressTick = this.ticks; it.use = true; return it; }
    if (this.ticks - this.state.pressTick > 30 || w.completeT >= 0) {
      const last = [...w.events].reverse().find((e) => e.t >= w.time - 0.8 && ['exit', 'door', 'locked', 'secret'].includes(e.type));
      this.finish(last ? last.text : `Walked to (${this.state.fx},${this.state.fy}) and pressed use.`);
      return null;
    }
    return it;
  }

  /** Auto-explore: walk to frontier after frontier until something new shows up. */
  private exploreStep(it: Intent): Intent | null {
    if (this.checkInterrupt()) return null;
    const w = this.w;
    const p = w.player;
    const where = () => `now at (${Math.floor(p.x)},${Math.floor(p.y)})`;
    if (this.ticks % 10 === 0 && this.seenItems() > this.state.items0) {
      this.finish(`Explored ${this.state.steps} tiles and spotted a new item (see the item list), ${where()}.`, true);
      return null;
    }
    if (!this.path || !this.path.length) {
      if (this.state.steps >= this.state.maxSteps) { this.finish(`Explored ${this.state.steps} tiles, ${where()}.`); return null; }
      const next = pathToFrontier(w);
      if (!next) {
        this.finish(`Nothing left to explore that you can reach (${where()}): look for locked doors, keys, the EXIT, or secret walls.`);
        return null;
      }
      this.path = next.slice(0, Math.max(1, this.state.maxSteps - this.state.steps));
      this.state.steps += this.path.length;
      this.state.legs++;
    }
    const r = this.followPath(it);
    return r === 'blocked' ? null : it;
  }

  /** Follow this.path, opening doors on the way. */
  private followPath(it: Intent): 'arrived' | 'moving' | 'blocked' {
    const w = this.w;
    const p = w.player;
    const path = this.path!;
    // skip reached waypoints
    while (path.length && Math.hypot(path[0][0] + 0.5 - p.x, path[0][1] + 0.5 - p.y) < (path.length === 1 ? 0.15 : 0.3)) path.shift();
    if (!path.length) return 'arrived';
    const [nx, ny] = path[0];
    // auto-open doors on the path
    const d = w.door(nx, ny);
    if (d && d.open < 0.9) {
      const want = Math.atan2(ny + 0.5 - p.y, nx + 0.5 - p.x);
      const diff = angDiff(want, p.angle);
      it.turn = Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * DT);
      if (Math.abs(diff) < 0.05 && !d.opening && this.ticks % 10 === 0) it.use = true;
      if (Math.hypot(nx + 0.5 - p.x, ny + 0.5 - p.y) > 1.2) it.forward = 0.6;
      return 'moving';
    }
    const want = Math.atan2(ny + 0.5 - p.y, nx + 0.5 - p.x);
    const diff = angDiff(want, p.angle);
    it.turn = Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * DT);
    it.forward = Math.abs(diff) < 0.5 ? 1 : 0.15;
    if (this.ticks % 20 === 0) {
      if (Math.hypot(p.x - this.state.lx, p.y - this.state.ly) < 0.1) this.state.stuck++;
      else this.state.stuck = 0;
      this.state.lx = p.x;
      this.state.ly = p.y;
      if (this.state.stuck >= 3) {
        this.finish(`BLOCKED on the way at tile (${Math.floor(p.x)},${Math.floor(p.y)}).`, true);
        return 'blocked';
      }
    }
    return 'moving';
  }
}
