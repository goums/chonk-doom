#!/usr/bin/env node
// Records the game's chiptune tracks (synthesized live by the game) to audio files for the video.
//   node video/scripts/music.mjs title:60 living:90 rex:40
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = path.resolve('video/public/music');
fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (const spec of process.argv.slice(2)) {
  const [track, secs] = spec.split(':');
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.chonk?.playMusic);
  const b64 = await page.evaluate(async ([track, ms]) => {
    const rec = new MediaRecorder(window.chonk.audioStream(), { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start(1000);
    window.chonk.playMusic(track);
    await new Promise((r) => setTimeout(r, ms));
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
    const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, [track, Number(secs) * 1000]);
  const webm = path.join(OUT, `${track}.webm`);
  fs.writeFileSync(webm, Buffer.from(b64, 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-b:a', '192k', path.join(OUT, `${track}.mp3`)]);
  fs.rmSync(webm);
  console.log(track, 'ok');
  await page.close();
}
await browser.close();
await server.close();
