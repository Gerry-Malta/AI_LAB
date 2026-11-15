// Blocking over time: where the stand-ins are, which way they face and how they are posed at time t of a shot.
// Between two beats, a character that changes mark gets up, moves to the new mark facing the travel direction (a slide,
// no walk cycle) and settles into the new pose. A character that stays on its mark blends between the two poses in place.
import { dist, lerp, lerpAngle, clamp } from './vec.js';
import { ease } from './motion.js';
import { poseBlend } from './standin.js';

export const beatBlocking = (scene, id) => (((scene.beats || []).find((b) => b.id === id) || {}).blocking) || {};

/**
 * How far the beat-to-beat action has gone at shot time t (0..1). shot.action = [start_s, end_s] times the action for
 * everyone, or { default: [s, e], CHAR_id: [s, e] } per character, so an actor can hold, then get up on a line;
 * without it the action spans the whole shot.
 */
export function actionT(shot, t, id) {
  const D = shot.duration_s || 0, a = shot.action;
  const w = !a ? null : Array.isArray(a) ? a : (a[id] || a.default || null);
  t = clamp(t, 0, 1);
  if (!w || !(D > 0)) return t;
  const s = clamp(w[0] / D, 0, 1), e = clamp((w[1] ?? D) / D, s + 1e-3, 1);
  return t <= s ? 0 : t >= e ? 1 : (t - s) / (e - s);
}

/** Blocking of a shot at time t in [0, 1]: the shot's beat, or the transition from beatA to beatB. */
export function blockingAt(scene, shot, t = 0) {
  const idA = shot.beatA || shot.beat, idB = shot.beatB || shot.beat;
  const bA = beatBlocking(scene, idA);
  if (!shot.beatB || idA === idB) return bA;
  return interpolateBlocking(scene, bA, beatBlocking(scene, idB), (id) => actionT(shot, t, id));
}

/** t: a number in [0, 1] for everyone, or a function (objectId) → t. */
export function interpolateBlocking(scene, bA, bB, t, opts = {}) {
  const tOf = typeof t === 'function' ? t : () => t;
  const getUp = opts.getUp ?? 0.2, settle = opts.settle ?? 0.8;
  const out = {};
  // props a beat moves or hides (the phone in her hand, then face down on the blanket) switch halfway through the action
  for (const o of (scene.objects || [])) {
    if (o.kind === 'standin' || (!bA[o.id] && !bB[o.id])) continue;
    const rest = { position: o.position, facing: (o.rotation || [0, 0, 0])[1], visible: o.visible };
    out[o.id] = Object.assign({}, rest, (tOf(o.id) < 0.5 ? bA[o.id] : bB[o.id]) || {});
  }
  for (const o of (scene.objects || []).filter((x) => x.kind === 'standin')) {
    const s = ease('smooth', clamp(tOf(o.id), 0, 1));
    const rest = { position: o.position, facing: (o.rotation || [0, 0, 0])[1], pose: o.pose || 'stand', visible: o.visible };
    const a = Object.assign({}, rest, bA[o.id] || {});
    const b = Object.assign({}, a, bB[o.id] || {});
    let position, facing, pose;
    if (dist(a.position, b.position) > 0.3) {
      const travel = (Math.atan2(b.position[0] - a.position[0], b.position[2] - a.position[2]) * 180) / Math.PI;
      if (s < getUp) { const w = s / getUp; position = a.position; facing = lerpAngle(a.facing, travel, w); pose = poseBlend(a.pose, 'stand', w); }
      else if (s <= settle) { const u = ease('smooth', (s - getUp) / (settle - getUp)); position = lerp(a.position, b.position, u); facing = travel; pose = 'stand'; }
      else { const w = (s - settle) / (1 - settle); position = b.position; facing = lerpAngle(travel, b.facing, w); pose = poseBlend('stand', b.pose, w); }
    } else {
      position = lerp(a.position, b.position, s); facing = lerpAngle(a.facing, b.facing, s); pose = poseBlend(a.pose, b.pose, s);
    }
    out[o.id] = { position, facing, pose, visible: s < 0.5 ? a.visible : b.visible };
  }
  return out;
}
