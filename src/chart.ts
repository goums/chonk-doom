// Benchmark charts as plain SVG strings. Shared by the project page (about.ts) and bench/publish.mjs (README images),
// so this file only uses erasable TypeScript (Node runs it with type stripping).

export interface ModelScore {
  model: string; // display name
  chonk: boolean; // Mistral Large 4 (highlighted)
  score: number; // 0..100
  cleared: number;
  episodes: number;
  cost: number; // mean $ per level (episode)
  secPerTurn: number;
  wallSec: number; // mean wall time per level
}

export interface ChartTheme { bg: string; panel: string; ink: string; muted: string; grid: string; hot: string; cold: string; font: string }

export const DARK: ChartTheme = { bg: '#2e222f', panel: '#160f17', ink: '#f3ecf5', muted: '#9babb2', grid: '#3e3546', hot: '#fb6b1d', cold: '#4d9be6', font: 'Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif' };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function frame(w: number, h: number, t: ChartTheme, title: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${t.font}" role="img" aria-label="${esc(title)}">` +
    `<rect width="${w}" height="${h}" rx="12" fill="${t.bg}"/>` +
    `<text x="20" y="30" fill="${t.ink}" font-size="16" font-weight="700">${esc(title)}</text>${body}</svg>`;
}

/** Horizontal bars, sorted by score. */
export function scoreBars(ms: ModelScore[], title: string, t: ChartTheme = DARK) {
  const rows = [...ms].sort((a, b) => b.score - a.score);
  const w = 720, left = 190, right = 150, top = 50, rowH = 34, h = top + rows.length * rowH + 16;
  const bw = w - left - right;
  let g = '';
  for (const x of [0, 25, 50, 75, 100]) {
    const px = left + (bw * x) / 100;
    g += `<line x1="${px}" y1="${top - 6}" x2="${px}" y2="${h - 12}" stroke="${t.grid}"/>`;
  }
  rows.forEach((m, i) => {
    const y = top + i * rowH;
    const c = m.chonk ? t.hot : t.cold;
    g += `<text x="${left - 10}" y="${y + 17}" text-anchor="end" fill="${m.chonk ? t.hot : t.ink}" font-size="14" font-weight="${m.chonk ? 700 : 500}">${esc(m.model)}</text>`;
    g += `<rect x="${left}" y="${y + 4}" width="${Math.max(2, (bw * m.score) / 100)}" height="18" rx="4" fill="${c}" opacity="${m.chonk ? 1 : 0.8}"/>`;
    g += `<text x="${left + (bw * m.score) / 100 + 8}" y="${y + 18}" fill="${t.ink}" font-size="13" font-weight="700">${m.score.toFixed(0)}</text>`;
    g += `<text x="${w - 16}" y="${y + 18}" text-anchor="end" fill="${t.muted}" font-size="12">${m.cleared}/${m.episodes} levels</text>`;
  });
  return frame(w, h, t, title, g);
}

/** Score (y) vs a cost/speed axis (x). Top-left is best. */
export function scatter(ms: ModelScore[], title: string, x: { key: 'cost' | 'secPerTurn' | 'wallSec'; label: string; log?: boolean; fmt: (v: number) => string }, t: ChartTheme = DARK) {
  const w = 720, h = 380, l = 56, r = 24, top = 50, b = 52;
  const vals = ms.map((m) => m[x.key]).filter((v) => v > 0);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const tx = (v: number) => (x.log ? Math.log10(v) : v);
  if (x.log) { lo = 10 ** Math.floor(Math.log10(lo)); hi = 10 ** Math.ceil(Math.log10(hi)); }
  else { lo = 0; hi = hi * 1.15; }
  const px = (v: number) => l + ((tx(v) - tx(lo)) / (tx(hi) - tx(lo))) * (w - l - r);
  const py = (s: number) => top + (1 - s / 100) * (h - top - b);
  let g = `<rect x="${l}" y="${top}" width="${(w - l - r) / 2}" height="${(h - top - b) / 2}" fill="${t.hot}" opacity="0.06"/>` +
    `<text x="${l + 8}" y="${top + 16}" fill="${t.hot}" font-size="11" opacity="0.8">better ↖</text>`;
  for (const s of [0, 25, 50, 75, 100]) g += `<line x1="${l}" y1="${py(s)}" x2="${w - r}" y2="${py(s)}" stroke="${t.grid}"/><text x="${l - 8}" y="${py(s) + 4}" text-anchor="end" fill="${t.muted}" font-size="12">${s}</text>`;
  const ticks: number[] = [];
  if (x.log) for (let v = lo; v <= hi * 1.001; v *= 10) for (const k of [1, 2, 5]) { if (v * k <= hi * 1.001) ticks.push(v * k); }
  else for (let i = 0; i <= 5; i++) ticks.push((hi * i) / 5);
  for (const v of ticks) g += `<line x1="${px(v)}" y1="${top}" x2="${px(v)}" y2="${h - b}" stroke="${t.grid}" opacity="0.6"/><text x="${px(v)}" y="${h - b + 16}" text-anchor="middle" fill="${t.muted}" font-size="12">${x.fmt(v)}</text>`;
  g += `<text x="${(l + w - r) / 2}" y="${h - 12}" text-anchor="middle" fill="${t.muted}" font-size="12">${esc(x.label)}</text>`;
  g += `<text x="16" y="${(top + h - b) / 2}" fill="${t.muted}" font-size="12" transform="rotate(-90 16 ${(top + h - b) / 2})" text-anchor="middle">Chonk score</text>`;
  // labels: nudge to avoid overlaps (simple greedy vertical offset)
  const placed: [number, number][] = [];
  for (const m of [...ms].sort((a, b) => Number(a.chonk) - Number(b.chonk))) {
    if (!(m[x.key] > 0)) continue;
    const cx = px(m[x.key]), cy = py(m.score);
    let ly = cy - 12;
    while (placed.some(([qx, qy]) => Math.abs(qx - cx) < 120 && Math.abs(qy - ly) < 16)) ly -= 16;
    placed.push([cx, ly]);
    const anchor = cx > w - 160 ? 'end' : 'start';
    const c = m.chonk ? t.hot : t.cold;
    g += `<circle cx="${cx}" cy="${cy}" r="${m.chonk ? 8 : 6}" fill="${c}" stroke="${t.bg}" stroke-width="2"/>`;
    g += `<text x="${cx + (anchor === 'end' ? -8 : 8)}" y="${ly}" text-anchor="${anchor}" fill="${m.chonk ? t.hot : t.ink}" font-size="14" font-weight="${m.chonk ? 700 : 500}">${esc(m.model)}</text>`;
  }
  return frame(w, h, t, title, g);
}

export const money = (v: number) => (v >= 1 ? `$${v.toFixed(0)}` : v >= 0.1 ? `$${v.toFixed(1)}` : `$${v.toFixed(2)}`);
export const secs = (v: number) => `${v.toFixed(0)} s`;
