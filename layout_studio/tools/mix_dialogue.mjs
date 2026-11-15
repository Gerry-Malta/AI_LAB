// Lay the scene's recorded dialogue onto a rendered previs video (same frame plan as the renderers) with ffmpeg.
// usage: node tools/mix_dialogue.mjs <scene.json> <video in.mp4> <video out.mp4> [--fps 24] [--shots 1A,1B]
// Clip paths in the scene are relative to the scene file. The video stream is copied, the dialogue becomes AAC.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as core from '../core/index.js';

/** Returns { lines, placed, missing } after writing out; placed = 0 means nothing was voiced (out is not written). */
export function mixDialogueInto(sceneFile, videoIn, videoOut, { fps = 24, shots = null, ffmpeg = process.env.FFMPEG || 'ffmpeg' } = {}) {
  const scene = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
  const dir = path.dirname(path.resolve(sceneFile));
  const lines = core.sequenceDialogue(scene, shots, fps).filter((l) => l.audio);
  const found = lines.map((l) => ({ ...l, file: path.resolve(dir, l.audio) })).filter((l) => fs.existsSync(l.file));
  const missing = lines.length - found.length;
  if (!found.length) return { lines: lines.length, placed: 0, missing };
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.resolve(videoIn)];
  for (const l of found) args.push('-i', l.file);
  const chains = found.map((l, i) => `[${i + 1}:a]aresample=48000,adelay=delays=${Math.max(0, Math.round(l.start * 1000))}:all=1[d${i}]`);
  const graph = `${chains.join(';')};${found.map((_, i) => `[d${i}]`).join('')}amix=inputs=${found.length}:normalize=0:dropout_transition=0,apad[aout]`;
  args.push('-filter_complex', graph, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-shortest', '-movflags', '+faststart', path.resolve(videoOut));
  const r = spawnSync(ffmpeg, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}`);
  return { lines: lines.length, placed: found.length, missing };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
  const pos = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
  if (pos.length < 3) { console.error('usage: node tools/mix_dialogue.mjs <scene.json> <video in.mp4> <video out.mp4> [--fps 24] [--shots 1A,1B]'); process.exit(2); }
  const res = mixDialogueInto(pos[0], pos[1], pos[2], { fps: +opt('fps', 24), shots: opt('shots', '') ? opt('shots', '').split(',') : null });
  console.log(res.placed ? `dialogue: ${res.placed} line(s) mixed into ${pos[2]}${res.missing ? `, ${res.missing} clip(s) missing` : ''}` : 'no recorded dialogue in these shots: nothing written');
}
