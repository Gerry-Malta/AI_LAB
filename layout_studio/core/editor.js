// Film editor: reads the cut the way an editor does. What can be measured is measured — eye-trace across each cut,
// the 30° rule and jump cuts, the 180° line, eyelines that meet, screen direction of movement, cutting in movement,
// sound bridging the cut (J / L), how long each shot needs to be read, and the rhythm of the whole (ASL, variation,
// acceleration). Emotion and story — the first two of Murch's six criteria — stay with the editor: the report gives them
// the evidence. Sources and the method are in .claude/skills/film-editor/references.
import { dist, round, clamp, toDeg } from './vec.js';
import { solveShot } from './shot.js';
import { blockingAt } from './blocking.js';
import { dialogueTimeline } from './dialogue.js';
import { editPlan, editSounds } from './edit.js';
import { composition } from './dp.js';
import { resolveSubject } from './metrics.js';
import { keypoints } from './standin.js';

const SIZE_ORDER = ['EWS', 'WS', 'FS', 'MLS', 'MS', 'MCU', 'CU', 'BCU', 'ECU'];
const sizeIndex = (s) => (s === 'INSERT' ? 6 : SIZE_ORDER.indexOf(s));

/**
 * Seconds an audience needs to read a shot of each size the first time (orientation for wide frames, a face or an
 * object for close ones). Working values from editing practice, not a law: a known place or face reads faster.
 */
export const READ_TIME = { EWS: 3.0, WS: 2.4, FS: 2.0, MLS: 1.8, MS: 1.6, MCU: 1.3, CU: 1.1, BCU: 0.9, ECU: 0.8, INSERT: 1.2 };
/** Average shot length ranges by tempo (seconds). Contemporary features average 3–4 s; dialogue drama runs longer. */
export const TEMPO = { contemplative: [6, 12], drama: [4, 7], dialogue: [3, 6], tension: [2, 4], action: [1.2, 3] };
/** Murch's rule of six, as weights. Only the last four can be measured; emotion and story are judged by the editor. */
export const RULE_OF_SIX = { emotion: 51, story: 23, rhythm: 10, eyeTrace: 7, plane: 5, space: 4 };

const horizAngle = (c, a, b) => { // angle at c between c→a and c→b, seen from above
  const ax = a[0] - c[0], az = a[2] - c[2], bx = b[0] - c[0], bz = b[2] - c[2];
  const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
  return toDeg(Math.acos(clamp((ax * bx + az * bz) / (la * lb), -1, 1)));
};
const attention = (an) => (an && an.subject ? (an.subject.eyes || an.subject.center) : null) || [0.5, 0.5];
const sideOf = (A, B, p) => Math.sign((B[0] - A[0]) * (p[2] - A[2]) - (B[2] - A[2]) * (p[0] - A[0]));

/** What each shot has to carry, and how long that takes: lines, the camera move, the action, reading the frame. */
export function shotTiming(scene, shot, opts = {}) {
  const D = shot.duration_s || 0;
  const lines = dialogueTimeline(shot);
  const spokenIn = lines.filter((l) => !l.prelap || l.end > 0);
  // a line that runs past the cut on purpose (L-cut) only needs its first second on the speaker; the others must land
  const lastLine = spokenIn.length ? Math.max(...spokenIn.map((l) => (l.lap ? Math.min(l.end, l.start + 1.0) : l.end))) : 0;
  const landed = spokenIn.filter((l) => !l.lap);
  const lineNeed = landed.length ? Math.max(...landed.map((l) => l.end)) + 0.35 : 0;
  const moves = shot.rig && shot.rig.type !== 'static' && shot.keys && shot.keys.B;
  const moveEnd = moves ? (Array.isArray(shot.move) ? +(shot.move[1] ?? D) : D) : 0;
  const acts = shot.beatB && shot.beatB !== (shot.beatA || shot.beat);
  const a = shot.action, actionEnd = acts ? (Array.isArray(a) ? +(a[1] ?? D) : a && typeof a === 'object' ? Math.max(...Object.values(a).map((w) => +(w[1] ?? D))) : D) : 0;
  const firstLook = opts.firstLook ? 1.0 : 0; // the first time a place or a face is seen it needs a little longer
  const read = (READ_TIME[shot.size] || 1.5) + firstLook;
  const need = Math.max(read, lineNeed, lastLine, moveEnd && moveEnd < D ? moveEnd + 0.3 : moveEnd ? D : 0, actionEnd ? Math.min(D, actionEnd + 0.2) : 0);
  const events = [...lines.map((l) => l.end), ...(shot.sfx || []).map((e) => (e.at || 0) + (e.dur_s || 0) * 0.3), moveEnd || 0, actionEnd || 0].filter((x) => x > 0);
  const lastEvent = events.length ? Math.min(D, Math.max(...events)) : 0;
  return { id: shot.id, name: shot.name || shot.id, size: shot.size, duration: D, read: round(read, 2), lastLine: round(lastLine, 2), moveEnd: round(moveEnd, 2), actionEnd: round(actionEnd, 2), need: round(need, 2), hold: round(D - Math.max(lastEvent, read), 2), lines: lines.length, j: lines.filter((l) => l.prelap).length, l: lines.filter((l) => l.lap).length };
}

/** One cut, A → B, measured at A's last frame and B's first. */
export function cutReview(scene, A, B, opts = {}) {
  const solvedA = solveShot(scene, A), solvedB = solveShot(scene, B);
  const pA = solvedA.pose(1), pB = solvedB.pose(0);
  const blA = blockingAt(scene, A, 1), blB = blockingAt(scene, B, 0);
  const anA = composition(scene, A, pA, blA), anB = composition(scene, B, pB, blB);
  const notes = [];
  const note = (level, rule, msg, fix = '', cost = 0) => notes.push({ level, rule, msg, fix, cost });
  // eye-trace: where the eye is at the end of A and where it has to go at the start of B (frame diagonal units)
  const ea = attention(anA), eb = attention(anB), asp = (A.camera && A.camera.aspect) || 2.39;
  const eyeTrace = Math.hypot((ea[0] - eb[0]) * asp, ea[1] - eb[1]) / Math.hypot(asp, 1);
  const quick = Math.min(A.duration_s || 0, B.duration_s || 0) < 1.6;
  if (eyeTrace > 0.42) note(quick ? 'warn' : 'info', 'eyeTrace', `The eye has to jump ${Math.round(eyeTrace * 100)}% of the frame across the cut (${pct(ea[0])},${pct(ea[1])} → ${pct(eb[0])},${pct(eb[1])})${quick ? ' on a quick cut' : ''}.`, 'reframe B so its point of interest lands nearer where A leaves the eye, or give B a beat longer', quick ? 6 : 3);
  const res = { from: A.name || A.id, to: B.name || B.id, eyeTrace: round(eyeTrace, 2), attention: [ea, eb], notes };
  // same subject: 30° rule and size step (jump cut), axial cuts accepted
  const subjA = resolveSubject(scene, A, blA), subjB = resolveSubject(scene, B, blB);
  const same = subjA && subjB && subjA.id === subjB.id;
  const step = Math.abs(sizeIndex(A.size) - sizeIndex(B.size));
  res.sizeStep = sizeIndex(A.size) >= 0 && sizeIndex(B.size) >= 0 ? sizeIndex(B.size) - sizeIndex(A.size) : null;
  if (same && subjA.kind === 'standin') {
    const c = keypoints(subjA).chest;
    const ang = horizAngle(c, pA.position, pB.position);
    res.angleChange = round(ang, 0);
    if (ang < 30 && step < 2) note(ang < 12 && step === 0 ? 'bad' : 'warn', 'space', `Jump cut on ${subjA.name}: the camera moves ${Math.round(ang)}° and the size ${step ? 'one step' : 'not at all'} (30° rule).`, ang < 12 ? 'change the size two steps (an axial cut) or move the camera 30°+ round the subject' : `move B ${Math.ceil(30 - ang)}° further round, or change the size two steps`, ang < 12 && step === 0 ? 12 : 7);
    else if (ang < 10 && step >= 2) res.axial = true;
  }
  // 180° line: both shots on the same side of the axis
  const line = A.line && B.line && A.line.join() === B.line.join() ? A.line : null;
  if (line) {
    const P = (id, bl) => { const o = scene.objects.find((x) => x.id === id); return ((bl[id] || {}).position) || (o && o.position); };
    const a1 = P(line[0], blA), a2 = P(line[1], blA), b1 = P(line[0], blB), b2 = P(line[1], blB);
    if (a1 && a2 && b1 && b2) {
      const sA = sideOf(a1, a2, pA.position), sB = sideOf(b1, b2, pB.position);
      res.lineSide = [sA, sB];
      if (sA && sB && sA !== sB) note('warn', 'plane', `${A.name} → ${B.name} crosses the line between ${line.join(' and ')}: screen positions flip.`, 'keep B on the same side of the axis, or show the move across the line (a neutral axial shot, a character crossing)', 8);
    }
  }
  // eyelines: in shot / reverse shot the two looks must point at each other
  const gA = anA.subject && anA.subject.gaze, gB = anB.subject && anB.subject.gaze;
  if (subjA && subjB && !same && subjA.kind === 'standin' && subjB.kind === 'standin' && line && line.includes(subjA.id) && line.includes(subjB.id) && gA && gB && gA !== 'camera' && gB !== 'camera') {
    res.eyelines = gA !== gB ? 'meet' : 'parallel';
    if (gA === gB) note('warn', 'plane', `Eyelines do not meet: both look screen-${gA} across the cut.`, 'put B on the other side of the line or swap the look room', 6);
  }
  // movement across the cut: a character moving at the end of A and at the start of B should keep its screen direction
  const moving = [];
  for (const o of (scene.objects || []).filter((x) => x.kind === 'standin')) {
    const pa0 = (blockingAt(scene, A, 0.94)[o.id] || {}).position, pa1 = (blA[o.id] || {}).position, pb0 = (blB[o.id] || {}).position, pb1 = (blockingAt(scene, B, 0.06)[o.id] || {}).position;
    if (!pa0 || !pa1 || !pb0 || !pb1) continue;
    const va = dist(pa0, pa1) / Math.max(0.05, 0.06 * (A.duration_s || 1)), vb = dist(pb0, pb1) / Math.max(0.05, 0.06 * (B.duration_s || 1));
    if (va < 0.15 || vb < 0.15) continue;
    // screen direction of the travel: + is screen-right (the camera's right vector is forward × up)
    const du = (pose, p0, p1) => { const f = [pose.target[0] - pose.position[0], 0, pose.target[2] - pose.position[2]]; const r = [-f[2], 0, f[0]]; return Math.sign(r[0] * (p1[0] - p0[0]) + r[2] * (p1[2] - p0[2])); };
    const dA = du(pA, pa0, pa1), dB = du(pB, pb0, pb1);
    moving.push({ id: o.id, name: o.name || o.id, dirA: dA, dirB: dB });
    if (dA && dB && dA !== dB) note('warn', 'plane', `${o.name || o.id} moves screen-${dA > 0 ? 'right' : 'left'} in ${A.name} and screen-${dB > 0 ? 'right' : 'left'} in ${B.name}: screen direction flips.`, 'keep the direction of travel across the cut', 7);
  }
  res.cutInMovement = moving.length > 0;
  // camera still travelling at the cut into a still frame
  const pA0 = solvedA.pose(Math.max(0, 1 - 0.25 / Math.max(0.5, A.duration_s || 1)));
  const camSpeed = dist(pA0.position, pA.position) / 0.25;
  const bMoves = B.rig && B.rig.type !== 'static' && B.keys && B.keys.B;
  res.cameraMovingAtCut = camSpeed > 0.08;
  if (res.cameraMovingAtCut && !bMoves && !res.cutInMovement) note('info', 'rhythm', `${A.name} is still travelling (${round(camSpeed, 2)} m/s) when it cuts to a still ${B.name}.`, 'let the move settle before the cut (move window) or cut on an action', 2);
  // sound across the cut
  const plan = opts.plan || editPlan(scene);
  const pa = plan.shots.find((p) => p.shot === A), cutT = pa ? pa.end : null;
  const snd = opts.sounds || editSounds(scene);
  const bridging = cutT == null ? [] : snd.dialogue.filter((d) => d.start < cutT - 0.05 && d.end > cutT + 0.05);
  res.soundBridge = bridging.map((d) => ({ who: d.who, kind: d.shotName === A.name ? 'L' : 'J' }));
  const endA = cutT == null ? [] : snd.dialogue.filter((d) => d.shotName === A.name && d.end <= cutT + 0.01 && d.end > cutT - 0.2);
  const startB = cutT == null ? [] : snd.dialogue.filter((d) => d.shotName === B.name && d.start >= cutT - 0.01 && d.start < cutT + 0.15);
  if (endA.length && !bridging.length) note('info', 'rhythm', `The line "${clip(endA[0].line)}" ends right on the cut: no room for it to land.`, 'hold A 0.3–0.6 s, or let the next shot take the end of the line (L-cut)', 3);
  if (startB.length && !bridging.length && endA.length) note('info', 'rhythm', `B's line starts on the first frame: a radio-play cut.`, 'pre-lap B\'s line under the end of A (J-cut) or give B a beat of reaction first', 2);
  // the reaction: B shows someone who is listening while another speaks
  const speakingAtB = cutT == null ? null : snd.dialogue.find((d) => d.start <= cutT + 0.3 && d.end > cutT + 0.3);
  if (speakingAtB && subjB && subjB.kind === 'standin' && speakingAtB.who && !String(subjB.name || '').toUpperCase().includes(String(speakingAtB.who).toUpperCase().split(' ')[0])) res.reaction = { listener: subjB.name, speaker: speakingAtB.who };
  // the measurable part of the rule of six (rhythm, eye-trace, plane, space), as a score
  const W = { rhythm: RULE_OF_SIX.rhythm, eyeTrace: RULE_OF_SIX.eyeTrace, plane: RULE_OF_SIX.plane, space: RULE_OF_SIX.space }, tot = W.rhythm + W.eyeTrace + W.plane + W.space;
  const lost = { rhythm: 0, eyeTrace: 0, plane: 0, space: 0 };
  for (const n of notes) if (lost[n.rule] != null) lost[n.rule] = Math.min(1, lost[n.rule] + n.cost / 10);
  res.craft = Math.round(100 * (1 - Object.entries(lost).reduce((a, [k, v]) => a + (W[k] / tot) * v, 0)));
  return res;
}
const pct = (x) => `${Math.round(x * 100)}%`;
const clip = (s, n = 38) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

/** Statistics of the rhythm: ASL, median, variation, the stretch of the scene that runs fastest, acceleration. */
export function pacing(durations, tempo) {
  const n = durations.length;
  if (!n) return null;
  const sum = durations.reduce((a, b) => a + b, 0), asl = sum / n;
  const sorted = [...durations].sort((a, b) => a - b), median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const sd = Math.sqrt(durations.reduce((a, b) => a + (b - asl) ** 2, 0) / n), cv = sd / (asl || 1);
  const win = Math.min(5, n), rolling = durations.map((_, i) => { const a = Math.max(0, i - Math.floor(win / 2)), b = Math.min(n, a + win); const s = durations.slice(a, b); return round(s.reduce((x, y) => x + y, 0) / s.length, 2); });
  const third = Math.max(1, Math.floor(n / 3));
  const head = durations.slice(0, third), tail = durations.slice(n - third);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  // monotone stretches: 4+ consecutive shots within ±15% of each other read as a metronome
  const runs = []; let start = 0;
  for (let i = 1; i <= n; i++) {
    const same = i < n && Math.abs(durations[i] - durations[i - 1]) <= 0.15 * Math.max(durations[i], durations[i - 1]);
    if (!same) { if (i - start >= 4) runs.push([start, i - 1]); start = i; }
  }
  const out = { shots: n, total: round(sum, 2), asl: round(asl, 2), median: round(median, 2), sd: round(sd, 2), cv: round(cv, 2), min: round(sorted[0], 2), max: round(sorted[n - 1], 2), rolling, accel: round(mean(head) / Math.max(0.1, mean(tail)), 2), monotone: runs };
  if (tempo && TEMPO[tempo]) out.tempo = { id: tempo, range: TEMPO[tempo], ok: asl >= TEMPO[tempo][0] && asl <= TEMPO[tempo][1] };
  return out;
}

/**
 * Edit review of a scene: every shot's timing against what it carries, every cut, the rhythm of the whole.
 * opts: { tempo: 'drama' | 'dialogue' | ..., shots: [ids or names] }.
 */
export function editReview(scene, opts = {}) {
  const shots = (scene.shots || []).filter((s) => !opts.shots || opts.shots.includes(s.id) || opts.shots.includes(s.name));
  const tempo = opts.tempo || (scene.edit && scene.edit.tempo) || null;
  const plan = editPlan(scene), sounds = editSounds(scene);
  const seen = new Set();
  const timing = shots.map((s) => {
    const key = s.size === 'EWS' || s.size === 'WS' ? 'place' : s.subject;
    const first = key && !seen.has(key); if (key) seen.add(key);
    return shotTiming(scene, s, { firstLook: first && ['EWS', 'WS', 'FS'].includes(s.size) });
  });
  const notes = [];
  const note = (level, rule, shot, msg, fix = '') => notes.push({ level, rule, shot, msg, fix });
  // the real silence inside each shot, on the edit clock: lines lapped in from the shot before and pre-lapped from the
  // shot after count, and so do the effects
  const sound = [...sounds.dialogue, ...sounds.sfx].map((e) => [e.start, e.end]);
  for (const t of timing) {
    const p = plan.shots.find((x) => x.shot.id === t.id); if (!p) continue;
    const iv = sound.filter(([a, b]) => b > p.start && a < p.end).map(([a, b]) => [Math.max(a, p.start), Math.min(b, p.end)]).sort((x, y) => x[0] - y[0]);
    let cur = p.start, longest = 0;
    for (const [a, b] of iv) { longest = Math.max(longest, a - cur); cur = Math.max(cur, b); }
    longest = Math.max(longest, p.end - cur);
    t.silence = round(longest, 2);
  }
  for (const t of timing) {
    if (t.duration + 1e-6 < t.need - 0.05) note(t.duration < t.need - 0.6 ? 'warn' : 'info', 'timing', t.name, `${t.duration}s is short for what it carries (needs about ${t.need}s: ${[t.lastLine ? `line to ${t.lastLine}s` : '', t.moveEnd ? `move to ${t.moveEnd}s` : '', t.actionEnd ? `action to ${t.actionEnd}s` : '', `reading ${t.read}s`].filter(Boolean).join(', ')}).`, `extend by ${round(t.need - t.duration, 1)}s, or pre-lap / overlap the line`);
    if (t.hold > 3.5 && (t.silence ?? t.hold) > 3.5 && !t.moveEnd && !t.actionEnd) note('info', 'timing', t.name, `${t.silence ?? t.hold}s of silence in this shot: a long hold.`, 'keep it if the moment is the emotion (a silence that lands); otherwise trim');
  }
  const cuts = [];
  for (let i = 0; i + 1 < shots.length; i++) cuts.push(cutReview(scene, shots[i], shots[i + 1], { plan, sounds }));
  const pace = pacing(shots.map((s) => s.duration_s || 0), tempo);
  if (pace) {
    if (pace.cv < 0.35 && pace.shots >= 6) note('warn', 'rhythm', null, `Durations vary little (CV ${pace.cv}): the cutting reads as a metronome.`, 'let the story set lengths: hold the reactions that matter, quicken the connective shots');
    for (const [a, b] of pace.monotone) note('info', 'rhythm', `${shots[a].name}–${shots[b].name}`, `${b - a + 1} shots in a row of almost the same length (${shots.slice(a, b + 1).map((s) => s.duration_s).join(', ')} s).`, 'vary them with the content of each shot');
    // a short scene is not a sample of a tempo: judge its average only from eight shots up
    if (pace.tempo && !pace.tempo.ok && pace.shots >= 8) note('info', 'rhythm', null, `ASL ${pace.asl}s is outside the ${pace.tempo.id} range ${pace.tempo.range.join('–')}s.`, pace.asl > pace.tempo.range[1] ? 'tighten the connective shots' : 'if the key moments are cut short, let them breathe (never pad the connective shots)');
  }
  const js = timing.reduce((a, t) => a + t.j, 0), ls = timing.reduce((a, t) => a + t.l, 0), lines = timing.reduce((a, t) => a + t.lines, 0);
  const bridged = cuts.filter((c) => c.soundBridge.length).length;
  const reactions = cuts.filter((c) => c.reaction).length;
  const craft = cuts.length ? Math.round(cuts.reduce((a, c) => a + c.craft, 0) / cuts.length) : 100;
  const timingOk = timing.filter((t) => t.duration + 1e-6 >= t.need - 0.05).length / Math.max(1, timing.length);
  const score = Math.round(0.6 * craft + 30 * timingOk + (pace && pace.cv >= 0.35 ? 10 : pace ? 10 * (pace.cv / 0.35) : 10));
  return { score, craft, pacing: pace, timing, cuts, notes, dialogue: { lines, j: js, l: ls, cutsBridged: bridged, reactions }, duration: round(plan.duration, 2) };
}

/** Markdown edit report for the editor's review and the crew. */
export function editReviewMarkdown(scene, rep) {
  const p = rep.pacing || {};
  const L = [`# Edit report · ${scene.project || ''} ${(scene.scene && scene.scene.name) || ''}`.trim(), '',
    `**${rep.score}/100** · craft of the cuts ${rep.craft}/100 (the measurable part of Murch's rule of six: rhythm, eye-trace, the 2D plane, 3D space — emotion and story are judged by the editor).`, '',
    `${p.shots} shots · ${rep.duration}s · ASL ${p.asl}s (median ${p.median}s, CV ${p.cv}, ${p.min}–${p.max}s)${p.tempo ? ` · tempo ${p.tempo.id} ${p.tempo.ok ? '✓' : '✗'}` : ''} · first third vs last third ${p.accel}× · dialogue ${rep.dialogue.lines} lines, ${rep.dialogue.j} J-cuts, ${rep.dialogue.l} L-cuts, ${rep.dialogue.cutsBridged} cuts bridged by sound, ${rep.dialogue.reactions} cuts onto a listener while a line plays.`, ''];
  if (rep.notes.length) { L.push('## Timing and rhythm', ''); for (const n of rep.notes) L.push(`- ${n.level === 'warn' ? '⚠' : '·'} ${n.shot ? `**${n.shot}** ` : ''}${n.msg}${n.fix ? ` → ${n.fix}` : ''}`); L.push(''); }
  L.push('## Cuts', '', '| cut | craft | eye-trace | size | angle | sound | notes |', '|---|---|---|---|---|---|---|');
  for (const c of rep.cuts) L.push(`| ${c.from} → ${c.to} | ${c.craft} | ${Math.round(c.eyeTrace * 100)}% | ${c.sizeStep == null ? '—' : (c.sizeStep > 0 ? '+' : '') + c.sizeStep} | ${c.angleChange != null ? c.angleChange + '°' : '—'}${c.axial ? ' axial' : ''} | ${c.soundBridge.map((b) => `${b.kind} ${b.who}`).join(', ') || '—'} | ${c.notes.map((n) => n.msg + (n.fix ? ` → ${n.fix}` : '')).join('<br>') || (c.cutInMovement ? 'cut in movement ✓' : '✓')} |`);
  L.push('', '## Shot timing', '', '| shot | size | dur | needs | reading | last line | move | action | longest silence |', '|---|---|---|---|---|---|---|---|---|');
  for (const t of rep.timing) L.push(`| ${t.name} | ${t.size} | ${t.duration} | ${t.need} | ${t.read} | ${t.lastLine || '—'} | ${t.moveEnd || '—'} | ${t.actionEnd || '—'} | ${t.silence ?? t.hold} |`);
  return L.join('\n') + '\n';
}
