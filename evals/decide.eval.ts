// DECISION eval: staged game situations with one sensible next move (get the key, heal, open the exit...).
import { evalite } from 'evalite';
import { ask, aimOf, dataset, variants, TRIALS, type Answer, type Case } from './lib';

function rightMove(output: Answer, e: Case['expected']) {
  const acts = output.actions;
  if (!acts.length) return 0;
  if (e.combat) {
    // first two actions must contain a shot roughly at the enemy
    const shot = acts.slice(0, 2).find((a) => a.type === 'attack' || a.type === 'shoot');
    if (!shot) return 0;
    const d = shot.type === 'shoot' ? 0 : (shot.degrees ?? 0);
    return Math.abs(d - (e.degrees ?? 0)) <= 12 ? 1 : 0.5;
  }
  if (e.target) {
    // a go_to (anywhere in the plan) ending near the target tile
    const [tx, ty] = e.target;
    const hit = acts.some((a) => a.type === 'go_to' && Math.hypot((a.x ?? -99) - tx, (a.y ?? -99) - ty) <= (e.radius ?? 1.5));
    if (hit) return 1;
    return acts.some((a) => (e.kinds ?? []).includes(a.type)) ? 0.25 : 0;
  }
  if (e.first) return e.first.includes(acts[0].type) ? 1 : acts.some((a) => (e.kinds ?? []).includes(a.type)) ? 0.5 : 0;
  return 0;
}

evalite.each(variants)<Case, Answer, Case['expected']>('Make the right move', {
  data: dataset.filter((c) => c.category === 'decision').map((c) => ({ input: c, expected: c.expected })),
  task: (c, v) => ask(c, v),
  trialCount: TRIALS,
  scorers: [
    { name: 'Valid act() call', scorer: ({ output }) => (output.valid ? 1 : 0) },
    { name: 'Right move', scorer: ({ output, expected }) => rightMove(output, expected ?? {}) },
  ],
  columns: ({ input, output }) => [
    { label: 'Case', value: input.description },
    { label: 'Plan', value: output.actions.map((a) => `${a.type}${a.x !== undefined ? `(${a.x},${a.y})` : a.degrees !== undefined ? `(${a.degrees}°)` : ''}`).join(' → ') || output.error || '' },
    { label: 'Aim', value: aimOf(output) ?? '' },
    { label: 's', value: (output.latencyMs / 1000).toFixed(1) },
  ],
});
