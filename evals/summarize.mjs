#!/usr/bin/env node
// Turns an Evalite JSON export into a markdown leaderboard: node evals/summarize.mjs [evals/results/latest.json]
import fs from 'node:fs';
const file = process.argv[2] ?? 'evals/results/latest.json';
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const { evals } = raw;
// keep the committed export small: drop the embedded frames (they live in evals/dataset.json)
for (const e of evals) for (const r of e.results ?? []) if (r.input?.input?.frame) r.input.input.frame = '(see dataset.json)';
fs.writeFileSync(file, JSON.stringify(raw));
const models = new Map();
for (const e of evals) {
  const m = models.get(e.variantName) ?? { aim: null, decide: null, lat: [], cost: 0, n: 0, fails: 0 };
  const key = e.variantGroup.startsWith('Aim') ? 'aim' : 'decide';
  m[key] = e.averageScore;
  for (const r of e.results ?? []) {
    m.n++;
    if (r.output?.latencyMs) m.lat.push(r.output.latencyMs);
    m.cost += r.output?.costUSD ?? 0;
    if (!r.output || r.output.error || r.status === 'fail') m.fails++;
  }
  models.set(e.variantName, m);
}
const pct = (x) => (x === null || x === undefined ? '-' : `${Math.round(100 * x)}%`);
let md = '| Model | Aim (ruler reading) | Decisions | Overall | Avg latency | Cost (all trials) | Errors |\n|---|---|---|---|---|---|---|\n';
const rows = [...models.entries()].map(([k, m]) => ({ k, ...m, overall: ((m.aim ?? 0) * 8 + (m.decide ?? 0) * 6) / 14 })).sort((a, b) => b.overall - a.overall);
for (const r of rows) {
  const lat = r.lat.length ? r.lat.reduce((a, b) => a + b, 0) / r.lat.length / 1000 : 0;
  md += `| ${r.k} | ${pct(r.aim)} | ${pct(r.decide)} | **${pct(r.overall)}** | ${lat.toFixed(1)} s | $${r.cost.toFixed(3)} | ${r.fails} |\n`;
}
const out = file.replace(/\.json$/, '.md');
fs.writeFileSync(out, md);
console.log(md);
