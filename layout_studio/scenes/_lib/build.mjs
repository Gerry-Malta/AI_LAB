// Scene builder used by the generation scripts (Node). It is the "hands" of the agent layer:
// it turns a described layout into the scene JSON, solving every camera with the deterministic core.
import fs from 'node:fs';
import path from 'node:path';
import * as core from '../../core/index.js';

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function createBuilder(meta) {
  const scene = core.newScene(meta);
  const B = { scene, core };
  const push = (o) => { scene.objects.push(core.newObject(o)); return o.id; };
  B.add = push;
  B.box = (id, name, role, position, size, opts = {}) => push(Object.assign({ id, name, role, kind: 'box', position, size }, opts));
  B.cylinder = (id, name, role, position, size, opts = {}) => push(Object.assign({ id, name, role, kind: 'cylinder', position, size }, opts));
  B.cone = (id, name, role, position, size, opts = {}) => push(Object.assign({ id, name, role, kind: 'cone', position, size }, opts));
  B.sphere = (id, name, role, position, size, opts = {}) => push(Object.assign({ id, name, role, kind: 'sphere', position, size }, opts));
  B.tree = (id, position, dia, h, opts = {}) => push(Object.assign({ id, name: opts.name || 'Pine', role: 'ENV', kind: 'tree', position, size: [dia, h, opts.trunk ?? 0.35], color: opts.color || '#2f5d3a', source: 'inferred' }, opts));
  B.standin = (id, name, height, color, position, facing = 0, pose = 'stand', opts = {}) => push(Object.assign({ id, name, role: 'CHAR', kind: 'standin', position, rotation: [0, facing, 0], height, pose, color, size: [0.5, height, 0.3] }, opts));
  B.beat = (id, label, t0, t1, blocking, opts = {}) => { scene.beats.push(Object.assign({ id, label, t0, t1, blocking }, opts)); return id; };

  /** Character record at a beat (falls back to the object's rest transform). */
  B.char = (id, beatId) => {
    const o = scene.objects.find((x) => x.id === id);
    if (!o) throw new Error(`unknown character ${id}`);
    const beat = scene.beats.find((b) => b.id === beatId);
    const bl = (beat && beat.blocking && beat.blocking[id]) || {};
    return { id, position: bl.position || o.position, facing: bl.facing ?? o.rotation[1], pose: bl.pose || o.pose || 'stand', height: o.height || 1.75, age: o.age };
  };
  B.object = (id) => { const o = scene.objects.find((x) => x.id === id); if (!o) throw new Error(`unknown object ${id}`); return o; };

  const solveKey = (def, shot, lens, beatId) => core.solveKeyDef(scene, shot, def, lens, beatId);

  /** Add a shot. A/B are framing definitions (see solveKey). */
  B.shot = (def) => {
    const lens = Object.assign({ filmback: 'ALEXA35_OG', focal_mm: 35, aspect: 2.39, squeeze: 1, fstop: 2.8 }, def.lens || {});
    const shot = core.newShot({ id: def.id, name: def.name || def.id, beat: def.beat || null, size: def.size || 'MS', subject: def.subject || null, intent: def.intent || '', notes: def.notes || '', duration_s: def.duration_s || 5, curve: def.curve || 'easeInOut', rig: Object.assign({ type: 'static' }, def.rig || {}), wantForeground: !!def.wantForeground, allowOcclusion: !!def.allowOcclusion, line: def.line || null, beatA: def.beatA || null, beatB: def.beatB || null, dialogue: def.dialogue || [], camera: lens });
    const { A, B: Bk } = core.solveShotKeys(scene, shot, { A: def.A, B: def.B || null }, lens);
    shot.keys = { A: { position: A.position, target: A.target, roll: A.roll }, B: Bk ? { position: Bk.position, target: Bk.target, roll: Bk.roll } : null };
    if (!lens.focus_m && A.meta && A.meta.distance) lens.focus_m = +A.meta.distance.toFixed(2);
    shot.camera = lens;
    shot.framing = { A: def.A, B: def.B || null };
    if (def.A && def.A.type === 'ots' && def.allowOcclusion == null) shot.allowOcclusion = true;
    scene.shots.push(shot);
    return shot;
  };

  B.report = () => {
    const lines = [];
    for (const shot of scene.shots) {
      const solved = core.solveShot(scene, shot);
      const blA = core.blockingAt(scene, shot, 0);
      const blB = core.blockingAt(scene, shot, 1);
      const sizeA = (shot.framing && shot.framing.A && shot.framing.A.size) || shot.size;
      const sizeB = (shot.framing && shot.framing.B && shot.framing.B.size) || shot.size;
      const fgA = shot.framing && shot.framing.A ? shot.framing.A.wantForeground : undefined;
      const fgB = shot.framing && shot.framing.B ? shot.framing.B.wantForeground : undefined;
      const evA = core.evaluateFrame(scene, shot, solved.pose(0), blA, { expectedSize: sizeA, wantForeground: fgA });
      const evB = shot.keys.B ? core.evaluateFrame(scene, shot, solved.pose(1), blB, { expectedSize: sizeB, wantForeground: fgB }) : null;
      lines.push(`${shot.name.padEnd(4)} ${String(shot.size).padEnd(6)} ${core.describeMove(solved.info)}`);
      // moving shots (camera or blocking): check the middle of the move too
      const moving = solved.info.pathLength > 0.05 || Math.abs(solved.info.panDelta) > 2 || (shot.beatA && shot.beatB && shot.beatA !== shot.beatB);
      if (moving) for (const t of [0.25, 0.5, 0.75]) {
        const ev = core.evaluateFrame(scene, shot, solved.pose(t), core.blockingAt(scene, shot, t), { expectedSize: 'WS', wantForeground: t < 0.5 ? fgA : fgB });
        const bad = ev.flags.filter((f) => f.level !== 'info' && !/Requested|headroom/.test(f.msg));
        if (bad.length) lines.push(`     t${t}: ${bad.map((f) => `[${f.level}] ${f.msg}`).join(' ')}`);
      }
      lines.push(`     A: score ${evA.score} size ${evA.size ? evA.size.measured : '-'} ${evA.flags.filter((f) => f.level !== 'info').map((f) => `[${f.level}] ${f.msg}`).join(' ')}`);
      if (evB) lines.push(`     B: score ${evB.score} size ${evB.size ? evB.size.measured : '-'} ${evB.flags.filter((f) => f.level !== 'info').map((f) => `[${f.level}] ${f.msg}`).join(' ')}`);
      for (const w of solved.warnings) lines.push(`     ⚠ ${w}`);
    }
    return lines.join('\n');
  };

  B.save = (file) => {
    const errors = core.validateScene(scene);
    if (errors.length) throw new Error('invalid scene: ' + errors.join('; '));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(scene, null, 1));
    return file;
  };
  return B;
}
