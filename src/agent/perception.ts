// What Le Chonk perceives each turn: the rendered frame + text observations.
import { World, ENEMIES, WEAPONS, WALL_CHARS, type Enemy } from '../game/world';
import { HFOV } from '../engine/renderer';

export type ObsMode = 'vision' | 'map' | 'radar';

export const OBS_MODES: Record<ObsMode, string> = {
  vision: 'Vision only: frame + status bar text',
  map: 'Vision + explored automap (default)',
  radar: 'Vision + automap + enemy radar (exact angles)',
};

const DEG = 180 / Math.PI;

export function relAngle(w: World, x: number, y: number) {
  const p = w.player;
  let a = Math.atan2(y - p.y, x - p.x) - p.angle;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return a;
}

/** Enemies currently on screen (inside the FOV with line of sight). */
export function visibleEnemies(w: World): Enemy[] {
  const p = w.player;
  return w.liveEnemies.filter((e) => {
    const rel = relAngle(w, e.x, e.y);
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    const halfW = Math.atan2(ENEMIES[e.kind].radius, d);
    return Math.abs(rel) < HFOV / 2 + halfW && d < 24 && w.hasLOS(p.x, p.y, e.x, e.y);
  });
}

/** Compass heading where 0 = North, 90 = East (map "up" is North). */
export function heading(w: World) {
  return Math.round(((w.player.angle * DEG + 90) % 360 + 360) % 360);
}

export function compass(h: number) {
  return ['NORTH', 'NORTH-EAST', 'EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST'][Math.round(h / 45) % 8];
}

const ITEM_CHAR: Record<string, string> = {
  catnip: '+', kibble: '+', tuna: '+', box: 'A', hairballs: 'a', sardines: 'a', battery: 'a',
  shotgun: 'W', laser: 'W', key_red: 'r', key_blue: 'b', key_yellow: 'y',
};

/** ASCII automap of explored tiles. North is up. */
export function automapAscii(w: World, withEnemies: boolean) {
  const p = w.player;
  const rows: string[][] = [];
  for (let y = 0; y < w.H; y++) {
    const r: string[] = [];
    for (let x = 0; x < w.W; x++) {
      if (!w.explored[y * w.W + x]) { r.push(' '); continue; }
      const c = w.grid[y][x];
      const d = w.door(x, y);
      if (d) {
        if (d.secret) r.push(d.open > 0 ? '/' : '#');
        else if (d.open >= 0.9) r.push('/');
        else r.push(d.key ? { red: 'R', blue: 'B', yellow: 'Y' }[d.key] : 'D');
      } else if (c === 'E') r.push('E');
      else if (c === 'e') r.push('e');
      else if (WALL_CHARS.has(c)) r.push('#');
      else r.push('.');
    }
    rows.push(r);
  }
  for (const it of w.items) {
    if (it.taken) continue;
    const x = Math.floor(it.x), y = Math.floor(it.y);
    if (w.explored[y * w.W + x]) rows[y][x] = ITEM_CHAR[it.kind] ?? '?';
  }
  for (const d of w.decor) {
    if (d.dead || !d.blocking) continue;
    const x = Math.floor(d.x), y = Math.floor(d.y);
    if (w.explored[y * w.W + x]) rows[y][x] = d.kind === 'barrel' ? 'x' : 'o';
  }
  if (withEnemies) {
    for (const e of visibleEnemies(w)) {
      rows[Math.floor(e.y)][Math.floor(e.x)] = { mouse: 'm', chihuahua: 'c', bulldog: 'd', rex: 'X' }[e.kind];
    }
  }
  const h = heading(w);
  rows[Math.floor(p.y)][Math.floor(p.x)] = ['^', '>', 'v', '<'][Math.round(h / 90) % 4];
  // crop to the explored bounding box (+1) to save tokens
  let x0 = w.W, x1 = 0, y0 = w.H, y1 = 0;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (rows[y][x] !== ' ') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = (n: number, l: number) => String(n).padStart(l, ' ');
  const out: string[] = [];
  let tens = '   ', ones = '   ';
  for (let x = x0; x <= x1; x++) { tens += x >= 10 ? String(Math.floor(x / 10)) : ' '; ones += String(x % 10); }
  out.push(tens, ones);
  for (let y = y0; y <= y1; y++) out.push(pad(y, 2) + ' ' + rows[y].slice(x0, x1 + 1).join(''));
  return out.join('\n');
}

export const MAP_LEGEND =
  "Legend: '^ > v <' = YOU (pointing where you face), '#' wall, '.' floor, ' ' unexplored, 'D' plain door (closed, NOT locked: just face it and use), " +
  "'R'/'B'/'Y' red/blue/yellow locked doors, '/' open door, 'E' EXIT switch, '+' health, 'A' armor, 'a' ammo, 'W' weapon, " +
  "'r'/'b'/'y' collar keys, 'x' explosive barrel, 'o' obstacle. Coordinates: x = column (grows EAST), y = row (grows SOUTH). North is up.";

export function statusText(w: World) {
  const p = w.player;
  const wd = WEAPONS[p.weapon];
  const ammo = wd.ammo ? `${p.ammo[wd.ammo]} ${wd.ammo}` : 'melee, no ammo needed';
  const owned = [...p.weapons].map((id) => `${WEAPONS[id].slot}=${WEAPONS[id].name}`).join(', ');
  const keys = p.keys.size ? [...p.keys].map((k) => k.toUpperCase()).join(', ') : 'none';
  const h = heading(w);
  return [
    `Health ${p.hp}% | Armor ${p.armor}% | Weapon: ${wd.name} (${ammo})`,
    `Weapons owned: ${owned}`,
    `Ammo: hairballs ${p.ammo.hairballs}, sardines ${p.ammo.sardines}, battery ${p.ammo.battery} | Keys: ${keys}`,
    `Position: x=${p.x.toFixed(1)}, y=${p.y.toFixed(1)} (tile ${Math.floor(p.x)},${Math.floor(p.y)}), facing ${compass(h)} (heading ${h}°)`,
    `Kills ${w.stats.kills}/${w.stats.totalKills} | Items ${w.stats.items}/${w.stats.totalItems} | Secrets ${w.stats.secrets}/${w.stats.totalSecrets} | Level time ${Math.floor(w.time)}s`,
  ].join('\n');
}

export function radarText(w: World) {
  const p = w.player;
  const vis = visibleEnemies(w);
  if (!vis.length) return 'Radar: no enemies in view.';
  return 'Radar (enemies in view, angle relative to crosshair, + = right):\n' + vis
    .map((e) => {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      const a = Math.round(relAngle(w, e.x, e.y) * DEG);
      return `- ${ENEMIES[e.kind].name}: ${a > 0 ? '+' : ''}${a}°, ${d.toFixed(1)} tiles, ${Math.round((100 * e.hp) / ENEMIES[e.kind].hp)}% hp`;
    })
    .join('\n');
}

/** Grab the composited game screen as a JPEG data URL, upscaled with nearest-neighbour. */
export function captureFrame(screen: HTMLCanvasElement, scale = 2, quality = 0.85) {
  const c = document.createElement('canvas');
  c.width = Math.round(screen.width * scale);
  c.height = Math.round(screen.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = scale < 1; // downscale smoothly, upscale pixel-perfect
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(screen, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
