// The edit: where each shot sits, and every sound in it (dialogue, spot effects, ambience) on one clock.
// Times are edit seconds. With fps they follow the exporters' frame plan (each shot gets round(duration × fps) frames,
// first and last on keys A and B), so a sound lands on the right frame; without fps they are plain seconds (live playback).
// Lines may start before their shot's cut (at < 0, a J-cut) or run past it (lap: true, an L-cut).
import { dialogueTimeline } from './dialogue.js';

const HOLD = 0.35; // subtitles stay up a little after the voice stops

/** Shots in edit order: { shot, start, end, frames, at(shotSeconds) → edit seconds }, plus the total duration. */
export function editPlan(scene, fps = 0, shotIds = null) {
  const shots = []; let t0 = 0;
  for (const sh of scene.shots || []) {
    if (shotIds && !shotIds.includes(sh.id) && !shotIds.includes(sh.name)) continue;
    const D = sh.duration_s || 0, n = fps ? Math.max(1, Math.round(D * fps)) : 0;
    const len = fps ? n / fps : D, k = fps ? (D > 0 && n > 1 ? (n - 1) / fps / D : 0) : 1, start = t0;
    shots.push({ shot: sh, start, end: start + len, frames: n, at: (s) => start + s * k });
    t0 += len;
  }
  return { shots, duration: t0 };
}

/**
 * Every sound of the edit, or of some shots played back to back: dialogue lines, spot effects (shot.sfx) and ambience
 * beds (scene.sound.ambience, from / to shot names, looped, faded). Events: { kind, file, start, end, dur, gain, ... }.
 */
export function editSounds(scene, { fps = 0, shotIds = null } = {}) {
  const plan = editPlan(scene, fps, shotIds);
  const dialogue = [], sfx = [], ambience = [];
  for (const p of plan.shots) {
    for (const l of dialogueTimeline(p.shot)) {
      const start = p.at(l.start);
      dialogue.push({ kind: 'dialogue', shotId: p.shot.id, shotName: p.shot.name, who: l.who, line: l.line, file: l.audio, start, end: start + l.dur, dur: l.dur, gain: l.gain ?? 1, index: l.index });
    }
    for (const e of p.shot.sfx || []) {
      if (!e.file) continue;
      const start = p.at(e.at || 0), dur = e.dur_s || 0;
      sfx.push({ kind: 'sfx', shotId: p.shot.id, shotName: p.shot.name, name: e.name || '', file: e.file, start, end: start + dur, dur, gain: e.gain ?? 1 });
    }
  }
  const full = shotIds ? editPlan(scene, fps) : plan;
  for (const a of (scene.sound && scene.sound.ambience) || []) {
    if (!a.file) continue;
    const pick = (n) => (n ? full.shots.find((p) => p.shot.name === n || p.shot.id === n) : null);
    const s0 = pick(a.from) ? pick(a.from).start : 0, s1 = pick(a.to) ? pick(a.to).end : full.duration;
    const base = { kind: 'ambience', name: a.name || '', file: a.file, gain: a.gain ?? 0.5, loop: a.loop !== false, dur: a.dur_s || 0 };
    if (!shotIds) { ambience.push({ ...base, start: s0, end: s1, offset: 0, fadeIn: a.fadeIn ?? 1, fadeOut: a.fadeOut ?? 1 }); continue; }
    for (const p of plan.shots) { // a selection gets each selected shot's slice of the bed
      const f = full.shots.find((x) => x.shot === p.shot), a0 = Math.max(s0, f.start), a1 = Math.min(s1, f.end);
      if (a1 > a0) ambience.push({ ...base, start: p.start + (a0 - f.start), end: p.start + (a1 - f.start), offset: a0 - s0, fadeIn: 0.05, fadeOut: 0.05 });
    }
  }
  return { duration: plan.duration, plan, dialogue, sfx, ambience };
}

/** The line on screen at edit time T: the most recent line that has started and is not over (plus a short hold). */
export function subtitleAt(lines, T) {
  let best = null;
  for (const l of lines) if (T >= l.start - 1e-6 && T < l.end + HOLD && (!best || l.start > best.start)) best = l;
  return best;
}
