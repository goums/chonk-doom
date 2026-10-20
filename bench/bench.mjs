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
          jobs.push({ provider: PROVIDER, model, obsMode, reasoning, level, run: r, seed: 1000 + r * 17 + level, skill: SKILL, speed: SPEED, maxTurns: maxTurns(level), maxDeaths: MAX_DEATHS });

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
    fs.writeFileSync(file, JSON.stringify(out));
    const e = out.episode;
    const lat = out.turns.filter((t) => t.latencyMs > 0).map((t) => t.latencyMs);
    Object.assign(e, { costUSD: out.costUSD, wallSec: (Date.now() - t0) / 1000, avgLatency: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length / 1000 : 0, tokens: out.usage.prompt + out.usage.completion, errors: out.turns.filter((t) => t.error).length });
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

// ---- summary: accomplishment / cost / speed ----
const groups = new Map();
for (const e of results) {
  const k = e.model.startsWith('bot:') ? e.model : `${e.model} · ${e.obsMode} · reasoning ${e.reasoning}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}
const pct = (x) => (100 * x).toFixed(0) + '%';
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const levels = [...new Set(results.map((e) => e.level))].sort();
let md = `# CHONK DOOM benchmark\n\n${new Date().toISOString().slice(0, 10)} · provider ${PROVIDER} · difficulty ${['Easy', 'Medium', 'Hard'][SKILL]} · ${RUNS} run(s) per level · turn caps ${JSON.stringify(TURN_CAP)} · max ${MAX_DEATHS} deaths\n\n`;
md += `| Model | Levels cleared | ${levels.map((l) => `E1M${l + 1}`).join(' | ')} | Kills | Deaths/ep | Turns/ep | $ / episode | $ / turn | s / turn |\n`;
md += `|---|---|${levels.map(() => '---').join('|')}|---|---|---|---|---|---|\n`;
const summary = [];
for (const [k, es] of groups) {
  const per = levels.map((l) => es.filter((e) => e.level === l));
  const turns = es.reduce((a, e) => a + e.turns, 0);
  const cost = es.reduce((a, e) => a + (e.costUSD || 0), 0);
  const row = {
    config: k,
    completion: mean(es.map((e) => (e.completed ? 1 : 0))),
    perLevel: per.map((xs) => ({ cleared: xs.filter((e) => e.completed).length, n: xs.length })),
    kills: mean(es.map((e) => e.kills / e.totalKills)),
    deaths: mean(es.map((e) => e.deaths)),
    turns: turns / es.length,
    costPerEpisode: cost / es.length,
    costPerTurn: turns ? cost / turns : 0,
    secPerTurn: mean(es.map((e) => e.avgLatency || 0)),
  };
  summary.push(row);
  md += `| ${k} | **${pct(row.completion)}** | ${row.perLevel.map((p) => `${p.cleared}/${p.n}`).join(' | ')} | ${pct(row.kills)} | ${row.deaths.toFixed(1)} | ${row.turns.toFixed(0)} | $${row.costPerEpisode.toFixed(3)} | $${row.costPerTurn.toFixed(4)} | ${row.secPerTurn.toFixed(1)} |\n`;
}
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ args, summary, episodes: results }, null, 2));
console.log('\n' + md);
