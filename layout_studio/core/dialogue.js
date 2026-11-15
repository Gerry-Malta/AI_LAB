// Dialogue timing: where each line sits inside its shot and in the edit. Shared by subtitles, live playback and both exporters.
// A line is { who, line, audio?, dur_s?, at? }: audio is a clip path relative to the scene file, dur_s its length,
// at an explicit start inside the shot (seconds). Without audio the length is estimated from the text.

const GAP = 0.35;      // breath between two lines in the same shot
const LEAD_MAX = 0.8;  // a first line starts at most this long after the cut
const HOLD = 0.35;     // subtitles stay up a little after the voice stops

/** Seconds an actor needs for a line when there is no recorded clip (about 14 characters per second). */
export const estimateLineDuration = (text) => Math.max(0.6, String(text || '').length / 14 + 0.3);

/** Lines of one shot with start / end in shot seconds: { who, line, audio, start, end, dur, overrun }. */
export function dialogueTimeline(shot) {
  const lines = (shot && shot.dialogue) || [];
  if (!lines.length) return [];
  const D = shot.duration_s || 0;
  const durs = lines.map((d) => (d.dur_s > 0 ? d.dur_s : estimateLineDuration(d.line)));
  const total = durs.reduce((a, b) => a + b, 0) + GAP * (lines.length - 1);
  let t = Math.min(LEAD_MAX, Math.max(0.15, (D - total) * 0.3));
  return lines.map((d, i) => {
    const start = d.at != null ? +d.at : t;
    const end = start + durs[i];
    t = end + GAP;
    return { who: d.who || '', line: d.line || '', audio: d.audio || null, start, end, dur: durs[i], overrun: end > D + 1e-6, index: i };
  });
}

/** Line on screen at shot time ts (seconds): from its start until the next line or the hold ends. */
export function dialogueAt(shot, ts) {
  const tl = dialogueTimeline(shot);
  for (let i = 0; i < tl.length; i++) {
    const next = tl[i + 1] ? tl[i + 1].start : Infinity;
    if (ts >= tl[i].start - 1e-6 && ts < Math.min(next, tl[i].end + HOLD)) return tl[i];
  }
  return null;
}

/**
 * Every line of the edit (or of the listed shots, played back to back) with absolute times in seconds from the first
 * included shot: { shotId, shotName, who, line, audio, start, end, dur }. With fps, times follow the exporters' frame plan
 * (each shot gets round(duration × fps) frames, first and last on keys A and B), so a voice lands on the right frame.
 */
export function sequenceDialogue(scene, shotIds = null, fps = 0) {
  const out = []; let t0 = 0;
  for (const sh of scene.shots || []) {
    if (shotIds && !shotIds.includes(sh.id) && !shotIds.includes(sh.name)) continue;
    const D = sh.duration_s || 0, n = fps ? Math.max(1, Math.round(D * fps)) : 0;
    const at = (s) => (fps ? t0 + (D > 0 && n > 1 ? (s / D) * (n - 1) : 0) / fps : t0 + s); // shot seconds → edit seconds
    for (const l of dialogueTimeline(sh)) out.push({ shotId: sh.id, shotName: sh.name, who: l.who, line: l.line, audio: l.audio, start: at(l.start), end: at(l.start) + l.dur, dur: l.dur });
    t0 += fps ? n / fps : D;
  }
  return out;
}

/** Notes for the shot check: lines that run past the cut, shots whose lines have no recorded voice. */
export function dialogueNotes(shot) {
  const tl = dialogueTimeline(shot), notes = [];
  for (const l of tl) if (l.overrun) notes.push({ level: 'warn', msg: `"${l.line}" runs ${(l.end - (shot.duration_s || 0)).toFixed(1)} s past the cut: lengthen the shot or let it pre-lap.` });
  const missing = tl.filter((l) => !l.audio).length;
  if (missing) notes.push({ level: 'info', msg: `${missing} line${missing > 1 ? 's' : ''} without a recorded voice (timing estimated).` });
  return notes;
}
