// Model client built on the Vercel AI SDK (`ai` + `@ai-sdk/mistral` + `@openrouter/ai-sdk-provider`), for two providers
// (both allow CORS, so it runs straight from the browser, and from Node for the evals):
//  - Mistral Studio (api.mistral.ai), the official way to call mistral-large-4
//  - OpenRouter (openrouter.ai), OpenAI-compatible, used to benchmark other models with the same harness
// In `npm run dev` requests go through the Vite dev proxy (/api/<provider>), which adds the key from .env.

import { generateText, jsonSchema, tool, type AssistantContent, type ModelMessage, type UserContent } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export type Content = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: string } | { type: 'thinking'; thinking: unknown })[];

export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: Content }
  | { role: 'assistant'; content: Content | null; tool_calls?: ToolCall[]; prefix?: boolean }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

export interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: unknown[];
  tool_choice?: 'auto' | 'any' | 'none' | 'required';
  parallel_tool_calls?: boolean;
  temperature?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'high';
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: { message: { role: 'assistant'; content: Content | null; tool_calls?: ToolCall[]; reasoning?: string | null }; finish_reason: string }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; prompt_tokens_details?: { cached_tokens?: number }; cost?: number };
}

export type Provider = 'mistral' | 'openrouter';

export interface ClientConfig {
  provider: Provider;
  apiKey: string | null; // null => use the dev proxy
}

export const PROVIDERS: Record<Provider, { label: string; url: string; proxy: string; keyHint: string; models: { id: string; label: string }[] }> = {
  mistral: {
    label: 'Mistral Studio',
    url: 'https://api.mistral.ai/v1/chat/completions',
    proxy: '/api/mistral/chat/completions',
    keyHint: 'console.mistral.ai',
    models: [
      { id: 'mistral-large-4', label: 'Mistral Large 4 (Le Chonk)' },
      { id: 'mistral-medium-3-5', label: 'Mistral Medium 3.5' },
      { id: 'ministral-14b-latest', label: 'Ministral 14B' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    proxy: '/api/openrouter/chat/completions',
    keyHint: 'openrouter.ai/keys',
    models: [
      { id: 'mistralai/mistral-large-4-0', label: 'Mistral Large 4 (Le Chonk)' },
      { id: 'mistralai/mistral-large-2512', label: 'Mistral Large 3' },
      { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna' },
      { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5' },
      { id: 'qwen/qwen3.8-flash', label: 'Qwen 3.8 Flash' },
    ],
  },
};

// USD per 1M tokens for Mistral Studio models (list prices; OpenRouter reports the real cost per request instead)
const PRICES: [RegExp, { input: number; cachedInput: number; output: number }][] = [
  [/large-4/, { input: 0.68, cachedInput: 0.07, output: 2.09 }],
  [/large-2512|large-3/, { input: 0.5, cachedInput: 0.05, output: 1.5 }],
  [/medium-3-5|medium-3\.5/, { input: 1.5, cachedInput: 0.15, output: 7.5 }],
  [/medium/, { input: 0.4, cachedInput: 0.04, output: 2 }],
  [/small/, { input: 0.15, cachedInput: 0.015, output: 0.6 }],
  [/ministral-14b/, { input: 0.2, cachedInput: 0.02, output: 0.2 }],
  [/ministral-8b/, { input: 0.15, cachedInput: 0.015, output: 0.15 }],
];
export function priceOf(model: string) {
  return PRICES.find(([re]) => re.test(model))?.[1] ?? PRICES[0][1];
}

export async function hasDevProxy(provider: Provider): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const r = await fetch(`/api/${provider}/status`);
    return r.ok;
  } catch {
    return false;
  }
}

/** Models that refuse "reasoning off" (learned at runtime from a 400): they get the lowest effort instead. */
const mandatoryReasoning = new Set<string>();

/** Our (Mistral-style) messages -> AI SDK ModelMessages. */
function toModelMessages(req: ChatRequest): { system: string | undefined; messages: ModelMessage[] } {
  let system: string | undefined;
  const messages: ModelMessage[] = [];
  for (const m of req.messages) {
    if (m.role === 'system') system = (system ? system + '\n' : '') + m.content;
    else if (m.role === 'user') {
      const parts: Exclude<UserContent, string> = [];
      if (typeof m.content !== 'string') {
        for (const c of m.content) {
          if (c.type === 'text') parts.push({ type: 'text', text: c.text });
          else if (c.type === 'image_url') parts.push({ type: 'image', image: new URL(c.image_url), mediaType: 'image/jpeg' });
        }
      }
      messages.push({ role: 'user', content: typeof m.content === 'string' ? m.content : parts });
    } else if (m.role === 'assistant') {
      const parts: AssistantContent = [];
      const text = typeof m.content === 'string' ? m.content : '';
      if (text) parts.push({ type: 'text', text });
      for (const tc of m.tool_calls ?? []) parts.push({ type: 'tool-call', toolCallId: tc.id, toolName: tc.function.name, input: JSON.parse(tc.function.arguments) });
      messages.push({ role: 'assistant', content: parts });
    } else if (m.role === 'tool') {
      messages.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId: m.tool_call_id, toolName: m.name, output: { type: 'text', value: m.content } }] });
    }
  }
  return { system, messages };
}

function languageModel(cfg: ClientConfig, model: string) {
  const P = PROVIDERS[cfg.provider];
  const key = cfg.apiKey ?? 'dev-proxy'; // the dev proxy replaces it with the key from .env
  const baseURL = cfg.apiKey ? undefined : P.proxy.replace(/\/chat\/completions$/, '');
  if (cfg.provider === 'mistral') return createMistral({ apiKey: key, baseURL })(model);
  return createOpenRouter({
    apiKey: key,
    baseURL,
    compatibility: 'strict',
    headers: { 'X-Title': 'CHONK DOOM', 'HTTP-Referer': 'https://goums.github.io/chonk-doom/' },
  }).chat(model, { usage: { include: true } }); // ask OpenRouter to report the real cost
}

/**
 * One chat turn through the Vercel AI SDK (`generateText`). Keeps a small OpenAI/Mistral-shaped request/response
 * so the agent, the benchmark and the evals don't depend on SDK types.
 */
export async function chat(cfg: ClientConfig, req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const P = PROVIDERS[cfg.provider];
  const { system, messages } = toModelMessages(req);
  const toolDefs = (req.tools ?? []) as { function: { name: string; description: string; parameters: object } }[];
  const tools = Object.fromEntries(toolDefs.map((t) => [t.function.name, tool({ description: t.function.description, inputSchema: jsonSchema(t.function.parameters as never) })]));
  for (let attempt = 0; ; attempt++) {
    const forced = req.reasoning_effort !== 'high' && mandatoryReasoning.has(req.model);
    const providerOptions = cfg.provider === 'mistral'
      ? { mistral: { reasoningEffort: req.reasoning_effort ?? 'none', parallelToolCalls: false } }
      : { openrouter: { reasoning: req.reasoning_effort === 'high' ? { effort: 'high' } : forced ? { effort: 'low' } : { enabled: false, effort: 'none' } } };
    try {
      const r = await generateText({
        model: languageModel(cfg, req.model),
        system,
        messages,
        tools,
        toolChoice: req.tool_choice === 'any' || req.tool_choice === 'required' ? 'required' : 'auto',
        temperature: req.temperature,
        maxOutputTokens: forced ? Math.max(req.max_tokens ?? 0, 6000) : req.max_tokens,
        providerOptions: providerOptions as never,
        maxRetries: 8, // exponential backoff on rate limits / 5xx
        abortSignal: signal,
      });
      const or = (r.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)?.usage;
      return {
        id: r.response.id,
        model: r.response.modelId,
        choices: [{
          finish_reason: r.finishReason,
          message: {
            role: 'assistant',
            content: r.text || null,
            reasoning: r.reasoningText ?? null,
            tool_calls: r.toolCalls.map((tc) => ({ id: tc.toolCallId, type: 'function' as const, function: { name: tc.toolName, arguments: JSON.stringify(tc.input) } })),
          },
        }],
        usage: {
          prompt_tokens: r.usage.inputTokens ?? 0,
          completion_tokens: r.usage.outputTokens ?? 0,
          total_tokens: r.usage.totalTokens ?? 0,
          prompt_tokens_details: { cached_tokens: r.usage.inputTokenDetails?.cacheReadTokens ?? 0 },
          cost: or?.cost,
        },
      };
    } catch (e) {
      const err = e as { statusCode?: number; responseBody?: string; message?: string; lastError?: { statusCode?: number; responseBody?: string; message?: string } };
      const last = err.lastError ?? err;
      const body = last.responseBody ?? '';
      if (/reasoning is mandatory/i.test(body + (last.message ?? '')) && !mandatoryReasoning.has(req.model) && attempt === 0) {
        mandatoryReasoning.add(req.model);
        continue;
      }
      let msg = last.message ?? String(e);
      try { const j = JSON.parse(body); msg = j.message ?? j.error?.message ?? msg; } catch { /* keep */ }
      throw new Error(`${P.label} ${last.statusCode ?? ''}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }
  }
}

/** Split a response content into visible text and reasoning trace. */
export function splitContent(c: Content | null): { text: string; thinking: string } {
  if (!c) return { text: '', thinking: '' };
  if (typeof c === 'string') return { text: c, thinking: '' };
  let text = '', thinking = '';
  for (const ch of c) {
    if (ch.type === 'text') text += ch.text;
    else if (ch.type === 'thinking') {
      const t = ch.thinking as unknown;
      if (typeof t === 'string') thinking += t;
      else if (Array.isArray(t)) thinking += t.map((x) => (typeof x === 'string' ? x : (x as { text?: string }).text ?? '')).join('');
    }
  }
  return { text, thinking };
}
