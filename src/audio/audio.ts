// Audio: ZZFX sound effects (MIT, Frank Force) + a tiny chiptune sequencer for music.
// No audio files: everything is synthesized at runtime.
import { ZZFX } from 'zzfx';

let ctx: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode;

export const audioSettings = { sfx: 0.7, music: 0.45, muted: false };

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  ctx = new AudioContext();
  ZZFX.audioContext = ctx;
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.connect(master);
  applyVolumes();
}

export function applyVolumes() {
  if (!ctx) return;
  master.gain.value = audioSettings.muted ? 0 : 1;
  sfxBus.gain.value = audioSettings.sfx;
  musicBus.gain.value = audioSettings.music;
}

// ---------------- SFX ----------------
// ZzFX parameter lists, designed in the ZzFX sound designer.
const SFX = {
  pistol: [1.3, 0.05, 160, 0.01, 0.03, 0.15, 4, 1.6, -3, 0, 0, 0, 0, 1.4, 0, 0.2],
  shotgun: [2.2, 0.05, 90, 0.01, 0.08, 0.4, 4, 2, 0, 0, 0, 0, 0, 1.8, 0, 0.3, 0, 0.5],
  claws: [0.9, 0.1, 900, 0.02, 0.03, 0.09, 3, 0, -18, 0, 0, 0, 0, 3],
  clawHit: [1.2, 0.1, 200, 0, 0.03, 0.1, 4, 1, 0, 0, 0, 0, 0, 2],
  meow: [1, 0.1, 520, 0.03, 0.12, 0.2, 1, 2, -5, 5, 0, 0, 0, 0, 0, 0, 0, 0.7],
  meowDeath: [1.4, 0, 600, 0.05, 0.5, 0.8, 1, 2, -4, 0.5, 0, 0, 0, 0, 0, 0, 0, 0.7],
  squeak: [0.6, 0.1, 1800, 0.01, 0.04, 0.1, 0, 1, 12],
  squeakDie: [0.8, 0.1, 2200, 0.01, 0.1, 0.25, 0, 1, -20],
  bark: [1.3, 0.1, 190, 0.01, 0.06, 0.12, 2, 1.5, -6, 0, 0, 0, 0, 0.8],
  barkDie: [1.3, 0.1, 160, 0.02, 0.2, 0.4, 2, 1.5, -3, 0, 0, 0, 0, 0.8, 0, 0, 0, 0.5],
  yap: [1, 0.1, 620, 0.01, 0.03, 0.06, 2, 1, -10, 0, 0, 0, 0.06, 0.5],
  growl: [1.6, 0.1, 70, 0.05, 0.4, 0.3, 2, 2, 0, 0, 0, 0, 0.03, 1.5, 9],
  throw: [0.6, 0.1, 400, 0, 0.02, 0.08, 3, 1, 20],
  pickup: [0.9, 0.02, 700, 0, 0.04, 0.14, 0, 1, 0, 0, 260, 0.04],
  bigPickup: [1, 0.02, 520, 0, 0.1, 0.3, 0, 1, 0, 0, 390, 0.08, 0.12],
  weaponPickup: [1, 0, 260, 0.02, 0.2, 0.3, 1, 1, 0, 0, 260, 0.06, 0.08],
  key: [0.8, 0, 1600, 0, 0.05, 0.25, 0, 1, 0, 0, 400, 0.05, 0.05],
  door: [0.9, 0.05, 55, 0.08, 0.35, 0.3, 2, 1, 0.5, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.3],
  locked: [0.8, 0, 120, 0, 0.08, 0.1, 2, 1, 0, 0, 0, 0, 0.05],
  explode: [2.2, 0.1, 60, 0.01, 0.3, 0.9, 4, 1, 0, 0, 0, 0, 0, 2, 0, 0.5, 0, 0.4],
  switch: [1, 0, 440, 0, 0.1, 0.3, 1, 1, 0, 0, 440, 0.1],
  hitWall: [0.4, 0.1, 150, 0, 0.01, 0.05, 4, 1, 0, 0, 0, 0, 0, 2],
  noAmmo: [0.5, 0, 200, 0, 0.02, 0.03, 0, 1],
  secret: [1, 0, 523, 0.02, 0.2, 0.4, 1, 1, 0, 0, 262, 0.1, 0.1],
} satisfies Record<string, number[]>;

export type SfxId = keyof typeof SFX;

const cache = new Map<SfxId, Float32Array | number[]>();

/** Play a sound. pan in [-1,1], vol in [0,1] (already distance-attenuated). */
export function sfx(id: SfxId, vol = 1, pan = 0) {
  if (!ctx || vol <= 0.01) return;
  let samples = cache.get(id);
  if (!samples) {
    // build once without randomness so cached samples stay consistent
    const p = [...SFX[id]];
    samples = ZZFX.buildSamples(...p) as number[];
    cache.set(id, samples);
  }
  const buf = ctx.createBuffer(1, samples.length, ZZFX.sampleRate);
  buf.getChannelData(0).set(samples);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.94 + Math.random() * 0.12;
  const g = ctx.createGain();
  g.gain.value = vol * 0.5;
  const pn = ctx.createStereoPanner();
  pn.pan.value = Math.max(-1, Math.min(1, pan));
  src.connect(g).connect(pn).connect(sfxBus);
  src.start();
}

// ---------------- MUSIC ----------------
// A minimal 4-channel tracker: lead (square), bass (sawtooth through lowpass), arp (triangle), drums (noise).

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function freq(n: string) {
  const m = /^([A-G][#b]?)(\d)$/.exec(n);
  if (!m) return 0;
  const midi = 12 * (+m[2] + 1) + NOTE[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Track {
  bpm: number;
  // each section: channels as space-separated 16th-note steps. '.' rest, '-' hold, drums: k s h
  sections: { lead?: string; bass?: string; arp?: string; drums?: string }[];
  order: number[];
}

const R = (s: string, n: number) => Array(n).fill(s).join(' ');

export const TRACKS: Record<string, Track> = {
  // Level 1: driving E-minor metal riff
  living: {
    bpm: 152,
    sections: [
      {
        bass: 'E2 E2 E3 E2 E2 G2 E2 E2 A2 E2 E2 Bb2 E2 E2 A2 G2 E2 E2 E3 E2 E2 G2 E2 E2 D3 C3 B2 . G2 . A2 .',
        drums: 'k . h . s . h . k k h . s . h h k . h . s . h . k k h . s . s s',
      },
      {
        lead: 'E4 - - G4 - - A4 - B4 - - A4 G4 - E4 - D4 - - E4 - - G4 - A4 - - - - - . .',
        bass: 'E2 E2 E3 E2 E2 G2 E2 E2 A2 E2 E2 Bb2 E2 E2 A2 G2 C2 C2 C3 C2 C2 E2 C2 C2 D2 D2 D3 D2 D2 F#2 D2 D2',
        drums: 'k . h . s . h . k k h . s . h h k . h . s . h . k k h . s . s s',
      },
      {
        lead: 'B4 - A4 - G4 - A4 - B4 - D5 - B4 - - - C5 - B4 - A4 - G4 - A4 - - - E4 - - -',
        bass: 'G2 G2 G3 G2 G2 B2 G2 G2 A2 A2 A3 A2 A2 C3 A2 A2 C2 C2 C3 C2 C2 E2 C2 C2 B1 B1 B2 B1 B1 D#2 B1 B1',
        arp: 'G4 B4 D5 B4 G4 B4 D5 B4 A4 C5 E5 C5 A4 C5 E5 C5 C5 E5 G5 E5 C5 E5 G5 E5 B4 D#5 F#5 D#5 B4 D#5 F#5 D#5',
        drums: 'k . h h s . h . k . h h s . h k k . h h s . h . k k h . s s s s',
      },
    ],
    order: [0, 0, 1, 1, 2, 1],
  },
  // Level 2: funky D-dorian kitchen groove
  kitchen: {
    bpm: 128,
    sections: [
      {
        bass: 'D2 . D3 . . D2 C3 . D2 . F2 . G2 . A2 C3 D2 . D3 . . D2 C3 . A1 . C2 . D2 . E2 .',
        arp: R('.', 32),
        drums: 'k . h . s . h k . k h . s . h . k . h . s . h k . k h . s h s h',
      },
      {
        lead: 'A4 - C5 - D5 - . C5 D5 - F5 - E5 - D5 - C5 - A4 - G4 - A4 - - - . . . . . .',
        bass: 'D2 . D3 . . D2 C3 . D2 . F2 . G2 . A2 C3 G2 . G3 . . G2 F3 . G2 . Bb2 . A2 . G2 .',
        drums: 'k . h . s . h k . k h . s . h . k . h . s . h k . k h . s h s h',
      },
    ],
    order: [0, 1, 0, 1],
  },
  // Level 3 / boss: fast, chromatic, menacing
  rex: {
    bpm: 168,
    sections: [
      {
        bass: 'C2 C2 C3 C2 Db2 C2 C2 C3 C2 Gb2 C2 C2 F2 C2 Eb2 Db2 C2 C2 C3 C2 Db2 C2 C2 C3 C2 G2 Gb2 F2 Eb2 Db2 C2 B1',
        drums: 'k k h k s . h k k k h k s . s s k k h k s . h k k k h k s s s s',
      },
      {
        lead: 'C5 - - Eb5 - - Gb5 - F5 - Eb5 - Db5 - C5 - G5 - - Gb5 - - F5 - Eb5 - Db5 - C5 - - -',
        bass: 'C2 C2 C3 C2 Db2 C2 C2 C3 C2 Gb2 C2 C2 F2 C2 Eb2 Db2 C2 C2 C3 C2 Db2 C2 C2 C3 C2 G2 Gb2 F2 Eb2 Db2 C2 B1',
        drums: 'k k h k s . h k k k h k s . s s k k h k s . h k k k h k s s s s',
      },
    ],
    order: [0, 1, 1, 0, 1],
  },
  // Title / intermission
  title: {
    bpm: 110,
    sections: [
      {
        lead: 'E5 - B4 - G4 - B4 - E5 - F#5 - G5 - - - F#5 - E5 - D5 - B4 - A4 - B4 - - - - -',
        arp: 'E4 G4 B4 G4 E4 G4 B4 G4 C4 E4 G4 E4 C4 E4 G4 E4 D4 F#4 A4 F#4 D4 F#4 A4 F#4 B3 D#4 F#4 D#4 B3 D#4 F#4 D#4',
        bass: 'E2 - - - - - - - C2 - - - - - - - D2 - - - - - - - B1 - - - - - - -',
        drums: 'k . . . h . . . s . . . h . . . k . . . h . . . s . . . h . h .',
      },
    ],
    order: [0],
  },
};

let current: { name: string; timer: number; step: number; next: number } | null = null;
let noiseBuf: AudioBuffer | null = null;

function tone(type: OscillatorType, f: number, t: number, dur: number, vol: number, cutoff?: number) {
  if (!ctx || !f) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.setTargetAtTime(vol * 0.6, t + 0.02, 0.05);
  g.gain.setTargetAtTime(0, t + dur - 0.02, 0.015);
  let node: AudioNode = o;
  if (cutoff) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = cutoff;
    fl.Q.value = 6;
    o.connect(fl);
    node = fl;
  }
  node.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function drum(kind: string, t: number) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (kind === 'k') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + 0.2);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  if (kind === 's') {
    f.type = 'bandpass';
    f.frequency.value = 1800;
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  } else {
    f.type = 'highpass';
    f.frequency.value = 7000;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  }
  src.connect(f).connect(g).connect(musicBus);
  src.start(t);
  src.stop(t + 0.2);
}

function parse(s?: string) {
  return s ? s.trim().split(/\s+/) : [];
}

/** Count how many '-' hold steps follow index i. */
function holdLen(steps: string[], i: number) {
  let n = 1;
  while (steps[(i + n) % steps.length] === '-' && n < steps.length) n++;
  return n;
}

export function playMusic(name: keyof typeof TRACKS | null) {
  if (current) {
    clearInterval(current.timer);
    current = null;
  }
  if (!name || !ctx) return;
  const tr = TRACKS[name];
  const stepDur = 60 / tr.bpm / 4;
  const parsed = tr.sections.map((s) => ({
    lead: parse(s.lead), bass: parse(s.bass), arp: parse(s.arp), drums: parse(s.drums),
  }));
  const state = { name, timer: 0, step: 0, next: ctx.currentTime + 0.1 };
  const tick = () => {
    if (!ctx) return;
    while (state.next < ctx.currentTime + 0.25) {
      const total = state.step;
      const sec = parsed[tr.order[Math.floor(total / 32) % tr.order.length]];
      const i = total % 32;
      const t = state.next;
      const L = sec.lead[i], B = sec.bass[i], A = sec.arp[i], D = sec.drums[i];
      if (L && L !== '.' && L !== '-') tone('square', freq(L), t, stepDur * holdLen(sec.lead, i), 0.09);
      if (B && B !== '.' && B !== '-') tone('sawtooth', freq(B), t, stepDur * holdLen(sec.bass, i) * 0.9, 0.16, 900);
      if (A && A !== '.' && A !== '-') tone('triangle', freq(A), t, stepDur * 0.9, 0.07);
      if (D && D !== '.') drum(D, t);
      state.next += stepDur;
      state.step++;
    }
  };
  state.timer = window.setInterval(tick, 50);
  tick();
  current = state;
}

export function currentMusic() {
  return current?.name ?? null;
}
