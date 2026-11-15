// Lay the scene's sound (dialogue, spot effects, ambience beds) onto a rendered previs video with ffmpeg, on the same
// frame plan as the renderers (core/edit.js). The video stream is copied; the sound becomes AAC through a limiter.
// usage: node tools/mix_dialogue.mjs <scene.json> <video in.mp4> <video out.mp4> [--fps 24] [--shots 1A,1B]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as core from '../core/index.js';

/** Returns { placed, missing, lines } after writing out; placed = 0 means there was nothing to hear (out is not written). */
export function mixSoundInto(sceneFile, videoIn, videoOut, { fps = 24, shots = null, ffmpeg = process.env.FFMPEG || 'ffmpeg' } = {}) {
  const scene = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
  const dir = path.dirname(path.resolve(sceneFile));
  const snd = core.editSounds(scene, { fps, shotIds: shots });
  const all = [...snd.dialogue, ...snd.sfx, ...snd.ambience].filter((e) => e.file && e.start < snd.duration && e.end > 0);
  const found = all.map((e) => ({ ...e, path: path.resolve(dir, e.file) })).filter((e) => fs.existsSync(e.path));
  const missing = all.length - found.length;
  if (!found.length) return { placed: 0, missing, lines: 0 };
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.resolve(videoIn)];
  const chains = found.map((e, i) => {
    const k = i + 1, ms = (s) => Math.max(0, Math.round(s * 1000));
    if (e.kind === 'ambience') {
      args.push('-stream_loop', '-1', '-i', e.path);
      const t0 = Math.max(0, e.start), len = Math.min(snd.duration, e.end) - t0, fi = Math.min(len / 2, e.fadeIn || 0.01), fo = Math.min(len / 2, e.fadeOut || 0.01);
      const off = ((e.offset || 0) + (t0 - e.start)) % (e.dur || 1e9);
      return `[${k}:a]atrim=start=${off.toFixed(3)}:duration=${len.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:st=0:d=${fi.toFixed(3)},afade=t=out:st=${(len - fo).toFixed(3)}:d=${fo.toFixed(3)},volume=${(e.gain ?? 0.5).toFixed(3)},adelay=delays=${ms(t0)}:all=1[s${i}]`;
    }
    args.push('-i', e.path);
    const head = e.start < 0 ? `atrim=start=${(-e.start).toFixed(3)},asetpts=PTS-STARTPTS,` : ''; // a line that starts before the export
    return `[${k}:a]${head}aresample=48000,volume=${(e.gain ?? 1).toFixed(3)},adelay=delays=${ms(e.start)}:all=1[s${i}]`;
  });
  const graph = `${chains.join(';')};${found.map((_, i) => `[s${i}]`).join('')}amix=inputs=${found.length}:normalize=0:dropout_transition=0,alimiter=limit=0.89:level=false,apad[aout]`;
  args.push('-filter_complex', graph, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-shortest', '-movflags', '+faststart', path.resolve(videoOut));
  const r = spawnSync(ffmpeg, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}`);
  return { placed: found.length, missing, lines: found.filter((e) => e.kind === 'dialogue').length };
}
export const mixDialogueInto = mixSoundInto; // earlier name, kept for scripts

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
  const pos = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
  if (pos.length < 3) { console.error('usage: node tools/mix_dialogue.mjs <scene.json> <video in.mp4> <video out.mp4> [--fps 24] [--shots 1A,1B]'); process.exit(2); }
  const res = mixSoundInto(pos[0], pos[1], pos[2], { fps: +opt('fps', 24), shots: opt('shots', '') ? opt('shots', '').split(',') : null });
  console.log(res.placed ? `sound: ${res.placed} clip(s) mixed (${res.lines} dialogue lines) into ${pos[2]}${res.missing ? `, ${res.missing} file(s) missing` : ''}` : 'no sound in these shots: nothing written');
}
