// Composition metrics: deterministic checks of a framed shot (no AI). Works on the scene JSON + a solved camera pose.
import { sub, add, norm, dot, len, dist, distXZ, cameraBasis, projectPoint, boxCorners, localToWorld, worldToLocal, worldToLocalDir, rayAABB, facingDir, lerp, toRad, clamp, round } from './vec.js';
import { fovFor, equivalentFocal } from './lens.js';
import { keypoints, standinParts, partBox, charTransform } from './standin.js';
import { SHOT_SIZES } from './framing.js';

/** Oriented box parts (world transform + local centre/size) for any object kind. Shared with the viewer. */
export function objectParts(obj) {
  const s = obj.size || [1, 1, 1];
  const t = { position: obj.position, rotation: obj.rotation || [0, 0, 0], scale: obj.scale || [1, 1, 1] };
  switch (obj.kind) {
    case 'plane': return [];
    case 'tree': {
      const [dia, h, trunkFrac = 0.35] = s; const th = h * trunkFrac;
      return [
        { t, center: [0, th / 2, 0], size: [dia * 0.12, th, dia * 0.12], tag: 'trunk', shape: 'cylinder' },
        { t, center: [0, th + (h - th) / 2, 0], size: [dia, h - th, dia], tag: 'canopy', shape: 'cone' },
      ];
    }
    case 'standin': {
      const ch = { position: obj.position, facing: (obj.rotation || [0, 0, 0])[1], pose: obj.pose || 'stand', height: obj.height || 1.75 };
      return standinParts(ch.pose, ch.height).map((p) => { const b = partBox(p); return { t: charTransform(ch), center: b.center, size: b.size, tag: p.tag }; });
    }
    case 'sphere': return [{ t, center: [0, s[1] / 2, 0], size: [s[0], s[1], s[2] ?? s[0]], tag: 'body', shape: 'sphere' }];
    case 'cone': return [{ t, center: [0, s[1] / 2, 0], size: [s[0], s[1], s[2] ?? s[0]], tag: 'body', shape: 'cone' }];
    case 'cylinder': case 'capsule': return [{ t, center: [0, s[1] / 2, 0], size: [s[0], s[1], s[2] ?? s[0]], tag: 'body', shape: 'cylinder' }];
    case 'box': default:
      return [{ t, center: [0, s[1] / 2, 0], size: [s[0], s[1], s[2] ?? s[0]], tag: 'body', shape: 'box' }];
  }
}

/** Sample points of an oriented box: 8 corners, 6 face centres, centre (so cones/spheres and straddling boxes are caught). */
function boxSamples(part) {
  const pts = boxCorners(part.t, part.center, part.size);
  const [cx, cy, cz] = part.center, [sx, sy, sz] = part.size;
  for (const d of [[sx / 2, 0, 0], [-sx / 2, 0, 0], [0, sy / 2, 0], [0, -sy / 2, 0], [0, 0, sz / 2], [0, 0, -sz / 2], [0, 0, 0]]) pts.push(localToWorld(part.t, [cx + d[0], cy + d[1], cz + d[2]]));
  return pts;
}
const inFrustum = (pts, eye, basis, vfov, aspect) => {
  for (const c of pts) { const p = projectPoint(c, eye, basis, vfov, aspect); if (p.inFrame) return true; }
  return false;
};

/** Smallest positive root of a*t^2 + b*t + c = 0 that satisfies `ok(t)`, or null. */
function quadRoot(a, b, c, ok) {
  if (Math.abs(a) < 1e-12) { if (Math.abs(b) < 1e-12) return null; const t = -c / b; return t > 0 && ok(t) ? t : null; }
  const D = b * b - 4 * a * c; if (D < 0) return null;
  const sq = Math.sqrt(D); const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
  for (const t of t1 < t2 ? [t1, t2] : [t2, t1]) if (t > 0 && ok(t)) return t;
  return null;
}

/**
 * Ray test against an object part in its own frame. Boxes use the slab test; cones, cylinders and spheres are
 * analytic in normalized coordinates (X = x / (sx/2), Z = z / (sz/2), Y = (y + sy/2) / sy for cone/cylinder).
 * Returns the ray parameter t (world metres for unscaled objects) or null.
 */
function rayPart(origin, dir, part) {
  const lo = worldToLocal(part.t, origin), ld = worldToLocalDir(part.t, dir);
  const [sx, sy, sz] = part.size;
  const o = [lo[0] - part.center[0], lo[1] - part.center[1], lo[2] - part.center[2]];
  const shape = part.shape || 'box';
  if (shape === 'box') return rayAABB(o, ld, [-sx / 2, -sy / 2, -sz / 2], [sx / 2, sy / 2, sz / 2]);
  const ox = o[0] / (sx / 2), oz = o[2] / (sz / 2), dx = ld[0] / (sx / 2), dz = ld[2] / (sz / 2);
  if (shape === 'sphere') {
    const oy = o[1] / (sy / 2), dy = ld[1] / (sy / 2);
    return quadRoot(dx * dx + dy * dy + dz * dz, 2 * (ox * dx + oy * dy + oz * dz), ox * ox + oy * oy + oz * oz - 1, () => true);
  }
  const oy = (o[1] + sy / 2) / sy, dy = ld[1] / sy; // 0 at base, 1 at top
  const yAt = (t) => oy + dy * t;
  let best = null;
  const take = (t) => { if (t != null && t > 0 && (best == null || t < best)) best = t; };
  if (shape === 'cone') {
    // X^2 + Z^2 = (1 - Y)^2
    take(quadRoot(dx * dx + dz * dz - dy * dy, 2 * (ox * dx + oz * dz + dy * (1 - oy)), ox * ox + oz * oz - (1 - oy) * (1 - oy), (t) => { const y = yAt(t); return y >= 0 && y <= 1; }));
    if (Math.abs(dy) > 1e-12) { const t = -oy / dy; const x = ox + dx * t, z = oz + dz * t; if (t > 0 && x * x + z * z <= 1) take(t); }
    return best;
  }
  // cylinder: X^2 + Z^2 = 1, 0 <= Y <= 1, plus the two caps
  take(quadRoot(dx * dx + dz * dz, 2 * (ox * dx + oz * dz), ox * ox + oz * oz - 1, (t) => { const y = yAt(t); return y >= 0 && y <= 1; }));
  if (Math.abs(dy) > 1e-12) for (const cap of [0, 1]) { const t = (cap - oy) / dy; const x = ox + dx * t, z = oz + dz * t; if (t > 0 && x * x + z * z <= 1) take(t); }
  return best;
}

/** Resolve the subject (object or character id) into a character-like record using the active blocking. */
export function resolveSubject(scene, shot, blocking) {
  const id = shot.subject;
  if (!id) return null;
  const obj = (scene.objects || []).find((o) => o.id === id);
  if (!obj) return null;
  if (obj.kind === 'standin') {
    const b = (blocking && blocking[id]) || {};
    return { id, kind: 'standin', name: obj.name || id, position: b.position || obj.position, facing: b.facing ?? (obj.rotation || [0, 0, 0])[1], pose: b.pose || obj.pose || 'stand', height: obj.height || 1.75 };
  }
  return { id, kind: obj.kind, name: obj.name || id, position: obj.position, size: obj.size || [1, 1, 1], facing: (obj.rotation || [0, 0, 0])[1] };
}

/** Objects with the beat blocking applied (positions/facing/pose of stand-ins). */
export function applyBlocking(scene, blocking) {
  return (scene.objects || []).map((o) => {
    if (o.kind !== 'standin' || !blocking || !blocking[o.id]) return o;
    const b = blocking[o.id];
    return Object.assign({}, o, { position: b.position || o.position, rotation: [0, b.facing ?? (o.rotation || [0, 0, 0])[1], 0], pose: b.pose || o.pose, visible: b.visible ?? o.visible });
  });
}

const SIZE_ORDER = ['EWS', 'WS', 'FS', 'MLS', 'MS', 'MCU', 'CU', 'BCU', 'ECU'];

/**
 * Evaluate a framed moment.
 * @param scene the scene JSON; @param shot the shot; @param pose {position,target,roll}; @param blocking beat blocking map
 */
export function evaluateFrame(scene, shot, pose, blocking, opts = {}) {
  const lens = Object.assign({ filmback: 'ALEXA35_OG', focal_mm: 35, aspect: 2.39, squeeze: 1 }, shot.camera || {});
  const { vfov, hfov } = fovFor(lens);
  const aspect = lens.aspect;
  const eye = pose.position, basis = cameraBasis(eye, pose.target, pose.roll || 0);
  const P = (p) => projectPoint(p, eye, basis, vfov, aspect);
  const flags = [];
  const flag = (level, msg) => flags.push({ level, msg });
  const objects = applyBlocking(scene, blocking).filter((o) => o.visible !== false);
  const subject = resolveSubject(scene, shot, blocking);
  const res = { lens: { focal_mm: lens.focal_mm, hfov: round(hfov, 1), vfov: round(vfov, 1), ffEquivalent: round(equivalentFocal(lens), 0) }, flags };

  // ---- horizon & eyeline ----
  const fwdH = norm([basis.forward[0], 0, basis.forward[2]]);
  const horizonP = P(add(eye, [fwdH[0] * 1e5, 0, fwdH[2] * 1e5]));
  const horizonY = horizonP.behind ? null : (horizonP.y + 1) / 2; // 0 bottom .. 1 top
  res.horizon = { y: horizonY == null ? null : round(horizonY, 2), inFrame: horizonY != null && horizonY >= 0 && horizonY <= 1 };
  if (res.horizon.inFrame && Math.abs(horizonY - 0.5) < 0.05) flag('info', 'Horizon runs through the centre of frame: consider placing it on a third.');
  res.cameraHeight = round(eye[1], 2);
  res.roll = round(pose.roll || 0, 1);
  if (Math.abs(res.roll) > 2) flag('info', `Dutch angle ${res.roll}°.`);

  // ---- subject ----
  let subjectDist = null, subjKP = null;
  if (subject && subject.kind === 'standin') {
    subjKP = keypoints(subject);
    const proj = {}; for (const [k, p] of Object.entries(subjKP)) proj[k] = P(p);
    subjectDist = dist(eye, subjKP.chest);
    const eyes = proj.eyes, head = proj.headTop;
    const ys = Object.values(proj).filter((p) => !p.behind).map((p) => p.y), xs = Object.values(proj).filter((p) => !p.behind).map((p) => p.x);
    const topY = Math.max(...ys), botY = Math.min(...ys), minX = Math.min(...xs), maxX = Math.max(...xs);
    if (!eyes.behind) {
      // measured size: which keypoint is cut by the bottom edge
      const order = ['feet', 'knees', 'thigh', 'hips', 'chest', 'shoulders', 'chin', 'mouth', 'brow', 'headTop'];
      let cut = 'feet';
      for (const k of order) { if (proj[k].y < -1) cut = k; else break; }
      const visibleFrac = (Math.min(1, topY) - Math.max(-1, botY)) / 2;
      const lying = ['lie_prone', 'lie_supine'].includes(subject.pose);
      const headFrac = Math.max(0, (proj.headTop.y - proj.chin.y) / 2); // head height as a fraction of frame height
      const byHead = headFrac >= 0.9 ? 'ECU' : headFrac >= 0.72 ? 'BCU' : headFrac >= 0.5 ? 'CU' : headFrac >= 0.31 ? 'MCU' : headFrac >= 0.21 ? 'MS' : headFrac >= 0.15 ? 'MLS' : headFrac >= 0.085 ? 'FS' : headFrac >= 0.035 ? 'WS' : 'EWS';
      let measured;
      if (lying) measured = byHead;
      else if (cut === 'feet') measured = visibleFrac > 0.78 ? 'FS' : visibleFrac > 0.28 ? 'WS' : 'EWS';
      else measured = { knees: 'MLS', thigh: 'MLS', hips: 'MS', chest: 'MCU', shoulders: 'CU', chin: 'BCU', mouth: 'ECU', brow: 'ECU', headTop: 'ECU' }[cut] || 'MS';
      const headroom = (1 - head.y) / 2; // fraction of frame height above head top
      const requested = opts.expectedSize || shot.size;
      const sizeOk = !requested || requested === 'INSERT' || requested === measured || Math.abs(SIZE_ORDER.indexOf(requested) - SIZE_ORDER.indexOf(measured)) <= 1;
      res.size = { requested, measured, subjectHeightFrac: round(visibleFrac, 2), headFrac: round(headFrac, 2), cutAt: lying ? 'head-rule' : cut, ok: sizeOk };
      if (!sizeOk) flag('warn', `Requested ${requested} but the frame reads as ${measured}.`);
      const spec = SHOT_SIZES[requested] || {};
      const wantHeadroom = spec.headroom ?? 0.1;
      res.headroom = { value: round(headroom, 3), ok: true };
      if (head.y > 1 && !['BCU', 'ECU', 'INSERT'].includes(requested)) { res.headroom.ok = false; flag('bad', 'Head top is cut by the frame edge.'); }
      else if (headroom > wantHeadroom + 0.12 && !spec.fill) { res.headroom.ok = false; flag('warn', `Too much headroom (${(headroom * 100).toFixed(0)}% of frame height).`); }
      else if (headroom < 0.01 && !['BCU', 'ECU'].includes(requested)) { res.headroom.ok = false; flag('warn', 'Head touches the top edge.'); }
      // lead room
      const face = facingDir(subject.facing || 0);
      const fdot = dot(face, basis.right);
      const fx = Math.abs(fdot) < 0.3 ? 0 : Math.sign(fdot);
      const sx = (eyes.x + 1) / 2;
      const front = fx > 0 ? 1 - sx : fx < 0 ? sx : 0.5, behind = 1 - front;
      res.leadRoom = { front: round(front, 2), behind: round(behind, 2), facing: fx > 0 ? 'right' : fx < 0 ? 'left' : 'camera' };
      if (fx !== 0 && Math.abs(eyes.x) > 0.12 && front < behind && (!lying || front < 0.15)) flag('warn', 'Subject looks into the near edge: give lead room on the facing side.');
      // thirds
      const px = (eyes.x + 1) / 2, py = (eyes.y + 1) / 2;
      const pts = [[1 / 3, 2 / 3], [2 / 3, 2 / 3], [1 / 3, 1 / 3], [2 / 3, 1 / 3]];
      const dmin = Math.min(...pts.map(([a, b]) => Math.hypot(px - a, py - b)));
      res.thirds = { eyesX: round(px, 2), eyesY: round(py, 2), distToPowerPoint: round(dmin, 2), centred: Math.abs(px - 0.5) < 0.08 };
      if (['CU', 'MCU', 'MS'].includes(requested) && py < 0.55) flag('info', 'Eyes sit low in frame; the upper third usually reads better.');
      // edges
      const tang = [];
      if (maxX > 0.96 && maxX <= 1) tang.push('right'); if (minX < -0.96 && minX >= -1) tang.push('left');
      if (topY > 0.96 && topY <= 1) tang.push('top');
      if (tang.length) { res.tangent = tang; flag('info', `Subject tangent to the ${tang.join('/')} edge.`); }
      if (minX < -1 && maxX > -1 || maxX > 1 && minX < 1) { if (Math.abs(eyes.x) > 0.9) flag('bad', 'Subject is split by the frame edge.'); }
      // eyeline
      const dh = eye[1] - subjKP.eyes[1];
      res.eyeline = { cameraMinusEyes: round(dh, 2), rel: dh > 0.25 ? 'high angle' : dh < -0.25 ? 'low angle' : 'eye level' };
      // occlusion: rays to eyes and chest against every other object part
      const occluders = new Set();
      for (const kpName of ['eyes', 'chest']) {
        const dir = norm(sub(subjKP[kpName], eye)), maxT = dist(eye, subjKP[kpName]) - 0.05;
        for (const o of objects) {
          if (o.id === subject.id || o.kind === 'plane' || o.role === 'GROUND') continue;
          for (const part of objectParts(o)) { const t = rayPart(eye, dir, part); if (t != null && t > 0.02 && t < maxT) { occluders.add(o.name || o.id); break; } }
        }
      }
      res.occlusion = { occluded: occluders.size > 0, by: [...occluders] };
      if (occluders.size) flag(shot.allowOcclusion ? 'info' : 'warn', `Subject partly hidden by ${[...occluders].join(', ')}.`);
      // distortion
      if (subjectDist < 1.2 && res.lens.ffEquivalent < 35 && ['CU', 'BCU', 'ECU', 'MCU'].includes(requested)) flag('warn', 'Wide lens very close to a face: distortion.');
      res.subjectDistance = round(subjectDist, 2);
    } else {
      flag('bad', 'Subject is behind the camera.');
    }
  } else if (subject) {
    const so = objects.find((x) => x.id === subject.id);
    const parts = so ? objectParts(so) : [];
    let seen = parts.length === 0;
    for (const part of parts) { if (inFrustum(boxSamples(part), eye, basis, vfov, aspect)) { seen = true; break; } }
    const c = add(subject.position, [0, (subject.size[1] || 0) / 2, 0]);
    subjectDist = dist(eye, c); res.subjectDistance = round(subjectDist, 2);
    if (!seen) flag('bad', 'Subject object is out of frame.');
    else {
      // occlusion: rays to the top centre and centre of each part that is in frame
      let tested = 0, blocked = 0; const by = new Set();
      for (const part of parts) {
        const [cx, cy, cz] = part.center, sy = part.size[1];
        for (const lp of [[cx, cy + sy / 2 - 0.01, cz], [cx, cy, cz]]) {
          const wp = localToWorld(part.t, lp);
          if (!projectPoint(wp, eye, basis, vfov, aspect).inFrame) continue;
          tested++;
          const dir = norm(sub(wp, eye)), maxT = dist(eye, wp) - 0.05;
          let hit = null;
          for (const o of objects) {
            if (o.id === subject.id || o.kind === 'plane') continue;
            for (const op of objectParts(o)) { const t = rayPart(eye, dir, op); if (t != null && t > 0.02 && t < maxT) { hit = o; break; } }
            if (hit) break;
          }
          if (hit) { blocked++; by.add(hit.name || hit.id); }
        }
      }
      res.occlusion = { occluded: blocked > 0, by: [...by], tested, blocked };
      if (tested && blocked === tested) flag('bad', `Subject hidden behind ${[...by].slice(0, 3).join(', ')}.`);
      else if (blocked) flag(shot.allowOcclusion ? 'info' : 'warn', `Subject partly hidden by ${[...by].slice(0, 3).join(', ')}.`);
    }
  }

  // ---- depth layers ----
  const layers = { fg: [], mg: [], bg: [] };
  const ref = subjectDist || dist(eye, pose.target);
  for (const o of objects) {
    if (o.kind === 'plane' || (subject && o.id === subject.id)) continue;
    const parts = objectParts(o);
    let seen = false, dmin = Infinity;
    for (const part of parts) {
      const corners = boxSamples(part);
      if (inFrustum(corners, eye, basis, vfov, aspect)) { seen = true; dmin = Math.min(dmin, Math.min(...corners.map((c) => dot(sub(c, eye), basis.forward)))); }
    }
    if (!seen) continue;
    const bucket = dmin < 0.6 * ref ? 'fg' : dmin <= 1.8 * ref ? 'mg' : 'bg';
    layers[bucket].push(o.name || o.id);
  }
  res.depth = { fg: layers.fg, mg: layers.mg, bg: layers.bg, counts: [layers.fg.length, layers.mg.length, layers.bg.length] };
  if (shot.wantForeground && !layers.fg.length) flag('warn', 'No foreground element although the shot asks for one.');
  if (!layers.bg.length && !layers.mg.length && !['BCU', 'ECU', 'INSERT'].includes(shot.size)) flag('info', 'Nothing behind the subject: flat depth.');

  // ---- score ----
  let score = 100;
  for (const f of flags) score -= f.level === 'bad' ? 25 : f.level === 'warn' ? 10 : 2;
  res.score = clamp(Math.round(score), 0, 100);
  return res;
}

/** 180° line check between consecutive shots of the same beat (two main characters). */
export function checkLine(scene, shots, poses, blockings) {
  const issues = [];
  for (let i = 1; i < shots.length; i++) {
    const a = shots[i - 1], b = shots[i];
    if (!a.beat || a.beat !== b.beat || !a.line || !b.line) continue;
    const [p, q] = a.line; // ids of the two characters defining the axis
    const bl = blockings[i] || {};
    const P1 = (bl[p] && bl[p].position) || (scene.objects.find((o) => o.id === p) || {}).position;
    const P2 = (bl[q] && bl[q].position) || (scene.objects.find((o) => o.id === q) || {}).position;
    if (!P1 || !P2) continue;
    const side = (pos) => Math.sign((P2[0] - P1[0]) * (pos[2] - P1[2]) - (P2[2] - P1[2]) * (pos[0] - P1[0]));
    const sa = side(poses[i - 1].position), sb = side(poses[i].position);
    if (sa && sb && sa !== sb) issues.push({ from: a.id, to: b.id, msg: `Crossing the line between ${a.name || a.id} and ${b.name || b.id} (axis ${p}–${q}).` });
  }
  return issues;
}
