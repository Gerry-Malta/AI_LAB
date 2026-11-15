// Solve a shot in the context of its scene: rig + subject tracking through the blocking.
import { lerp } from './vec.js';
import { solveRig } from './rigs.js';
import { blockingAt } from './blocking.js';
import { resolveSubject } from './metrics.js';
import { keypoints } from './standin.js';

/** Anchor of the shot's subject (between chest and eyes) at shot time t, following the blocking. Null for props. */
export function shotTrack(scene, shot) {
  const obj = shot.subject && (scene.objects || []).find((o) => o.id === shot.subject);
  if (!obj || obj.kind !== 'standin') return null;
  return (t) => { const kp = keypoints(resolveSubject(scene, shot, blockingAt(scene, shot, t))); return lerp(kp.chest, kp.eyes, 0.5); };
}

/** solveRig with the scene context (subject position and tracking). Use this everywhere a shot is played or exported. */
/**
 * Effective timing curve of the camera move. shot.move = [start_s, end_s] keeps the camera still until the move is
 * motivated (an actor gets up, a line lands) and lets it settle before the cut; the shot's curve eases inside the window.
 */
export function moveCurve(shot) {
  const D = shot.duration_s || 0, m = shot.move;
  if (!Array.isArray(m) || !(D > 0)) return shot.curve || 'easeInOut';
  const a = Math.max(0, Math.min(D, +m[0] || 0)), b = Math.max(a + 0.04, Math.min(D, m[1] == null ? D : +m[1]));
  return { type: 'window', start: a / D, end: b / D, inner: shot.curve || 'easeInOut' };
}
export function solveShot(scene, shot) {
  const subj = resolveSubject(scene, shot, blockingAt(scene, shot, 0));
  const timed = Array.isArray(shot.move) ? Object.assign({}, shot, { curve: moveCurve(shot) }) : shot;
  return solveRig(timed, { subject: subj && subj.position, track: shotTrack(scene, shot) });
}
