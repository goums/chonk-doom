// Shared eval helpers: load keys from .env, ask a model exactly like the harness does, parse its act() call.
import fs from 'node:fs';
import { chat, type Provider } from '../src/agent/mistral';
import { systemPrompt, ACT_TOOL } from '../src/agent/prompt';
import type { Action } from '../src/agent/actions';

// minimal .env loader (no dependency)
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

export interface Case {
  id: string;
  category: 'aim' | 'decision';
  description: string;
  input: { observation: string; frame: string };
  expected: Record<string, unknown> & { degrees?: number; target?: [number, number]; radius?: number; kinds?: string[]; first?: string[]; combat?: boolean };
}

export interface Answer { thought: string; actions: Action[]; valid: boolean; latencyMs: number; costUSD: number; error?: string }

export const dataset: Case[] = JSON.parse(fs.readFileSync(new URL('./dataset.json', import.meta.url), 'utf8'));

export interface ModelVariant { provider: Provider; model: string }

const DEFAULT_MODELS = 'mistralai/mistral-large-4-0,mistralai/mistral-large-2512,google/gemini-3.8-flash,openai/gpt-5.6-luna';

/** Models to evaluate: EVAL_PROVIDER (openrouter | mistral) + EVAL_MODELS (comma-separated). */
export const variants = (process.env.EVAL_MODELS ?? DEFAULT_MODELS).split(',').map((m) => m.trim()).filter(Boolean).map((model) => ({
  name: model.split('/').pop()!,
  input: { provider: (process.env.EVAL_PROVIDER ?? 'openrouter') as Provider, model },
}));

export async function ask(c: Case, v: ModelVariant): Promise<Answer> {
  const apiKey = v.provider === 'openrouter' ? process.env.OPEN_ROUTER_API_KEY : process.env.MISTRAL_STUDIO_API_KEY;
  if (!apiKey) throw new Error(`missing API key for ${v.provider} in .env`);
  const t0 = performance.now();
  try {
    const r = await chat({ provider: v.provider, apiKey }, {
      model: v.model,
      messages: [
        { role: 'system', content: systemPrompt('map') },
        { role: 'user', content: [{ type: 'text', text: c.input.observation }, { type: 'image_url', image_url: c.input.frame }] },
      ],
      tools: [ACT_TOOL],
      tool_choice: 'any',
      parallel_tool_calls: false,
      temperature: 0.3,
      max_tokens: 800,
    });
    const tc = r.choices[0]?.message.tool_calls?.[0];
    const j = tc ? JSON.parse(tc.function.arguments) : null;
    const actions: Action[] = Array.isArray(j?.actions) ? j.actions : [];
    return { thought: String(j?.thought ?? ''), actions, valid: !!j && actions.length > 0, latencyMs: performance.now() - t0, costUSD: r.usage.cost ?? 0 };
  } catch (e) {
    return { thought: '', actions: [], valid: false, latencyMs: performance.now() - t0, costUSD: 0, error: String((e as Error).message ?? e) };
  }
}

/** The first turning action's angle (turn / attack), or null. */
export function aimOf(a: Answer): number | null {
  const x = a.actions.find((s) => s.type === 'attack' || s.type === 'turn');
  return x && typeof x.degrees === 'number' ? x.degrees : null;
}
