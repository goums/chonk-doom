// CHONK DOOM demo video: 9 scenes, each as long as its voice-over line.
import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { loadFont as loadPixel } from '@remotion/google-fonts/PixelifySans';
import { loadFont as loadPress } from '@remotion/google-fonts/PressStart2P';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import voice from './voice.json';
import leaderboard from './leaderboard.json';
import { observation } from './observation';
import tl2 from '../public/footage/replay-2.timeline.json';
import tl3 from '../public/footage/replay-3.timeline.json';
import tl4 from '../public/footage/replay-4.timeline.json';

const PIXEL = loadPixel().fontFamily;
const PRESS = loadPress().fontFamily;
const FREDOKA = loadFredoka().fontFamily;
const INTER = loadInter().fontFamily;
const MONO = loadMono().fontFamily;

export const FPS = 30;
const C = { bg: '#241b26', panel: '#2e222f', panel2: '#3e3546', line: '#625565', ink: '#f3ecf5', muted: '#9babb2', orange: '#fb6b1d', yellow: '#f9c22b', cyan: '#30e1b9', red: '#e83b3b', blue: '#4d9be6' };

type Line = { id: string; who: string; text: string; file: string; sec: number };
const V = Object.fromEntries((voice as Line[]).map((l) => [l.id, l])) as Record<string, Line>;
const LEAD = 0.4; // seconds of silence before each line
const len = (ids: string[], pad = 0.8) => Math.round((ids.reduce((a, id) => a + V[id].sec + LEAD, 0) + pad) * FPS);

// when a given decision shows up in a recorded replay (timeline = when each turn finished)
type TL = { turn: number; sec: number }[];
const at = (tl: TL, turn: number, offset = 2.0) => (tl.find((x) => x.turn === turn - 1)?.sec ?? 0) + offset;
const CLIPS = {
  L1: 'footage/replay-2.mp4', L2: 'footage/replay-3.mp4', L3: 'footage/replay-4.mp4',
};

// ---------------------------------------------------------------- building blocks
const Footage: React.FC<{ src: string; from: number; volume?: number; dim?: number; blur?: number }> = ({ src, from, volume = 0, dim = 0, blur = 0 }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <AbsoluteFill style={{ filter: blur ? `blur(${blur}px)` : undefined }}>
      {/* the game is 16:10: show it whole, centred, over a blurred copy */}
      <OffthreadVideo src={staticFile(src)} startFrom={Math.round(from * FPS)} volume={0} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px) brightness(0.45)' }} />
    </AbsoluteFill>
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', filter: blur ? `blur(${blur}px)` : undefined }}>
      <OffthreadVideo src={staticFile(src)} startFrom={Math.round(from * FPS)} volume={volume} style={{ height: '100%', width: 'auto', boxShadow: '0 0 60px rgba(0,0,0,0.6)' }} />
    </AbsoluteFill>
    {dim > 0 && <AbsoluteFill style={{ background: `rgba(20,14,22,${dim})` }} />}
  </AbsoluteFill>
);

const Voice: React.FC<{ id: string; delay?: number }> = ({ id, delay = LEAD }) => (
  <Sequence from={Math.round(delay * FPS)} layout="none">
    <Audio src={staticFile(V[id].file)} volume={1} />
  </Sequence>
);

const Music: React.FC<{ track: string; from?: number; volume?: number }> = ({ track, from = 0, volume = 0.22 }) => {
  const { durationInFrames } = useVideoConfig();
  return <Audio src={staticFile(`music/${track}.mp3`)} startFrom={Math.round(from * FPS)} volume={(fr) => volume * Math.max(0, Math.min(1, fr / 10, (durationInFrames - fr) / 15))} />;
};

const pop = (frame: number, fps: number, delay = 0) => spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 160 } });

const Tag: React.FC<{ children: React.ReactNode; color?: string; delay?: number; style?: React.CSSProperties }> = ({ children, color = C.orange, delay = 0, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(f, fps, delay);
  return (
    <div style={{ display: 'inline-block', background: color, color: '#2e222f', fontFamily: FREDOKA, fontWeight: 700, fontSize: 44, padding: '14px 30px', borderRadius: 14, boxShadow: '0 6px 0 #160f17', transform: `scale(${s})`, ...style }}>{children}</div>
  );
};

const Caption: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const x = interpolate(pop(f, fps, 4), [0, 1], [-700, 0]);
  return (
    <div style={{ position: 'absolute', left: 60, bottom: 250, transform: `translateX(${x}px)` }}>
      <div style={{ background: C.orange, color: '#2e222f', fontFamily: PIXEL, fontSize: 64, padding: '8px 28px', borderRadius: 10, boxShadow: '0 6px 0 #160f17' }}>{text}</div>
      {sub && <div style={{ marginTop: 12, background: 'rgba(36,27,38,0.92)', color: C.ink, fontFamily: INTER, fontWeight: 600, fontSize: 32, padding: '8px 20px', borderRadius: 8, display: 'inline-block' }}>{sub}</div>}
    </div>
  );
};

const SceneTitle: React.FC<{ kicker: string; title: string }> = ({ kicker, title }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 90, top: 70, opacity: o }}>
      <div style={{ fontFamily: FREDOKA, fontWeight: 600, fontSize: 30, color: C.cyan, letterSpacing: 1 }}>{kicker}</div>
      <div style={{ fontFamily: PIXEL, fontSize: 84, color: C.orange, lineHeight: 1.05 }}>{title}</div>
    </div>
  );
};

const fadeIn = (f: number, d = 10) => interpolate(f, [0, d], [0, 1], { extrapolateRight: 'clamp' });

// ---------------------------------------------------------------- scenes
const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const face = pop(f, fps, 6);
  const logo = pop(f, fps, 18);
  return (
    <AbsoluteFill>
      <Footage src={CLIPS.L3} from={at(tl4, 17)} dim={0.55} blur={6} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
        <Img src={staticFile('img/le-chonk-angry.png')} style={{ width: 260, imageRendering: 'pixelated', transform: `scale(${face}) rotate(${interpolate(face, [0, 1], [-20, 0])}deg)`, filter: 'drop-shadow(0 12px 0 rgba(0,0,0,0.5))' }} />
        <div style={{ fontFamily: PRESS, fontSize: 120, letterSpacing: 4, transform: `scale(${logo})`, background: 'linear-gradient(180deg, #FFD800 0%, #FFAF00 30%, #FF8205 55%, #FA500F 75%, #E10500 100%)', WebkitBackgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(8px 8px 0 #3a0a00)' }}>CHONK DOOM</div>
        <div style={{ opacity: fadeIn(f - 30), fontFamily: FREDOKA, fontWeight: 600, fontSize: 46, color: C.ink, marginTop: 20 }}>
          Le Chonk plays DOOM · powered by <span style={{ color: C.orange }}>Mistral Large 4</span>
        </div>
      </AbsoluteFill>
      <Music track="title" volume={0.3} />
      <Voice id="intro" delay={1} />
    </AbsoluteFill>
  );
};

const Game: React.FC = () => {
  const d = len(['game']);
  const cuts = [
    { src: CLIPS.L1, from: at(tl2, 4), text: '3 levels', sub: 'Le Salon → La Cuisine → La Cave' },
    { src: CLIPS.L2, from: at(tl3, 2), text: 'DOOM arsenal', sub: 'laser pistol · shotgun · chaingun' },
    { src: CLIPS.L3, from: at(tl4, 6), text: 'Angry dogs & mice', sub: 'keys · locked doors · explosive barrels' },
    { src: CLIPS.L3, from: at(tl4, 18), text: 'REX', sub: 'the armored Doberman boss' },
  ];
  const each = Math.ceil(d / cuts.length);
  return (
    <AbsoluteFill>
      {cuts.map((c, i) => (
        <Sequence key={i} from={i * each} durationInFrames={each}>
          <Footage src={c.src} from={c.from} volume={0.25} />
          <Caption text={c.text} sub={c.sub} />
        </Sequence>
      ))}
      <Voice id="game" />
    </AbsoluteFill>
  );
};

const Freeze: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = observation.split('\n');
  const shown = Math.floor(interpolate(f, [15, 8 * fps], [0, lines.length], { extrapolateRight: 'clamp' }));
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <SceneTitle kicker="THE HARNESS" title="Time freezes" />
      <div style={{ position: 'absolute', left: 90, top: 260, width: 1000, transform: `scale(${pop(f, fps, 4)})`, transformOrigin: 'left top' }}>
        <Img src={staticFile('img/agent-frame.jpg')} style={{ width: 1000, borderRadius: 12, border: `4px solid ${C.line}`, imageRendering: 'pixelated' }} />
        <div style={{ position: 'absolute', right: 20, top: 20, background: C.cyan, color: '#160f17', fontFamily: FREDOKA, fontWeight: 700, fontSize: 36, padding: '8px 18px', borderRadius: 10, opacity: (Math.floor(f / 15) % 2) ? 1 : 0.65 }}>⏸ TIME FROZEN</div>
        <div style={{ fontFamily: INTER, fontSize: 26, color: C.muted, marginTop: 14 }}>The exact frame sent to the model</div>
      </div>
      <pre style={{ position: 'absolute', left: 1130, top: 260, width: 720, height: 740, margin: 0, overflow: 'hidden', background: '#160f17', border: `2px solid ${C.panel2}`, borderRadius: 12, padding: 18, whiteSpace: 'pre-wrap', fontFamily: MONO, fontSize: 16.5, lineHeight: 1.32, color: '#cfe8dc', opacity: fadeIn(f - 8) }}>
        {lines.slice(0, shown).join('\n')}
      </pre>
      <Music track="title" from={10} volume={0.14} />
      <Voice id="freeze" />
    </AbsoluteFill>
  );
};

const Ruler: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const z = interpolate(f, [0, 25], [1, 2.1], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        {/* zoom into the ruler along the bottom of the 3D view */}
        <div style={{ transform: `scale(${z})`, transformOrigin: '50% 82%' }}>
          <Img src={staticFile('img/agent-frame.jpg')} style={{ width: 1500, imageRendering: 'pixelated', borderRadius: 8 }} />
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center', opacity: fadeIn(f - 30) }}>
        <Tag delay={30} color={C.yellow}>Degree ruler: −45° … +45°</Tag>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 90, textAlign: 'center' }}>
        <Tag delay={70}>“Where is it?” → “turn −25°”</Tag>
      </div>
      <Music track="title" from={20} volume={0.14} />
      <Voice id="ruler" />
    </AbsoluteFill>
  );
};

const ACT = `act({
  thought: "Hssss! Mouse at -30°.
            Pew pew, then explore south!",
  actions: [
    { type: "attack", degrees: -30, shots: 3 },
    { type: "turn", degrees: 180 },
    { type: "explore", tiles: 24 }
  ],
  notes: "Red key unknown. Door at (5,7)."
})`;

const Act: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = Math.floor(interpolate(f, [10, 4 * fps], [0, ACT.length], { extrapolateRight: 'clamp' }));
  const run = f > 5 * fps;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <SceneTitle kicker="THE HARNESS" title="One tool call" />
      <pre style={{ position: 'absolute', left: 90, top: 270, width: 820, margin: 0, background: '#160f17', border: `2px solid ${C.panel2}`, borderRadius: 14, padding: 30, fontFamily: MONO, fontSize: 27, lineHeight: 1.45, color: C.cyan }}>
        {ACT.slice(0, chars)}<span style={{ opacity: Math.floor(f / 8) % 2 ? 1 : 0 }}>▌</span>
      </pre>
      <div style={{ position: 'absolute', left: 980, top: 270, width: 850, opacity: fadeIn(f - 20) }}>
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: `4px solid ${run ? C.orange : C.line}`, width: 850, height: 531 }}>
          <OffthreadVideo src={staticFile(CLIPS.L1)} startFrom={Math.round(at(tl2, 3) * FPS)} volume={0.35} style={{ width: 850, height: 531, filter: run ? undefined : 'grayscale(0.8) brightness(0.7)' }} />
          <div style={{ position: 'absolute', left: 16, top: 16, background: run ? C.orange : C.cyan, color: '#160f17', fontFamily: FREDOKA, fontWeight: 700, fontSize: 30, padding: '6px 16px', borderRadius: 8 }}>{run ? '▶ time runs' : '⏸ thinking…'}</div>
        </div>
        <div style={{ marginTop: 26, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Tag delay={6.5 * fps} color={C.red} style={{ fontSize: 32, color: '#fff' }}>INTERRUPTED: new enemy!</Tag>
          <Tag delay={8 * fps} color={C.yellow} style={{ fontSize: 32 }}>Plan long when calm, short in combat</Tag>
        </div>
      </div>
      <Voice id="act" />
    </AbsoluteFill>
  );
};

// real thought bubbles from the replays: two play with game sound only, the boss moments are voiced
const THINKS = [
  { id: 'q1', src: CLIPS.L2, from: at(tl3, 2), sec: 4.5 },
  { id: 'q2', src: CLIPS.L2, from: at(tl3, 6), sec: 4.5 },
  { id: 'q3', src: CLIPS.L3, from: at(tl4, 17), voice: true },
  { id: 'q4', src: CLIPS.L3, from: at(tl4, 29, 3.2), voice: true },
];
const thinkFrames = (q: (typeof THINKS)[number]) => (q.voice ? len([q.id], 0.5) : Math.round((q.sec ?? 4) * FPS));
const Thinks: React.FC = () => {
  let t = 0;
  return (
    <AbsoluteFill>
      {THINKS.map((q) => {
        const d = thinkFrames(q);
        const s = (
          <Sequence key={q.id} from={t} durationInFrames={d}>
            <Footage src={q.src} from={q.from} volume={q.voice ? 0.3 : 0.7} />
            <div style={{ position: 'absolute', right: 40, top: 250 }}><Tag color={C.cyan} style={{ fontSize: 30 }}>🐱 Le Chonk thinks · real thoughts from Mistral Large 4</Tag></div>
            {q.voice && <Voice id={q.id} delay={0.25} />}
          </Sequence>
        );
        t += d;
        return s;
      })}
    </AbsoluteFill>
  );
};

interface M { model: string; chonk: boolean; score: number; cost: number; secPerTurn: number; cleared: number; episodes: number }
const Bench: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = (leaderboard as unknown as { leagues: { id: string; models: M[] }[] }).leagues.find((l) => l.id === 'instruct')!;
  const me = L.models.find((m) => m.chonk)!;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <SceneTitle kicker="BENCHMARK · OPEN-WEIGHT MODELS · INSTRUCT LEAGUE" title="Same game, same harness" />
      <div style={{ position: 'absolute', left: 90, top: 290, width: 1150 }}>
        {L.models.map((m, i) => {
          const g = interpolate(pop(f, fps, 12 + i * 6), [0, 1], [0, m.score / 100]);
          return (
            <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 20, height: 92 }}>
              <div style={{ width: 330, textAlign: 'right', fontFamily: FREDOKA, fontWeight: m.chonk ? 700 : 500, fontSize: 36, color: m.chonk ? C.orange : C.ink }}>{m.chonk ? '🐱 ' : ''}{m.model}</div>
              <div style={{ flex: 1, height: 52, background: '#160f17', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ width: `${g * 100}%`, height: '100%', borderRadius: 8, background: m.chonk ? `linear-gradient(90deg, ${C.yellow}, ${C.orange})` : C.blue }} />
              </div>
              <div style={{ width: 90, fontFamily: PRESS, fontSize: 30, color: m.chonk ? C.yellow : C.ink }}>{Math.round(g * 100)}</div>
            </div>
          );
        })}
        <div style={{ fontFamily: INTER, fontSize: 24, color: C.muted, marginTop: 10, marginLeft: 350 }}>Chonk score: 60 for clearing a level + 40 × enemies killed · best run per level</div>
      </div>
      <div style={{ position: 'absolute', right: 90, top: 300, display: 'flex', flexDirection: 'column', gap: 26 }}>
        {[[`#1`, 'of 6 models'], [`$${me.cost.toFixed(2)}`, 'per level'], [`${me.secPerTurn.toFixed(1)} s`, 'per decision'], [`${me.cleared}/${me.episodes}`, 'levels cleared']].map(([v, l], i) => (
          <div key={l} style={{ background: C.panel, border: `2px solid ${C.panel2}`, borderRadius: 14, padding: '18px 28px', width: 420, transform: `scale(${pop(f, fps, 2.5 * fps + i * 8)})` }}>
            <div style={{ fontFamily: PRESS, fontSize: 46, color: C.yellow }}>{v}</div>
            <div style={{ fontFamily: INTER, fontSize: 26, color: C.muted, marginTop: 8 }}>{l}</div>
          </div>
        ))}
      </div>
      <Music track="living" volume={0.12} />
      <Voice id="bench" />
    </AbsoluteFill>
  );
};

const STACK = [
  ['🟦', 'TypeScript', 'no framework'], ['🧊', 'three.js', '3D, low-res pixel render'], ['🎨', 'Canvas 2D', 'all art drawn in code'], ['🎵', 'Web Audio + ZzFX', 'music & sounds in code'],
  ['🧠', 'Mistral Large 4', 'vision + function calling'], ['🔌', 'Vercel AI SDK', 'Mistral + OpenRouter'], ['🧪', 'Evalite', 'evals on staged scenes'], ['🎭', 'Playwright', 'headless benchmark'],
  ['⚡', 'Vite + GitHub Pages', 'static site, no backend'], ['🎙️', 'Voxtral TTS', 'the voices in this video'], ['📼', 'Deterministic replays', 'seed + decisions = same game'], ['📦', 'Public traces', 'every frame, every thought'],
];
const Stack: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <SceneTitle kicker="HOW IT'S BUILT" title="Tech stack" />
      <div style={{ position: 'absolute', left: 90, right: 90, top: 280, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
        {STACK.map(([ico, name, sub], i) => (
          <div key={name} style={{ background: C.panel, border: `2px solid ${C.panel2}`, borderRadius: 16, padding: '24px 26px', transform: `scale(${pop(f, fps, 6 + i * 5)})` }}>
            <div style={{ fontSize: 46 }}>{ico}</div>
            <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 36, color: C.ink, marginTop: 6 }}>{name}</div>
            <div style={{ fontFamily: INTER, fontSize: 24, color: C.muted, marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>
      <Music track="living" from={25} volume={0.12} />
      <Voice id="stack" />
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const CAST = ['cast-angry-mouse', 'cast-chihuahua', 'cast-bulldog', 'cast-rex-boss'];
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 50, marginBottom: 30 }}>
        <Img src={staticFile('img/cast-le-chonk.png')} style={{ height: 230, imageRendering: 'pixelated', transform: `scale(${pop(f, fps, 2)})` }} />
        {CAST.map((c, i) => <Img key={c} src={staticFile(`img/${c}.png`)} style={{ height: 120 + i * 30, imageRendering: 'pixelated', transform: `scale(${pop(f, fps, 8 + i * 5)})` }} />)}
      </div>
      <div style={{ fontFamily: PRESS, fontSize: 96, background: 'linear-gradient(180deg, #FFD800 0%, #FF8205 55%, #E10500 100%)', WebkitBackgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(6px 6px 0 #3a0a00)', transform: `scale(${pop(f, fps, 10)})` }}>CHONK DOOM</div>
      <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: fadeIn(f - 20) }}>
        <div style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 52, color: C.orange }}>▶ goums.github.io/chonk-doom</div>
        <div style={{ fontFamily: FREDOKA, fontWeight: 600, fontSize: 40, color: C.ink }}>github.com/goums/chonk-doom</div>
        <div style={{ fontFamily: INTER, fontSize: 28, color: C.muted, marginTop: 10 }}>Mistral AI · “Le Chonk wants to play” challenge</div>
      </div>
      <Music track="title" volume={0.3} />
      <Voice id="outro" delay={0.6} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- timeline
const SCENES: { C: React.FC; frames: number }[] = [
  { C: Intro, frames: len(['intro'], 1.6) },
  { C: Game, frames: len(['game']) },
  { C: Freeze, frames: len(['freeze']) },
  { C: Ruler, frames: len(['ruler']) },
  { C: Act, frames: len(['act'], 1.2) },
  { C: Thinks, frames: THINKS.reduce((a, q) => a + thinkFrames(q), 0) },
  { C: Bench, frames: len(['bench'], 1.2) },
  { C: Stack, frames: len(['stack'], 1.0) },
  { C: Outro, frames: len(['outro'], 3.5) },
];
export const totalFrames = SCENES.reduce((a, s) => a + s.frames, 0);

export const ChonkDoom: React.FC = () => {
  let t = 0;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {SCENES.map(({ C: Scene, frames }, i) => {
        const s = <Sequence key={i} from={t} durationInFrames={frames}><Scene /></Sequence>;
        t += frames;
        return s;
      })}
    </AbsoluteFill>
  );
};
