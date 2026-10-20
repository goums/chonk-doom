import './style.css';
import { Renderer, SCREEN_W, SCREEN_H } from './engine/renderer';
import { Game } from './game/game';
import { drawHud, drawTitle, drawIntermission, drawVictory, fmtTime } from './game/hud';
import { emptyIntent, DT, WEAPON_ORDER, SKILLS, type Intent } from './game/world';
import { initAudio, playMusic, audioSettings, applyVolumes, currentMusic } from './audio/audio';
import { ChonkAgent, type TurnRecord } from './agent/agent';
import { hasDevProxy } from './agent/mistral';
import type { ObsMode } from './agent/perception';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const screen = $<HTMLCanvasElement>('screen');
const sctx = screen.getContext('2d')!;
sctx.imageSmoothingEnabled = false;
const renderer = new Renderer();
const game = new Game();
renderer.load(game.world);
game.listeners.push((type) => {
  if (type === 'level') renderer.load(game.world);
});

type Mode = 'menu' | 'human' | 'agent' | 'replay';
let mode: Mode = 'menu';
let agent: ChonkAgent | null = null;
let showAutomap = false;

// ---------------- input ----------------
const keys = new Set<string>();
let mouseDX = 0;
let mouseFire = false;
let usePressed = false;
let weaponPressed: number | null = null;
let menuSel = 0;
const MENU = ['NEW GAME', 'LET LE CHONK PLAY', 'SKILL: ', 'SOUND: '];
let menuSkill = 1;

function menuLines() {
  return MENU.map((m, i) => (i === 2 ? m + SKILLS[menuSkill].name : i === 3 ? m + (audioSettings.muted ? 'OFF' : 'ON') : m));
}

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  initAudio();
  if (mode === 'menu' && !currentMusic()) playMusic('title');
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') { audioSettings.muted = !audioSettings.muted; applyVolumes(); }
  if (mode === 'menu') {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') menuSel = (menuSel + 1) % MENU.length;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') menuSel = (menuSel + MENU.length - 1) % MENU.length;
    if (e.code === 'Enter' || e.code === 'Space') menuPick();
    if (menuSel === 2 && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) menuSkill = (menuSkill + (e.code === 'ArrowRight' ? 1 : 3)) % 4;
    return;
  }
  if (e.code === 'Escape' && mode === 'human') toMenu();
  if (e.code === 'Tab') showAutomap = !showAutomap;
  if (e.code === 'KeyE' || e.code === 'Space') usePressed = true;
  const n = Number(e.key);
  if (n >= 1 && n <= 4) weaponPressed = n;
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
screen.addEventListener('click', () => {
  initAudio();
  if (mode === 'menu') { if (!currentMusic()) playMusic('title'); return; }
  if (mode === 'human' && document.pointerLockElement !== screen) lockPointer();
});
screen.addEventListener('mousedown', (e) => { if (e.button === 0 && document.pointerLockElement === screen) mouseFire = true; });
window.addEventListener('mouseup', () => { mouseFire = false; });
document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === screen) mouseDX += e.movementX; });
document.addEventListener('pointerlockchange', () => {
  $('click-hint').classList.toggle('hidden', !(mode === 'human' && document.pointerLockElement !== screen));
});

function humanIntent(): Intent {
  const it = emptyIntent();
  const k = (c: string) => keys.has(c);
  it.forward = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  it.strafe = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
  if (k('AltLeft') || k('AltRight')) { it.strafe += (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0); }
  else it.turn = ((k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0)) * 3.2 * DT;
  it.turn += mouseDX * 0.0032;
  mouseDX = 0;
  it.fire = mouseFire || k('ControlLeft') || k('ControlRight') || k('KeyF');
  it.run = k('ShiftLeft') || k('ShiftRight');
  it.use = usePressed;
  usePressed = false;
  if (weaponPressed) { it.weapon = WEAPON_ORDER[weaponPressed - 1]; weaponPressed = null; }
  return it;
}

// ---------------- modes ----------------
function toMenu() {
  if (agent) agent.stop();
  agent = null;
  mode = 'menu';
  game.state = 'title';
  document.exitPointerLock?.();
  playMusic('title');
  hideOverlays();
  setAgentButtons(false);
}

function hideOverlays() {
  $('bubble').classList.add('hidden');
  $('thinking').classList.add('hidden');
  $('click-hint').classList.add('hidden');
  document.getElementById('replay-bar')?.remove();
}

function menuPick() {
  if (menuSel === 0) startHuman();
  else if (menuSel === 1) startAgent();
  else if (menuSel === 2) menuSkill = (menuSkill + 1) % 4;
  else { audioSettings.muted = !audioSettings.muted; applyVolumes(); }
}

function lockPointer() {
  try {
    const r = screen.requestPointerLock() as unknown as Promise<void> | undefined;
    r?.catch?.(() => {});
  } catch { /* not allowed here */ }
}

function startHuman() {
  initAudio();
  if (agent) agent.stop();
  agent = null;
  hideOverlays();
  mode = 'human';
  game.newGame(menuSkill, Number(($('start-level') as HTMLSelectElement).value));
  lockPointer();
  $('click-hint').classList.remove('hidden');
}

// ---------------- agent panel ----------------
const keyInput = $<HTMLInputElement>('api-key');
try { keyInput.value = localStorage.getItem('chonk.mistralKey') ?? ''; } catch { /* storage blocked */ }
keyInput.addEventListener('change', () => { try { localStorage.setItem('chonk.mistralKey', keyInput.value.trim()); } catch { /* ignore */ } });
let devProxy = false;
hasDevProxy().then((ok) => { devProxy = ok; $('proxy-note').classList.toggle('hidden', !ok); });

function setAgentButtons(running: boolean) {
  ($('agent-pause') as HTMLButtonElement).disabled = !running;
  ($('agent-stop') as HTMLButtonElement).disabled = !running;
  ($('agent-export') as HTMLButtonElement).disabled = !agent;
}

function setStatus(s: string, err = false) {
  const el = $('status');
  el.textContent = s;
  el.classList.toggle('error', err);
}

function startAgent() {
  initAudio();
  const key = keyInput.value.trim();
  if (!key && !devProxy) {
    setStatus('Paste your Mistral API key first (Setup panel). Get one at console.mistral.ai.', true);
    ($('setup') as HTMLDetailsElement).open = true;
    keyInput.focus();
    return;
  }
  if (agent) agent.stop();
  hideOverlays();
  document.exitPointerLock?.();
  $('log').innerHTML = '';
  const skill = Number(($('skill') as HTMLSelectElement).value);
  mode = 'agent';
  game.newGame(skill, Number(($('start-level') as HTMLSelectElement).value), Math.floor(Math.random() * 1e6));
  agent = new ChonkAgent(game, screen, {
    model: $<HTMLInputElement>('model').value.trim() || 'mistral-large-4',
    obsMode: ($('obs') as HTMLSelectElement).value as ObsMode,
    reasoning: ($('reasoning') as HTMLSelectElement).value as 'none' | 'high',
    maxTurns: Number($<HTMLInputElement>('max-turns').value) || 400,
    skill,
    speed: Number(($('speed') as HTMLSelectElement).value),
  }, { apiKey: key || null });
  agent.onUpdate = onAgentUpdate;
  setAgentButtons(true);
  ($('setup') as HTMLDetailsElement).open = false;
  agent.run();
}

$('btn-human').addEventListener('click', startHuman);
$('btn-agent').addEventListener('click', startAgent);
$('agent-stop').addEventListener('click', () => { agent?.stop(); setAgentButtons(false); ($('agent-export') as HTMLButtonElement).disabled = false; });
$('agent-pause').addEventListener('click', () => {
  if (!agent) return;
  const paused = agent.status === 'paused';
  agent.pause(!paused);
  $('agent-pause').textContent = paused ? '⏸ Pause' : '▶ Resume';
});
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

function turnHtml(r: TurnRecord, withFrame: boolean) {
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
    ${withFrame ? `<details><summary>frame Le Chonk saw</summary><img src="${r.frame}" alt="frame"></details>` : ''}`;
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
    el.innerHTML = turnHtml(rec, true);
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

// ---------------- replay viewer ----------------
interface RunFile { config: { model: string; obsMode: string }; turns: TurnRecord[]; run: unknown; costUSD: number }
let replay: { run: RunFile; idx: number; img: HTMLImageElement; playing: boolean; t: number } | null = null;

$('btn-replay').addEventListener('click', () => ($('replay-dialog') as HTMLDialogElement).showModal());
$<HTMLInputElement>('replay-file').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  startReplay(JSON.parse(await f.text()));
  ($('replay-dialog') as HTMLDialogElement).close();
});

function startReplay(run: RunFile) {
  if (agent) agent.stop();
  agent = null;
  hideOverlays();
  mode = 'replay';
  playMusic(null);
  replay = { run, idx: 0, img: new Image(), playing: true, t: 0 };
  const bar = document.createElement('div');
  bar.id = 'replay-bar';
  bar.innerHTML = `<button class="btn small" id="rp-play">⏸</button><input type="range" id="rp-slider" min="0" max="${run.turns.length - 1}" value="0"><span id="rp-label"></span>`;
  $('stage').insertBefore(bar, $('help'));
  $('rp-play').addEventListener('click', () => { replay!.playing = !replay!.playing; $('rp-play').textContent = replay!.playing ? '⏸' : '▶'; });
  $('rp-slider').addEventListener('input', (e) => showReplayTurn(Number((e.target as HTMLInputElement).value)));
  $('log').innerHTML = '';
  showReplayTurn(0);
  setStatus(`📼 Replay: ${run.config.model}, ${run.config.obsMode} mode, ${run.turns.length} turns, $${(run.costUSD ?? 0).toFixed(2)}`);
}

function showReplayTurn(i: number) {
  if (!replay) return;
  replay.idx = i;
  replay.t = 0;
  const r = replay.run.turns[i];
  replay.img.src = r.frame;
  ($('rp-slider') as HTMLInputElement).value = String(i);
  $('rp-label').textContent = `${i + 1}/${replay.run.turns.length}`;
  const b = $('bubble');
  b.innerHTML = `<b>LE CHONK:</b> ${esc(r.thought)}`;
  b.classList.toggle('hidden', !r.thought);
  const el = document.createElement('div');
  el.className = 'turn';
  el.innerHTML = turnHtml(r, false);
  $('log').prepend(el);
  while ($('log').children.length > 60) $('log').lastElementChild!.remove();
}

// ---------------- main loop ----------------
let acc = 0;
let last = performance.now();
let titleT = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  titleT += dt;

  if (mode === 'menu') {
    drawTitle(sctx, titleT, menuLines(), menuSel, ['ARROWS + ENTER TO SELECT', 'A MISTRAL LE CHONK CHALLENGE ENTRY']);
  } else if (mode === 'replay' && replay) {
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (replay.img.complete) sctx.drawImage(replay.img, 0, 0, SCREEN_W, SCREEN_H);
    if (replay.playing) {
      replay.t += dt;
      if (replay.t > 2.2 && replay.idx < replay.run.turns.length - 1) showReplayTurn(replay.idx + 1);
    }
  } else {
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      if (mode === 'human') {
        if (game.state === 'playing') {
          const it = humanIntent();
          if (game.world.player.dead && it.use) game.advance();
          game.tick(it);
        } else {
          game.tick(emptyIntent());
          if (usePressed) { usePressed = false; game.advance(); if (game.state === 'title') toMenu(); }
        }
      } else if (mode === 'agent' && agent) {
        // time only flows while one of Le Chonk's actions is executing
        const speed = agent.cfg.speed;
        for (let i = 0; i < speed; i++) {
          if (game.state !== 'playing' || game.world.completeT >= 0 || game.world.player.dead) { game.tick(emptyIntent()); break; }
          const it = agent.tickIntent();
          if (!it) break;
          game.tick(it);
        }
      }
    }
    if (game.state === 'playing') {
      renderer.render();
      sctx.drawImage(renderer.canvas, 0, 0);
      drawHud(sctx, game.world, {
        automap: showAutomap,
        ruler: mode === 'agent',
        showMessages: true,
        agentBanner: mode === 'agent' ? `${(agent?.cfg.model ?? '').toUpperCase()} / TURN ${agent ? agent.turns.length + (agent.status === 'thinking' ? 1 : 0) : 0}` : undefined,
      });
    } else if (game.state === 'intermission') {
      drawIntermission(sctx, game.world, game.nextLevelName, game.stateT);
    } else if (game.state === 'victory') {
      const r = game.run;
      drawVictory(sctx, game.stateT, [
        `KILLS ${r.kills}/${r.totalKills}   SECRETS ${r.secrets}   DEATHS ${r.deaths}`,
        `TOTAL TIME ${fmtTime(r.time)}   SKILL ${game.skillName}`,
        agent ? `${agent.turns.length} TURNS BY ${agent.cfg.model.toUpperCase()}  $${agent.cost.toFixed(2)}` : '',
      ]);
    } else if (game.state === 'title') {
      toMenu();
    }
    const thinking = mode === 'agent' && agent && (agent.status === 'thinking') && game.state === 'playing';
    $('thinking').classList.toggle('hidden', !thinking);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Expose for automation (benchmark runner / debugging).
Object.assign(window, { chonk: { game, get agent() { return agent; }, startAgent, startHuman, startReplay } });
