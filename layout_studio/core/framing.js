// Framing solver: from a subject, a shot size, a lens and an angle, compute camera position and target.
// This is what the agent uses to place cameras deterministically; the user can then nudge in the viewport.
import { add, sub, scale, norm, lerp, rotateY, facingDir, cameraBasis, dot, cross, dist, toRad, toDeg, clamp, distXZ, roundV, round } from './vec.js';
import { fovFor, activeGate, LENS_KITS } from './lens.js';
import { keypoints } from './standin.js';

/**
 * Shot sizes. Cut sizes frame [bottom keypoint .. top keypoint] with headroom (fraction of frame height).
 * Fill sizes make the visible subject height a fraction of the frame height.
 */
export const SHOT_SIZES = {
  EWS:    { name: 'Extreme wide',          fill: 0.15, bottomMargin: 0.15 },
  WS:     { name: 'Wide',                  fill: 0.42, bottomMargin: 0.12 },
  FS:     { name: 'Full shot',             bottom: 'feet',      top: 'headTop', headroom: 0.06, bottomMargin: 0.04 },
  MLS:    { name: 'Medium long / cowboy',  bottom: 'thigh',     top: 'headTop', headroom: 0.07 },
  MS:     { name: 'Medium',                bottom: 'hips',      top: 'headTop', headroom: 0.08 },
  MCU:    { name: 'Medium close-up',       bottom: 'chest',     top: 'headTop', headroom: 0.08 },
  CU:     { name: 'Close-up',              bottom: 'shoulders', top: 'headTop', headroom: 0.05 },
  BCU:    { name: 'Big close-up',          bottom: 'chin',      top: 'headTop', headroom: 0.02 },
  ECU:    { name: 'Extreme close-up',      bottom: 'mouth',     top: 'brow',    headroom: 0.0 },
  INSERT: { name: 'Insert / detail',       fill: 0.65, bottomMargin: 0.175 },
};
export const SHOT_SIZE_IDS = Object.keys(SHOT_SIZES);

const minY = (kp) => Math.min(...Object.values(kp).map((p) => p[1]));

/** Frame height needed (metres, at the subject plane) and the frame centre height for a subject + size. */
export function frameSpan(ch, sizeId, headroomOverride) {
  const spec = SHOT_SIZES[sizeId] || SHOT_SIZES.MS;
  const kp = keypoints(ch);
  let F, yb, anchor;
  if (spec.fill) {
    const top = kp.headTop[1], bottom = minY(kp);
    F = Math.max(0.2, (top - bottom)) / spec.fill;
    yb = bottom - spec.bottomMargin * F;
    anchor = kp.hips;
  } else {
    const top = kp[spec.top][1], bottom = kp[spec.bottom][1];
    const h = headroomOverride ?? spec.headroom, bm = spec.bottomMargin || 0;
    F = Math.max(0.05, top - bottom) / Math.max(0.2, 1 - h - bm);
    yb = bottom - bm * F;
    anchor = lerp(kp[spec.top], kp[spec.bottom], 0.5);
  }
  return { F, yc: yb + F / 2, anchor, kp, spec };
}

/**
 * Solve a single-subject framing.
 * @param {object} o
 *  subject {position, facing, pose, height}; size 'CU'|...; lens {filmback, focal_mm, aspect, squeeze};
 *  azimuth: degrees around the subject, 0 = frontal (camera in front of the face), 180 = behind,
 *           positive = counter-clockwise seen from above (towards the subject's own left);
 *  elevation: camera pitch in degrees (positive looks down) — ignored if cameraHeight is given;
 *  cameraHeight: absolute lens height (metres);
 *  leadRoom: fraction of frame width of extra space in front of the face (default 0.12);
 *  headroom: override fraction; distance: override metres.
 */
export function solveFraming(o) {
  const lens = Object.assign({ filmback: 'ALEXA35_OG', focal_mm: 35, aspect: 2.39, squeeze: 1 }, o.lens || {});
  const { vfov, hfov } = fovFor(lens);
  let { F, yc, anchor, kp, spec } = frameSpan(o.subject, o.size || 'MS', o.headroom);
  const face = facingDir(o.subject.facing || 0);
  const camDir = rotateY(face, o.azimuth ?? 30); // horizontal direction from subject to camera
  // lateral extent of the framed body span (matters for lying / crouching subjects): widen the frame if it does not fit
  const rightV = norm(cross([-camDir[0], 0, -camDir[2]], [0, 1, 0]));
  const chain = ['feet', 'knees', 'thigh', 'hips', 'chest', 'shoulders', 'chin', 'mouth', 'eyes', 'brow', 'headTop'];
  const spanNames = spec.fill ? chain : chain.slice(chain.indexOf(spec.bottom), chain.indexOf(spec.top) + 1);
  const H = o.subject.height || 1.75;
  let lo = Infinity, hi = -Infinity;
  for (const n of spanNames) { if (!kp[n]) continue; const v = dot(sub(kp[n], anchor), rightV); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const widthPad = (spec.bottom === 'chin' || spec.bottom === 'mouth') ? 0.16 * H : 0.3 * H;
  const extent = (hi - lo) + widthPad;
  const margin = o.margin ?? 0.08;
  const FwNeeded = extent / Math.max(0.2, 1 - 2 * margin);
  if (o.distance == null && FwNeeded > F * lens.aspect) {
    F = FwNeeded / lens.aspect;
    const top = spec.fill ? kp.headTop[1] : kp[spec.top][1];
    const h = o.headroom ?? spec.headroom ?? 0.1;
    if (!spec.fill) yc = top + h * F - F / 2;
    const mid = (lo + hi) / 2;
    anchor = [anchor[0] + mid * rightV[0], anchor[1], anchor[2] + mid * rightV[2]];
  }
  const d = o.distance ?? Math.max(0.3, (F / 2) / Math.tan(toRad(vfov) / 2));
  const Fw = F * lens.aspect;
  let elev = o.elevation ?? 0;
  if (o.cameraHeight != null) elev = toDeg(Math.asin(clamp((o.cameraHeight - yc) / d, -0.98, 0.98)));
  const ce = Math.cos(toRad(elev)), se = Math.sin(toRad(elev));
  let target = [anchor[0], yc, anchor[2]];
  let position = add(target, [camDir[0] * ce * d, se * d, camDir[2] * ce * d]);
  // lead room: translate camera + target sideways so the subject sits off-centre, space in front of the face
  const basis = cameraBasis(position, target, 0);
  const fdot = dot(face, basis.right);
  const facingSign = Math.abs(fdot) < 0.3 ? 0 : Math.sign(fdot);
  const lead = (o.leadRoom ?? 0.12) * Fw * facingSign;
  if (lead) { position = add(position, scale(basis.right, lead)); target = add(target, scale(basis.right, lead)); }
  const notes = [];
  if (d < 0.6 && lens.focal_mm < 40) notes.push('Very close with a wide lens: facial distortion likely.');
  return { position: roundV(position), target: roundV(target), distance: round(d, 2), frameHeight: round(F, 2), frameWidth: round(Fw, 2), vfov: round(vfov, 1), hfov: round(hfov, 1), size: spec.name, elevation: round(elev, 1), keypoints: kp, notes };
}

/**
 * Aim a camera that cannot move (sticks) at a subject: the head sits under the top edge with `headroom`,
 * or, when the frame is much taller than the subject, the body sits in the lower part of the frame.
 */
export function aimFromPosition(o) {
  const lens = Object.assign({ filmback: 'ALEXA35_OG', focal_mm: 35, aspect: 2.39, squeeze: 1 }, o.lens || {});
  const { vfov } = fovFor(lens);
  const kp = keypoints(o.subject);
  const d = Math.max(0.2, dist(o.position, kp.chest));
  const F = 2 * d * Math.tan(toRad(vfov) / 2), Fw = F * lens.aspect;
  const headroom = o.headroom ?? 0.1;
  const minY = Math.min(...Object.values(kp).map((p) => p[1]));
  const ycHead = kp.headTop[1] + headroom * F - F / 2;
  const ycBody = minY - 0.12 * F + F / 2;
  const yc = Math.max(ycHead, ycBody);
  let target = [kp.chest[0], yc, kp.chest[2]];
  const basis = cameraBasis(o.position, target, 0);
  const face = facingDir(o.subject.facing || 0);
  const fdot = dot(face, basis.right);
  const facingSign = Math.abs(fdot) < 0.3 ? 0 : Math.sign(fdot);
  const lead = (o.leadRoom ?? 0.12) * Fw * facingSign;
  if (lead) target = add(target, scale(basis.right, lead));
  return { target: roundV(target), distance: round(d, 2), frameHeight: round(F, 2) };
}

/**
 * Two-shot: both subjects in frame. side = +1/-1 picks the side of the a→b axis the camera sits on
 * (keep it constant across a scene to respect the 180° line). margin = fraction of frame width kept free per side.
 */
export function solveTwoShot(o) {
  const lens = Object.assign({ filmback: 'ALEXA35_OG', focal_mm: 35, aspect: 2.39, squeeze: 1 }, o.lens || {});
  const { vfov } = fovFor(lens);
  const sa = frameSpan(o.a, o.size || 'MS', o.headroom), sb = frameSpan(o.b, o.size || 'MS', o.headroom);
  const top = Math.max(sa.kp.headTop[1], sb.kp.headTop[1]);
  const spec = SHOT_SIZES[o.size || 'MS'];
  const Fv = Math.max(sa.F, sb.F) + Math.abs(sa.yc - sb.yc);
  const axis = sub(o.b.position, o.a.position); axis[1] = 0;
  const sep = Math.hypot(axis[0], axis[2]);
  const margin = o.margin ?? 0.12;
  const bodies = 0.25 * ((o.a.height || 1.75) + (o.b.height || 1.75)) * 0.5;
  const Fw = (sep + bodies) / Math.max(0.2, 1 - 2 * margin);
  const Fh = Fw / lens.aspect;
  const F = Math.max(Fv, Fh);
  const d = o.distance ?? Math.max(0.5, (F / 2) / Math.tan(toRad(vfov) / 2));
  const headroom = o.headroom ?? spec.headroom ?? 0.08;
  const yc = spec.fill ? (sa.yc + sb.yc) / 2 : top + headroom * F - F / 2;
  const mid = lerp(o.a.position, o.b.position, 0.5);
  let perp = norm([-axis[2], 0, axis[0]]);
  if ((o.side ?? 1) < 0) perp = scale(perp, -1);
  if (o.azimuthOffset) perp = rotateY(perp, o.azimuthOffset);
  let elev = o.elevation ?? 0;
  if (o.cameraHeight != null) elev = toDeg(Math.asin(clamp((o.cameraHeight - yc) / d, -0.98, 0.98)));
  const ce = Math.cos(toRad(elev)), se = Math.sin(toRad(elev));
  const target = [mid[0], yc, mid[2]];
  const position = add(target, [perp[0] * ce * d, se * d, perp[2] * ce * d]);
  return { position: roundV(position), target: roundV(target), distance: round(d, 2), frameHeight: round(F, 2), frameWidth: round(F * lens.aspect, 2), separation: round(sep, 2), elevation: round(elev, 1), notes: [] };
}

/**
 * Over-the-shoulder: camera behind `fg` looking at `bg`. side = +1/-1 shoulder choice (keep the line!).
 * If fitSize is given, the focal length is chosen from the kit to reach that size on `bg`.
 */
export function solveOTS(o) {
  const lens = Object.assign({ filmback: 'ALEXA35_OG', focal_mm: 50, aspect: 2.39, squeeze: 1 }, o.lens || {});
  const kfg = keypoints(o.fg), kbg = keypoints(o.bg);
  const dir = norm(sub([kbg.eyes[0], 0, kbg.eyes[2]], [kfg.shoulders[0], 0, kfg.shoulders[2]]));
  const right = norm([dir[2], 0, -dir[0]]);
  const side = o.side ?? 1;
  const back = o.back ?? 1.1, lateral = o.lateral ?? 0.45;
  const position = add(add(kfg.shoulders, scale(dir, -back)), scale(right, side * lateral));
  position[1] = kfg.shoulders[1] + (o.heightOffset ?? 0.12);
  const d = Math.hypot(kbg.eyes[0] - position[0], kbg.eyes[2] - position[2]);
  let focal = lens.focal_mm;
  if (o.fitSize) {
    const { F } = frameSpan(o.bg, o.fitSize);
    const gate = activeGate(lens.filmback, lens.aspect, lens.squeeze);
    const want = (gate.h * d) / F; // mm
    const kit = LENS_KITS[o.kit || 'S35 spherical primes'];
    focal = kit.reduce((p, c) => (Math.abs(c - want) < Math.abs(p - want) ? c : p), kit[0]);
  }
  const { vfov } = fovFor(Object.assign({}, lens, { focal_mm: focal }));
  const F = 2 * d * Math.tan(toRad(vfov) / 2), Fw = F * lens.aspect;
  // bg subject on the far third, fg shoulder on the near third
  const target = add([kbg.eyes[0], kbg.eyes[1] - 0.12 * F, kbg.eyes[2]], scale(right, -side * (o.offset ?? 0.18) * Fw));
  return { position: roundV(position), target: roundV(target), distance: round(d, 2), focal_mm: focal, frameHeight: round(F, 2), notes: [] };
}

/** Frame an object (prop) given its world bounds centre and size. */
export function frameObject(o) {
  const lens = Object.assign({ filmback: 'ALEXA35_OG', focal_mm: 50, aspect: 2.39, squeeze: 1 }, o.lens || {});
  const { vfov } = fovFor(lens);
  const fill = o.fill ?? 0.65;
  const extent = Math.max(o.size[0], o.size[1], o.size[2] || 0) / Math.max(1, lens.aspect / 1.2);
  const F = extent / fill;
  const d = o.distance ?? Math.max(0.25, (F / 2) / Math.tan(toRad(vfov) / 2));
  const az = o.azimuth ?? 0, elev = o.elevation ?? 55;
  const ce = Math.cos(toRad(elev)), se = Math.sin(toRad(elev));
  const dirH = rotateY([0, 0, 1], az);
  const target = o.center.slice();
  const position = add(target, [dirH[0] * ce * d, se * d, dirH[2] * ce * d]);
  return { position: roundV(position), target: roundV(target), distance: round(d, 2), frameHeight: round(F, 2), notes: [] };
}

/** Focal length that gives frame height F (m) at distance d (m) on a gate of height gateH (mm). */
export const focalForFrameHeight = (F, d, gateH) => (gateH * d) / F;
