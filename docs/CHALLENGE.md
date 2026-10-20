# Challenge brief — "Le Chonk wants to play" (Mistral AI Discord)

> Source: Mistral AI Discord announcement, copied 2026-10-20.

Le Chonk is powerful, with frontier agentic and vision capabilities we can use for computer use and
automated, complex workflows. But what about having it play games?

Our chonky cat is tired of everyone testing its capabilities with work and wants to have some fun.
Pick a game of your choice, and develop a harness allowing it to play it.

**Instructions:** using **Mistral Large 4 Preview via the Studio API under `mistral-large-4`**, develop
a harness or tooling allowing it to interact with and play a game of your own choice.

> Note: `mistral-large-latest` does **not** point to `mistral-large-4`. Be sure to use the correct one.

## Resources
- [Studio documentation](https://docs.mistral.ai/studio)
- [Object Detection Cookbook](https://colab.research.google.com/github/mistralai/cookbook/blob/main/mistral/image_understanding/bbox_getstarted.ipynb)
- Coupon `CHALLENGE-OCTOBER-2026`: 20 free credits for the first 10 users (org admin + billing info required)
- [Challenge rules](https://mistr.al/le-chonk-challenge)

## Rewards
- **Mistral AI winner:** 250 credits + swag
- **Mistral AI 2nd:** 50 credits + swag
- **Community winner:** temporary Discord role + more swag

## Evaluation
- ~~**Fun:** how much fun did Le Chonk have?~~ (struck from the brief)
- **Complexity:** how complex and hard is the task?
- **Performance:** how well does the model perform with this harness?
- **Reproducibility:** how easily can someone follow the instructions and set up the harness?

## Submission
- The challenge runs for 2 weeks and **ends Thursday 2026-10-29 at 23:59 CET**.
- Post in the Discord submissions channel (nothing unrelated).
- The submission must include:
  - a **video showcasing the solution** (also used for community voting)
  - a **GitHub repo** with all the code and a full README explaining setup
  - **how the solution was developed** (how many people, what tools, which OSS projects it builds on)
- Community voting: up-arrow reactions in the submissions channel. The top 3 community and Mistral
  favorites go to a final Discord poll.
- Winners are contacted in the Discord channel within 24h after the end of the event, then privately.

---

# Competing submissions (benchmark to beat)

## 1. "Fish Heist" — exploit discovery
- Game built in a custom framework; **Large 4 built the game itself with Vibe** and Claude Code ran and analysed the challenge.
- The game has a deliberate "bug" that makes the player lose over and over, plus an exploit in the game code.
  Le Chonk **found the exploit by itself** and cheated to win.
- Site: https://le-chonk-challenge.netlify.app/ · video slideshow: https://youtu.be/T7SyhaccN2A
- Strengths: a striking emergent-behavior story.
  Weaknesses: a simple game, an engineered scenario, and no quantitative performance numbers.

## 2. "le-chonk-crafter" — Crafter (2D Minecraft-like survival)
- Every turn: the **game frame as an image + a text map of the tiles on screen + its own notes from last turn**.
  It reasons, then calls one `act` tool with its next few moves. No scripted policy, every decision is Large 4.
- **Crafter score ≥ 43.7% over 5 runs** (GPT-4 agent 27.3%, human experts 50.5% on the official scoreboard).
  Best run reached an iron pickaxe.
- **Ablations:** without the text map (screenshot + stats only) ≥ 38.9%; reasoning off roughly halves the score.
- Fun anecdote: it walked into lava right after reasoning it should be careful about lava.
- **Step-by-step replay site** of its thinking: https://raylitebull.github.io/le-chonk-crafter/
- Code: https://github.com/raylitebull/le-chonk-crafter. Built by one person with Claude Code + Codex on top of the open-source Crafter game.
- Strengths: rigorous evaluation (multi-run score, ablations, external baseline), a replay viewer, strong reproducibility.

## What CHONK DOOM has to beat them on
| Criterion | Our answer |
|---|---|
| Complexity | Real-time 3D FPS (first-person vision, aiming, navigation, combat, keys/doors, multiple levels, boss) vs 2D grid games |
| Performance | **Quantitative eval:** N runs per config, with level completion %, kills %, secrets, deaths, turns and $ cost; **ablations** (vision-only vs automap vs entity radar, reasoning on/off); a scripted-bot and a human baseline |
| Reproducibility | Runs fully in the browser on GitHub Pages: paste a Mistral key and press "Let Le Chonk play". Plus a headless CLI benchmark (`npm run bench`) |
| Showcase | Live "Chonk's brain" panel (thoughts, tool calls, the exact frame the model saw), **replay viewer** of recorded runs, emergent anecdotes |
| Originality | Our own game (Doom-like, Le Chonk is the hero, Doom-style face HUD), original art + music, all procedurally generated |
