// Minimal chat-completions client for two providers (both allow CORS, so no backend is needed):
//  - Mistral Studio (api.mistral.ai), the official way to call mistral-large-4
//  - OpenRouter (openrouter.ai), OpenAI-compatible, used to benchmark other models with the same harness
// In `npm run dev` requests go through the Vite dev proxy (/api/<provider>), which adds the key from .env.

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

// USD per 1M tokens on Mistral Studio (OpenRouter reports the real cost per request instead)
export const PRICE = { input: 0.68, cachedInput: 0.07, output: 2.09 };

export async function hasDevProxy(provider: Provider): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const r = await fetch(`/api/${provider}/status`);
    return r.ok;
  } catch {
    return false;
  }
}

/** Provider-specific request adjustments (both APIs are OpenAI-like, with small differences). */
function adapt(provider: Provider, req: ChatRequest): Record<string, unknown> {
  if (provider === 'mistral') return { ...req };
  const { reasoning_effort, tool_choice, ...rest } = req;
  return {
    ...rest,
    // OpenAI-style image parts + tool_choice
    messages: req.messages.map((m) =>
      m.role === 'user' && Array.isArray(m.content)
        ? { ...m, content: m.content.map((c) => (c.type === 'image_url' && typeof c.image_url === 'string' ? { type: 'image_url', image_url: { url: c.image_url } } : c)) }
        : m,
    ),
    tool_choice: tool_choice === 'any' ? 'required' : tool_choice,
    reasoning: reasoning_effort === 'high' ? { effort: 'high' } : { enabled: false },
    usage: { include: true }, // ask OpenRouter to report the real cost
  };
}

export async function chat(cfg: ClientConfig, req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const P = PROVIDERS[cfg.provider];
  const url = cfg.apiKey ? P.url : P.proxy;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.provider === 'openrouter') {
    headers['X-Title'] = 'CHONK DOOM';
    headers['HTTP-Referer'] = 'https://goums.github.io/chonk-doom/';
  }
  const body = JSON.stringify(adapt(cfg.provider, req));
  let delay = 2000;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { method: 'POST', headers, body, signal });
    if (r.ok) return r.json();
    const errText = await r.text();
    // retry rate limits and transient server errors
    if ((r.status === 429 || r.status >= 500) && attempt < 6) {
      await new Promise((res) => setTimeout(res, delay));
      delay *= 1.8;
      continue;
    }
    let msg = errText;
    try { const j = JSON.parse(errText); msg = j.message ?? j.error?.message ?? errText; } catch { /* keep raw */ }
    throw new Error(`${P.label} ${r.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
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
