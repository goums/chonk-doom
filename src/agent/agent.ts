// The harness loop: observe -> ask Mistral Large 4 -> execute actions -> repeat.
import type { Game } from '../game/game';
import type { Intent } from '../game/world';
import { ActionExecution, type Action, type ActionResult } from './actions';
import { automapAscii, captureFrame, radarText, statusText, visibleEnemies, type ObsMode } from './perception';
import { chat, splitContent, PRICE, type Message, type ClientConfig, type ToolCall } from './mistral';
import { systemPrompt, ACT_TOOL } from './prompt';
import { WALL_CHARS } from '../game/world';
import { botAct, randomAct } from './bot';

export interface AgentConfig {
  model: string;
  obsMode: ObsMode;
  reasoning: 'none' | 'high';
  historyTurns: number; // past turns kept in context (text only)
  maxTurns: number;
  temperature: number;
  imageScale: number;
  skill: number;
  speed: number; // playback speed multiplier for action execution
  singleLevel: boolean; // benchmark episodes: stop when the first level ends
  maxDeaths: number; // stop after this many deaths (0 = unlimited)
}

export const DEFAULT_CONFIG: AgentConfig = {
  model: 'mistral-large-4',
  obsMode: 'map',
  reasoning: 'none',
  historyTurns: 4,
  maxTurns: 400,
  temperature: 0.3,
  imageScale: 2,
  skill: 1,
  speed: 1,
  singleLevel: false,
  maxDeaths: 0,
};

export interface TurnRecord {
  turn: number;
  level: string;
  gameTime: number;
  frame: string; // small jpeg data URL (for replay)
  observation: string;
  thought: string;
  reasoning: string;
  actions: Action[];
  results: ActionResult[];
  notes: string;
  usage: { prompt: number; completion: number; cached: number };
  latencyMs: number;
  hp: number;
  kills: number;
  error?: string;
}

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'paused' | 'stopped' | 'error' | 'done';

interface PastTurn { user: string; assistant: Message; tool: Message }

export class ChonkAgent {
  status: AgentStatus = 'idle';
  cfg: AgentConfig;
  client: ClientConfig;
  turns: TurnRecord[] = [];
  notes = '';
  usage = { prompt: 0, completion: 0, cached: 0 };
  private past: PastTurn[] = [];
  private exec: ActionExecution | null = null;
  private execResolve: (() => void) | null = null;
  private lastEventIdx = 0;
  private lastWorld: unknown = null;
  private abort: AbortController | null = null;
  private stopRequested = false;
  private pauseRequested = false;
  private positions: [number, number][] = [];
  private pendingNote = '';
  onUpdate: (a: ChonkAgent, rec?: TurnRecord) => void = () => {};
  /** Called right before a frame is captured, so turbo mode can render on demand. */
  beforeCapture: () => void = () => {};
  startedAt = 0;
  lastError = '';

  constructor(private game: Game, private screen: HTMLCanvasElement, cfg: Partial<AgentConfig>, client: ClientConfig) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.client = client;
  }

  get cost() {
    const u = this.usage;
    return ((u.prompt - u.cached) * PRICE.input + u.cached * PRICE.cachedInput + u.completion * PRICE.output) / 1e6;
  }

  /** Called by the main loop every fixed tick. Returns the intent to apply, or null if no action runs. */
  tickIntent(): Intent | null {
    if (!this.exec) return null;
    const it = this.exec.step();
    if (!it || this.exec.done) {
      const r = this.execResolve;
      this.execResolve = null;
      r?.();
      return it;
    }
    return it;
  }

  get executing() {
    return !!this.exec && !this.exec.done;
  }

  stop() {
    this.stopRequested = true;
    this.abort?.abort();
    if (this.execResolve) { this.exec?.finish('Stopped.'); this.execResolve(); }
    this.status = 'stopped';
    this.onUpdate(this);
  }

  pause(p: boolean) {
    this.pauseRequested = p;
    if (p && this.status !== 'stopped') this.status = 'paused';
    this.onUpdate(this);
  }

  private runAction(a: Action, interruptible: boolean): Promise<ActionResult> {
    return new Promise((resolve) => {
      const ex = new ActionExecution(this.game.world, a, interruptible);
      this.exec = ex;
      if (ex.done) {
        this.exec = null;
        resolve({ action: a, outcome: ex.outcome, interrupted: ex.interrupted, ticks: 0 });
        return;
      }
      this.execResolve = () => {
        this.exec = null;
        resolve({ action: a, outcome: ex.outcome || 'Done.', interrupted: ex.interrupted, ticks: ex.ticks });
      };
    });
  }

  private eventsSinceLast(): string[] {
    const w = this.game.world;
    if (this.lastWorld !== w) { this.lastWorld = w; this.lastEventIdx = 0; }
    const evs = w.events.slice(this.lastEventIdx);
    this.lastEventIdx = w.events.length;
    // compress repeated damage lines
    const out: string[] = [];
    for (const e of evs) {
      if (e.type === 'weapon' || e.type === 'use') continue;
      out.push(e.text);
    }
    return out.slice(-14);
  }

  private frontier(): string {
    const w = this.game.world;
    const p = w.player;
    const pts: [number, number, number][] = [];
    for (let y = 1; y < w.H - 1; y++)
      for (let x = 1; x < w.W - 1; x++) {
        if (!w.explored[y * w.W + x] || WALL_CHARS.has(w.grid[y][x]) || w.door(x, y)) continue;
        const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !w.explored[(y + dy) * w.W + x + dx]);
        if (touches) pts.push([x, y, Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y)]);
      }
    pts.sort((a, b) => a[2] - b[2]);
    if (!pts.length) return 'No unexplored frontier left within reach (look for doors, keys or secrets).';
    return 'Nearest unexplored frontier tiles: ' + pts.slice(0, 6).map(([x, y]) => `(${x},${y})`).join(' ');
  }

  private buildObservation(): string {
    const w = this.game.world;
    const parts: string[] = [];
    parts.push(`=== TURN ${this.turns.length + 1} | ${w.level.id} ${w.level.name} (${w.level.subtitle}) ===`);
    parts.push(`Objective: ${w.level.objective}`);
    parts.push(statusText(w));
    const vis = visibleEnemies(w).length;
    parts.push(vis ? `${vis} enemy(s) visible on screen right now.` : 'No enemies visible on screen right now.');
    if (this.cfg.obsMode === 'radar') parts.push(radarText(w));
    if (this.cfg.obsMode !== 'vision') {
      parts.push('Automap (explored area):\n' + automapAscii(w, this.cfg.obsMode === 'radar'));
      parts.push(this.frontier());
    }
    // simple stuck detector
    const p = w.player;
    this.positions.push([p.x, p.y]);
    if (this.positions.length > 8) this.positions.shift();
    if (this.positions.length === 8 && this.positions.every(([x, y]) => Math.hypot(x - p.x, y - p.y) < 1.2) && !vis)
      parts.push('NOTE: you have stayed within ~1 tile of this spot for 8 turns without enemies around. Try a different direction or explore elsewhere.');
    parts.push(`Your notes: ${this.notes || '(empty)'}`);
    return parts.join('\n');
  }

  private buildMessages(obs: string, frame: string): Message[] {
    const msgs: Message[] = [{ role: 'system', content: systemPrompt(this.cfg.obsMode) }];
    const keep = this.past.slice(-this.cfg.historyTurns);
    for (const t of keep) {
      // older observations are kept as short text only (no image) to save tokens
      msgs.push({ role: 'user', content: t.user });
      msgs.push(t.assistant);
      msgs.push(t.tool);
    }
    msgs.push({ role: 'user', content: [{ type: 'text', text: obs }, { type: 'image_url', image_url: frame }] });
    return msgs;
  }

  private parseAct(tc: ToolCall | undefined, text: string): { thought: string; actions: Action[]; notes?: string } | null {
    let raw = tc?.function.arguments;
    if (!raw) {
      // fallback: model answered with JSON in plain text
      const m = /\{[\s\S]*\}/.exec(text);
      raw = m?.[0];
    }
    if (!raw) return null;
    try {
      const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const actions: Action[] = (Array.isArray(j.actions) ? j.actions : []).slice(0, 5).filter((a: Action) => a && typeof a.type === 'string');
      return { thought: String(j.thought ?? ''), actions, notes: typeof j.notes === 'string' ? j.notes : undefined };
    } catch {
      return null;
    }
  }

  private async waitWhilePaused() {
    while (this.pauseRequested && !this.stopRequested) await new Promise((r) => setTimeout(r, 200));
    if (this.status === 'paused') this.status = 'thinking';
  }

  async run() {
    this.stopRequested = false;
    this.startedAt = performance.now();
    const g = this.game;
    while (!this.stopRequested && this.turns.length < this.cfg.maxTurns) {
      await this.waitWhilePaused();
      if (this.stopRequested) break;
      // handle non-gameplay screens
      if (this.cfg.singleLevel && g.state !== 'playing') break;
      if (this.cfg.maxDeaths && g.run.deaths >= this.cfg.maxDeaths) break;
      if (g.state === 'intermission') {
        await new Promise((r) => setTimeout(r, 2500 / this.cfg.speed));
        g.advance();
        this.past = [];
        this.positions = [];
        this.notes = this.notes ? `(previous level notes, now obsolete) ${this.notes.slice(0, 120)}` : '';
        continue;
      }
      if (g.state === 'victory' || g.state === 'title') {
        this.status = 'done';
        this.onUpdate(this);
        return;
      }
      if (g.world.completeT >= 0) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      if (g.world.player.dead) {
        await new Promise((r) => setTimeout(r, 1500 / this.cfg.speed));
        g.restartLevel();
        this.past = [];
        this.pendingNote = 'YOU DIED. The level restarted from its beginning, with the inventory you had when you entered it. Learn from it: use cover, keep your health up, fight from a distance.';
        this.notes += ' | Died here once: be careful.';
        this.positions = [];
        continue;
      }

      this.status = 'thinking';
      this.onUpdate(this);
      const events = this.eventsSinceLast();
      const obsCore = this.buildObservation();
      const note = this.pendingNote ? this.pendingNote + '\n\n' : '';
      this.pendingNote = '';
      const obs = note + (events.length ? `Events since your last turn:\n- ${events.join('\n- ')}\n\n` : '') + obsCore;
      this.beforeCapture();
      const frame = captureFrame(this.screen, this.cfg.imageScale);
      const small = captureFrame(this.screen, 1, 0.7);
      const t0 = performance.now();
      const rec: TurnRecord = {
        turn: this.turns.length + 1, level: g.world.level.id, gameTime: g.world.time, frame: small, observation: obs,
        thought: '', reasoning: '', actions: [], results: [], notes: this.notes, usage: { prompt: 0, completion: 0, cached: 0 },
        latencyMs: 0, hp: g.world.player.hp, kills: g.world.stats.kills,
      };
      let resp;
      if (this.cfg.model.startsWith('bot:')) {
        // scripted baseline: no API call
        const b = this.cfg.model === 'bot:random' ? randomAct(g.world) : botAct(g.world);
        await new Promise((r) => setTimeout(r, 150 / this.cfg.speed));
        resp = {
          id: 'bot', model: this.cfg.model,
          choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant' as const, content: '', tool_calls: [{ id: 'bot' + this.turns.length, type: 'function' as const, function: { name: 'act', arguments: JSON.stringify(b) } }] } }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
      } else try {
        this.abort = new AbortController();
        resp = await chat(this.client, {
          model: this.cfg.model,
          messages: this.buildMessages(obs, frame),
          tools: [ACT_TOOL],
          tool_choice: 'any',
          parallel_tool_calls: false,
          temperature: this.cfg.temperature,
          max_tokens: this.cfg.reasoning === 'high' ? 8000 : 800,
          ...(this.cfg.reasoning === 'high' ? { reasoning_effort: 'high' as const } : {}),
        }, this.abort.signal);
      } catch (e) {
        if (this.stopRequested) break;
        this.lastError = String((e as Error).message ?? e);
        rec.error = this.lastError;
        this.status = 'error';
        this.turns.push(rec);
        this.onUpdate(this, rec);
        return;
      }
      rec.latencyMs = performance.now() - t0;
      const u = resp.usage;
      const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
      rec.usage = { prompt: u.prompt_tokens, completion: u.completion_tokens, cached };
      this.usage.prompt += u.prompt_tokens;
      this.usage.completion += u.completion_tokens;
      this.usage.cached += cached;
      const msg = resp.choices[0].message;
      const { text, thinking } = splitContent(msg.content);
      rec.reasoning = thinking;
      const tc = msg.tool_calls?.[0];
      const act = this.parseAct(tc, text);
      if (!act || !act.actions.length) {
        rec.thought = text || '(no valid action)';
        rec.error = 'No valid act() call; waiting 0.5s.';
        this.turns.push(rec);
        this.onUpdate(this, rec);
        await this.runAction({ type: 'wait', seconds: 0.5 }, true);
        continue;
      }
      rec.thought = act.thought || text;
      rec.actions = act.actions;
      if (act.notes !== undefined) this.notes = act.notes.slice(0, 600);
      rec.notes = this.notes;
      this.status = 'acting';
      this.onUpdate(this, rec);

      // execute sequentially; stop the chain after an interrupt
      for (let i = 0; i < act.actions.length; i++) {
        if (this.stopRequested) break;
        const a = act.actions[i];
        const interruptible = !['attack', 'shoot', 'turn', 'use', 'weapon'].includes(a.type);
        const r = await this.runAction(a, interruptible);
        rec.results.push(r);
        this.onUpdate(this, rec);
        if (r.interrupted || g.state !== 'playing') {
          const skipped = act.actions.length - i - 1;
          if (skipped) rec.results.push({ action: { type: 'wait' }, outcome: `${skipped} remaining action(s) skipped.`, interrupted: true, ticks: 0 });
          break;
        }
      }
      this.turns.push(rec);

      const resultText = rec.results.map((r, i) => `${i + 1}. ${JSON.stringify(r.action)} -> ${r.outcome}`).join('\n');
      const toolCallId = tc?.id ?? Math.random().toString(36).slice(2, 11);
      const assistant: Message = {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: toolCallId, type: 'function', function: { name: 'act', arguments: JSON.stringify({ thought: rec.thought, actions: rec.actions, ...(act.notes !== undefined ? { notes: act.notes } : {}) }) } }],
      };
      // past observations are stored without the bulky automap, to keep context small
      const shortObs = obs.split('\nAutomap')[0] + '\n(frame + automap omitted)';
      this.past.push({ user: shortObs, assistant, tool: { role: 'tool', tool_call_id: toolCallId, name: 'act', content: resultText } });
      if (this.past.length > 30) this.past.shift();
      this.onUpdate(this, rec);
    }
    if (this.status !== 'error') this.status = this.stopRequested ? 'stopped' : 'done';
    this.onUpdate(this);
  }

  /** Export the run for the replay viewer / benchmark. */
  exportRun() {
    const g = this.game;
    return {
      version: 1,
      date: new Date().toISOString(),
      config: this.cfg,
      usage: this.usage,
      costUSD: this.cost,
      run: g.run,
      currentLevel: g.world.level.id,
      state: g.state,
      turns: this.turns,
    };
  }
}
