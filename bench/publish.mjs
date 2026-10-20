#!/usr/bin/env node
// Publishes benchmark / eval / replay data for the website (about.html + the in-game replay menu):
//   public/data/leaderboard.json   per-league, per-level metrics (computed from the raw episode logs)
//   public/data/evals.json         Evalite results per league
//   public/data/thinks.json        "Le Chonk thinks" quotes (+ frames in public/data/frames/)
//   public/replays/*.json + index.json   slim run logs, re-simulated live by the game (no API key needed)
// Usage: node bench/publish.mjs
import fs from 'node:fs';
import path from 'node:path';

const LEAGUES = [
  { id: 'mistral', dir: 'runs/league-mistral', title: 'Mistral family · instruct (Mistral Studio)', desc: 'Mistral Large 4 vs its open-weight predecessors and smaller siblings, reasoning off.' },
  { id: 'instruct', dir: 'runs/league-instruct', title: 'Open-weight league · instruct (OpenRouter)', desc: 'Non-reasoning open-weight models with vision + tools, reasoning off.' },
  { id: 'reasoning', dir: 'runs/league-reasoning', title: 'Open-weight league · reasoning (OpenRouter)', desc: 'Reasoning open-weight models, reasoning effort high.' },
];
const EVALS = [
  { file: 'evals/results/mistral.json', title: 'Mistral family (Mistral Studio)' },
  { file: 'evals/results/instruct.json', title: 'Open-weight · instruct' },
  { file: 'evals/results/reasoning.json', title: 'Open-weight · reasoning' },
];
const FEATURED = [
  { glob: 'runs/featured-full', title: '🏆 Mistral Large 4 plays the whole game', desc: '3 levels, live re-simulation' },
];

const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const episodeFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('summary') && !f.endsWith('.error.json')).map((f) => path.join(dir, f))
  .filter((f) => !readJSON(f).episode?.error) : []); // API failures are not results
const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const shortModel = (m, r) => `${m.split('/').pop()}${r === 'high' ? ' (reasoning)' : ''}`;

/** Recompute episode metrics from a run log (works for old and new logs). */
function episodeOf(run) {
  const e = run.episode ?? {};
  const m = run.metrics ?? {};
  const errs = [...(m.aimErrors ?? [])].sort((a, b) => a - b);
  const lat = run.turns.filter((t) => t.latencyMs > 0).map((t) => t.latencyMs / 1000);
  return {
    model: shortModel(e.model ?? run.config.model, e.reasoning ?? run.config.reasoning), level: (e.level ?? 0) + 1, completed: !!e.completed,
    turns: run.turns.length, actions: m.actions ?? run.turns.reduce((a, t) => a + t.actions.length, 0),
    gameTime: e.gameTime ?? null, wallSec: e.wallSec ?? null, secPerTurn: mean(lat), tokensIn: run.usage.prompt, tokensOut: run.usage.completion,
    cost: run.costUSD, hitRate: m.shots ? m.hits / m.shots : null, aimErr: errs.length ? errs[Math.floor(errs.length / 2)] : null,
    aim5: errs.length ? errs.filter((x) => x <= 5).length / errs.length : null, damage: m.damageTaken ?? null, deaths: e.deaths ?? 0,
    kills: e.totalKills ? e.kills / e.totalKills : null,
  };
}

// ---- leaderboard ----
const leagues = [];
for (const L of LEAGUES) {
  const eps = episodeFiles(L.dir).map((f) => episodeOf(readJSON(f)));
  if (!eps.length) continue;
  const rows = [];
  for (const model of [...new Set(eps.map((e) => e.model))]) {
    for (const level of [...new Set(eps.map((e) => e.level))].sort()) {
      const xs = eps.filter((e) => e.model === model && e.level === level);
      if (!xs.length) continue;
      rows.push({
        model, level, episodes: xs.length, cleared: xs.filter((e) => e.completed).length,
        ...Object.fromEntries(['turns', 'actions', 'gameTime', 'wallSec', 'secPerTurn', 'tokensIn', 'tokensOut', 'cost', 'hitRate', 'aimErr', 'aim5', 'damage', 'deaths', 'kills'].map((k) => [k, mean(xs.map((e) => e[k]))])),
      });
    }
  }
  leagues.push({ id: L.id, title: L.title, desc: L.desc, rows });
  console.log(`league ${L.id}: ${eps.length} episodes`);
}
fs.mkdirSync('public/data/frames', { recursive: true });
fs.writeFileSync('public/data/leaderboard.json', JSON.stringify({ generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', leagues }, null, 1));

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
  const rows = [...by.values()].map((m) => ({ model: m.model, aim: m.aim, decide: m.decide, overall: ((m.aim ?? 0) * 8 + (m.decide ?? 0) * 6) / 14, latency: mean(m.lat), cost: m.cost })).sort((a, b) => b.overall - a.overall);
  evalLeagues.push({ title: E.title, rows });
}
fs.writeFileSync('public/data/evals.json', JSON.stringify({ leagues: evalLeagues }, null, 1));

// ---- replays (slim: the game re-simulates them, so frames/observations are not needed) ----
fs.mkdirSync('public/replays', { recursive: true });
const index = [];
const slim = (run) => ({
  version: run.version, date: run.date, config: run.config, provider: run.provider, game: run.game, episode: run.episode && { seed: run.episode.seed, level: run.episode.level, skill: run.episode.skill, completed: run.episode.completed },
  usage: run.usage, costUSD: run.costUSD,
  turns: run.turns.map((t) => ({ turn: t.turn, level: t.level, gameTime: t.gameTime, thought: t.thought, reasoning: (t.reasoning || '').slice(0, 1200), actions: t.actions, results: t.results, notes: t.notes, usage: t.usage, latencyMs: t.latencyMs, costUSD: t.costUSD, hp: t.hp, kills: t.kills, error: t.error })),
});
const pickRuns = [];
for (const F of FEATURED) for (const f of episodeFiles(F.glob)) pickRuns.push({ f, title: F.title, desc: F.desc });
// + every cleared Mistral Large 4 level from the leagues
for (const L of LEAGUES) for (const f of episodeFiles(L.dir)) {
  const r = readJSON(f);
  if (/large-4/.test(r.config.model) && r.episode?.completed) pickRuns.push({ f, title: `Mistral Large 4 · Level ${r.episode.level + 1}`, desc: `${r.turns.length} turns, ${r.config.reasoning === 'high' ? 'reasoning' : 'instruct'}, ${L.id}` });
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
