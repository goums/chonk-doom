#!/usr/bin/env node
// Publishes benchmark / eval / replay data for the website (about.html + the in-game replay menu):
//   public/data/leaderboard.json   per-league, per-level metrics (computed from the raw episode logs)
//   public/data/evals.json         Evalite results per league
//   public/data/thinks.json        "Le Chonk thinks" quotes (+ frames in public/data/frames/)
//   public/replays/*.json + index.json   slim run logs, re-simulated live by the game (no API key needed)
// Usage: node bench/publish.mjs
import fs from 'node:fs';
import path from 'node:path';

import { scoreBars, scatter, money, secs } from '../src/chart.ts';

// open-weight models only, two leagues so reasoning and non-reasoning models are never mixed
const LEAGUES = [
  // + Large 4's earlier Mistral Studio batch
  { id: 'instruct', dir: 'runs/league-instruct', extra: { dir: 'runs/league-mistral', match: /large-4/ }, title: 'Instruct league', desc: 'Reasoning off.' },
  { id: 'reasoning', dir: 'runs/league-reasoning', title: 'Reasoning league', desc: 'Reasoning effort high.' },
];
const EVALS = [
  { file: 'evals/results/instruct.json', title: 'Instruct league' },
  { file: 'evals/results/reasoning.json', title: 'Reasoning league' },
];
const NAMES = {
  'mistral-large-4-0': 'Mistral Large 4', 'mistral-large-4': 'Mistral Large 4', 'kimi-k2.6': 'Kimi K2.6', 'qwen3.5-397b-a17b': 'Qwen3.5 397B',
  'deepseek-v4.1-flash': 'DeepSeek V4.1 Flash', 'glm-5.3-flash': 'GLM-5.3 Flash', 'gemma-4-31b-it': 'Gemma 4 31B', 'nemotron-3.5-super-vl': 'Nemotron 3.5 Super VL',
};
const pretty = (m) => NAMES[m.split('/').pop()] ?? m.split('/').pop();
const isChonk = (m) => /large 4/i.test(m);
const FEATURED = [
  { glob: 'runs/featured-full', title: '🏆 Mistral Large 4 plays the whole game', desc: '3 levels, live re-simulation' },
];

const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const episodeFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('summary') && !f.endsWith('.error.json')).map((f) => path.join(dir, f))
  .filter((f) => !readJSON(f).episode?.error) : []); // API failures are not results
const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

const bestKills = (run) => Math.max(run.episode?.kills ?? 0, ...run.turns.map((t) => t.kills ?? 0));

/** Recompute episode metrics from a run log (works for old and new logs). */
function episodeOf(run) {
  const e = run.episode ?? {};
  const m = run.metrics ?? {};
  const errs = [...(m.aimErrors ?? [])].sort((a, b) => a - b);
  const lat = run.turns.filter((t) => t.latencyMs > 0).map((t) => t.latencyMs / 1000);
  return {
    model: pretty(e.model ?? run.config.model), level: (e.level ?? 0) + 1, completed: !!e.completed,
    turns: run.turns.length, actions: m.actions ?? run.turns.reduce((a, t) => a + t.actions.length, 0),
    gameTime: e.gameTime ?? null, wallSec: e.wallSec ?? null, secPerTurn: mean(lat), tokensIn: run.usage.prompt, tokensOut: run.usage.completion,
    cost: run.costUSD, hitRate: m.shots ? m.hits / m.shots : null, aimErr: errs.length ? errs[Math.floor(errs.length / 2)] : null,
    aim5: errs.length ? errs.filter((x) => x <= 5).length / errs.length : null, damage: m.damageTaken ?? null, deaths: e.deaths ?? 0,
    kills: e.totalKills ? bestKills(run) / e.totalKills : null,
    // Chonk score: 60 points for clearing the level + 40 points x share of enemies killed (best attempt: a death resets the level)
    score: 60 * (e.completed ? 1 : 0) + 40 * (e.totalKills ? Math.min(1, bestKills(run) / e.totalKills) : 0),
  };
}

// ---- leaderboard ----
const leagues = [];
for (const L of LEAGUES) {
  const files = [...episodeFiles(L.dir), ...(L.extra ? episodeFiles(L.extra.dir).filter((f) => L.extra.match.test(path.basename(f))) : [])];
  const eps = files.map((f) => episodeOf(readJSON(f)));
  if (!eps.length) continue;
  const rows = [];
  for (const model of [...new Set(eps.map((e) => e.model))]) {
    for (const level of [...new Set(eps.map((e) => e.level))].sort()) {
      const xs = eps.filter((e) => e.model === model && e.level === level);
      if (!xs.length) continue;
      rows.push({
        model, level, episodes: xs.length, cleared: xs.filter((e) => e.completed).length,
        ...Object.fromEntries(['score', 'turns', 'actions', 'gameTime', 'wallSec', 'secPerTurn', 'tokensIn', 'tokensOut', 'cost', 'hitRate', 'aimErr', 'aim5', 'damage', 'deaths', 'kills'].map((k) => [k, mean(xs.map((e) => e[k]))])),
      });
    }
  }
  const models = [...new Set(eps.map((e) => e.model))].map((model) => {
    const xs = eps.filter((e) => e.model === model);
    const errs = xs.map((e) => e.aimErr).filter((x) => x !== null);
    return { model, chonk: isChonk(model), score: mean(xs.map((e) => e.score)), cleared: xs.filter((e) => e.completed).length, episodes: xs.length,
      cost: mean(xs.map((e) => e.cost)), secPerTurn: mean(xs.map((e) => e.secPerTurn)), wallSec: mean(xs.map((e) => e.wallSec)), aimErr: mean(errs), hitRate: mean(xs.map((e) => e.hitRate)) };
  }).sort((a, b) => b.score - a.score);
  leagues.push({ id: L.id, title: L.title, desc: L.desc, rows, models });
  // static charts for the README
  fs.mkdirSync('docs/img', { recursive: true });
  fs.writeFileSync(`docs/img/bench-${L.id}-score.svg`, scoreBars(models, `${L.title}: Chonk score (0-100)`));
  fs.writeFileSync(`docs/img/bench-${L.id}-cost.svg`, scatter(models, `${L.title}: score vs cost per level`, { key: 'cost', label: 'Cost per level (USD, log scale)', log: true, fmt: money }));
  fs.writeFileSync(`docs/img/bench-${L.id}-speed.svg`, scatter(models, `${L.title}: score vs seconds per decision`, { key: 'secPerTurn', label: 'Seconds per decision', fmt: secs }));
  console.log(`league ${L.id}: ${eps.length} episodes`);
}
// the featured full-game run (hero stats)
const full = episodeFiles('runs/featured-full').map(readJSON).filter((r) => r.episode?.completed).sort((a, b) => a.turns.length - b.turns.length)[0];
const featured = full && { levels: new Set(full.turns.map((t) => t.level)).size, turns: full.turns.length, cost: full.costUSD, wallSec: full.episode.wallSec, deaths: full.episode.deaths, kills: full.episode.kills, totalKills: full.episode.totalKills };
fs.mkdirSync('public/data/frames', { recursive: true });
fs.writeFileSync('public/data/leaderboard.json', JSON.stringify({ generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', leagues, featured }, null, 1));

/** Replace the text between <!-- name:start --> and <!-- name:end --> in the README. */
function readmeBlock(name, md) {
  const f = 'README.md', s = fs.readFileSync(f, 'utf8');
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (re.test(s)) fs.writeFileSync(f, s.replace(re, `$1\n${md}\n$2`));
}
const f1 = (x, d = 1) => (x === null || x === undefined ? '–' : x.toFixed(d));
readmeBlock('bench', leagues.map((L) => `### ${L.title} (${L.desc.replace('.', '').toLowerCase()})

<img src="docs/img/bench-${L.id}-score.svg" width="720" alt="${L.title} score">

| Model | Score | Levels cleared | Cost / level | s / decision | Aim error |
|---|---|---|---|---|---|
${L.models.map((m) => `| ${m.chonk ? `**${m.model}** 🐱` : m.model} | **${f1(m.score, 0)}** | ${m.cleared}/${m.episodes} | $${f1(m.cost, 2)} | ${f1(m.secPerTurn)} | ${m.aimErr === null ? '–' : f1(m.aimErr) + '°'} |`).join('\n')}

<img src="docs/img/bench-${L.id}-cost.svg" width="49%" alt="score vs cost"> <img src="docs/img/bench-${L.id}-speed.svg" width="49%" alt="score vs speed">`).join('\n\n'));

// ---- evals ----
const evalLeagues = [];
for (const E of EVALS) {
  if (!fs.existsSync(E.file)) continue;
  const { evals } = readJSON(E.file);
  const by = new Map();
  for (const e of evals) {
    const m = by.get(e.variantName) ?? { model: e.variantName, aim: null, decide: null, lat: [], cost: 0 };
    m[e.variantGroup.startsWith('Aim') ? 'aim' : 'decide'] = e.averageScore;
    for (const r of e.results ?? []) { if (r.output?.latencyMs) m.lat.push(r.output.latencyMs / 1000); m.cost += r.output?.costUSD ?? 0; }
    by.set(e.variantName, m);
  }
  const rows = [...by.values()].map((m) => ({ model: pretty(m.model), aim: m.aim, decide: m.decide, overall: ((m.aim ?? 0) * 8 + (m.decide ?? 0) * 6) / 14, latency: mean(m.lat), cost: m.cost })).sort((a, b) => b.overall - a.overall);
  evalLeagues.push({ title: E.title, rows });
}
fs.writeFileSync('public/data/evals.json', JSON.stringify({ leagues: evalLeagues }, null, 1));
readmeBlock('evals', evalLeagues.map((L) => `**${L.title}**

| Model | Aim | Decisions | Overall |
|---|---|---|---|
${L.rows.map((r) => `| ${isChonk(r.model) ? `**${r.model}**` : r.model} | ${Math.round(100 * r.aim)}% | ${Math.round(100 * r.decide)}% | **${Math.round(100 * r.overall)}%** |`).join('\n')}`).join('\n\n'));

// ---- replays (slim: the game re-simulates them, so frames/observations are not needed) ----
fs.mkdirSync('public/replays', { recursive: true });
for (const f of fs.readdirSync('public/replays')) if (/^replay-\d+\.json$/.test(f)) fs.rmSync(path.join('public/replays', f));
const index = [];
const slim = (run) => ({
  version: run.version, date: run.date, config: run.config, provider: run.provider, game: run.game, episode: run.episode && { seed: run.episode.seed, level: run.episode.level, skill: run.episode.skill, completed: run.episode.completed },
  usage: run.usage, costUSD: run.costUSD,
  turns: run.turns.map((t) => ({ turn: t.turn, level: t.level, gameTime: t.gameTime, thought: t.thought, reasoning: (t.reasoning || '').slice(0, 1200), actions: t.actions, results: t.results, notes: t.notes, usage: t.usage, latencyMs: t.latencyMs, costUSD: t.costUSD, hp: t.hp, kills: t.kills, error: t.error })),
});
const pickRuns = [];
// the best full-game run only (cleared, fewest decisions)
for (const F of FEATURED) {
  const best = episodeFiles(F.glob).map((f) => ({ f, r: readJSON(f) })).filter(({ r }) => r.episode?.completed).sort((a, b) => a.r.turns.length - b.r.turns.length)[0];
  if (best) pickRuns.push({ f: best.f, title: F.title, desc: `${F.desc}, ${best.r.turns.length} turns` });
}
// + every cleared Mistral Large 4 level from the leagues
// + the fastest cleared Mistral Large 4 run of each level
for (let lvl = 0; lvl < 3; lvl++) {
  const best = LEAGUES.flatMap((L) => [...episodeFiles(L.dir), ...(L.extra ? episodeFiles(L.extra.dir) : [])])
    .filter((f) => /large-4/.test(path.basename(f))).map((f) => ({ f, r: readJSON(f) }))
    .filter(({ r }) => r.episode?.completed && r.episode.level === lvl).sort((a, b) => a.r.turns.length - b.r.turns.length)[0];
  if (best) pickRuns.push({ f: best.f, title: `Mistral Large 4 · Level ${lvl + 1}`, desc: `${best.r.turns.length} turns` });
}
for (const [i, p] of pickRuns.entries()) {
  const name = `replay-${i + 1}.json`;
  fs.writeFileSync(path.join('public/replays', name), JSON.stringify(slim(readJSON(p.f))));
  index.push({ file: name, title: p.title, desc: p.desc });
}
fs.writeFileSync('public/replays/index.json', JSON.stringify(index, null, 1));
console.log(`${index.length} replays`);

// ---- "Le Chonk thinks" quotes (from the featured run, or any Large 4 run) ----
const src = pickRuns[0] ? readJSON(pickRuns[0].f) : null;
const quotes = [];
if (src) {
  const tag = (t, i) => {
    const out = t.results.map((r) => r.outcome).join(' ');
    const prev = src.turns[i - 1];
    if (i === 0) return 'Opening';
    if (/Level complete/.test(out)) return 'EXIT!';
    if (/You died/.test(out)) return 'Defeat';
    if (/rex/i.test(t.thought)) return 'Boss fight';
    if (t.hp < 35 && t.hp > 0) return 'Low health';
    if (/key/i.test(t.thought) && /got|grab|have|j'ai/i.test(t.thought)) return 'Key';
    if (prev && t.kills > prev.kills + 1) return 'Combat';
    return null;
  };
  const seen = new Set();
  src.turns.forEach((t, i) => {
    const k = tag(t, i);
    if (!k || !t.thought || (seen.has(k) && !['Boss fight', 'EXIT!'].includes(k)) || quotes.length >= 9) return;
    seen.add(k);
    let frame;
    if (t.frame?.startsWith('data:image')) {
      frame = `data/frames/q${quotes.length + 1}.jpg`;
      fs.writeFileSync(path.join('public', frame), Buffer.from(t.frame.split(',')[1], 'base64'));
    }
    const plan = t.actions.map((a) => `${a.type}${a.degrees !== undefined ? `(${a.degrees}°)` : a.x !== undefined ? `(${a.x},${a.y})` : a.tiles !== undefined ? `(${a.tiles})` : ''}`).join(' → ');
    quotes.push({ turn: t.turn, level: t.level, tag: k, thought: t.thought, frame, plan });
  });
}
fs.writeFileSync('public/data/thinks.json', JSON.stringify(quotes, null, 1));
if (fs.existsSync('docs/img/observation.txt')) fs.copyFileSync('docs/img/observation.txt', 'public/data/observation.txt');
console.log(`${quotes.length} quotes`);
