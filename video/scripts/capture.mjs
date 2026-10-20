#!/usr/bin/env node
// Records replays as gameplay footage for the video (no API calls: replays re-simulate recorded runs).
// The game canvas fills a 1728x1080 viewport (16:10); Chrome's screencast frames are encoded to a 30 fps MP4.
//   node video/scripts/capture.mjs replay-2 replay-3 replay-4
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const W = 1728, H = 1080;
const OUT = path.resolve('video/public/footage');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const url = `http://127.0.0.1:${server.config.server.port ?? server.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });

for (const name of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(url + 'index.html');
  await page.addStyleTag({ content: `
    header, #brain, #stage-bar, #touchpad, #app::before { display: none !important; }
    main { padding: 0 !important; display: block !important; }
    #screen-wrap { position: fixed !important; left: 0; top: 0; width: ${W}px !important; height: ${H}px !important; max-width: none !important; border: 0 !important; box-shadow: none !important; }
    #screen { cursor: none !important; }
    #bubble { max-width: 62% !important; left: 1.5% !important; top: 2.5% !important; }
    #bubble-face { width: 96px !important; }
    #bubble-text { font-size: 27px !important; padding: 14px 20px !important; border-width: 4px !important; border-radius: 20px !important; }
    #thinking { transform: scale(1.6); }` });
  await page.waitForFunction(() => window.chonk?.startReplay);
  const run = JSON.parse(fs.readFileSync(`public/replays/${name}.json`, 'utf8'));

  const frames = [];
  const dir = path.join(OUT, `${name}-frames`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = path.join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  // record the game's own music + sound effects
  const audioT0 = await page.evaluate(() => {
    const rec = new MediaRecorder(window.chonk.audioStream(), { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
    window.__chunks = [];
    rec.ondataavailable = (e) => window.__chunks.push(e.data);
    rec.start(1000);
    window.__rec = rec;
    // turn timeline: when each decision is shown (for cutting the video on moments)
    window.__turns = [];
    let n = -1;
    setInterval(() => { const k = window.chonk.agent?.turns?.length ?? -1; if (k !== n) { n = k; window.__turns.push({ turn: k, t: Date.now() / 1000 }); } }, 50);
    return Date.now() / 1000;
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = Date.now();
  await page.evaluate((r) => window.chonk.startReplay(r), run);
  await page.waitForTimeout(2500); // linger on the end screen
  await cdp.send('Page.stopScreencast');
  const audio = await page.evaluate(() => new Promise((res) => {
    window.__rec.onstop = async () => {
      const buf = new Uint8Array(await new Blob(window.__chunks).arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      res(btoa(s));
    };
    window.__rec.stop();
  }));
  const turns = await page.evaluate(() => window.__turns);
  const webm = path.join(dir, 'audio.webm');
  fs.writeFileSync(webm, Buffer.from(audio, 'base64'));
  await page.close();

  // variable frame timing -> constant 30 fps
  const list = frames.map((fr, i) => `file '${fr.f}'\nduration ${((frames[i + 1]?.t ?? fr.t + 1 / 30) - fr.t).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).f}'\n`;
  fs.writeFileSync(path.join(dir, 'list.txt'), list);
  const mp4 = path.join(OUT, `${name}.mp4`);
  // audio started audioOffset seconds before the first video frame
  const audioOffset = Math.max(0, frames[0].t - audioT0).toFixed(3);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-ss', audioOffset, '-i', webm,
    '-map', '0:v', '-map', '1:a', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', '-shortest', mp4]);
  fs.writeFileSync(path.join(OUT, `${name}.timeline.json`), JSON.stringify(turns.filter((x) => x.turn >= 0).map((x) => ({ turn: x.turn, sec: +(x.t - frames[0].t).toFixed(2) }))));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${name}: ${frames.length} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${mp4}`);
}
await browser.close();
await server.close();
