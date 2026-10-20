#!/usr/bin/env node
// Headless benchmark: runs Le Chonk on each level N times per configuration and writes
// per-episode run files (replayable in the web UI) + a summary table.
//
//   npm run bench -- --models mistral-large-4 --obs map,vision --reasoning none,high --levels 0,1,2 --runs 3
//
// The API key is read from .env (MISTRAL_STUDIO_API_KEY) through the Vite dev proxy, or from MISTRAL_API_KEY.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const list = (k, d) => String(args[k] ?? d).split(',').map((s) => s.trim()).filter(Boolean);
const MODELS = list('models', 'mistral-large-4');
const OBS = list('obs', 'map');
const REASONING = list('reasoning', 'none');
const LEVELS = list('levels', '0,1,2').map(Number);
const RUNS = Number(args.runs ?? 3);
const PARALLEL = Number(args.parallel ?? 3);
const SKILL = Number(args.skill ?? 1);
const SPEED = Number(args.speed ?? 32); // >= 16 = turbo (render only when the agent looks)
const MAX_DEATHS = Number(args['max-deaths'] ?? 3);
const TURN_CAP = { 0: 150, 1: 220, 2: 260 };
const maxTurns = (lvl) => Number(args['max-turns'] ?? TURN_CAP[lvl] ?? 200);
const OUT = path.resolve(args.out ?? `runs/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
fs.mkdirSync(OUT, { recursive: true });

const jobs = [];
for (const model of MODELS)
  for (const obsMode of model.startsWith('bot:') ? ['radar'] : OBS)
    for (const reasoning of model.startsWith('bot:') ? ['none'] : REASONING)
      for (const level of LEVELS)
        for (let r = 0; r < RUNS; r++)
          jobs.push({ model, obsMode, reasoning, level, run: r, seed: 1000 + r * 17 + level, skill: SKILL, speed: SPEED, maxTurns: maxTurns(level), maxDeaths: MAX_DEATHS });

console.log(`🐱 CHONK DOOM bench: ${jobs.length} episodes -> ${OUT}`);
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

const results = [];
let next = 0;
async function worker(id) {
  while (next < jobs.length) {
    const job = jobs[next++];
    const name = `${job.model.replace(/[^a-z0-9.-]/gi, '_')}__${job.obsMode}__r-${job.reasoning}__L${job.level + 1}__run${job.run}`;
    const file = path.join(OUT, name + '.json');
    if (fs.existsSync(file)) { results.push(JSON.parse(fs.readFileSync(file, 'utf8')).episode); continue; }
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => console.error(`[${name}] page error:`, e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.chonk?.runEpisode);
    const t0 = Date.now();
    const out = await page.evaluate((o) => window.chonk.runEpisode(o), { ...job, apiKey: process.env.MISTRAL_API_KEY || '' });
    fs.writeFileSync(file, JSON.stringify(out));
    const e = out.episode;
    results.push(e);
    console.log(`[w${id}] ${name}: ${e.completed ? '✅ EXIT' : '❌'} kills ${e.kills}/${e.totalKills} deaths ${e.deaths} turns ${e.turns} $${out.costUSD.toFixed(3)} ${(Date.now() - t0) / 1000 | 0}s${e.error ? ' ERROR ' + e.error : ''}`);
    await page.close();
  }
}
await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, (_, i) => worker(i)));
await browser.close();
await server.close();

// ---- summary ----
const groups = new Map();
for (const e of results) {
  const k = e.model.startsWith('bot:') ? e.model : `${e.model} · ${e.obsMode} · reasoning ${e.reasoning}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(0) + '%' : '-');
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
let md = `# CHONK DOOM benchmark\n\n${new Date().toISOString()} · skill ${SKILL} · ${RUNS} run(s) per level · turn caps ${JSON.stringify(TURN_CAP)} · max deaths ${MAX_DEATHS}\n\n`;
md += '| Config | Level | Completion | Kills | Items | Deaths/ep | Turns/ep | Game time |\n|---|---|---|---|---|---|---|---|\n';
const summary = [];
for (const [k, es] of groups) {
  for (const lvl of [...new Set(es.map((e) => e.level))].sort()) {
    const xs = es.filter((e) => e.level === lvl);
    const row = {
      config: k, level: lvl + 1, episodes: xs.length,
      completion: mean(xs.map((e) => (e.completed ? 1 : 0))),
      kills: mean(xs.map((e) => e.kills / e.totalKills)),
      items: mean(xs.map((e) => e.items / e.totalItems)),
      deaths: mean(xs.map((e) => e.deaths)),
      turns: mean(xs.map((e) => e.turns)),
      time: mean(xs.map((e) => e.gameTime)),
    };
    summary.push(row);
    md += `| ${k} | E1M${lvl + 1} | ${pct(row.completion, 1)} (${xs.filter((e) => e.completed).length}/${xs.length}) | ${pct(row.kills, 1)} | ${pct(row.items, 1)} | ${row.deaths.toFixed(1)} | ${row.turns.toFixed(0)} | ${row.time.toFixed(0)}s |\n`;
  }
  const score = mean(es.map((e) => (e.completed ? 1 : 0)));
  md += `| **${k}** | **all** | **${pct(score, 1)}** | **${pct(mean(es.map((e) => e.kills / e.totalKills)), 1)}** | | **${mean(es.map((e) => e.deaths)).toFixed(1)}** | | |\n`;
}
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ args, summary, episodes: results }, null, 2));
console.log('\n' + md);
