#!/usr/bin/env node
// Builds evals/dataset.json: real game situations staged in the actual engine, with the exact frame +
// observation the model receives, and a ground truth for scoring. Run: npm run eval:data
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.chonk?.stageScenario);
await page.waitForTimeout(500);

const cases = [];

/** Run `setup(world, params)` in the page, snapshot, and store the case. */
async function scene(id, category, description, level, setup, params, expected) {
  const snap = await page.evaluate(
    async ({ level, setup, params }) => {
      const w = window.chonk.stageScenario(level);
      const fn = new Function('w', 'p', setup);
      const truth = fn(w, params) ?? {};
      for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
      return { ...(await window.chonk.snapshotScenario()), truth };
    },
    { level, setup, params },
  );
  cases.push({ id, category, description, input: { observation: snap.observation, frame: snap.frame }, expected: { ...expected, ...snap.truth } });
  console.log(`✓ ${id}: ${description}`);
}

// shared JS snippets (run inside the page)
const ONLY = `
  // keep only the listed enemies, remove obstacles that could hide them
  const keep = p.keep ?? [];
  w.enemies = w.enemies.filter((e, i) => keep.includes(i));
  w.decor.forEach((d) => { if (d.kind === 'plant' || d.kind === 'lamp') d.dead = true; });
`;
const PLACE_ENEMY = `
  const base = w.enemies.find((x) => x.kind === p.kind) ?? w.enemies[0];
  const e = { ...base, kind: p.kind, id: base.id };
  w.enemies = [e];
  w.decor.forEach((d) => { if (d.kind === 'plant' || d.kind === 'lamp') d.dead = true; });
  const pl = w.player;
  pl.x = p.px; pl.y = p.py; pl.angle = 0;
  const a = (p.deg * Math.PI) / 180;
  e.x = pl.x + Math.cos(a) * p.dist; e.y = pl.y + Math.sin(a) * p.dist; e.state = 'idle';
  const rel = Math.atan2(e.y - pl.y, e.x - pl.x) - pl.angle;
  return { degrees: Math.round((Math.atan2(Math.sin(rel), Math.cos(rel)) * 180) / Math.PI), kind: p.kind, distance: p.dist };
`;

// ---- 1. AIM: one enemy at a known angle in the library (E1M1), read off the degree ruler ----
const aims = [
  ['mouse', -30, 4], ['bulldog', -18, 4.5], ['chihuahua', -8, 5], ['mouse', 0, 5.5],
  ['bulldog', 9, 4], ['chihuahua', 16, 4.5], ['mouse', 24, 4], ['bulldog', 33, 3.6],
];
for (const [kind, deg, dist] of aims) {
  await scene(`aim_${kind}_${deg}`, 'aim', `Aim at a ${kind} standing at ${deg}° (${dist} tiles)`, 0, PLACE_ENEMY,
    { kind, deg, dist, px: 13.5, py: 3.5 }, {});
}

// ---- 2. DECISIONS: what should Le Chonk do next? ----
const REVEAL = 'w.explored.fill(1);';
await scene('decide_get_key', 'decision', 'Red door is locked, the red key has been seen: go get the key', 0,
  REVEAL + ONLY + `w.player.x = 10.5; w.player.y = 9.5; w.player.angle = Math.PI / 2; return { target: [7, 22], radius: 1.5, kinds: ['go_to'] };`,
  {}, {});
await scene('decide_heal', 'decision', 'Health is 15%, no enemies, food has been seen: go eat', 0,
  REVEAL + ONLY + `w.player.hp = 15; w.player.x = 6.5; w.player.y = 4.5; w.player.angle = 0;
   const food = w.items.find((i) => i.kind === 'catnip' && Math.floor(i.y) <= 6);
   return { target: [Math.floor(food.x), Math.floor(food.y)], radius: 1.5, kinds: ['go_to'] };`,
  {}, {});
await scene('decide_use_key', 'decision', 'Le Chonk has the red key: go open the red door', 0,
  REVEAL + ONLY + `w.player.keys.add('red'); const k = w.items.find((i) => i.kind === 'key_red'); k.taken = true;
   w.player.x = 12.5; w.player.y = 9.5; w.player.angle = 0; return { target: [22, 11], radius: 1.6, kinds: ['go_to', 'use', 'explore'] };`,
  {}, {});
await scene('decide_explore', 'decision', 'Start of the level, nothing seen yet: explore', 0,
  ONLY + `return { kinds: ['explore', 'go_to', 'move', 'turn'], first: ['explore', 'go_to', 'move', 'turn'] };`,
  {}, {});
await scene('decide_fight_bulldog', 'decision', 'A bulldog charges 2 tiles ahead: shoot it (or back off and shoot)', 0,
  PLACE_ENEMY.replace('return {', 'const t = {') + `; return { ...t, kinds: ['attack', 'shoot'], combat: true };`,
  { kind: 'bulldog', deg: 3, dist: 2, px: 13.5, py: 3.5 }, {});
await scene('decide_exit', 'decision', 'The EXIT switch is right in front of Le Chonk: press it', 0,
  ONLY + REVEAL + `w.player.x = 24.5; w.player.y = 21.6; w.player.angle = Math.PI / 2; w.player.keys.add('red'); return { kinds: ['use', 'move', 'go_to'], first: ['use', 'move', 'go_to'] };`,
  {}, {});

fs.mkdirSync('evals', { recursive: true });
fs.writeFileSync('evals/dataset.json', JSON.stringify(cases, null, 1));
console.log(`\n${cases.length} cases -> evals/dataset.json (${Math.round(fs.statSync('evals/dataset.json').size / 1024)} KB)`);
await browser.close();
await server.close();
