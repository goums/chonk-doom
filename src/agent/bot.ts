// A hand-written scripted policy ("bot:simple"). It is used as:
//  1. an offline smoke test of the whole harness (no API key needed),
//  2. a BASELINE in the benchmark. Note that it cheats: it reads exact enemy positions from game memory.
import { World, WALL_CHARS } from '../game/world';
import type { Action } from './actions';
import { findPath } from './actions';
import { visibleEnemies, relAngle } from './perception';

const DEG = 180 / Math.PI;

function nearestReachable(w: World, pts: [number, number][]) {
  const p = w.player;
  let best: { x: number; y: number; len: number } | null = null;
  for (const [x, y] of pts) {
    const path = findPath(w, x, y);
    if (path && (!best || path.length < best.len)) best = { x, y, len: path.length };
    if (Math.hypot(x - p.x, y - p.y) > 40) continue;
  }
  return best;
}

/** Stand on the floor tile next to (tx,ty), face it, and press use. */
function useTile(w: World, tx: number, ty: number): Action[] | null {
  const p = w.player;
  const adj: [number, number][] = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]];
  const cand = adj.filter(([x, y]) => w.explored[y * w.W + x] && !WALL_CHARS.has(w.grid[y][x]) && !w.door(x, y));
  const near = cand.find(([x, y]) => Math.floor(p.x) === x && Math.floor(p.y) === y);
  if (near) {
    const a = relAngle(w, tx + 0.5, ty + 0.5) * DEG;
    return [{ type: 'turn', degrees: Math.round(a) }, { type: 'use' }];
  }
  const t = nearestReachable(w, cand);
  if (!t) return null;
  return [{ type: 'go_to', x: t.x, y: t.y }];
}

/** Random baseline: uniformly random macro-actions (lower bound). */
export function randomAct(w: World): { thought: string; actions: Action[] } {
  const r = Math.random;
  const pick = [
    (): Action => ({ type: 'turn', degrees: Math.round((r() - 0.5) * 180) }),
    (): Action => ({ type: 'move', tiles: Math.round(r() * 4) }),
    (): Action => ({ type: 'strafe', tiles: Math.round((r() - 0.5) * 4) }),
    (): Action => ({ type: 'attack', degrees: Math.round((r() - 0.5) * 60), shots: 2 }),
    (): Action => ({ type: 'use' }),
    (): Action => ({ type: 'go_to', x: Math.floor(r() * w.W), y: Math.floor(r() * w.H) }),
  ];
  return { thought: 'Random paw-ssibilities.', actions: [pick[Math.floor(r() * pick.length)](), pick[Math.floor(r() * pick.length)]()] };
}

export function botAct(w: World): { thought: string; actions: Action[] } {
  const p = w.player;
  const vis = visibleEnemies(w);
  if (vis.length) {
    vis.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const e = vis[0];
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const a = Math.round(relAngle(w, e.x, e.y) * DEG);
    const acts: Action[] = [];
    // best weapon
    const slot = p.weapons.has('laser') && p.ammo.battery > 0 ? 4 : p.weapons.has('shotgun') && p.ammo.sardines > 0 && d < 5 ? 3 : p.ammo.hairballs > 0 ? 2 : 1;
    const cur = { claws: 1, hairball: 2, shotgun: 3, laser: 4 }[p.weapon];
    if (slot !== cur) acts.push({ type: 'weapon', slot });
    acts.push({ type: 'attack', degrees: a, shots: slot === 4 ? 8 : slot === 3 ? 1 : 3 });
    if (e.kind === 'bulldog' && d < 2.5) acts.push({ type: 'move', tiles: -1.5 });
    return { thought: `Enemy ${e.kind} at ${a}°, ${d.toFixed(1)} tiles. Fire!`, actions: acts };
  }
  // collect keys, then health if hurt, weapons, then doors/exit, then explore
  const known = (x: number, y: number) => w.explored[Math.floor(y) * w.W + Math.floor(x)];
  const items = w.items.filter((i) => !i.taken && known(i.x, i.y));
  const pick = (pred: (k: string) => boolean) => nearestReachable(w, items.filter((i) => pred(i.kind)).map((i) => [Math.floor(i.x), Math.floor(i.y)]));
  const key = pick((k) => k.startsWith('key'));
  if (key) return { thought: 'A collar key! Mine.', actions: [{ type: 'go_to', x: key.x, y: key.y }] };
  const weapon = pick((k) => k === 'shotgun' || k === 'laser');
  if (weapon) return { thought: 'New weapon spotted.', actions: [{ type: 'go_to', x: weapon.x, y: weapon.y }] };
  if (p.hp < 60) {
    const h = pick((k) => k === 'catnip' || k === 'kibble' || k === 'tuna');
    if (h) return { thought: 'Need food.', actions: [{ type: 'go_to', x: h.x, y: h.y }] };
  }
  // exit
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    if (w.grid[y][x] === 'E' && known(x, y)) {
      const u = useTile(w, x, y);
      if (u) return { thought: 'The exit switch!', actions: u };
    }
  }
  // explore frontier
  const front: [number, number][] = [];
  for (let y = 1; y < w.H - 1; y++)
    for (let x = 1; x < w.W - 1; x++) {
      if (!w.explored[y * w.W + x] || WALL_CHARS.has(w.grid[y][x])) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !w.explored[(y + dy) * w.W + x + dx])) front.push([x, y]);
    }
  const f = nearestReachable(w, front.filter(([x, y]) => Math.floor(p.x) !== x || Math.floor(p.y) !== y));
  if (f) return { thought: 'Exploring.', actions: [{ type: 'go_to', x: f.x, y: f.y }, { type: 'turn', degrees: 90 }] };
  // unopened doors we can open
  for (const d of w.doors.values()) {
    if (d.open > 0 || d.secret || !known(d.x, d.y) || (d.key && !p.keys.has(d.key))) continue;
    const u = useTile(w, d.x, d.y);
    if (u) return { thought: 'Opening a door.', actions: u };
  }
  return { thought: 'Hmm, looking around.', actions: [{ type: 'turn', degrees: 90 }, { type: 'move', tiles: 2 }] };
}
