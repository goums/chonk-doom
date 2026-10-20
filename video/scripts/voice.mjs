#!/usr/bin/env node
// Generates the voice-over with Voxtral TTS (Mistral Studio key from .env). Cached: only changed lines are regenerated.
//   node video/scripts/voice.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const { voices, lines } = JSON.parse(fs.readFileSync('video/voice/script.json', 'utf8'));
const OUT = 'video/public/voice';
fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const l of lines) {
  const voice = voices[l.who];
  const hash = crypto.createHash('sha1').update(`voxtral-mini-tts-3|${voice}|${l.text}`).digest('hex').slice(0, 10);
  const file = path.join(OUT, `${l.id}-${hash}.mp3`);
  if (!fs.existsSync(file)) {
    const r = await fetch('https://api.mistral.ai/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.MISTRAL_STUDIO_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voxtral-mini-tts-3', voice_id: voice, input: l.text, response_format: 'mp3' }),
    });
    const d = await r.json();
    if (!d.audio_data) throw new Error(`${l.id}: ${JSON.stringify(d).slice(0, 200)}`);
    const raw = file.replace('.mp3', '.raw.mp3');
    fs.writeFileSync(raw, Buffer.from(d.audio_data, 'base64'));
    // trim leading / trailing silence
    const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', `${trim},areverse,${trim},areverse`, '-b:a', '192k', file]);
    fs.rmSync(raw);
    console.log('generated', file);
  }
  const sec = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
  manifest.push({ id: l.id, who: l.who, text: l.text, file: path.relative('video/public', file), sec: +sec.toFixed(2) });
}
fs.writeFileSync('video/src/voice.json', JSON.stringify(manifest, null, 1));
console.log(manifest.map((m) => `${m.id.padEnd(7)} ${m.sec.toFixed(1)} s`).join('\n'));
