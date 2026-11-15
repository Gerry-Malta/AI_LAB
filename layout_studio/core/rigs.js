// Camera rigs as parametric constraints. solveRig(shot) returns pose(t) plus a technical sheet and warnings,
// so every move stays reproducible with real equipment.
import { add, sub, scale, lerp, lerp1, norm, len, dist, distXZ, bezier2, yawPitchFromDir, dirFromYawPitch, lerpAngle, angleDelta, noise1, rotateAxis, cross, clamp, round, roundV, toRad } from './vec.js';
import { ease } from './motion.js';

export const RIGS = {
  static:    { id: 'static',    name: 'Sticks / tripod (pan-tilt only)', limits: { panRate: 45, tiltRate: 30, height: [0.25, 2.4] } },
  slider:    { id: 'slider',    name: 'Slider',                          limits: { track: 1.5, speed: 0.6, height: [0.3, 2.0] } },
  dolly:     { id: 'dolly',     name: 'Dolly on track',                  limits: { speed: 1.5, boom: [0.45, 1.95], track: 30 } },
  crane:     { id: 'crane',     name: 'Crane / jib / Technocrane',       limits: { arm: 15, speed: 3.0, minArm: 1.0 }, params: { arm: 9 } },
  steadicam: { id: 'steadicam', name: 'Steadicam',                       limits: { speed: 1.6, height: [0.5, 2.0] },  noise: { pos: 0.006, rot: 0.09, freq: 0.3 } },
  handheld:  { id: 'handheld',  name: 'Handheld',                        limits: { speed: 1.6, height: [0.4, 2.0] },  noise: { pos: 0.008, rot: 0.2, freq: 0.9 } },
  gimbal:    { id: 'gimbal',    name: 'Gimbal (Ronin)',                  limits: { speed: 2.5, height: [0.2, 2.4] },  noise: { pos: 0.003, rot: 0.03, freq: 0.6 } },
  drone:     { id: 'drone',     name: 'Drone',                           limits: { speed: 12, minHeight: 2 },          noise: { pos: 0.012, rot: 0.04, freq: 0.2 } },
  vehicle:   { id: 'vehicle',   name: 'Car mount / Russian arm',         limits: { speed: 30 } },
};
export const RIG_IDS = Object.keys(RIGS);

const keyOf = (k, fallback) => ({
  position: (k && k.position) || (fallback && fallback.position) || [0, 1.5, 5],
  target: (k && k.target) || (fallback && fallback.target) || [0, 1.5, 0],
  roll: (k && k.roll) || 0,
});

/** Solve a shot's camera move. Returns { pose(t), warnings, info, samples }. t in [0,1]. */
export function solveRig(shot, ctx = {}) {
  const rig = RIGS[(shot.rig && shot.rig.type) || 'static'] || RIGS.static;
  const prm = Object.assign({}, rig.params || {}, (shot.rig || {}));
  const A = keyOf(shot.keys && shot.keys.A);
  const B = keyOf(shot.keys && shot.keys.B, A);
  const duration = Math.max(0.1, shot.duration_s || 5);
  const curve = shot.curve || 'easeInOut';
  const warnings = [];
  const info = { rig: rig.id, rigName: rig.name };
  const noise = (shot.rig && (shot.rig.noise === false || shot.rig.shake === 0)) ? null : rig.noise;
  const seed = (prm.seed ?? 7) + 1;

  // --- subject tracking: ctx.track(t) is the subject's anchor at shot time t (moves with the blocking) ---------
  const track = typeof ctx.track === 'function' ? ctx.track : null;
  const followAim = !!(track && (prm.follow || prm.aim === 'subject'));
  const followPos = !!(track && prm.follow && rig.id !== 'static' && rig.id !== 'crane');
  let followTarget = null, followPosition = null;
  if (track) {
    const a0 = track(0), a1 = track(1);
    const tA = sub(A.target, a0), tB = sub(B.target, a1), pA = sub(A.position, a0), pB = sub(B.position, a1);
    const vf = prm.followVertical ?? 0.7; // an operator booms up and down less than the actor
    followTarget = (s, t) => add(track(t), lerp(tA, tB, s));
    // the operator keeps a distance and swings around the subject (polar interpolation), never through it
    const polar = (v) => ({ yaw: (Math.atan2(v[0], v[2]) * 180) / Math.PI, d: Math.hypot(v[0], v[2]), y: v[1] });
    const qa = polar(pA), qb = polar(pB);
    followPosition = (s, t) => {
      const a = track(t), yaw = toRad(lerpAngle(qa.yaw, qb.yaw, s)), d = lerp1(qa.d, qb.d, s);
      const p = [a[0] + Math.sin(yaw) * d, a[1] + lerp1(qa.y, qb.y, s), a[2] + Math.cos(yaw) * d];
      const y0 = lerp1(A.position[1], B.position[1], s);
      return [p[0], y0 + vf * (p[1] - y0), p[2]];
    };
    info.follow = followPos ? 'position + aim' : followAim ? 'aim' : undefined;
  }

  // --- base path (before noise) -------------------------------------------------------------
  let basePose;
  const lerpTarget = (s, t = s) => (followAim ? followTarget(s, t) : (prm.aim === 'subject' && ctx.subject) ? ctx.subject.slice() : lerp(A.target, B.target, s));
  const path = (s, t = s) => (followPos ? followPosition(s, t) : prm.via ? bezier2(A.position, prm.via, B.position, s) : lerp(A.position, B.position, s));

  if (rig.id === 'static') {
    if (dist(A.position, B.position) > 0.01) { warnings.push('Sticks cannot translate: key B position was constrained to key A.'); B.position = A.position.slice(); }
    const a = yawPitchFromDir(sub(A.target, A.position)), b = yawPitchFromDir(sub(B.target, B.position));
    const dA = dist(A.target, A.position) || 1, dB = dist(B.target, B.position) || 1;
    basePose = (s, t = s) => {
      if (followAim) return { position: A.position.slice(), target: followTarget(s, t), roll: lerp1(A.roll, B.roll, s) };
      const yaw = lerpAngle(a.yaw, b.yaw, s), pitch = lerp1(a.pitch, b.pitch, s);
      const d = lerp1(dA, dB, s);
      return { position: A.position.slice(), target: add(A.position, scale(dirFromYawPitch(yaw, pitch), d)), roll: lerp1(A.roll, B.roll, s) };
    };
    info.panDelta = round(angleDelta(a.yaw, b.yaw), 1); info.tiltDelta = round(b.pitch - a.pitch, 1);
  } else if (rig.id === 'crane') {
    // pivot: given, or auto placed on the ground behind the midpoint (away from the mean target)
    let pivot = prm.pivot;
    if (!pivot) {
      const mid = lerp(A.position, B.position, 0.5), midT = lerp(A.target, B.target, 0.5);
      const away = norm([mid[0] - midT[0], 0, mid[2] - midT[2]]);
      const back = Math.max(3, Math.min(10, 0.5 * distXZ(A.position, B.position) + 2, 0.4 * dist(mid, midT) + 2));
      pivot = [mid[0] + away[0] * back, 0, mid[2] + away[2] * back];
    }
    const base = [pivot[0], (prm.pivotHeight ?? 1.2), pivot[2]];
    const sph = (p) => { const d = sub(p, base); return { r: len(d), yaw: yawPitchFromDir(d).yaw, pitch: yawPitchFromDir(d).pitch }; };
    const sa = sph(A.position), sb = sph(B.position);
    const armMax = prm.arm || rig.limits.arm;
    info.pivot = roundV(base); info.armA = round(sa.r, 2); info.armB = round(sb.r, 2); info.armMax = armMax;
    if (Math.max(sa.r, sb.r) > armMax) warnings.push(`Crane reach ${Math.max(sa.r, sb.r).toFixed(1)} m exceeds arm ${armMax} m: move the pivot closer or use a longer arm.`);
    if (Math.min(sa.r, sb.r) < rig.limits.minArm) warnings.push('Crane key too close to the pivot (< 1 m).');
    basePose = (s, t = s) => {
      const r = lerp1(sa.r, sb.r, s), yaw = lerpAngle(sa.yaw, sb.yaw, s), pitch = lerp1(sa.pitch, sb.pitch, s);
      return { position: add(base, scale(dirFromYawPitch(yaw, pitch), r)), target: lerpTarget(s, t), roll: lerp1(A.roll, B.roll, s) };
    };
    info.swingDelta = round(angleDelta(sa.yaw, sb.yaw), 1); info.boomDelta = round(sb.pitch - sa.pitch, 1);
  } else {
    basePose = (s, t = s) => ({ position: path(s, t), target: lerpTarget(s, t), roll: lerp1(A.roll, B.roll, s) });
    if (rig.id === 'slider' && Math.abs(A.position[1] - B.position[1]) > 0.05) warnings.push('Slider keys differ in height: a slider is level, tilt the whole rig or use a jib.');
  }

  // --- noise (operator / handheld texture) --------------------------------------------------
  const velocityAt = (s) => { const h = 0.01; const p0 = basePose(Math.max(0, s - h)).position, p1 = basePose(Math.min(1, s + h)).position; return dist(p0, p1) / ((Math.min(1, s + h) - Math.max(0, s - h)) * duration); };
  const pose = (t) => {
    t = clamp(t, 0, 1);
    const s = ease(curve, t);
    const p = basePose(s, t);
    if (!noise) return p;
    const tt = t * duration;
    const speedFactor = rig.id === 'handheld' || rig.id === 'steadicam' ? 1 + 0.8 * Math.min(1, velocityAt(s) / 1.4) : 1;
    // intensity per shot (rig.shake, 1 = default) and steadier operating on long lenses
    const shake = prm.shake ?? 1, lensK = clamp(Math.sqrt(35 / ((shot.camera && shot.camera.focal_mm) || 35)), 0.5, 1.2);
    const amp = noise.pos * speedFactor * shake;
    const rotAmp = noise.rot * speedFactor * shake * lensK;
    const dp = [noise1(tt, seed, noise.freq) * amp, noise1(tt, seed + 1, noise.freq * 0.8) * amp * 0.7, noise1(tt, seed + 2, noise.freq * 1.1) * amp * 0.6];
    const position = add(p.position, dp);
    let dir = sub(p.target, position);
    const d = len(dir); dir = norm(dir);
    const right = norm(cross(dir, [0, 1, 0]));
    dir = rotateAxis(dir, [0, 1, 0], noise1(tt, seed + 3, noise.freq * 0.9) * rotAmp);
    dir = rotateAxis(dir, right, noise1(tt, seed + 4, noise.freq * 1.3) * rotAmp * 0.7);
    return { position, target: add(position, scale(dir, d)), roll: p.roll + noise1(tt, seed + 5, noise.freq * 0.7) * rotAmp * 0.3 };
  };

  // --- technical sheet from samples ---------------------------------------------------------
  const N = 120, samples = [];
  for (let i = 0; i <= N; i++) samples.push(basePose(ease(curve, i / N), i / N));
  let length = 0, maxSpeed = 0, maxPan = 0, maxTilt = 0, minH = Infinity, maxH = -Infinity;
  let prevYP = yawPitchFromDir(sub(samples[0].target, samples[0].position));
  for (let i = 1; i <= N; i++) {
    const seg = dist(samples[i].position, samples[i - 1].position); length += seg;
    maxSpeed = Math.max(maxSpeed, seg / (duration / N));
    const yp = yawPitchFromDir(sub(samples[i].target, samples[i].position));
    maxPan = Math.max(maxPan, Math.abs(angleDelta(prevYP.yaw, yp.yaw)) / (duration / N));
    maxTilt = Math.max(maxTilt, Math.abs(yp.pitch - prevYP.pitch) / (duration / N));
    prevYP = yp;
  }
  for (const s of samples) { minH = Math.min(minH, s.position[1]); maxH = Math.max(maxH, s.position[1]); }
  const ypA = yawPitchFromDir(sub(A.target, A.position)), ypB = yawPitchFromDir(sub(B.target, B.position));
  Object.assign(info, {
    duration_s: duration, curve, pathLength: round(length, 2), avgSpeed: round(length / duration, 2), maxSpeed: round(maxSpeed, 2),
    maxPanRate: round(maxPan, 1), maxTiltRate: round(maxTilt, 1), heightA: round(A.position[1], 2), heightB: round(B.position[1], 2),
    minHeight: round(minH, 2), maxHeight: round(maxH, 2), panDelta: info.panDelta ?? round(angleDelta(ypA.yaw, ypB.yaw), 1), tiltDelta: info.tiltDelta ?? round(ypB.pitch - ypA.pitch, 1),
    trackLengthXZ: round(distXZ(A.position, B.position), 2),
    distanceA: ctx.subject ? round(dist(A.position, ctx.subject), 2) : undefined,
    distanceB: ctx.subject ? round(dist(B.position, ctx.subject), 2) : undefined,
  });

  // --- limits -------------------------------------------------------------------------------
  const L = rig.limits;
  if (L.speed && maxSpeed > L.speed) warnings.push(`${rig.name}: peak speed ${maxSpeed.toFixed(2)} m/s exceeds the comfortable ${L.speed} m/s. Lengthen the shot (${Math.ceil(length / L.speed * 1.3)} s) or shorten the move.`);
  if (L.track && length > L.track) warnings.push(`${rig.name}: move length ${length.toFixed(1)} m exceeds the track limit of ${L.track} m.`);
  if (L.height && !prm.lowMode && (minH < L.height[0] || maxH > L.height[1])) warnings.push(`${rig.name}: lens height ${minH.toFixed(2)}–${maxH.toFixed(2)} m is outside the practical range ${L.height[0]}–${L.height[1]} m.`);
  if (L.boom && !prm.lowMode && (minH < L.boom[0] || maxH > L.boom[1])) warnings.push(`Dolly: lens height ${minH.toFixed(2)}–${maxH.toFixed(2)} m is outside the boom range ${L.boom[0]}–${L.boom[1]} m (add a riser / low mode or use a jib arm).`);
  if (L.minHeight && minH < L.minHeight) warnings.push(`Drone below ${L.minHeight} m: consider a gimbal or crane for this height.`);
  if (L.panRate && maxPan > L.panRate) warnings.push(`Pan rate ${maxPan.toFixed(0)}°/s exceeds ${L.panRate}°/s: risk of judder/whip, slow the pan or lengthen the shot.`);
  if (L.tiltRate && maxTilt > L.tiltRate) warnings.push(`Tilt rate ${maxTilt.toFixed(0)}°/s exceeds ${L.tiltRate}°/s.`);

  return { pose, warnings, info, samples };
}

/** Human-readable move summary for camera sheets. */
export function describeMove(info) {
  const parts = [];
  if (info.rig === 'static') parts.push(`static${Math.abs(info.panDelta) > 1 ? `, pan ${info.panDelta}°` : ''}${Math.abs(info.tiltDelta) > 1 ? `, tilt ${info.tiltDelta}°` : ''}${info.follow ? ', pans with the subject' : ''}`);
  else {
    parts.push(`${info.rigName}: ${info.pathLength} m in ${info.duration_s} s (avg ${info.avgSpeed} m/s, peak ${info.maxSpeed} m/s)`);
    if (info.follow) parts.push(`follows the subject (${info.follow})`);
    if (info.rig === 'crane') parts.push(`pivot ${info.pivot.join('/')} m, arm ${info.armA}→${info.armB} m, swing ${info.swingDelta}°, boom ${info.boomDelta}°`);
    if (Math.abs(info.heightA - info.heightB) > 0.05) parts.push(`lens height ${info.heightA}→${info.heightB} m`); else parts.push(`lens height ${info.heightA} m`);
    if (Math.abs(info.panDelta) > 1) parts.push(`pan ${info.panDelta}°`);
    if (Math.abs(info.tiltDelta) > 1) parts.push(`tilt ${info.tiltDelta}°`);
  }
  return parts.join(' · ');
}
