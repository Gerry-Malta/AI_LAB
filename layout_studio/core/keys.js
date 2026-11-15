// Key (camera pose) definitions solved against the scene: the bridge between a described framing
// ("CU of Arthur from 30°, eye level") and concrete camera coordinates. Used by the builder scripts and by the viewer's Re-solve.
import { solveFraming, solveTwoShot, solveOTS, frameObject, aimFromPosition } from './framing.js';

export const KEY_TYPES = ['single', 'two', 'ots', 'object', 'raw'];

/** Character record (position/facing/pose/height) at a beat, falling back to the rest transform. */
export function charAt(scene, id, beatId) {
  const o = (scene.objects || []).find((x) => x.id === id);
  if (!o) throw new Error(`unknown character ${id}`);
  const beat = (scene.beats || []).find((b) => b.id === beatId);
  const bl = (beat && beat.blocking && beat.blocking[id]) || {};
  return { id, position: bl.position || o.position, facing: bl.facing ?? ((o.rotation || [0, 0, 0])[1]), pose: bl.pose || o.pose || 'stand', height: o.height || 1.75, age: o.age };
}

/** Solve one key definition. Returns {position, target, roll, meta} or null. May adjust lens.focal_mm for OTS fitSize. */
export function solveKeyDef(scene, shot, def, lens, beatId) {
  if (!def) return null;
  const beat = def.beat || beatId || shot.beat;
  switch (def.type || 'single') {
    case 'raw': return { position: def.position, target: def.target, roll: def.roll || 0, meta: {} };
    case 'single': {
      const subj = charAt(scene, def.subject || shot.subject, beat);
      const r = solveFraming(Object.assign({}, def, { subject: subj, size: def.size || shot.size, lens }));
      return { position: r.position, target: r.target, roll: def.roll || 0, meta: r };
    }
    case 'two': {
      const r = solveTwoShot(Object.assign({}, def, { a: charAt(scene, def.a, beat), b: charAt(scene, def.b, beat), size: def.size || shot.size, lens }));
      return { position: r.position, target: r.target, roll: def.roll || 0, meta: r };
    }
    case 'ots': {
      const r = solveOTS(Object.assign({}, def, { fg: charAt(scene, def.fg, beat), bg: charAt(scene, def.bg, beat), lens }));
      if (def.fitSize) lens.focal_mm = r.focal_mm;
      return { position: r.position, target: r.target, roll: def.roll || 0, meta: r };
    }
    case 'object': {
      const o = (scene.objects || []).find((x) => x.id === def.object);
      if (!o) throw new Error(`unknown object ${def.object}`);
      const size = o.size || [1, 1, 1];
      const center = [o.position[0], o.position[1] + size[1] / 2, o.position[2]];
      const r = frameObject(Object.assign({}, def, { center, size, lens }));
      return { position: r.position, target: r.target, roll: def.roll || 0, meta: r };
    }
    default: throw new Error(`unknown key type ${def.type}`);
  }
}

/** Solve A and B from framing definitions. Sticks: B keeps A's position and is re-aimed at its subject. */
export function solveShotKeys(scene, shot, defs, lens) {
  const A = solveKeyDef(scene, shot, defs.A, lens, shot.beatA || shot.beat);
  if (!A) throw new Error(`shot ${shot.id}: key A required`);
  let B = solveKeyDef(scene, shot, defs.B, lens, shot.beatB || shot.beat);
  if (B && shot.rig && shot.rig.type === 'static') {
    B.position = A.position.slice();
    const d = defs.B;
    if ((d.type || 'single') === 'single') {
      const subj = charAt(scene, d.subject || shot.subject, d.beat || shot.beatB || shot.beat);
      const aim = aimFromPosition({ position: A.position, subject: subj, lens, headroom: d.headroom, leadRoom: d.leadRoom });
      B.target = aim.target; B.meta = Object.assign({}, B.meta, aim);
    }
  }
  return { A, B };
}

/** Re-solve both keys of a shot from its stored framing definitions (shot.framing = {A, B}). */
export function resolveShotKeys(scene, shot) {
  if (!shot.framing || !shot.framing.A) return false;
  const { A, B } = solveShotKeys(scene, shot, shot.framing, shot.camera);
  shot.keys = { A: { position: A.position, target: A.target, roll: A.roll }, B: B ? { position: B.position, target: B.target, roll: B.roll } : null };
  if (A.meta && A.meta.distance) shot.camera.focus_m = +(+A.meta.distance).toFixed(2);
  return true;
}
