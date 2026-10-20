#!/usr/bin/env node
// Headless benchmark: runs Le Chonk on each level N times per configuration and writes
// per-episode run files (replayable in the web UI) + a summary table.
//
//   npm run bench -- --models mistral-large-4 --obs map,vision --reasoning none,high --levels 0,1,2 --runs 3
//
// Providers: --provider mistral (Mistral Studio, key MISTRAL_STUDIO_API_KEY) or --provider openrouter (key OPEN_ROUTER_API_KEY),
// both read from .env by the Vite dev proxy. Example (4 models on OpenRouter):
//   npm run bench -- --provider openrouter --models mistralai/mistral-large-4-0,google/gemini-3.8-flash --runs 3
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
const PROVIDER = String(args.provider ?? 'mistral');
const MODELS = list('models', PROVIDER === 'openrouter' ? 'mistralai/mistral-large-4-0' : 'mistral-large-4');
const OBS = list('obs', 'map');
const REASONING = list('reasoning', 'none');
const LEVELS = list('levels', '0,1,2').map(Number);
const RUNS = Number(args.runs ?? 3);
const PARALLEL = Number(args.parallel ?? 3);
const SKILL = Number(args.skill ?? 1);
const SPEED = Number(args.speed ?? 32); // >= 16 = turbo (render only when the agent looks)
const MAX_DEATHS = Number(args['max-deaths'] ?? 3);
const FULL = args.full === 'true'; // --full: one episode = the whole game (3 levels), e.g. for featured replays
const TURN_CAP = { 0: 150, 1: 220, 2: 260 };
const maxTurns = (lvl) => Number(args['max-turns'] ?? TURN_CAP[lvl] ?? 200);
const OUT = path.resolve(args.out ?? `runs/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
fs.mkdirSync(OUT, { recursive: true });

const jobs = [];
for (const model of MODELS)
  for (const obsMode of model.startsWith('bot:') ? ['radar'] : OBS)
    for (const reasoning of model.startsWith('bot:') ? ['none'] : REASONING)
      for (const level of FULL ? [0] : LEVELS)
        for (let r = 0; r < RUNS; r++)
          jobs.push({ provider: PROVIDER, model, obsMode, reasoning, level: FULL ? 0 : level, run: r, seed: 1000 + r * 17 + level, skill: SKILL, speed: SPEED, maxTurns: FULL ? Number(args['max-turns'] ?? 500) : maxTurns(level), maxDeaths: FULL ? Number(args['max-deaths'] ?? 6) : MAX_DEATHS, full: FULL });

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
    const out = await page.evaluate((o) => window.chonk.runEpisode(o), { ...job, apiKey: '' });
    const e = out.episode;
    const lat = out.turns.filter((t) => t.latencyMs > 0).map((t) => t.latencyMs);
    const m = out.metrics ?? {};
    const errs = [...(m.aimErrors ?? [])].sort((a, b) => a - b);
    Object.assign(e, {
      costUSD: out.costUSD,
      wallSec: (Date.now() - t0) / 1000,
      avgLatency: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length / 1000 : 0,
      tokensIn: out.usage.prompt,
      tokensOut: out.usage.completion,
      tokens: out.usage.prompt + out.usage.completion,
      actions: m.actions ?? 0,
      actionsByType: m.byType ?? {},
      interrupts: m.interrupts ?? 0,
      invalidTurns: m.invalidTurns ?? 0,
      shots: m.shots ?? 0,
      hits: m.hits ?? 0,
      hitRate: m.shots ? m.hits / m.shots : null,
      aimErrMedian: errs.length ? errs[Math.floor(errs.length / 2)] : null,
      aimWithin5: errs.length ? errs.filter((x) => x <= 5).length / errs.length : null,
      damageTaken: m.damageTaken ?? 0,
      errors: out.turns.filter((t) => t.error).length,
    });
    // errored episodes (API failures) are not cached, so a re-run retries them
    if (!e.error) fs.writeFileSync(file, JSON.stringify(out));
    else fs.writeFileSync(file.replace(/\.json$/, '.error.json'), JSON.stringify(out));
    results.push(e);
    console.log(`[w${id}] ${name}: ${e.completed ? '✅ EXIT' : '❌'} kills ${e.kills}/${e.totalKills} deaths ${e.deaths} turns ${e.turns} $${out.costUSD.toFixed(3)} ${(Date.now() - t0) / 1000 | 0}s${e.error ? ' ERROR ' + e.error : ''}`);
    await page.close();
  }
}
await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, (_, i) => worker(i)));
await browser.close();
await server.close();

// ---- summary: one table per level ("Clearing Level N") + an overall table ----
const groups = new Map();
for (const e of results) {
  const k = e.model.startsWith('bot:') ? e.model : `${e.model.split('/').pop()}${e.reasoning === 'high' ? ' (reasoning)' : ''}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}
const pct = (x) => (x === null || x === undefined || Number.isNaN(x) ? '-' : (100 * x).toFixed(0) + '%');
const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const fmt = (x, d = 0) => (x === null || x === undefined ? '-' : x.toFixed(d));
const mmss = (s) => (s === null ? '-' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const levels = [...new Set(results.map((e) => e.level))].sort();
let md = `# CHONK DOOM benchmark\n\n${new Date().toISOString().slice(0, 10)} · provider ${PROVIDER} · difficulty ${['Easy', 'Medium', 'Hard'][SKILL]} · ${RUNS} run(s) per level · turn caps ${JSON.stringify(TURN_CAP)} · max ${MAX_DEATHS} deaths\n\n`;
const summary = [];
for (const lvl of levels) {
  md += `## Clearing Level ${lvl + 1}\n\n| Model | Cleared | Turns | Actions | Game time | Wall time | s / turn | Tokens in / out | Cost | Hit rate | Aim error (median) | Aim ≤ 5° | Damage taken | Deaths | Kills |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const [k, es] of groups) {
    const xs = es.filter((e) => e.level === lvl);
    if (!xs.length) continue;
    const row = {
      model: k, level: lvl + 1, episodes: xs.length,
      cleared: xs.filter((e) => e.completed).length,
      turns: mean(xs.map((e) => e.turns)), actions: mean(xs.map((e) => e.actions)),
      gameTime: mean(xs.map((e) => e.gameTime)), wallSec: mean(xs.map((e) => e.wallSec)), secPerTurn: mean(xs.map((e) => e.avgLatency)),
      tokensIn: mean(xs.map((e) => e.tokensIn)), tokensOut: mean(xs.map((e) => e.tokensOut)), cost: mean(xs.map((e) => e.costUSD)),
      hitRate: mean(xs.map((e) => e.hitRate)), aimErr: mean(xs.map((e) => e.aimErrMedian)), aim5: mean(xs.map((e) => e.aimWithin5)),
      damage: mean(xs.map((e) => e.damageTaken)), deaths: mean(xs.map((e) => e.deaths)), kills: mean(xs.map((e) => e.kills / e.totalKills)),
    };
    summary.push(row);
    md += `| ${k} | **${row.cleared}/${row.episodes}** | ${fmt(row.turns)} | ${fmt(row.actions)} | ${mmss(row.gameTime)} | ${mmss(row.wallSec)} | ${fmt(row.secPerTurn, 1)} | ${fmt(row.tokensIn / 1000)}k / ${fmt(row.tokensOut / 1000, 1)}k | $${fmt(row.cost, 3)} | ${pct(row.hitRate)} | ${row.aimErr === null ? '-' : fmt(row.aimErr, 1) + '°'} | ${pct(row.aim5)} | ${fmt(row.damage)} | ${fmt(row.deaths, 1)} | ${pct(row.kills)} |\n`;
  }
  md += '\n';
}
md += `## Overall\n\n| Model | Levels cleared | Total cost | Total wall time | Avg s / turn |\n|---|---|---|---|---|\n`;
for (const [k, es] of groups) {
  md += `| ${k} | **${es.filter((e) => e.completed).length}/${es.length}** | $${fmt(es.reduce((a, e) => a + (e.costUSD || 0), 0), 3)} | ${mmss(es.reduce((a, e) => a + (e.wallSec || 0), 0))} | ${fmt(mean(es.map((e) => e.avgLatency)), 1)} |\n`;
}
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ args, summary, episodes: results }, null, 2));
console.log('\n' + md);
