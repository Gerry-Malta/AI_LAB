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
export function solveShot(scene, shot) {
  const subj = resolveSubject(scene, shot, blockingAt(scene, shot, 0));
  return solveRig(shot, { subject: subj && subj.position, track: shotTrack(scene, shot) });
}
