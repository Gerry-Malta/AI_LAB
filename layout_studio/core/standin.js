// Stand-ins as Unreal-style mannequins.
// A skeleton with real body proportions (adult, child or in between), poses as joint angles, forward kinematics and
// automatic grounding. One source of truth for the viewer meshes, the shot-check keypoints, occlusion and the Blender export.
// Local frame: origin on the ground under the pelvis, +Z = facing direction, +Y = up, +X = the character's left.
import { add, lerp, lerp1, clamp, dist, rotateY, localToWorld, mat3Mul, mat3MulVec, toRad } from './vec.js';

// ------------------------------------------------------------------ proportions --------------------------------------------
// Fractions of the standing height H. Adult values follow standard anthropometric tables (Drillis & Contini);
// the child table is a 6-year-old (head about 1/5.7 of the height, shorter legs, rounder limbs). Ages in between blend.
const ADULT = {
  top: 1, brow: 0.952, eyes: 0.936, mouth: 0.895, chin: 0.87, headPivot: 0.9, neck: 0.84, shoulderY: 0.818, shoulderX: 0.115,
  chest: 0.72, waist: 0.615, hip: 0.53, hipX: 0.05, knee: 0.285, ankle: 0.039,
  upperArm: 0.186, foreArm: 0.146, hand: 0.108, footFwd: 0.115, footBack: 0.04, footW: 0.056,
  headW: 0.086, headD: 0.112, chestW: 0.175, chestD: 0.108, chestH: 0.19, waistW: 0.13, waistD: 0.092, waistH: 0.1,
  pelvisW: 0.18, pelvisD: 0.112, pelvisH: 0.11,
  rNeck: 0.03, rUpperArm: 0.03, rForeArm: 0.024, rThigh: 0.048, rShin: 0.034, rShoulder: 0.033, rElbow: 0.024, rKnee: 0.032,
  handW: 0.05, handT: 0.022,
};
const CHILD = {
  top: 1, brow: 0.935, eyes: 0.9, mouth: 0.857, chin: 0.825, headPivot: 0.862, neck: 0.8, shoulderY: 0.776, shoulderX: 0.1,
  chest: 0.69, waist: 0.585, hip: 0.47, hipX: 0.055, knee: 0.255, ankle: 0.04,
  upperArm: 0.175, foreArm: 0.14, hand: 0.1, footFwd: 0.12, footBack: 0.04, footW: 0.062,
  headW: 0.122, headD: 0.15, chestW: 0.19, chestD: 0.13, chestH: 0.19, waistW: 0.155, waistD: 0.115, waistH: 0.1,
  pelvisW: 0.18, pelvisD: 0.12, pelvisH: 0.1,
  rNeck: 0.034, rUpperArm: 0.031, rForeArm: 0.026, rThigh: 0.051, rShin: 0.037, rShoulder: 0.033, rElbow: 0.025, rKnee: 0.034,
  handW: 0.055, handT: 0.025,
};
export const DEFAULT_AGE = 30;
/** Age used for proportions: explicit, or estimated from the height for children (below 1.55 m). */
export function ageFor(height, age) {
  if (age != null && isFinite(age)) return +age;
  const cm = (height || 1.75) * 100;
  return cm < 155 ? clamp((cm - 77) / 6, 2, 16) : DEFAULT_AGE;
}
/** Body measures in metres for a standing height and an age. */
export function proportions(height = 1.75, age) {
  const a = ageFor(height, age);
  const w = clamp((a - 6) / 10, 0, 1);
  const P = { H: height, age: a };
  for (const k of Object.keys(ADULT)) P[k] = lerp1(CHILD[k], ADULT[k], w) * height;
  return P;
}

// ------------------------------------------------------------------ poses --------------------------------------------------
// Joint angles in degrees.
//  root, spine, chest, neck, head: pitch (+ bends forward), yaw (+ turns to the character's left), roll (+ leans left).
//  shoulder, hip: flex (+ swings the limb forward), abd (+ out to the side), twist (+ external rotation).
//  elbow, knee: flex (+ bends). ankle, wrist: flex (+ toes or back of the hand up).
//  A key without side (shoulder) applies to both; shoulderL / shoulderR override one side.
//  In a blocking, a pose can be a library name or { base: 'sit_ground', head: { pitch: 25 }, ... } to adjust the acting.
export const POSE_LIBRARY = {
  stand: { shoulder: { abd: 9, flex: 3 }, elbow: { flex: 10 }, wrist: { flex: 4 }, hip: { abd: 3 }, knee: { flex: 3 }, ankle: { flex: 3 } },
  walk: {
    root: { pitch: 2 }, chest: { yaw: -5 }, shoulderL: { flex: -18, abd: 8 }, shoulderR: { flex: 22, abd: 8 }, elbowL: { flex: 12 }, elbowR: { flex: 30 },
    hipL: { flex: 24 }, kneeL: { flex: 6 }, ankleL: { flex: 8 }, hipR: { flex: -14 }, kneeR: { flex: 22 }, ankleR: { flex: -12 },
  },
  sit_ground: {
    root: { pitch: -15 }, spine: { pitch: 18 }, chest: { pitch: 8 }, neck: { pitch: 4 }, head: { pitch: 8 },
    shoulder: { flex: 30, abd: 4 }, elbow: { flex: 118 }, wrist: { flex: 8 }, hip: { flex: 140, abd: 14, twist: 6 }, knee: { flex: 155 }, ankle: { flex: 0 },
  },
  sit_cross: {
    root: { pitch: 0 }, spine: { pitch: 10 }, chest: { pitch: 6 }, head: { pitch: 10 },
    shoulder: { flex: 30, abd: 12 }, elbow: { flex: 64 }, hip: { flex: 100, abd: 30, twist: 75 }, knee: { flex: 140 }, ankle: { flex: 6 },
  },
  sit_chair: {
    spine: { pitch: 4 }, head: { pitch: 4 }, shoulder: { flex: 30, abd: 8 }, elbow: { flex: 70 }, hip: { flex: 88, abd: 6 }, knee: { flex: 86 }, ankle: { flex: -2 },
  },
  crouch: {
    root: { pitch: 22 }, spine: { pitch: 14 }, chest: { pitch: 6 }, neck: { pitch: -8 }, head: { pitch: 2 },
    shoulder: { flex: 44, abd: 14 }, elbow: { flex: 46 }, hip: { flex: 112, abd: 18, twist: 10 }, knee: { flex: 136 }, ankle: { flex: 24 },
  },
  kneel: { spine: { pitch: 4 }, head: { pitch: 2 }, shoulder: { flex: 12, abd: 9 }, elbow: { flex: 24 }, hip: { flex: 2, abd: 4 }, knee: { flex: 90 }, ankle: { flex: -75 } },
  lie_prone: {
    root: { pitch: 90 }, spine: { pitch: -30 }, chest: { pitch: -2 }, neck: { pitch: -18 }, head: { pitch: 16 },
    shoulder: { flex: 100, abd: 16 }, elbow: { flex: 45 }, wrist: { flex: 6 }, hip: { flex: -2, abd: 6 }, kneeL: { flex: 72 }, kneeR: { flex: 38 }, ankle: { flex: -38 },
  },
  lie_supine: { root: { pitch: -90, roll: 180 }, head: { pitch: -8 }, shoulder: { abd: 16 }, elbow: { flex: 12 }, hip: { abd: 5 }, knee: { flex: 2 }, ankle: { flex: -24 } },
};
export const POSES = Object.keys(POSE_LIBRARY);
export const POSE_NAMES = {
  stand: 'Standing', walk: 'Walking (mid stride)', sit_ground: 'Sitting on the ground, knees up', sit_cross: 'Sitting cross-legged',
  sit_chair: 'Sitting on a chair', crouch: 'Crouching', kneel: 'Kneeling', lie_prone: 'Lying prone, on the elbows', lie_supine: 'Lying on the back',
};
const AXIAL = ['root', 'spine', 'chest', 'neck', 'head'];
const LIMBS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'];
export const JOINTS = [...AXIAL, ...LIMBS.flatMap((j) => [j + 'L', j + 'R'])];

function expand(def) {
  const out = {};
  for (const j of AXIAL) out[j] = Object.assign({}, def[j] || {});
  for (const j of LIMBS) { out[j + 'L'] = Object.assign({}, def[j] || {}, def[j + 'L'] || {}); out[j + 'R'] = Object.assign({}, def[j] || {}, def[j + 'R'] || {}); }
  return out;
}
export function blendPoses(A, B, w) {
  const out = {};
  for (const j of JOINTS) {
    const a = A[j] || {}, b = B[j] || {}, o = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = lerp1(a[k] || 0, b[k] || 0, w);
    out[j] = o;
  }
  return out;
}
/** Full joint map for a pose: a library name, a blend {a, b, w}, or an explicit angle set. */
export function resolvePose(pose) {
  if (pose == null) return expand(POSE_LIBRARY.stand);
  if (typeof pose === 'string') return expand(POSE_LIBRARY[pose] || POSE_LIBRARY.stand);
  if (pose.a !== undefined || pose.b !== undefined) return blendPoses(resolvePose(pose.a), resolvePose(pose.b), clamp(pose.w ?? 0.5, 0, 1));
  if (pose.base) {
    const merged = Object.assign({}, POSE_LIBRARY[pose.base] || POSE_LIBRARY.stand);
    for (const [k, v] of Object.entries(pose)) if (k !== 'base') merged[k] = Object.assign({}, merged[k] || {}, v);
    return expand(merged);
  }
  return expand(pose);
}
export const poseBlend = (a, b, w) => (w <= 0 || a === b ? a : w >= 1 ? b : { a, b, w });
/** Name that best describes a pose (blends report their dominant side). */
export function poseKey(pose) {
  if (!pose) return 'stand';
  if (typeof pose === 'string') return pose;
  if (pose.a !== undefined) return (pose.w ?? 0.5) < 0.5 ? poseKey(pose.a) : poseKey(pose.b);
  return pose.base || 'custom';
}

// ------------------------------------------------------------------ kinematics ---------------------------------------------
const Rx = (d) => { const a = toRad(d), c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const Ry = (d) => { const a = toRad(d), c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const Rz = (d) => { const a = toRad(d), c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const mul = (...ms) => ms.reduce((a, b) => mat3Mul(a, b));
const at = (p, m, v) => add(p, mat3MulVec(m, v));
const axial = (o = {}) => mul(Ry(o.yaw || 0), Rx(o.pitch || 0), Rz(-(o.roll || 0)));
const limb = (o = {}, sgn) => mul(Rx(-(o.flex || 0)), Rz(sgn * (o.abd || 0)), Ry(sgn * (o.twist || 0)));

/** Lowest point of a part along Y (exact for ellipsoids, boxes and capsules). */
export function partMinY(p) {
  if (p.kind === 'capsule') return Math.min(p.a[1], p.b[1]) - p.radius;
  const m = p.m, h = p.size.map((s) => s / 2);
  if (p.kind === 'box') return p.center[1] - (Math.abs(m[1][0]) * h[0] + Math.abs(m[1][1]) * h[1] + Math.abs(m[1][2]) * h[2]);
  return p.center[1] - Math.hypot(m[1][0] * h[0], m[1][1] * h[1], m[1][2] * h[2]);
}

const cache = new Map();
/**
 * Pose a mannequin. Returns { parts, joints, keypoints, proportions } in the character's local frame, resting on y = 0.
 * Parts: { tag, kind: 'ellipsoid'|'sphere'|'box'|'capsule', center, m (3x3 rotation), size (full extents in the part frame),
 * radius / length / a / b for capsules (axis = part Y), mat: 'body'|'joint'|'accent' }. Results are cached: do not mutate.
 */
export function skeleton(pose = 'stand', height = 1.75, age) {
  const key = JSON.stringify([pose, height, age ?? null]);
  const hit = cache.get(key);
  if (hit) return hit;
  const P = proportions(height, age), H = height, A = resolvePose(pose);
  const parts = [], joints = {};
  const push = (o) => { parts.push(o); return o; };
  const ell = (tag, center, m, size, mat = 'body') => push({ tag, kind: 'ellipsoid', center, m, size, mat });
  const sph = (tag, center, r, mat = 'joint') => push({ tag, kind: 'sphere', center, m: I3, size: [2 * r, 2 * r, 2 * r], radius: r, mat });
  const box = (tag, center, m, size, mat = 'body') => push({ tag, kind: 'box', center, m, size, mat });
  const cap = (tag, a, b, m, r, mat = 'body') => { const L = dist(a, b); return push({ tag, kind: 'capsule', a, b, center: lerp(a, b, 0.5), m, radius: r, length: L, size: [2 * r, L + 2 * r, 2 * r], mat }); };

  // axial chain: pelvis → waist → chest → neck → head
  const rootR = axial(A.root);
  const pelvis = [0, P.hip, 0];
  const spineR = mul(rootR, axial(A.spine));
  const waist = at(pelvis, rootR, [0, P.waist - P.hip, 0]);
  const chestR = mul(spineR, axial(A.chest));
  const chest = at(waist, spineR, [0, P.chest - P.waist, 0]);
  const neckR = mul(chestR, axial(A.neck));
  const neck = at(chest, chestR, [0, P.neck - P.chest, -0.012 * H]);
  const headR = mul(neckR, axial(A.head));
  const headPivot = at(neck, neckR, [0, P.headPivot - P.neck, 0.008 * H]);
  const hp = (y, z) => at(headPivot, headR, [0, y - P.headPivot, z]);

  ell('pelvis', at(pelvis, rootR, [0, -0.012 * H, -0.006 * H]), rootR, [P.pelvisW, P.pelvisH, P.pelvisD]);
  ell('waist', at(waist, spineR, [0, 0.004 * H, -0.004 * H]), spineR, [P.waistW, P.waistH, P.waistD], 'joint');
  ell('chest', at(chest, chestR, [0, 0.016 * H, 0]), chestR, [P.chestW, P.chestH, P.chestD]);
  cap('neck', neck, headPivot, neckR, P.rNeck, 'accent');
  ell('head', hp((P.top + P.chin) / 2, 0.004 * H), headR, [P.headW, P.top - P.chin, P.headD]);
  ell('nose', hp((P.eyes + P.mouth) / 2, P.headD * 0.47), headR, [P.headW * 0.16, (P.eyes - P.mouth) * 0.75, P.headD * 0.2], 'accent');

  for (const [S, sgn] of [['L', 1], ['R', -1]]) {
    // arm: shoulder → elbow → wrist → hand
    const shoulder = at(chest, chestR, [sgn * P.shoulderX, P.shoulderY - P.chest, -0.01 * H]);
    const shR = mul(chestR, limb(A['shoulder' + S], sgn));
    const elbow = at(shoulder, shR, [0, -P.upperArm, 0]);
    const elR = mul(shR, Rx(-(A['elbow' + S].flex || 0)));
    const wrist = at(elbow, elR, [0, -P.foreArm, 0]);
    const wrR = mul(elR, Rx(-(A['wrist' + S].flex || 0)));
    sph('shoulder' + S, shoulder, P.rShoulder, 'body');
    cap('upperArm' + S, shoulder, elbow, shR, P.rUpperArm);
    sph('elbow' + S, elbow, P.rElbow);
    cap('foreArm' + S, elbow, wrist, elR, P.rForeArm);
    box('hand' + S, at(wrist, wrR, [0, -P.hand * 0.5, 0]), wrR, [P.handT, P.hand, P.handW]);
    // leg: hip → knee → ankle → foot
    const hip = at(pelvis, rootR, [sgn * P.hipX, 0, 0]);
    const hR = mul(rootR, limb(A['hip' + S], sgn));
    const knee = at(hip, hR, [0, -(P.hip - P.knee), 0]);
    const kR = mul(hR, Rx(A['knee' + S].flex || 0));
    const ankle = at(knee, kR, [0, -(P.knee - P.ankle), 0]);
    const aR = mul(kR, Rx(-(A['ankle' + S].flex || 0)));
    cap('thigh' + S, hip, knee, hR, P.rThigh);
    sph('knee' + S, knee, P.rKnee);
    cap('shin' + S, knee, ankle, kR, P.rShin);
    box('foot' + S, at(ankle, aR, [0, -P.ankle * 0.45, (P.footFwd - P.footBack) / 2]), aR, [P.footW, P.ankle * 1.1, P.footFwd + P.footBack], 'joint');
    Object.assign(joints, {
      ['shoulder' + S]: shoulder, ['elbow' + S]: elbow, ['wrist' + S]: wrist, ['hand' + S]: at(wrist, wrR, [0, -P.hand, 0]),
      ['hip' + S]: hip, ['knee' + S]: knee, ['ankle' + S]: ankle, ['sole' + S]: at(ankle, aR, [0, -P.ankle, (P.footFwd - P.footBack) / 2]),
    });
  }
  Object.assign(joints, { pelvis, waist, chest, neck, headPivot });
  const kp = {
    headTop: hp(P.top, -0.004 * H), brow: hp(P.brow, P.headD * 0.45), eyes: hp(P.eyes, P.headD * 0.42), mouth: hp(P.mouth, P.headD * 0.42), chin: hp(P.chin, P.headD * 0.34),
    shoulders: lerp(joints.shoulderL, joints.shoulderR, 0.5), chest, hips: pelvis,
    thigh: lerp(lerp(joints.hipL, joints.kneeL, 0.5), lerp(joints.hipR, joints.kneeR, 0.5), 0.5),
    knees: lerp(joints.kneeL, joints.kneeR, 0.5), feet: lerp(joints.soleL, joints.soleR, 0.5),
  };
  // grounding: the lowest point of the body rests on y = 0
  const lift = -Math.min(...parts.map(partMinY));
  const up = (p) => [p[0], p[1] + lift, p[2]];
  for (const p of parts) { p.center = up(p.center); if (p.a) { p.a = up(p.a); p.b = up(p.b); } }
  for (const k of Object.keys(joints)) joints[k] = up(joints[k]);
  for (const k of Object.keys(kp)) kp[k] = up(kp[k]);
  const res = { parts, joints, keypoints: kp, proportions: P };
  if (cache.size > 500) cache.clear();
  cache.set(key, res);
  return res;
}

// ------------------------------------------------------------------ public helpers ----------------------------------------
export const KEYPOINT_NAMES = ['headTop', 'brow', 'eyes', 'mouth', 'chin', 'shoulders', 'chest', 'hips', 'thigh', 'knees', 'feet'];

/** World-space keypoints for a character {position, facing (deg), pose, height, age}. */
export function keypoints(ch) {
  const { keypoints: kp } = skeleton(ch.pose || 'stand', ch.height || 1.75, ch.age);
  const out = {};
  for (const [k, p] of Object.entries(kp)) out[k] = add(ch.position, rotateY(p, ch.facing || 0));
  return out;
}
/** Mannequin parts in the character's local frame (see skeleton). */
export const standinParts = (pose = 'stand', H = 1.75, age) => skeleton(pose, H, age).parts;

/** Axis-aligned bounds of a part in the character frame. */
export function partBox(p) {
  if (p.kind === 'capsule') return { center: p.center, size: [0, 1, 2].map((i) => Math.abs(p.a[i] - p.b[i]) + 2 * p.radius) };
  const h = p.size.map((s) => s / 2);
  const ext = [0, 1, 2].map((r) => (p.kind === 'box' ? Math.abs(p.m[r][0]) * h[0] + Math.abs(p.m[r][1]) * h[1] + Math.abs(p.m[r][2]) * h[2] : Math.hypot(p.m[r][0] * h[0], p.m[r][1] * h[1], p.m[r][2] * h[2])));
  return { center: p.center, size: ext.map((e) => 2 * e) };
}
/** Local AABB of the whole mannequin in a pose. */
export function standinBounds(pose, H, age) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of standinParts(pose, H, age)) {
    const b = partBox(p);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.center[i] - b.size[i] / 2); max[i] = Math.max(max[i], b.center[i] + b.size[i] / 2); }
  }
  return { min, max };
}
/** Character as a pseudo-object for localToWorld (rotation = facing around Y). */
export const charTransform = (ch) => ({ position: ch.position, rotation: [0, ch.facing || 0, 0], scale: [1, 1, 1] });
export const charPartWorld = (ch, p) => localToWorld(charTransform(ch), p);
