// Director of photography: reads a frame the way a DP does (where the eyes sit on the grid, look room, headroom, angle,
// lens and distance, balance, mergers behind the head, cuts at the joints, depth) and composes a camera for a narrative
// intent by searching lens, angle and height and aiming the eyes onto the chosen grid. Deterministic: same scene, same
// answer. The rules and their sources are summarised in .claude/skills/director-of-photography/references.
import { add, sub, scale, norm, dot, dist, cameraBasis, projectPoint, rotateY, clamp, round, roundV, toRad, toDeg } from './vec.js';
import { fovFor, equivalentFocal, LENS_KITS, dof } from './lens.js';
import { keypoints, skeleton, headSamples } from './standin.js';
import { solveFraming, SHOT_SIZES, EYE_V, HEADROOM } from './framing.js';
import { evaluateFrame, faceReading, applyBlocking, resolveSubject, objectParts } from './metrics.js';
import { beatBlocking, blockingAt } from './blocking.js';
import { solveShot } from './shot.js';

// ------------------------------------------------------------------ grids ------------------------------------------------
/** Composition grids as fractions of the frame (the same lines vertically and horizontally). */
export const GRIDS = {
  thirds: { name: 'Rule of thirds', lines: [1 / 3, 2 / 3] },
  phi: { name: 'Phi grid (golden section)', lines: [0.382, 0.618] },
  quarters: { name: 'Rule of quarters', lines: [0.25, 0.75] },
  center: { name: 'Centre / symmetry', lines: [0.5] },
};
export const GRID_IDS = Object.keys(GRIDS);


const CLOSE = ['MS', 'MCU', 'CU', 'BCU', 'ECU'];
const FACE_SIZES = ['MCU', 'CU', 'BCU', 'ECU'];

// ------------------------------------------------------------------ intents ----------------------------------------------
/**
 * Narrative intent → camera grammar. Ranges, not single values: the composer searches inside them.
 *  sizes: shot sizes that serve the intent; ffEq: full-frame equivalent focal range (mm);
 *  vAngle: degrees of the lens above (+) or below (-) the subject's eyes; face: degrees off the face axis (0 = into the
 *  lens, 90 = profile); grid; look: 'long' (space in front of the gaze), 'short' (short-sided), 'centre';
 *  headroom: 'tight' | 'normal' | 'generous'; roll: dutch range; dof: 'shallow' | 'deep' | 'any'; move: what motion serves it.
 */
export const INTENTS = {
  neutral: { label: 'Classical coverage', sizes: ['MS', 'MCU', 'CU'], ffEq: [35, 125], vAngle: [-5, 5], face: [15, 50], grid: 'thirds', look: 'long', headroom: 'normal', roll: [0, 0], dof: 'any', move: 'static or motivated',
    why: 'Invisible style: eye level, three-quarter faces, eyes on the upper third, room in front of the look.' },
  establish: { label: 'Establish the geography', sizes: ['EWS', 'WS'], ffEq: [18, 50], vAngle: [5, 35], face: [0, 180], grid: 'thirds', look: 'long', headroom: 'normal', roll: [0, 0], dof: 'deep', move: 'slow crane / drone descent, or static',
    why: 'Who is where: a slightly high, deep-focus frame with the horizon on a third orients the audience before the cutting starts.' },
  intimacy: { label: 'Intimacy, emotional access', sizes: ['CU', 'MCU', 'BCU'], ffEq: [65, 140], vAngle: [-4, 4], face: [8, 30], grid: 'phi', look: 'long', headroom: 'normal', roll: [0, 0], dof: 'shallow', move: 'static, or a slow push-in on a realisation', minFaceDist: 1.2,
    why: 'Eye level and the eyeline close to the lens make the look intimate; a portrait lens from conversational distance flatters (faces shot from inside personal space read as less trustworthy).' },
  direct: { label: 'Direct, confessional', sizes: ['CU', 'BCU', 'MCU'], ffEq: [55, 125], vAngle: [-3, 3], face: [0, 10], grid: 'center', look: 'centre', headroom: 'normal', roll: [0, 0], dof: 'shallow', move: 'static', minFaceDist: 1.2,
    why: 'A frontal, centred face almost into the lens: confrontation or confession, the audience is addressed.' },
  conflict: { label: 'Conflict in dialogue', sizes: ['MCU', 'CU'], ffEq: [50, 125], vAngle: [-5, 5], face: [15, 40], grid: 'thirds', look: 'long', headroom: 'normal', roll: [0, 0], dof: 'shallow', move: 'static matched singles; tighter as it escalates', minFaceDist: 1.1,
    why: 'Matched singles on opposite thirds keep both sides equal; escalation is played by tightening sizes, not by moving the line.' },
  isolation: { label: 'Isolation, loneliness', sizes: ['WS', 'FS', 'EWS'], ffEq: [18, 40], vAngle: [8, 40], face: [20, 120], grid: 'quarters', look: 'long', headroom: 'generous', roll: [0, 0], dof: 'deep', move: 'static, or a slow pull-out',
    why: 'A small figure pushed to the quarter line inside a big negative space: the size of a thing in frame is its importance, so small reads alone.' },
  vulnerability: { label: 'Vulnerability', sizes: ['MS', 'MCU', 'FS'], ffEq: [28, 60], vAngle: [10, 35], face: [15, 60], grid: 'thirds', look: 'long', headroom: 'generous', roll: [0, 0], dof: 'any', move: 'static or a slow pull-back',
    why: 'Looking down on a subject makes them read weaker and smaller (camera-angle studies: high angles lower perceived power).' },
  power: { label: 'Power, dominance', sizes: ['MS', 'MCU', 'MLS'], ffEq: [28, 50], vAngle: [-30, -8], face: [10, 45], grid: 'center', look: 'long', headroom: 'tight', roll: [0, 0], dof: 'any', move: 'static',
    why: 'A low angle makes the subject read stronger and more active; tight headroom lets them own the frame.' },
  tension: { label: 'Tension, unease', sizes: ['MCU', 'CU'], ffEq: [24, 45], vAngle: [-12, 12], face: [5, 45], grid: 'quarters', look: 'short', headroom: 'tight', roll: [0, 8], dof: 'shallow', move: 'static, or a creeping push',
    why: 'Short-siding (looking into the near edge) and a slightly wide lens close in deny the character room: trapped, unbalanced.' },
  observation: { label: 'Observation, distance', sizes: ['FS', 'MLS', 'WS'], ffEq: [85, 200], vAngle: [-3, 10], face: [30, 100], grid: 'thirds', look: 'long', headroom: 'normal', roll: [0, 0], dof: 'any', move: 'static on a long lens',
    why: 'A long lens from far away watches without being part of the scene: compression, a voyeur\'s distance.' },
  wonder: { label: 'Wonder, scale', sizes: ['EWS', 'WS'], ffEq: [14, 35], vAngle: [-25, 2], face: [0, 180], grid: 'thirds', look: 'long', headroom: 'generous', roll: [0, 0], dof: 'deep', move: 'slow tilt-up or crane',
    why: 'A low wide frame with the horizon on the lower third gives the sky and the landscape their size.' },
  detail: { label: 'Detail, insert', sizes: ['INSERT', 'ECU'], ffEq: [70, 200], vAngle: [25, 75], face: [0, 180], grid: 'thirds', look: 'centre', headroom: 'normal', roll: [0, 0], dof: 'shallow', move: 'static',
    why: 'A close, longer lens on the object and a shallow focus point the eye at the one thing the story needs now.' },
  calm: { label: 'Calm, resolution', sizes: ['WS', 'FS', 'MS'], ffEq: [35, 90], vAngle: [-3, 3], face: [0, 40], grid: 'center', look: 'centre', headroom: 'normal', roll: [0, 0], dof: 'deep', move: 'static',
    why: 'Affinity resolves: level horizon, symmetry, no dutch, nothing pushing against the frame.' },
  childhood: { label: 'A child\'s world', sizes: ['MS', 'MLS', 'MCU', 'FS'], ffEq: [24, 50], vAngle: [-6, 6], face: [10, 60], grid: 'thirds', look: 'long', headroom: 'normal', roll: [0, 0], dof: 'shallow', move: 'low and close, at the child\'s eye height',
    why: 'The lens at the child\'s eye height: adults loom, the grass is a forest, the world is seen from inside it.' },
};
export const INTENT_IDS = Object.keys(INTENTS);
/** Profile for an intent id (unknown: neutral), with per-shot overrides (grid, look, vAngle, face, ffEq, ...). */
export function profileFor(intent, overrides = {}) {
  const base = INTENTS[intent] || INTENTS.neutral;
  const p = Object.assign({ id: INTENTS[intent] ? intent : 'neutral' }, base);
  for (const k of ['grid', 'look', 'vAngle', 'face', 'ffEq', 'headroom', 'roll', 'dof', 'minFaceDist']) if (overrides[k] != null) p[k] = overrides[k];
  return p;
}

// ------------------------------------------------------------------ projection helpers -----------------------------------
const lensOf = (shot, over) => Object.assign({ filmback: 'ALEXA35_OG', focal_mm: 35, aspect: 2.39, squeeze: 1, fstop: 2.8 }, (shot && shot.camera) || {}, over || {});
function viewer(pose, lens) {
  const { vfov, hfov } = fovFor(lens);
  const basis = cameraBasis(pose.position, pose.target, pose.roll || 0);
  const tanV = Math.tan(toRad(vfov) / 2), tanH = tanV * lens.aspect;
  const uv = (p) => { const r = projectPoint(p, pose.position, basis, vfov, lens.aspect); return r.behind ? null : { u: (r.x + 1) / 2, v: (1 - r.y) / 2, depth: r.depth }; };
  return { basis, vfov, hfov, tanV, tanH, uv, eye: pose.position };
}
const charRec = (o) => ({ id: o.id, name: o.name || o.id, position: o.position, facing: (o.rotation || [0, 0, 0])[1], pose: o.pose || 'stand', height: o.height || 1.75, age: o.age });
const toWorld = (ch, p) => add(ch.position, rotateY(p, ch.facing || 0));
/** Head forward direction in the world (from the nose, which carries the head rotation). */
function headForward(ch) {
  const sk = skeleton(ch.pose || 'stand', ch.height || 1.75, ch.age);
  const nose = sk.parts.find((p) => p.tag === 'nose');
  if (!nose) return rotateY([0, 0, 1], ch.facing || 0);
  const m = nose.m;
  return rotateY([m[0][2], m[1][2], m[2][2]], ch.facing || 0);
}
const clip01 = (b) => [clamp(b[0], 0, 1), clamp(b[1], 0, 1), clamp(b[2], 0, 1), clamp(b[3], 0, 1)];
const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

/** A stand-in seen by the lens: bounding box, eyes, head, gaze on screen, visible fraction. */
function figureInFrame(V, ch) {
  const kp = keypoints(ch), sk = skeleton(ch.pose || 'stand', ch.height || 1.75, ch.age);
  const pts = [...Object.values(kp), ...Object.values(sk.joints).map((j) => toWorld(ch, j))];
  const pr = pts.map(V.uv).filter(Boolean);
  if (!pr.length) return null;
  const box = [Math.min(...pr.map((p) => p.u)), Math.min(...pr.map((p) => p.v)), Math.max(...pr.map((p) => p.u)), Math.max(...pr.map((p) => p.v))];
  const cb = clip01(box), full = area(box);
  if (area(cb) <= 0) return null;
  const eyes = V.uv(kp.eyes), chin = V.uv(kp.chin);
  // the top of the head in frame is the top of its silhouette (a lowered or lying head shows its crown or its back)
  const hs = headSamples(ch).map(V.uv).filter(Boolean);
  const top = hs.length ? hs.reduce((a, b) => (b.v < a.v ? b : a)) : V.uv(kp.headTop);
  // gaze on screen from the horizontal heading of the head (someone looking down-left still needs room on the left);
  // 'camera' when the head points at the lens or straight away from it
  const fwd = headForward(ch), fwdH = norm([fwd[0], 0, fwd[2]]);
  const toCam = norm([V.eye[0] - kp.eyes[0], 0, V.eye[2] - kp.eyes[2]]);
  const sinA = fwdH[0] * toCam[2] - fwdH[2] * toCam[0];
  const ahead = V.uv(add(kp.eyes, scale(fwdH, 0.35)));
  let gaze = 'camera', gdu = 0;
  if (eyes && ahead) { gdu = ahead.u - eyes.u; if (Math.abs(sinA) > 0.2 && Math.abs(gdu) > 1e-4) gaze = gdu > 0 ? 'right' : 'left'; }
  const P = skeleton(ch.pose || 'stand', ch.height || 1.75, ch.age).proportions;
  const headHalfU = eyes ? (P.headW / 2) / (2 * Math.max(0.05, eyes.depth) * V.tanH) : 0;
  return { id: ch.id, name: ch.name, box, clipped: cb, area: area(cb), visible: full > 0 ? area(cb) / full : 0, eyes, top, chin, gaze, gazeDu: gdu, headHalfU, kp, center: [(cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2] };
}
/** An object seen by the lens: clipped bounding box from its part corners. */
function objectInFrame(V, o) {
  const pts = [];
  for (const part of objectParts(o)) {
    const [sx, sy, sz] = part.size.map((s) => s / 2);
    for (let i = 0; i < 8; i++) {
      const d = [i & 1 ? sx : -sx, i & 2 ? sy : -sy, i & 4 ? sz : -sz];
      const l = add(part.center, part.m ? [part.m[0][0] * d[0] + part.m[0][1] * d[1] + part.m[0][2] * d[2], part.m[1][0] * d[0] + part.m[1][1] * d[1] + part.m[1][2] * d[2], part.m[2][0] * d[0] + part.m[2][1] * d[1] + part.m[2][2] * d[2]] : d);
      const t = part.t, s = t.scale || [1, 1, 1];
      pts.push(add(t.position, rotateY([l[0] * s[0], l[1] * s[1], l[2] * s[2]], (t.rotation || [0, 0, 0])[1])));
    }
  }
  const pr = pts.map(V.uv).filter(Boolean);
  if (!pr.length) return null;
  const box = [Math.min(...pr.map((p) => p.u)), Math.min(...pr.map((p) => p.v)), Math.max(...pr.map((p) => p.u)), Math.max(...pr.map((p) => p.v))];
  const cb = clip01(box);
  if (area(cb) <= 0) return null;
  return { id: o.id, name: o.name || o.id, box, clipped: cb, area: area(cb), depth: Math.min(...pr.map((p) => p.depth)) };
}

/** Distance of a point to the nearest line / power point of each grid. */
export function gridFit(u, v) {
  const out = {};
  for (const [id, g] of Object.entries(GRIDS)) {
    const dx = Math.min(...g.lines.map((x) => Math.abs(u - x))), dy = Math.min(...g.lines.map((y) => Math.abs(v - y)));
    out[id] = { dx: round(dx, 3), dy: round(dy, 3), dPoint: round(Math.hypot(dx, dy), 3) };
  }
  return out;
}
const inRange = (x, r) => x >= r[0] && x <= r[1];
const outBy = (x, r) => (x < r[0] ? r[0] - x : x > r[1] ? x - r[1] : 0);

// ------------------------------------------------------------------ analysis ---------------------------------------------
/**
 * Read a framed moment like a DP. pose = {position, target, roll}; blocking = beat blocking map (or blockingAt()).
 * opts.intent picks the profile the frame is judged against (default shot.dp.intent, else neutral); opts.ev reuses an
 * evaluateFrame result. Returns measures, a 0..100 score against the profile and notes with concrete fixes.
 */
export function composition(scene, shot, pose, blocking, opts = {}) {
  const lens = lensOf(shot, opts.lens);
  const V = viewer(pose, lens);
  const dpo = shot.dp || {};
  const prof = profileFor(opts.intent || dpo.intent || 'neutral', Object.assign({}, dpo, opts.overrides || {}));
  if (dpo.povOf) prof.vAngle = [-89, 89]; // a point of view: the angle is the character's, not a choice
  const ev = opts.ev || evaluateFrame(scene, Object.assign({}, shot, { camera: lens }), pose, blocking);
  const objects = applyBlocking(scene, blocking).filter((o) => o.visible !== false);
  const subjectRec = resolveSubject(scene, shot, blocking);
  const size = opts.size || shot.size;
  const notes = [];
  const note = (level, rule, msg, fix, cost = 0) => notes.push({ level, rule, msg, fix: fix || '', cost });

  const figures = objects.filter((o) => o.kind === 'standin').map((o) => figureInFrame(V, charRec(o))).filter(Boolean);
  const things = objects.filter((o) => o.kind !== 'standin' && o.kind !== 'plane' && o.role !== 'ENV').map((o) => objectInFrame(V, o)).filter(Boolean);
  const subj = subjectRec ? figures.find((f) => f.id === subjectRec.id) || things.find((t) => t.id === subjectRec.id) || null : null;
  const isChar = !!(subj && subj.eyes !== undefined);

  const res = { intent: prof.id, profile: prof.label, size, lens: { focal_mm: lens.focal_mm, ffEq: round(equivalentFocal(lens), 0), hfov: round(V.hfov, 1) }, roll: round(pose.roll || 0, 1), figures: figures.map((f) => ({ id: f.id, name: f.name, eyes: f.eyes && [round(f.eyes.u, 3), round(f.eyes.v, 3)], box: f.clipped.map((x) => round(x, 3)), visible: round(f.visible, 2), gaze: f.gaze })), notes };

  // ---- horizon ----
  const fwdH = norm([V.basis.forward[0], 0, V.basis.forward[2]]);
  const hz = V.uv(add(V.eye, scale(fwdH, 1e5)));
  res.horizon = hz && hz.v >= 0 && hz.v <= 1 ? { v: round(hz.v, 3), onThird: Math.abs(hz.v - 1 / 3) < 0.05 || Math.abs(hz.v - 2 / 3) < 0.05, centred: Math.abs(hz.v - 0.5) < 0.05 } : { v: null };

  // ---- the subject ----
  if (isChar && subj.eyes) {
    const e = subj.eyes, ch = charRec(Object.assign({}, objects.find((o) => o.id === subj.id)));
    const eyesW = subj.kp.eyes;
    const hd = Math.hypot(V.eye[0] - eyesW[0], V.eye[2] - eyesW[2]);
    const vAngle = toDeg(Math.atan2(V.eye[1] - eyesW[1], hd));
    const fr = faceReading(ch, V.eye);
    const faceDist = dist(V.eye, eyesW);
    const headroom = subj.top ? subj.top.v : null;
    const front = subj.gaze === 'right' ? 1 - e.u : subj.gaze === 'left' ? e.u : null;
    const look = front == null ? 'camera' : front >= 0.55 ? 'long' : front <= 0.45 ? 'short' : 'centre';
    res.subject = {
      id: subj.id, name: subj.name, eyes: [round(e.u, 3), round(e.v, 3)], headroom: headroom == null ? null : round(headroom, 3), gaze: subj.gaze,
      lookRoom: front == null ? null : { front: round(front, 2), behind: round(1 - front, 2), look },
      vAngle: round(vAngle, 1), angle: Math.abs(vAngle) < 5 ? 'eye level' : vAngle >= 35 ? 'extreme high' : vAngle >= 15 ? 'high' : vAngle > 0 ? 'slightly high' : vAngle <= -35 ? 'extreme low' : vAngle <= -15 ? 'low' : 'slightly low',
      face: fr ? { offAxis: fr.offAxis, reads: fr.offAxis < 12 ? 'frontal' : fr.offAxis < 50 ? 'three-quarter' : fr.offAxis < 75 ? 'three-quarter profile' : fr.offAxis < 100 ? 'profile' : 'back' } : null,
      distance: round(faceDist, 2), grid: gridFit(e.u, e.v),
    };
    const sz = CLOSE.includes(size) || size === 'FS' || size === 'MLS' ? size : null;
    // eyes on the grid: the vertical line on the back side of the look (long), the front side (short) or the centre
    const lines = GRIDS[prof.grid].lines;
    let wantU = 0.5;
    if (prof.look === 'centre' || subj.gaze === 'camera' || lines.length === 1) wantU = prof.grid === 'center' || lines.length === 1 ? 0.5 : (e.u < 0.5 ? lines[0] : lines[lines.length - 1]);
    else { const backLine = subj.gaze === 'right' ? lines[0] : lines[lines.length - 1]; const frontLine = subj.gaze === 'right' ? lines[lines.length - 1] : lines[0]; wantU = prof.look === 'short' ? frontLine : backLine; }
    res.subject.wantU = round(wantU, 3);
    if (sz && CLOSE.includes(sz)) {
      const du = e.u - wantU;
      if (Math.abs(du) > 0.035) note(Math.abs(du) > 0.09 ? 'warn' : 'info', 'grid', `Eyes at ${pct(e.u)} across, the ${GRIDS[prof.grid].name.toLowerCase()} wants ${pct(wantU)} for this look.`, `pan ${du > 0 ? 'right' : 'left'} ${panDeg(Math.abs(du), V)}°`, Math.min(15, Math.abs(du) * 110));
      const ev_ = EYE_V[sz];
      if (ev_ && !inRange(e.v, ev_)) note(outBy(e.v, ev_) > 0.06 ? 'warn' : 'info', 'eyeline', `Eyes ${pct(e.v)} from the top; a ${sz} reads best with them at ${pct(ev_[0])}–${pct(ev_[1])} (the upper third).`, `tilt ${e.v > ev_[1] ? 'down' : 'up'} ${tiltDeg(outBy(e.v, ev_), V)}°`, Math.min(12, outBy(e.v, ev_) * 120));
    } else if (sz) {
      const du = subj.center[0] - wantU;
      if (Math.abs(du) > 0.06 && prof.grid !== 'center') note('info', 'grid', `The figure is centred at ${pct(subj.center[0])}; the ${GRIDS[prof.grid].name.toLowerCase()} would put it at ${pct(wantU)}.`, `pan ${du > 0 ? 'right' : 'left'} ${panDeg(Math.abs(du), V)}°`, Math.min(8, Math.abs(du) * 60));
    }
    // headroom by size, then the intent (tight / generous)
    const hr = HEADROOM[size];
    if (hr && headroom != null) {
      let want = hr.slice();
      if (prof.headroom === 'tight') want = [want[0] - 0.03, Math.max(want[0], want[1] - 0.04)];
      if (prof.headroom === 'generous') want = [want[0] + 0.02, want[1] + 0.1];
      if (!inRange(headroom, want)) note(outBy(headroom, want) > 0.06 ? 'warn' : 'info', 'headroom', `Headroom ${pct(headroom)} of the frame; ${prof.headroom} headroom for a ${size} is ${pct(want[0])}–${pct(want[1])}.`, `tilt ${headroom > want[1] ? 'down' : 'up'} ${tiltDeg(outBy(headroom, want), V)}°`, Math.min(10, outBy(headroom, want) * 100));
    }
    // look room
    if (front != null && prof.look !== 'centre') {
      if (prof.look === 'long' && front < 0.5) note(front < 0.42 ? 'warn' : 'info', 'lookroom', `Short-sided: ${pct(front)} of the width in front of the look.`, `pan ${subj.gaze === 'right' ? 'right' : 'left'} ${panDeg(0.62 - front, V)}° (or reframe the subject onto the back third)`, 12);
      if (prof.look === 'short' && front > 0.5) note('info', 'lookroom', `The intent asks for short-siding but the look has ${pct(front)} of the width in front.`, `pan ${subj.gaze === 'right' ? 'left' : 'right'} ${panDeg(front - 0.38, V)}°`, 10);
    }
    // vertical angle (a head lowered by more than 15° lets the lens go lower by 0.6 of the pitch, to find the face)
    const hfS = headForward(ch), pitchDn = Math.max(0, toDeg(Math.asin(clamp(-hfS[1], -1, 1))));
    res.subject.headPitch = round(pitchDn, 0);
    const vRange = pitchDn > 15 ? [prof.vAngle[0] - 0.6 * pitchDn - 2, prof.vAngle[1]] : prof.vAngle;
    if (!inRange(vAngle, vRange)) {
      const want = vAngle < vRange[0] ? vRange[0] : vRange[1];
      const dy = Math.tan(toRad(want)) * hd - (V.eye[1] - eyesW[1]);
      note(outBy(vAngle, vRange) > 10 ? 'warn' : 'info', 'angle', `Lens ${Math.abs(round(vAngle, 0))}° ${vAngle >= 0 ? 'above' : 'below'} the eyes (${res.subject.angle}); ${prof.label.toLowerCase()} wants ${fmtRange(vRange.map((x) => round(x, 0)))}°${pitchDn > 15 ? ` (the head is lowered ${round(pitchDn, 0)}°)` : ''}.`, `${dy > 0 ? 'raise' : 'lower'} the camera ${Math.abs(round(dy, 2))} m and re-aim`, Math.min(12, outBy(vAngle, vRange) * 0.8));
    }
    // face angle
    if (fr && FACE_SIZES.includes(size) && !inRange(fr.offAxis, prof.face)) note(outBy(fr.offAxis, prof.face) > 20 ? 'warn' : 'info', 'face', `The face is ${fr.offAxis}° off the lens axis (${res.subject.face.reads}); ${prof.label.toLowerCase()} wants ${fmtRange(prof.face)}°.`, `swing the camera ${round(outBy(fr.offAxis, prof.face), 0)}° ${fr.offAxis > prof.face[1] ? 'toward' : 'away from'} the face axis`, Math.min(10, outBy(fr.offAxis, prof.face) * 0.35));
    // lens and distance on faces
    const minD = prof.minFaceDist ?? (FACE_SIZES.includes(size) ? 1.0 : 0);
    if (FACE_SIZES.includes(size) && faceDist < minD) note(faceDist < 0.8 ? 'warn' : 'info', 'perspective', `The lens is ${round(faceDist, 2)} m from the face: close perspective swells the nose and reads less trustworthy.`, `back off to ${minD} m and go longer (about ${round(lens.focal_mm * minD / faceDist, 0)} mm)`, faceDist < 0.8 ? 10 : 5);
    // cuts at joints
    const sk = skeleton(ch.pose || 'stand', ch.height || 1.75, ch.age);
    const cuts = [];
    for (const j of ['elbowL', 'elbowR', 'wristL', 'wristR', 'kneeL', 'kneeR', 'ankleL', 'ankleR']) {
      const p = V.uv(toWorld(ch, sk.joints[j])); if (!p) continue;
      const nearV = (p.u > 0 && p.u < 1) && (Math.abs(p.v - 1) < 0.025 || Math.abs(p.v) < 0.02), nearU = (p.v > 0 && p.v < 1) && (Math.abs(p.u) < 0.02 || Math.abs(p.u - 1) < 0.02);
      if (nearV || nearU) cuts.push(j.replace(/[LR]$/, ''));
    }
    if (cuts.length) note('info', 'joints', `The frame edge cuts at the ${[...new Set(cuts)].join(', ')}: cut between joints, not on them.`, 'change size a step or tilt a little', 3 * Math.min(2, new Set(cuts).size));
    // mergers: thin verticals far behind the head; the horizon through the head
    const mergers = [];
    const headU = [e.u - subj.headHalfU, e.u + subj.headHalfU];
    for (const o of objects) {
      if (o.id === subj.id || o.kind === 'standin' || o.kind === 'plane') continue;
      const s = o.size || [1, 1, 1], tall = o.kind === 'tree' ? s[1] * (s[2] ?? 0.35) : s[1], wide = o.kind === 'tree' ? s[0] * 0.12 : Math.max(s[0], s[2] ?? s[0]);
      if (!(tall > 2.5 * wide)) continue;
      const base = V.uv(o.position), topP = V.uv(add(o.position, [0, tall, 0]));
      if (!base || !topP || base.depth < e.depth + 1) continue;
      const halfW = wide / 2 / (2 * base.depth * V.tanH), cu = (base.u + topP.u) / 2;
      if (cu + halfW > headU[0] && cu - halfW < headU[1] && Math.min(base.v, topP.v) < e.v && Math.max(base.v, topP.v) > e.v) mergers.push({ name: o.name || o.id, depth: base.depth });
    }
    // a trunk far outside the depth of field is a soft shape: still a merger, a smaller one
    const dofM = dof({ focal_mm: lens.focal_mm, fstop: lens.fstop || 2.8, focus_m: lens.focus_m || dist(V.eye, subj.kp.eyes) }, lens.filmback);
    const sharp = mergers.filter((m) => !(dofM.far_m !== Infinity && m.depth > dofM.far_m * 1.5));
    if (mergers.length) note('info', 'merger', `${mergers.slice(0, 2).map((m) => m.name).join(', ')} grows out of the head in the background${sharp.length ? '' : ' (out of focus)'}.`, 'shift the camera sideways a little or change the angle so the head has clean background', sharp.length ? 6 : 2);
    // an eye-level lens puts the horizon through the eyes (normal); through the neck it reads as a cut
    const sh = V.uv(subj.kp.shoulders);
    if (res.horizon.v != null && subj.chin && sh && res.horizon.v > subj.chin.v && res.horizon.v < sh.v) note('info', 'merger', 'The horizon line cuts through the neck.', 'raise or lower the camera so the horizon clears the neck (eyes or shoulders)', 4);
    res.subject.cuts = [...new Set(cuts)];
    res.subject.mergers = mergers.map((m) => m.name);
    // depth of field: is the background soft?
    const d = dof({ focal_mm: lens.focal_mm, fstop: lens.fstop || 2.8, focus_m: lens.focus_m || faceDist }, lens.filmback);
    const bgDepths = things.concat(figures.filter((f) => f.id !== subj.id)).map((t) => t.depth ?? (t.eyes && t.eyes.depth)).filter((x) => x != null && x > faceDist + 0.5);
    res.depthOfField = { near: round(d.near_m, 2), far: d.far_m === Infinity ? null : round(d.far_m, 2), backgroundSoft: d.far_m !== Infinity && bgDepths.length > 0 && bgDepths.every((x) => x > d.far_m) };
    if (prof.dof === 'shallow' && d.far_m === Infinity) note('info', 'dof', 'Everything is in focus; the intent wants the subject separated.', `open up (T${Math.max(1.4, (lens.fstop || 2.8) / 2)}) or go longer`, 3);
    if (prof.dof === 'deep' && d.total_m !== Infinity && d.total_m < 3 && !FACE_SIZES.includes(size)) note('info', 'dof', `Only ${round(d.total_m, 1)} m in focus; the intent wants the space readable.`, 'stop down or go wider', 3);
  } else if (subj) {
    // an object: how much of the frame it fills and where
    const c = [(subj.clipped[0] + subj.clipped[2]) / 2, (subj.clipped[1] + subj.clipped[3]) / 2];
    res.subject = { id: subj.id, name: subj.name, center: [round(c[0], 3), round(c[1], 3)], fill: round(Math.max(subj.clipped[2] - subj.clipped[0], subj.clipped[3] - subj.clipped[1]), 2), grid: gridFit(c[0], c[1]) };
    if (size === 'INSERT' && res.subject.fill < 0.3) note('warn', 'size', `The object fills only ${pct(res.subject.fill)} of the frame: an insert is about the object.`, 'go closer or longer', 10);
  }

  // ---- lens vs intent ----
  const ff = res.lens.ffEq;
  if (!inRange(ff, prof.ffEq)) note(outBy(ff, prof.ffEq) > 25 ? 'warn' : 'info', 'lens', `${lens.focal_mm} mm (${ff} mm full-frame equivalent) is outside ${prof.label.toLowerCase()}'s ${fmtRange(prof.ffEq)} mm.`, `use about ${round(clamp(ff, prof.ffEq[0], prof.ffEq[1]) / (ff / lens.focal_mm), 0)} mm`, Math.min(8, outBy(ff, prof.ffEq) * 0.15));
  if (!inRange(Math.abs(res.roll), prof.roll)) note('info', 'roll', `Dutch ${res.roll}° outside the intent's ${fmtRange(prof.roll)}°.`, prof.roll[1] === 0 ? 'level the horizon' : `roll ${prof.roll[0]}–${prof.roll[1]}°`, 6);
  if (prof.sizes && !prof.sizes.includes(size)) note('info', 'size', `${size} is not among the sizes that serve ${prof.label.toLowerCase()} (${prof.sizes.join(', ')}).`, `consider ${prof.sizes[0]}`, 4);

  // ---- balance and negative space ----
  const weights = [];
  for (const f of figures) weights.push({ u: clamp(f.center[0] + (f.gaze === 'right' ? 0.08 : f.gaze === 'left' ? -0.08 : 0), 0, 1), w: f.area * (subj && f.id === subj.id ? 1.6 : 1) });
  for (const t of things) weights.push({ u: (t.clipped[0] + t.clipped[2]) / 2, w: t.area * 0.5 });
  const W = weights.reduce((a, b) => a + b.w, 0);
  const cx = W > 0 ? weights.reduce((a, b) => a + b.u * b.w, 0) / W : 0.5;
  const filled = Math.min(1, figures.reduce((a, f) => a + f.area, 0) + things.reduce((a, t) => a + t.area, 0) * 0.6);
  res.balance = { cx: round(cx, 2), negativeSpace: round(1 - filled, 2) };
  if (prof.grid === 'center' && Math.abs(cx - 0.5) > 0.12) note('info', 'balance', `Visual weight sits at ${pct(cx)} across; the intent wants a centred, symmetric frame.`, `pan ${cx > 0.5 ? 'right' : 'left'} ${panDeg(Math.abs(cx - 0.5), V)}°`, 6);
  if (prof.id === 'isolation' && res.balance.negativeSpace < 0.75) note('info', 'space', `Negative space ${pct(res.balance.negativeSpace)}; isolation reads with the figure small in a big empty frame.`, 'go wider or further', 6);

  // ---- two figures: on the grid lines, both eyelines readable ----
  const pair = figures.filter((f) => f.eyes && f.eyes.u > 0 && f.eyes.u < 1 && f.visible > 0.25).sort((a, b) => a.eyes.u - b.eyes.u);
  if (pair.length >= 2 && ['two', 'two-shot'].includes(opts.kind || (shot.framing && shot.framing.A && shot.framing.A.type))) {
    const [a, b] = [pair[0], pair[pair.length - 1]];
    const fits = Object.fromEntries(Object.entries(GRIDS).filter(([, g]) => g.lines.length === 2).map(([id, g]) => [id, round(Math.abs(a.eyes.u - g.lines[0]) + Math.abs(b.eyes.u - g.lines[1]), 3)]));
    res.pair = { left: a.name, right: b.name, eyesU: [round(a.eyes.u, 3), round(b.eyes.u, 3)], fits };
  }

  // ---- hard checks from the shot check (occlusion, face reading, size) carry over ----
  for (const f of ev.flags || []) if (f.level !== 'info') note(f.level, 'check', f.msg, '', f.level === 'bad' ? 25 : 8);

  res.score = clamp(Math.round(100 - notes.reduce((a, n) => a + (n.cost || 0), 0)), 0, 100);
  res.checkScore = ev.score;
  return res;
}
const pct = (x) => `${Math.round(x * 100)}%`;
const fmtRange = (r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}…${r[1]}`);
const panDeg = (du, V) => Math.max(1, Math.round(toDeg(Math.atan(2 * du * V.tanH))));
const tiltDeg = (dv, V) => Math.max(1, Math.round(toDeg(Math.atan(2 * dv * V.tanV))));

// ------------------------------------------------------------------ aiming -----------------------------------------------
/** Target that puts world point P at frame point (u, v) (u from the left, v from the top) from the eye, roll 0. */
export function aimAt(eye, P, u, v, lens) {
  const { vfov } = fovFor(lens);
  const tanV = Math.tan(toRad(vfov) / 2), tanH = tanV * (lens.aspect || 2.39);
  const xs = 2 * u - 1, ys = 1 - 2 * v;
  const D = dist(eye, P);
  let target = P.slice();
  for (let i = 0; i < 8; i++) {
    const b = cameraBasis(eye, target, 0), d = sub(P, eye);
    const depth = dot(d, b.forward); if (depth <= 1e-6) break;
    const x = dot(d, b.right) / (depth * tanH), y = dot(d, b.up) / (depth * tanV);
    const ex = Math.atan(x * tanH) - Math.atan(xs * tanH), ey = Math.atan(y * tanV) - Math.atan(ys * tanV);
    if (Math.abs(ex) < 1e-5 && Math.abs(ey) < 1e-5) break;
    const f = norm(add(b.forward, add(scale(b.right, Math.tan(ex)), scale(b.up, Math.tan(ey)))));
    target = add(eye, scale(f, D));
  }
  return roundV(target);
}

// ------------------------------------------------------------------ composer ---------------------------------------------
function kitWithin(range, lens, kitName) {
  const ratio = equivalentFocal(Object.assign({}, lens, { focal_mm: 1 }));
  const kit = LENS_KITS[kitName || ((lens.squeeze || 1) > 1.4 ? 'Anamorphic 2x' : 'S35 spherical primes')];
  let ok = kit.filter((f) => f * ratio >= range[0] - 1 && f * ratio <= range[1] + 1);
  if (!ok.length) { const mid = (range[0] + range[1]) / 2; ok = [kit.reduce((p, c) => (Math.abs(c * ratio - mid) < Math.abs(p * ratio - mid) ? c : p), kit[0])]; }
  if (ok.length > 4) { const pick = [0, Math.round((ok.length - 1) / 3), Math.round((2 * (ok.length - 1)) / 3), ok.length - 1]; ok = [...new Set(pick.map((i) => ok[i]))]; }
  return ok;
}
const samples = (r, n) => (r[0] === r[1] || n <= 1 ? [(r[0] + r[1]) / 2] : Array.from({ length: n }, (_, i) => r[0] + ((r[1] - r[0]) * i) / (n - 1)));
const charAtBeat = (scene, id, beat) => { const o = (scene.objects || []).find((x) => x.id === id); if (!o) throw new Error(`unknown character ${id}`); const bl = beatBlocking(scene, beat)[id] || {}; return { id, name: o.name || id, position: bl.position || o.position, facing: bl.facing ?? (o.rotation || [0, 0, 0])[1], pose: bl.pose || o.pose || 'stand', height: o.height || 1.75, age: o.age }; };
/** Which side of the line a→b a point is on (+1 / -1), seen from above. */
const sideOf = (a, b, p) => Math.sign((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]));

/**
 * Compose a camera for a single (a stand-in subject) from a narrative intent: searches the lenses of the kit inside the
 * intent's focal range, the face angles and the heights it allows, solves the distance for the shot size, aims the eyes
 * onto the grid (back third for a long look, front for short-siding, centre) and keeps the candidate that scores best on
 * the shot check plus the composition. opts: { intent, subject, size, beat, side: +1/-1 with line: [idA, idB] to stay on
 * one side of the 180° line, focal (fixed lens), grid, look, vAngle, face, ffEq, kit, povOf: a character whose eye
 * height the lens takes (a point of view) }.
 * Returns { position, target, roll, focal_mm, distance, analysis, check, alternatives, why }.
 */
export function compose(scene, shot, opts = {}) {
  const prof = profileFor(opts.intent || (shot.dp && shot.dp.intent) || 'neutral', opts);
  const beat = opts.beat || shot.beatA || shot.beat;
  const subjectId = opts.subject || shot.subject;
  const size = opts.size || shot.size;
  const subj = charAtBeat(scene, subjectId, beat);
  if (!subj || (scene.objects.find((o) => o.id === subjectId) || {}).kind !== 'standin') throw new Error('compose needs a stand-in subject');
  const blocking = beatBlocking(scene, beat);
  const base = lensOf(shot, opts.lens);
  const focals = opts.focal ? [opts.focal] : kitWithin(prof.ffEq, base, opts.kit);
  // point of view: the lens at another character's eye height (a child looking up at a parent); the angle is given
  const pov = opts.povOf ? charAtBeat(scene, opts.povOf, beat) : null;
  const povY = pov ? keypoints(pov).eyes[1] : null;
  if (pov) prof.vAngle = [-89, 89];
  const inner = (r, k = 0.12) => [r[0] + (r[1] - r[0]) * k, r[1] - (r[1] - r[0]) * k];
  const faceAngles = samples(inner([Math.max(0, prof.face[0]), Math.min(prof.face[1], 75)]), prof.face[1] - prof.face[0] > 20 ? 4 : 2);
  let vAngles = pov ? [0] : samples(inner(prof.vAngle), prof.vAngle[1] - prof.vAngle[0] > 8 ? 3 : 1);
  const line = opts.line || shot.line;
  const lineIds = Array.isArray(line) && line.length === 2 ? line : null;
  // side: with a line it is the side of the 180° axis the lens stays on; without one, the side of the face
  const sides = opts.side && !lineIds ? [opts.side] : [1, -1];
  const kpS = keypoints(subj);
  // face angles are measured from where the head points, not the body (a turned head, a lowered chin)
  const hf = headForward(subj), headYaw = toDeg(Math.atan2(hf[0], hf[2]));
  const yawOff = ((headYaw - (subj.facing || 0) + 540) % 360) - 180;
  // a lowered head (reading, a phone, a drawing) shows its crown to an eye-level lens: go lower to find the face
  const pitchDown = Math.max(0, toDeg(Math.asin(clamp(-hf[1], -1, 1))));
  const lying = /^lie_/.test(typeof subj.pose === 'string' ? subj.pose : (subj.pose && (subj.pose.base || (subj.pose.a && subj.pose.a.base))) || '');
  if (!pov && pitchDown > 15 && FACE_SIZES.concat(['MS']).includes(size)) vAngles = [...new Set(vAngles.map((a) => Math.max(-30, round(a - 0.6 * pitchDown, 1))).concat(vAngles))];
  const evalShot = Object.assign({}, shot, { subject: subjectId, size, beat, beatA: null, beatB: null, dp: Object.assign({}, shot.dp || {}, { intent: prof.id }) });
  const cands = [];
  for (const focal of focals) {
    const lens = Object.assign({}, base, { focal_mm: focal });
    for (const fa of faceAngles) for (const sgn of sides) for (const va of vAngles) {
      const az = sgn * fa + yawOff;
      // distance from the size, then the height that gives the vertical angle to the eyes
      const r0 = solveFraming({ subject: subj, size, lens, azimuth: az, elevation: 0, leadRoom: 0 });
      const hd = Math.hypot(r0.position[0] - kpS.eyes[0], r0.position[2] - kpS.eyes[2]);
      const camY = pov ? Math.max(0.12, povY) : Math.max(0.12, kpS.eyes[1] + Math.tan(toRad(va)) * hd); // no lower than a low-mode rig on the ground
      const r = solveFraming({ subject: subj, size, lens, azimuth: az, cameraHeight: camY, leadRoom: 0 });
      const position = r.position;
      if (lineIds) {
        const A = charAtBeat(scene, lineIds[0], beat).position, B = charAtBeat(scene, lineIds[1], beat).position;
        if (opts.side && sideOf(A, B, position) !== opts.side) continue;
      }
      // aim: the eyes onto the grid point the intent asks for (horizontal from the gaze side, vertical from the size)
      const V0 = viewer({ position, target: r.target, roll: 0 }, lens);
      const f0 = figureInFrame(V0, subj);
      const lines = GRIDS[prof.grid].lines;
      let u = 0.5;
      if (f0 && f0.gaze !== 'camera' && lines.length > 1 && prof.look !== 'centre') {
        const back = f0.gaze === 'right' ? lines[0] : lines[lines.length - 1], front = f0.gaze === 'right' ? lines[lines.length - 1] : lines[0];
        u = prof.look === 'short' ? front : back;
      }
      const ev_ = EYE_V[size];
      let v = null, target;
      if (ev_ && CLOSE.includes(size)) {
        const gl = lines.length > 1 ? lines[0] : 1 / 3;
        v = clamp(gl, ev_[0], ev_[1]);
        if (prof.headroom === 'generous') v = Math.min(ev_[1] + 0.04, v + 0.05);
        if (prof.headroom === 'tight') v = Math.max(ev_[0] - 0.03, v - 0.03);
        // never at the price of the size: the head keeps its headroom and the landmark the size cuts at stays below the
        // bottom edge (raising the eyes in frame reveals more body and would read a size wider)
        const hsV = headSamples(subj).map(V0.uv).filter(Boolean), ey = V0.uv(kpS.eyes), hr = HEADROOM[size], spec = SHOT_SIZES[size] || {};
        const top = hsV.length ? hsV.reduce((a, b) => (b.v < a.v ? b : a)) : V0.uv(kpS.headTop);
        // (lying figures are sized on the head; a BCU / ECU may lose the top of the head, the modern big close-up)
        let cutAt = !lying && !['BCU', 'ECU'].includes(size) && spec.bottom && kpS[spec.bottom] ? V0.uv(kpS[spec.bottom]) : null;
        if (cutAt && ey && cutAt.v < ey.v + 0.05) cutAt = null;
        if (top && ey && hr) {
          const s0 = ey.v - top.v;
          const lo = Math.max(hr[0] + s0, cutAt ? 1.01 - (cutAt.v - ey.v) : -1), hi = hr[1] + s0;
          v = clamp(v, lo, Math.max(lo, hi));
        }
        target = aimAt(position, kpS.eyes, u, v, lens);
      } else {
        // wide sizes: keep the solver's vertical framing, place the figure horizontally
        const cU = f0 ? f0.center[0] : 0.5;
        const Pmid = f0 ? kpS.chest : kpS.eyes;
        const cur = V0.uv(Pmid);
        target = aimAt(position, Pmid, u + (cur ? cur.u - cU : 0), cur ? cur.v : 0.5, lens);
      }
      const pose = { position, target, roll: prof.roll[1] > 0 ? (prof.roll[0] + prof.roll[1]) / 2 * (sgn > 0 ? 1 : -1) : 0 };
      const ev = evaluateFrame(scene, Object.assign({}, evalShot, { camera: lens }), pose, blocking);
      const an = composition(scene, evalShot, pose, blocking, { lens, ev, intent: prof.id, size, overrides: pov ? { vAngle: [-89, 89] } : {} });
      // prefer the middle of the ranges a little (repeatable, not always the extreme)
      const mid = (r) => (r[0] + r[1]) / 2, span = (r) => Math.max(1, r[1] - r[0]);
      const centrality = 3 * (Math.abs(fa - mid([prof.face[0], Math.min(prof.face[1], 75)])) / span(prof.face) + Math.abs(va - mid(prof.vAngle)) / span(prof.vAngle) + Math.abs(an.lens.ffEq - mid(prof.ffEq)) / span(prof.ffEq));
      const total = 0.45 * ev.score + 0.55 * an.score - centrality;
      cands.push({ total: round(total, 2), position, target: pose.target, roll: pose.roll, focal_mm: focal, azimuth: round(sgn * fa, 1), vAngle: round(va, 1), distance: r.distance, eyesAt: v == null ? null : [round(u, 3), round(v, 3)], check: ev, analysis: an });
    }
  }
  if (!cands.length) throw new Error(`compose: no camera position for ${shot.name || shot.id} with intent ${prof.id}`);
  cands.sort((a, b) => b.total - a.total);
  const best = cands[0];
  const why = [
    `${prof.label}: ${prof.why}`,
    `${best.focal_mm} mm (${best.analysis.lens.ffEq} mm FF eq.) at ${best.distance} m, face ${Math.abs(best.azimuth)}° off axis, ${pov ? `the lens at ${pov.name}'s eye height (${round(povY, 2)} m, a point of view), ${Math.abs(best.analysis.subject.vAngle)}° ${best.analysis.subject.vAngle >= 0 ? 'above' : 'below'} the eyes` : `lens ${Math.abs(best.vAngle)}° ${best.vAngle >= 0 ? 'above' : 'below'} the eyes`}.`,
    best.eyesAt ? `Eyes placed at ${pct(best.eyesAt[0])} across, ${pct(best.eyesAt[1])} from the top (${GRIDS[prof.grid].name.toLowerCase()}, ${prof.look} look).` : `Figure placed on the ${GRIDS[prof.grid].name.toLowerCase()}.`,
    `Check ${best.check.score}/100, composition ${best.analysis.score}/100.`,
  ];
  const alternatives = cands.slice(1).filter((c, i, arr) => arr.findIndex((d) => d.focal_mm === c.focal_mm && Math.sign(d.azimuth) === Math.sign(c.azimuth)) === i).slice(0, 4)
    .map((c) => ({ focal_mm: c.focal_mm, azimuth: c.azimuth, vAngle: c.vAngle, total: c.total, check: c.check.score, composition: c.analysis.score }));
  return { position: best.position, target: best.target, roll: best.roll, focal_mm: best.focal_mm, distance: best.distance, azimuth: best.azimuth, vAngle: best.vAngle, intent: prof.id, analysis: best.analysis, check: best.check, alternatives, why };
}

// ------------------------------------------------------------------ reports ----------------------------------------------
/** DP read of one shot at its first and last frame (moving shots both ends), against the shot's intent. */
export function dpShotReport(scene, shot, opts = {}) {
  const solved = solveShot(scene, shot);
  const ends = shot.keys && shot.keys.B ? [['A', 0], ['B', 1]] : [['A', 0]];
  const out = { id: shot.id, name: shot.name || shot.id, size: shot.size, intent: (shot.dp && shot.dp.intent) || opts.intent || 'neutral', focal_mm: (shot.camera || {}).focal_mm, frames: [] };
  for (const [k, t] of ends) {
    const pose = solved.pose(t), bl = blockingAt(scene, shot, t);
    const def = shot.framing && shot.framing[k], size = (def && def.size) || shot.size;
    const ev = evaluateFrame(scene, shot, pose, bl, { expectedSize: size });
    const an = composition(scene, shot, pose, bl, { intent: out.intent, size, ev });
    out.frames.push({ key: k, score: an.score, check: an.checkScore, subject: an.subject || null, horizon: an.horizon, balance: an.balance, notes: an.notes });
  }
  out.score = Math.round(out.frames.reduce((a, f) => a + f.score, 0) / out.frames.length);
  return out;
}

/**
 * DP report of a scene: every shot against its intent, plus the coverage rules that need more than one shot —
 * matched singles in shot / reverse-shot (same size, lens, eye height, mirrored look), one lens family, sizes used.
 */
export function dpReport(scene, opts = {}) {
  const shots = (scene.shots || []).filter((s) => !opts.shots || opts.shots.includes(s.id) || opts.shots.includes(s.name));
  const per = shots.map((s) => dpShotReport(scene, s, opts));
  const coverage = [];
  // reverse pairs: singles of the two people on a line, close sizes, in the same stretch of the scene
  const singles = per.map((r, i) => ({ r, s: shots[i] })).filter(({ s }) => s.line && FACE_SIZES.concat(['MS']).includes(s.size) && s.subject && s.line.includes(s.subject));
  for (let i = 0; i < singles.length; i++) for (let j = i + 1; j < singles.length && j <= i + 3; j++) {
    const a = singles[i], b = singles[j];
    if (a.s.subject === b.s.subject || a.s.size !== b.s.size) continue;
    const fa = a.r.frames[0].subject, fb = b.r.frames[0].subject;
    if (!fa || !fb) continue;
    const issues = [];
    if ((a.s.camera || {}).focal_mm !== (b.s.camera || {}).focal_mm) issues.push(`lenses differ (${a.s.camera.focal_mm} / ${b.s.camera.focal_mm} mm)`);
    if (Math.abs(fa.eyes[1] - fb.eyes[1]) > 0.05) issues.push(`eye heights differ (${pct(fa.eyes[1])} / ${pct(fb.eyes[1])} from the top)`);
    if (Math.abs(fa.vAngle - fb.vAngle) > 6) issues.push(`camera angles differ (${fa.vAngle}° / ${fb.vAngle}°)`);
    if (fa.gaze !== 'camera' && fa.gaze === fb.gaze) issues.push(`both look ${fa.gaze}: the eyelines do not meet`);
    if (fa.face && fb.face && Math.abs(fa.face.offAxis - fb.face.offAxis) > 15) issues.push(`face angles differ (${fa.face.offAxis}° / ${fb.face.offAxis}°)`);
    coverage.push({ pair: [a.r.name, b.r.name], matched: issues.length === 0, issues });
  }
  const lenses = [...new Set(shots.map((s) => (s.camera || {}).focal_mm))].sort((x, y) => x - y);
  const sizes = {}; for (const s of shots) sizes[s.size] = (sizes[s.size] || 0) + 1;
  const score = per.length ? Math.round(per.reduce((a, r) => a + r.score, 0) / per.length) : 0;
  return { score, shots: per, coverage, lenses, sizes };
}

/** Markdown version of a DP report, for the crew and for the agent's review. */
export function dpReportMarkdown(scene, rep) {
  const L = [`# DP report · ${scene.project || ''} ${(scene.scene && scene.scene.name) || ''}`.trim(), '', `Average composition score **${rep.score}/100** over ${rep.shots.length} shots. Lenses: ${rep.lenses.join(', ')} mm. Sizes: ${Object.entries(rep.sizes).map(([k, v]) => `${k} ${v}`).join(' · ')}.`, ''];
  if (rep.coverage.length) {
    L.push('## Shot / reverse shot', '');
    for (const c of rep.coverage) L.push(`- ${c.pair.join(' ↔ ')}: ${c.matched ? 'matched' : c.issues.join('; ')}`);
    L.push('');
  }
  L.push('## Shots', '', '| shot | size | intent | lens | score | eyes (u, v) | angle | face | notes |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of rep.shots) {
    const f = r.frames[0], s = f.subject || {};
    const ns = r.frames.flatMap((fr) => fr.notes.filter((n) => n.level !== 'info' || n.cost >= 5).map((n) => `${r.frames.length > 1 ? fr.key + ': ' : ''}${n.msg}${n.fix ? ` → ${n.fix}` : ''}`));
    L.push(`| ${r.name} | ${r.size} | ${r.intent} | ${r.focal_mm} mm | ${r.score} | ${s.eyes ? `${pct(s.eyes[0])}, ${pct(s.eyes[1])}` : s.center ? `${pct(s.center[0])}, ${pct(s.center[1])}` : '—'} | ${s.angle ? `${s.angle} (${s.vAngle}°)` : '—'} | ${s.face ? `${s.face.reads} ${s.face.offAxis}°` : '—'} | ${ns.join('<br>') || '✓'} |`);
  }
  return L.join('\n') + '\n';
}
