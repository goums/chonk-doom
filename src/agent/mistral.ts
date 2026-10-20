// Minimal Mistral chat-completions client (browser). The API allows CORS, so no backend is needed.
// In `npm run dev` we route through the Vite dev proxy (/api/mistral) which injects the .env key.

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
  choices: { message: { role: 'assistant'; content: Content | null; tool_calls?: ToolCall[] }; finish_reason: string }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; prompt_tokens_details?: { cached_tokens?: number } };
}

export interface ClientConfig {
  apiKey: string | null; // null => use dev proxy
}

// USD per 1M tokens for mistral-large-4 (docs.mistral.ai, Oct 2026 launch pricing)
export const PRICE = { input: 0.07, cachedInput: 0.07, output: 2.09 };

export async function hasDevProxy(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const r = await fetch('/api/mistral/status');
    return r.ok;
  } catch {
    return false;
  }
}

export async function chat(cfg: ClientConfig, req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const url = cfg.apiKey ? 'https://api.mistral.ai/v1/chat/completions' : '/api/mistral/chat/completions';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  let delay = 2000;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(req), signal });
    if (r.ok) return r.json();
    const body = await r.text();
    // retry rate limits and transient server errors
    if ((r.status === 429 || r.status >= 500) && attempt < 6) {
      await new Promise((res) => setTimeout(res, delay));
      delay *= 1.8;
      continue;
    }
    let msg = body;
    try { msg = JSON.parse(body).message ?? body; } catch { /* keep raw */ }
    throw new Error(`Mistral API ${r.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
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
