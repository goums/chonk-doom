# 🐱 CHONK DOOM

**A retro DOOM-like FPS where you are Le Chonk, and a harness that lets _Mistral Large 4_ play it by itself.**

> Entry for the Mistral AI Discord challenge **"Le Chonk wants to play"** ([brief](docs/CHALLENGE.md)).

▶️ **Play it / watch Le Chonk play:** https://goums.github.io/chonk-doom/ <br>
🎬 **Video:** _coming soon_

The house has been invaded by angry dogs and mice. Le Chonk, a very large and very proud orange tabby, grabs his hairball gun.
Three levels (Le Salon → La Cuisine → La Cave), colored-collar keys, secret walls, explosive catnip barrels, a sardine shotgun,
a laser pointer, and **REX**, an armored Doberman boss. Everything (textures, sprites, the Doom-style face, music, sounds) is
generated procedurally at runtime: there are **no asset files**.

| | |
|---|---|
| **Complexity** | Real-time 3D first-person shooter: perception from raw pixels, aiming, dodging projectiles, navigation in a maze with doors/keys/secrets, resource management, a boss fight. |
| **Performance** | Headless benchmark: N episodes per level and per config with completion %, kills %, deaths and cost, plus **ablations** (vision only / + automap / + radar, reasoning on/off) and a scripted-bot baseline. See [Results](#results). |
| **Reproducibility** | Zero install: open the GitHub Pages site, paste a Mistral key and press **Let Le Chonk play**. Or run `npm run dev` / `npm run bench` locally. Every run can be saved and **replayed** step by step, including the exact frame the model saw and its thoughts. |

---

## How Le Chonk plays (the harness)

```
          ┌─────────────────────────── game is FROZEN while Le Chonk thinks ───────────────────────────┐
          │                                                                                             │
  World ──┼─► render frame (384×240, Doom-like status bar, + degree ruler) ──► JPEG ×2 upscale ──┐       │
          │                                                                                     ▼       │
          ├─► text observation: health/armor/ammo/keys, heading, events since last turn,   mistral-large-4│
          │   ASCII automap of explored tiles (+ frontier list), own notes                  (vision + tools)
          │                                                                                     │       │
          │                       act({thought, actions[1..5], notes})  ◄──────────────────────┘       │
          │                                     │                                                       │
          └──── ActionExecution: turn / move / strafe / attack / shoot / use / go_to / weapon / wait ◄──┘
                time runs only while actions execute · movement interrupted by damage or new enemies
```

### Adapting a real-time FPS to an LLM

A frontier model takes seconds to answer, while a shooter runs at 60 fps. CHONK DOOM is designed for both humans and agents:

- **Time freezes while the model thinks.** In agent mode the simulation only advances while an action executes, so latency never kills Le Chonk. Enemies still act during his actions.
- **Discrete, interruptible macro-actions.** One `act` tool call contains 1-5 actions. Movement (`move`, `strafe`, `go_to`, `wait`) is **interrupted** as soon as Le Chonk takes damage or a new enemy comes into view. The model then gets a fresh frame and decides again, like a reflex.
- **A degree ruler for vision-based aiming.** The bottom of the 3D view has a ruler (−45°…+45°, ticks every 5°, red 0 = crosshair). The model reads where an enemy stands on it and calls `attack(degrees, shots)`. This is the same "ground your answer in pixel coordinates" idea as the Mistral object-detection cookbook, made explicit in the game UI.
- **An automap + `go_to(x, y)`.** As in Doom's automap, explored tiles are shown as ASCII with coordinates, and `go_to` walks the shortest *known* path, opening unlocked doors on the way. Strategy (where to explore, which key opens what) stays with the model. Locomotion, which is tedious through an LLM, is delegated.
- **Notes as memory.** Each turn the model can rewrite a short `notes` field ("red door at (22,11), key not found yet…") that is shown back to it. Only the last 4 turns are kept in context, and only the current frame is sent as an image.
- **In-character inner monologue.** The required `thought` field is displayed as Le Chonk's speech bubble in the game, which makes runs fun to watch.

### Observation modes (for ablations)

| Mode | Frame | Status text | Automap + frontier | Enemy radar (exact angles) |
|---|---|---|---|---|
| `vision` | ✅ | ✅ | ❌ | ❌ |
| `map` (default) | ✅ | ✅ | ✅ | ❌ |
| `radar` | ✅ | ✅ | ✅ | ✅ |

In `vision` and `map` modes, **enemies are only ever perceived through the image**: the text only says how many are on screen.

### Files

| Path | What |
|---|---|
| [`src/game/world.ts`](src/game/world.ts) | Deterministic fixed-timestep simulation (player, enemy AI with flow-field pathing, hitscan, projectiles, doors, keys, secrets) |
| [`src/game/levels.ts`](src/game/levels.ts) | The 3 ASCII levels |
| [`src/engine/renderer.ts`](src/engine/renderer.ts) | Three.js renderer at 384×240, nearest-neighbour for the retro look |
| [`src/art/*`](src/art) | Procedural pixel art: textures, enemies, items, weapons, Le Chonk's face |
| [`src/audio/audio.ts`](src/audio/audio.ts) | ZzFX sound effects + a tiny 4-channel chiptune sequencer with 4 original tracks |
| [`src/agent/prompt.ts`](src/agent/prompt.ts) | System prompt + the `act` tool schema |
| [`src/agent/perception.ts`](src/agent/perception.ts) | Frame capture, ASCII automap, status, radar |
| [`src/agent/actions.ts`](src/agent/actions.ts) | Macro-action executor (interrupts, path-finding) |
| [`src/agent/agent.ts`](src/agent/agent.ts) | The observe → think → act loop, history/context management, run export |
| [`src/agent/bot.ts`](src/agent/bot.ts) | Scripted baseline bot (cheats: reads enemy positions from memory) |
| [`bench/bench.mjs`](bench/bench.mjs) | Headless Playwright benchmark runner |

---

## Setup

### Option A: no install (GitHub Pages)
1. Open https://goums.github.io/chonk-doom/
2. In **Chonk's Brain → Setup**, paste your Mistral API key (from [console.mistral.ai](https://console.mistral.ai)). It's stored only in your browser's localStorage and sent only to `api.mistral.ai`, which allows CORS.
3. Pick the observation mode / reasoning / skill and press **🐱 Let Le Chonk play**.

> The model must be `mistral-large-4` (**not** `mistral-large-latest`). Your workspace needs access to it in Mistral Studio.

### Option B: local dev
```bash
git clone https://github.com/goums/chonk-doom && cd chonk-doom
npm install
echo "MISTRAL_STUDIO_API_KEY=your_key" > .env   # used server-side by the dev proxy, never bundled
npm run dev                                     # http://localhost:5173
```
With `npm run dev`, the browser talks to a small Vite middleware (`/api/mistral`) that adds the key from `.env`, so you don't need to paste it.

### Option C: benchmark (headless)
```bash
npx playwright install chromium
npm run bench -- --models mistral-large-4 --obs map --reasoning none --levels 0,1,2 --runs 5 --parallel 3
npm run bench -- --models bot:simple --runs 5                     # scripted baseline
npm run bench -- --obs vision,map,radar --reasoning none,high     # ablations
```
Each episode is one level, capped at 150/220/260 turns and 3 deaths. Results go to `runs/<date>/`: one JSON per episode (open it with **📼 Replay a run**) plus `summary.md`.

### Playing yourself
WASD to move · mouse / ←→ to turn · click / Ctrl to fire · E / Space to use · 1-4 for weapons · Shift to run · Tab for the automap · M to mute.

---

## Results

_Benchmark in progress: the table will be filled in from `runs/*/summary.md`._

---

## How it was developed

- **Team:** 1 person ([@goums](https://github.com/goums), [uplab](https://uplab.fr)) + **Claude Code** (Anthropic) as the coding agent, which wrote most of the code from a design brief.
- **Players:** every in-game decision in agent mode is made by **Mistral Large 4** (`mistral-large-4`) via the Mistral Studio API. The scripted bot is only a baseline.
- **Open source used:**
  - [three.js](https://threejs.org) (MIT): 3D rendering
  - [ZzFX](https://github.com/KilledByAPixel/ZzFX) by Frank Force (MIT): sound effect synthesis
  - [Vite](https://vitejs.dev) + TypeScript: tooling
  - [Playwright](https://playwright.dev): headless benchmark runner
  - Fonts: *Press Start 2P* and *VT323* (Google Fonts, OFL)
- **Original work:** the game design, levels, all pixel art (drawn procedurally in code), the music (4 original chiptune tracks) and the harness. DOOM is the obvious inspiration, but no DOOM code or assets are used.
- Le Chonk's look follows the official Mistral Large 4 mascot palette.

## License
MIT
