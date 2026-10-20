import './style.css';
import { STYLE } from './art/style';
import { setBtn } from './icons';
import { Renderer, SCREEN_W, SCREEN_H, VIEW_H } from './engine/renderer';
import { Game } from './game/game';
import { drawHud, drawTitle, drawIntermission, drawVictory, fmtTime } from './game/hud';
import { emptyIntent, DT, WEAPON_ORDER, SKILLS, type Intent } from './game/world';
import { initAudio, playMusic, audioSettings, applyVolumes, currentMusic } from './audio/audio';
import { ChonkAgent, type TurnRecord } from './agent/agent';
import { hasDevProxy } from './agent/mistral';
import type { ObsMode } from './agent/perception';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

document.body.classList.add(STYLE.name);
// web fonts must be ready before art with text is generated
try { await Promise.race([Promise.all([document.fonts.load(`${STYLE.fontWeight} 12px '${STYLE.font}'`), document.fonts.load(`12px 'Press Start 2P'`)]), new Promise((r) => setTimeout(r, 2500))]); } catch { /* offline */ }

const screen = $<HTMLCanvasElement>('screen');
screen.width = SCREEN_W * STYLE.screen;
screen.height = SCREEN_H * STYLE.screen;
const sctx = screen.getContext('2d')!;
sctx.imageSmoothingEnabled = STYLE.smooth; // pixel style: nearest-neighbour upscale of the 3D view
sctx.setTransform(STYLE.screen, 0, 0, STYLE.screen, 0, 0);
const renderer = new Renderer();
const game = new Game();
renderer.load(game.world);
game.listeners.push((type) => {
  if (type === 'level') renderer.load(game.world);
});

type Mode = 'menu' | 'human' | 'agent';
let mode: Mode = 'menu';
let agent: ChonkAgent | null = null;
let paused = false;
let showAutomap = false;
let difficulty = 1;

// ---------------- input ----------------
const keys = new Set<string>();
let firePressed = false; // edge, for menus / respawn
let weaponPressed: number | null = null;
let menuSel = 0;
const MENU = ['NEW GAME', 'LET LE CHONK PLAY', 'DIFFICULTY: ', 'SOUND: '];

function menuLines() {
  return MENU.map((m, i) => (i === 2 ? m + SKILLS[difficulty].name : i === 3 ? m + (audioSettings.muted ? 'OFF' : 'ON') : m));
}

function setDifficulty(d: number) {
  difficulty = (d + SKILLS.length) % SKILLS.length;
  ($('difficulty') as HTMLSelectElement).value = String(difficulty);
}
$('difficulty').addEventListener('change', () => setDifficulty(Number(($('difficulty') as HTMLSelectElement).value)));

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return;
  initAudio();
  if (mode === 'menu' && !currentMusic()) playMusic('title');
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat && e.code === 'Space') return;
  keys.add(e.code);
  if (mode === 'menu') {
    if (e.code === 'ArrowDown') menuSel = (menuSel + 1) % MENU.length;
    if (e.code === 'ArrowUp') menuSel = (menuSel + MENU.length - 1) % MENU.length;
    if (e.code === 'Enter' || e.code === 'Space') menuPick();
    if (menuSel === 2 && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) setDifficulty(difficulty + (e.code === 'ArrowRight' ? 1 : -1));
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
  if (e.code === 'Tab') showAutomap = !showAutomap;
  if (e.code === 'Space' || e.code === 'Enter') firePressed = true;
  const n = Number(e.key);
  if (n >= 1 && n <= 4) weaponPressed = n;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
screen.addEventListener('click', () => {
  initAudio();
  if (mode === 'menu' && !currentMusic()) playMusic('title');
});

function humanIntent(): Intent {
  const it = emptyIntent();
  const k = (c: string) => keys.has(c);
  it.forward = (k('ArrowUp') || k('KeyW') ? 1 : 0) - (k('ArrowDown') || k('KeyS') ? 1 : 0);
  it.strafe = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
  it.turn = ((k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0)) * 3.0 * DT;
  it.fire = k('Space');
  it.run = k('ShiftLeft') || k('ShiftRight');
  it.use = k('KeyE');
  if (weaponPressed) { it.weapon = WEAPON_ORDER[weaponPressed - 1]; weaponPressed = null; }
  return it;
}

function toggleSound(force?: boolean) {
  initAudio();
  audioSettings.muted = force ?? !audioSettings.muted;
  applyVolumes();
  setBtn($('btn-sound'), audioSettings.muted ? 'soundOff' : 'soundOn', audioSettings.muted ? 'Sound Off' : 'Sound On');
  try { localStorage.setItem('chonk.muted', audioSettings.muted ? '1' : '0'); } catch { /* ignore */ }
}
$('btn-sound').addEventListener('click', () => toggleSound());
try { if (localStorage.getItem('chonk.muted') === '1') audioSettings.muted = true; } catch { /* ignore */ }
setBtn($('btn-human'), 'gamepad', 'Play Yourself');
setBtn($('btn-agent'), 'cat', 'Let Le Chonk Play');
setBtn($('btn-sound'), audioSettings.muted ? 'soundOff' : 'soundOn', audioSettings.muted ? 'Sound Off' : 'Sound On');
setBtn($('btn-github'), 'github', 'GitHub');
setBtn($('pause-btn'), 'pause', 'Pause');
setBtn($('resume-btn'), 'play', 'Resume');
setBtn($('agent-start'), 'play', 'Start Le Chonk');
setBtn($('quit-btn'), 'home', 'Quit to Menu');
setBtn($('agent-stop'), 'stop', 'Stop');
setBtn($('agent-export'), 'save', 'Save Log');

// ---------------- modes ----------------
function showBrain(show: boolean) {
  document.body.classList.toggle('brain-open', show);
}

function setPaused(p: boolean) {
  if (mode === 'menu') p = false;
  paused = p;
  $('pause-overlay').classList.toggle('hidden', !p);
  setBtn($('pause-btn'), p ? 'play' : 'pause', p ? 'Resume' : 'Pause');
  agent?.pause(p);
  if (p) keys.clear();
}
$('pause-btn').addEventListener('click', () => setPaused(!paused));
$('resume-btn').addEventListener('click', () => setPaused(false));
$('quit-btn').addEventListener('click', () => toMenu());

function toMenu() {
  if (agent) agent.stop();
  agent = null;
  mode = 'menu';
  setPaused(false);
  game.state = 'title';
  playMusic('title');
  hideOverlays();
  setAgentButtons(false);
  $('pause-btn').classList.add('hidden');
}

function hideOverlays() {
  $('bubble').classList.add('hidden');
  $('thinking').classList.add('hidden');
}

function menuPick() {
  if (menuSel === 0) startHuman();
  else if (menuSel === 1) openAgentSetup();
  else if (menuSel === 2) setDifficulty(difficulty + 1);
  else toggleSound();
}

function startHuman() {
  initAudio();
  if (agent) agent.stop();
  agent = null;
  showBrain(false);
  hideOverlays();
  setPaused(false);
  mode = 'human';
  game.newGame(difficulty, 0);
  $('pause-btn').classList.remove('hidden');
}

// ---------------- agent panel ----------------
const keyInput = $<HTMLInputElement>('api-key');
try { keyInput.value = localStorage.getItem('chonk.mistralKey') ?? ''; } catch { /* storage blocked */ }
keyInput.addEventListener('change', () => { try { localStorage.setItem('chonk.mistralKey', keyInput.value.trim()); } catch { /* ignore */ } });
let devProxy = false;
hasDevProxy().then((ok) => { devProxy = ok; $('proxy-note').classList.toggle('hidden', !ok); });

function setAgentButtons(running: boolean) {
  ($('agent-stop') as HTMLButtonElement).disabled = !running;
  ($('agent-export') as HTMLButtonElement).disabled = !agent;
}

function setStatus(s: string, err = false) {
  const el = $('status');
  el.textContent = s;
  el.classList.toggle('error', err);
}

/** "Let Le Chonk play": show the brain sidebar with its setup, ready to start. */
function openAgentSetup() {
  initAudio();
  if (mode === 'human') toMenu();
  showBrain(true);
  ($('setup') as HTMLDetailsElement).open = true;
  setStatus(devProxy || keyInput.value.trim() ? 'Ready. Press Start Le Chonk.' : 'Paste your Mistral API key, then press Start Le Chonk.');
  if (!devProxy && !keyInput.value.trim()) keyInput.focus();
}

function startAgent() {
  initAudio();
  const key = keyInput.value.trim();
  if (!key && !devProxy) {
    setStatus('Paste your Mistral API key first. Get one at console.mistral.ai.', true);
    keyInput.focus();
    return;
  }
  if (agent) agent.stop();
  showBrain(true);
  hideOverlays();
  setPaused(false);
  $('log').innerHTML = '';
  mode = 'agent';
  game.newGame(difficulty, Number(($('start-level') as HTMLSelectElement).value), Math.floor(Math.random() * 1e6));
  agent = new ChonkAgent(game, screen, {
    model: $<HTMLInputElement>('model').value.trim() || 'mistral-large-4',
    obsMode: ($('obs') as HTMLSelectElement).value as ObsMode,
    reasoning: ($('reasoning') as HTMLSelectElement).value as 'none' | 'high',
    maxTurns: Number($<HTMLInputElement>('max-turns').value) || 400,
    skill: difficulty,
    speed: Number(($('speed') as HTMLSelectElement).value),
  }, { apiKey: key || null });
  agent.onUpdate = onAgentUpdate;
  agent.beforeCapture = drawGameFrame;
  setAgentButtons(true);
  ($('setup') as HTMLDetailsElement).open = false;
  $('pause-btn').classList.remove('hidden');
  agent.run();
}

$('btn-human').addEventListener('click', startHuman);
$('btn-agent').addEventListener('click', openAgentSetup);
$('agent-start').addEventListener('click', startAgent);
$('brain-close').addEventListener('click', () => { if (mode === 'agent') toMenu(); showBrain(false); });
$('agent-stop').addEventListener('click', () => { agent?.stop(); setAgentButtons(false); ($('agent-export') as HTMLButtonElement).disabled = false; });
$('speed').addEventListener('change', () => { if (agent) agent.cfg.speed = Number(($('speed') as HTMLSelectElement).value); });
$('agent-export').addEventListener('click', () => {
  if (!agent) return;
  const blob = new Blob([JSON.stringify(agent.exportRun())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chonk-run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
});

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

function describeAction(a: TurnRecord['actions'][number]) {
  const args = Object.entries(a).filter(([k]) => k !== 'type').map(([k, v]) => `${k}=${v}`).join(' ');
  return `${a.type}${args ? ' ' + args : ''}`;
}

function turnHtml(r: TurnRecord) {
  const items = r.actions.map((a, i) => {
    const res = r.results[i];
    return `<li class="${res?.interrupted ? 'int' : ''}"><span class="act">${esc(describeAction(a))}</span>${res ? ' → ' + esc(res.outcome) : ''}</li>`;
  }).join('');
  const extra = r.results.slice(r.actions.length).map((x) => `<li class="int">${esc(x.outcome)}</li>`).join('');
  return `<header><span>#${r.turn} · ${r.level} · ${fmtTime(r.gameTime)}</span><span>${(r.latencyMs / 1000).toFixed(1)}s · ${r.usage.prompt}+${r.usage.completion} tok</span></header>
    ${r.thought ? `<div class="thought">🐱 ${esc(r.thought)}</div>` : ''}
    ${r.reasoning ? `<details><summary>reasoning</summary><div class="reasoning">${esc(r.reasoning)}</div></details>` : ''}
    ${r.error ? `<div class="err">⚠ ${esc(r.error)}</div>` : ''}
    <ol>${items}${extra}</ol>
    <details><summary>frame Le Chonk saw</summary><img src="${r.frame}" alt="frame"></details>`;
}

const turnEls = new Map<number, HTMLElement>();
function onAgentUpdate(a: ChonkAgent, rec?: TurnRecord) {
  if (rec) {
    let el = turnEls.get(rec.turn);
    if (!el || !el.isConnected) {
      el = document.createElement('div');
      el.className = 'turn';
      $('log').prepend(el);
      turnEls.set(rec.turn, el);
      while ($('log').children.length > 120) $('log').lastElementChild!.remove();
    }
    el.innerHTML = turnHtml(rec);
    if (rec.thought) {
      const b = $('bubble');
      b.innerHTML = `<b>LE CHONK:</b> ${esc(rec.thought)}`;
      b.classList.remove('hidden');
    }
  }
  const labels: Record<string, string> = {
    thinking: `🧠 Thinking… (turn ${a.turns.length + 1})`, acting: '🐾 Acting…', paused: '⏸ Paused', stopped: '⏹ Stopped',
    done: game.state === 'victory' ? '🏆 VICTORY! Le Chonk saved the house.' : '✔ Finished', idle: 'Idle', error: '⚠ ' + a.lastError,
  };
  setStatus(labels[a.status] ?? a.status, a.status === 'error');
  if (a.status === 'done' || a.status === 'error' || a.status === 'stopped') setAgentButtons(false);
  ($('agent-export') as HTMLButtonElement).disabled = false;
  renderStats();
}

function renderStats() {
  const w = game.world;
  const a = agent;
  const s = (label: string, v: string) => `<div class="stat"><b>${v}</b><span>${label}</span></div>`;
  $('stats').innerHTML = [
    s('turns', String(a?.turns.length ?? 0)),
    s('level', w.level.id),
    s('kills', `${game.run.kills + w.stats.kills}`),
    s('deaths', String(game.run.deaths)),
    s('health', `${w.player.hp}%`),
    s('tokens', a ? `${Math.round((a.usage.prompt + a.usage.completion) / 1000)}k` : '0'),
    s('cost', a ? `$${a.cost.toFixed(3)}` : '$0'),
    s('avg think', a && a.turns.length ? `${(a.turns.reduce((x, t) => x + t.latencyMs, 0) / a.turns.length / 1000).toFixed(1)}s` : '-'),
  ].join('');
}
renderStats();

// ---------------- main loop ----------------
let turboFrame = 0;
function drawGameFrame() {
  renderer.render();
  sctx.drawImage(renderer.canvas, 0, 0, SCREEN_W, VIEW_H);
  drawHud(sctx, game.world, {
    automap: showAutomap,
    ruler: mode === 'agent',
    showMessages: true,
    agentBanner: mode === 'agent' ? `${(agent?.cfg.model ?? '').toUpperCase()} / TURN ${agent ? agent.turns.length + (agent.status === 'thinking' ? 1 : 0) : 0}` : undefined,
  });
}

let acc = 0;
let last = performance.now();
let titleT = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  titleT += dt;

  if (mode === 'menu') {
    drawTitle(sctx, titleT, menuLines(), menuSel, ['ARROWS + ENTER TO SELECT', 'A MISTRAL LE CHONK CHALLENGE ENTRY']);
  } else {
    if (!paused) acc += dt;
    while (acc >= DT) {
      acc -= DT;
      if (mode === 'human') {
        if (game.state === 'playing') {
          const it = humanIntent();
          if (game.world.player.dead && firePressed) game.advance();
          game.tick(it);
        } else {
          game.tick(emptyIntent());
          if (firePressed) { game.advance(); if (game.state === 'title') toMenu(); }
        }
        firePressed = false;
      } else if (mode === 'agent' && agent) {
        // time only flows while one of Le Chonk's actions is executing
        // turbo (benchmarks): simulate as fast as possible, render only when a frame is captured
        const speed = agent.cfg.speed >= 16 ? 6000 : agent.cfg.speed;
        for (let i = 0; i < speed; i++) {
          if (game.state !== 'playing' || game.world.completeT >= 0 || game.world.player.dead) { agent.tickIntent(); game.tick(emptyIntent()); break; }
          const it = agent.tickIntent();
          if (!it) break;
          game.tick(it);
        }
      }
    }
    const turbo = mode === 'agent' && agent && agent.cfg.speed >= 16;
    if (game.state === 'playing') {
      if (!turbo || ++turboFrame % 30 === 0) drawGameFrame();
    } else if (game.state === 'intermission') {
      drawIntermission(sctx, game.world, game.nextLevelName, game.stateT);
    } else if (game.state === 'victory') {
      const r = game.run;
      drawVictory(sctx, game.stateT, [
        `KILLS ${r.kills}/${r.totalKills}   SECRETS ${r.secrets}   DEATHS ${r.deaths}`,
        `TOTAL TIME ${fmtTime(r.time)}   DIFFICULTY ${game.skillName}`,
        agent ? `${agent.turns.length} TURNS BY ${agent.cfg.model.toUpperCase()}  $${agent.cost.toFixed(2)}` : '',
      ]);
    } else if (game.state === 'title') {
      toMenu();
    }
    const thinking = mode === 'agent' && agent && agent.status === 'thinking' && game.state === 'playing' && !paused;
    $('thinking').classList.toggle('hidden', !thinking);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export interface EpisodeOptions {
  model: string; obsMode: ObsMode; reasoning: 'none' | 'high'; skill: number; level: number;
  maxTurns: number; seed: number; speed: number; maxDeaths: number; apiKey?: string;
}

/** Run one benchmark episode (one level) and resolve with the exported run. Used by bench/bench.mjs. */
async function runEpisode(o: EpisodeOptions) {
  if (agent) agent.stop();
  hideOverlays();
  showBrain(true);
  $('log').innerHTML = '';
  mode = 'agent';
  game.newGame(o.skill, o.level, o.seed);
  agent = new ChonkAgent(game, screen, {
    model: o.model, obsMode: o.obsMode, reasoning: o.reasoning, maxTurns: o.maxTurns, skill: o.skill,
    speed: o.speed, singleLevel: true, maxDeaths: o.maxDeaths,
  }, { apiKey: o.apiKey || null });
  agent.onUpdate = onAgentUpdate;
  agent.beforeCapture = drawGameFrame;
  await agent.run();
  const w = game.world;
  const completed = game.run.levelsCompleted > 0;
  return {
    ...agent.exportRun(),
    episode: {
      ...o, apiKey: undefined, completed,
      kills: completed ? game.run.kills : w.stats.kills,
      totalKills: completed ? game.run.totalKills : w.stats.totalKills,
      items: completed ? game.run.items : w.stats.items,
      totalItems: w.stats.totalItems,
      secrets: completed ? game.run.secrets : w.stats.secrets,
      deaths: game.run.deaths,
      gameTime: completed ? game.run.time : w.time,
      turns: agent.turns.length,
      hpEnd: w.player.hp,
      error: agent.status === 'error' ? agent.lastError : null,
    },
  };
}

// Expose for automation (benchmark runner / debugging).
Object.assign(window, { chonk: { game, get agent() { return agent; }, startAgent, startHuman, openAgentSetup, runEpisode } });
