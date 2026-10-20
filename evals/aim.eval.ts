// AIM eval: one enemy at a known angle. Does the model read the degree ruler and aim at it?
import { evalite } from 'evalite';
import { ask, aimOf, dataset, variants, TRIALS, type Answer, type Case } from './lib';

evalite.each(variants)<Case, Answer, Case['expected']>('Aim with the degree ruler', {
  data: dataset.filter((c) => c.category === 'aim').map((c) => ({ input: c, expected: c.expected })),
  task: (c, v) => ask(c, v),
  trialCount: TRIALS,
  scorers: [
    { name: 'Valid act() call', scorer: ({ output }) => (output.valid ? 1 : 0) },
    {
      name: 'Aim accuracy (≤5° = 1, 20°+ = 0)',
      scorer: ({ output, expected }) => {
        const d = aimOf(output);
        if (d === null || expected?.degrees === undefined) return { score: 0, metadata: { aimed: d } };
        const err = Math.abs(d - expected.degrees);
        return { score: Math.max(0, Math.min(1, 1 - (err - 5) / 15)), metadata: { aimed: d, truth: expected.degrees, err } };
      },
    },
    { name: 'Shoots (attack/shoot)', scorer: ({ output }) => (output.actions.some((a) => a.type === 'attack' || a.type === 'shoot') ? 1 : 0) },
  ],
  columns: ({ input, output }) => [
    { label: 'Case', value: input.id },
    { label: 'Truth', value: `${input.expected.degrees}°` },
    { label: 'Aimed', value: `${aimOf(output) ?? '-'}°` },
    { label: 'Thought', value: output.thought.slice(0, 140) || output.error || '' },
    { label: 's', value: (output.latencyMs / 1000).toFixed(1) },
  ],
});
