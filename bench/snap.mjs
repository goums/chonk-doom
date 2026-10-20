#!/usr/bin/env node
// Captures README artifacts: the exact frame + observation Le Chonk receives, and gameplay screenshots.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForFunction(() => window.chonk?.runEpisode);
await page.waitForTimeout(800);

// 0. favicon + social icon: angry Le Chonk, rendered from the in-game face art
const icons = await page.evaluate(async () => {
  const { buildFaces, FACE_W, FACE_H } = await import('/src/art/face.ts');
  const face = buildFaces().get('0_0_angry');
  const out = {};
  for (const size of [32, 64, 180, 512]) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    const k = Math.floor(size / FACE_W) || size / FACE_W;
    const w = FACE_W * k, h = FACE_H * k;
    x.drawImage(face, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
    out[size] = c.toDataURL('image/png');
  }
  return out;
});
fs.writeFileSync('public/favicon.png', Buffer.from(icons[64].split(',')[1], 'base64'));
fs.writeFileSync('public/favicon-32.png', Buffer.from(icons[32].split(',')[1], 'base64'));
fs.writeFileSync('public/apple-touch-icon.png', Buffer.from(icons[180].split(',')[1], 'base64'));
fs.writeFileSync('docs/img/le-chonk-angry.png', Buffer.from(icons[512].split(',')[1], 'base64'));

// 1. title screen
await page.screenshot({ path: 'docs/img/title.png' });

// 2. a short scripted episode, then grab the exact observation + 768x480 frame the model would get
const out = await page.evaluate(async () => {
  // replay a short scripted episode, stopping right after a movement got interrupted by enemies coming into view
  let ep;
  for (let n = 4; n <= 40; n++) {
    ep = await window.chonk.runEpisode({ model: 'bot:simple', obsMode: 'map', reasoning: 'none', skill: 1, level: 0, maxTurns: n, seed: 7, speed: 32, maxDeaths: 1 });
    const last = ep.turns[ep.turns.length - 1];
    const { visibleEnemies } = await import('/src/agent/perception.ts');
    const w = window.chonk.game.world;
    const near = visibleEnemies(w).some((e) => Math.hypot(e.x - w.player.x, e.y - w.player.y) < 7);
    if (near && last.results.some((r) => /new enemy/.test(r.outcome))) break;
  }
  const { captureFrame } = await import('/src/agent/perception.ts');
  const a = window.chonk.agent;
  a.beforeCapture();
  const frame = captureFrame(document.getElementById('screen'), 768 / document.getElementById('screen').width);
  const t = ep.turns[ep.turns.length - 1];
  // observation built at the same instant as the frame (what the next turn would receive)
  return { frame, observation: a.buildObservation(), actions: t.actions, results: t.results };
});
fs.writeFileSync('docs/img/agent-frame.jpg', Buffer.from(out.frame.split(',')[1], 'base64'));
fs.writeFileSync('docs/img/observation.txt', out.observation);
fs.writeFileSync('docs/img/turn.json', JSON.stringify({ actions: out.actions, results: out.results }, null, 2));

// 3. gameplay screenshot (human mode)
await page.evaluate(() => {
  window.chonk.startHuman();
  const w = window.chonk.game.world;
  w.player.x = 12.5; w.player.y = 3.5; w.player.angle = 0;
  w.msg('Got the red key!', 'key');
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'docs/img/gameplay.png' });
await browser.close();
await server.close();
console.log('ok');
