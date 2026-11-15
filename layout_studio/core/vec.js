// Minimal vector / matrix helpers (Y-up, right-handed, same conventions as three.js).
// Pure JS so the core runs in the browser and in Node without three.js.

export const DEG = Math.PI / 180;
export const toRad = (d) => d * DEG;
export const toDeg = (r) => r / DEG;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp1 = (a, b, t) => a + (b - a) * t;

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => len(sub(a, b));
export const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [lerp1(a[0], b[0], t), lerp1(a[1], b[1], t), lerp1(a[2], b[2], t)];
export const clone = (a) => [a[0], a[1], a[2]];
export const eq = (a, b, eps = 1e-6) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;

/** Quadratic bezier through A, via, B. */
export const bezier2 = (A, V, B, t) => {
  const u = 1 - t;
  return [
    u * u * A[0] + 2 * u * t * V[0] + t * t * B[0],
    u * u * A[1] + 2 * u * t * V[1] + t * t * B[1],
    u * u * A[2] + 2 * u * t * V[2] + t * t * B[2],
  ];
};

/** Yaw/pitch (degrees) of a direction. Yaw 0 = +Z, yaw 90 = +X (same as character facing). Pitch > 0 looks up. */
export function yawPitchFromDir(d) {
  const n = norm(d);
  return { yaw: toDeg(Math.atan2(n[0], n[2])), pitch: toDeg(Math.asin(clamp(n[1], -1, 1))) };
}
export function dirFromYawPitch(yaw, pitch) {
  const cy = Math.cos(toRad(pitch));
  return [Math.sin(toRad(yaw)) * cy, Math.sin(toRad(pitch)), Math.cos(toRad(yaw)) * cy];
}
/** Forward vector of a character facing `yaw` degrees (0 = +Z, 90 = +X). */
export const facingDir = (yaw) => [Math.sin(toRad(yaw)), 0, Math.cos(toRad(yaw))];
/** Shortest signed angular difference b - a in degrees, in (-180, 180]. */
export function angleDelta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
export const lerpAngle = (a, b, t) => a + angleDelta(a, b) * t;

/** Rotate a point/vector around the Y axis by yaw degrees. */
export function rotateY(p, yawDeg) {
  const c = Math.cos(toRad(yawDeg)), s = Math.sin(toRad(yawDeg));
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
/** Rotate vector v around unit axis k by angle degrees (Rodrigues). */
export function rotateAxis(v, k, deg) {
  const c = Math.cos(toRad(deg)), s = Math.sin(toRad(deg));
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/** Camera basis from eye/target/roll. forward points INTO the scene (camera looks along -Z in camera space). */
export function cameraBasis(eye, target, rollDeg = 0) {
  let forward = norm(sub(target, eye));
  if (len(forward) < 1e-9 || Math.abs(forward[1]) > 0.99999) forward = [0, forward[1] >= 0 ? 1 : -1, 1e-6];
  let right = norm(cross(forward, [0, 1, 0]));
  if (len(right) < 1e-9) right = [1, 0, 0];
  let up = cross(right, forward);
  if (rollDeg) { right = rotateAxis(right, forward, rollDeg); up = rotateAxis(up, forward, rollDeg); }
  return { forward, right, up };
}

/**
 * Project a world point. Returns normalized device coords x,y in [-1,1] (inside the frame),
 * `depth` along the view axis (metres, > 0 in front), and `inFrame`.
 */
export function projectPoint(p, eye, basis, vfovDeg, aspect) {
  const d = sub(p, eye);
  const depth = dot(d, basis.forward);
  const xc = dot(d, basis.right), yc = dot(d, basis.up);
  const tanV = Math.tan(toRad(vfovDeg) / 2), tanH = tanV * aspect;
  if (depth <= 1e-6) return { x: NaN, y: NaN, depth, inFrame: false, behind: true };
  const x = xc / (depth * tanH), y = yc / (depth * tanV);
  return { x, y, depth, inFrame: Math.abs(x) <= 1 && Math.abs(y) <= 1, behind: false };
}

/** Rotation matrix (3x3, row-major) from Euler XYZ degrees — same as three.js Euler order 'XYZ'. */
export function eulerXYZToMat3(rx, ry, rz) {
  const a = toRad(rx), b = toRad(ry), c = toRad(rz);
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // R = Rx * Ry * Rz
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}
export const mat3MulVec = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
export const mat3T = (m) => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
export const mat3Mul = (a, b) => {
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return r;
};

/** Transform a local point of an object {position, rotation(deg XYZ), scale} to world. */
export function localToWorld(obj, p) {
  const s = obj.scale || [1, 1, 1];
  const R = eulerXYZToMat3(...(obj.rotation || [0, 0, 0]));
  return add(obj.position, mat3MulVec(R, [p[0] * s[0], p[1] * s[1], p[2] * s[2]]));
}
export function worldToLocal(obj, p) {
  const s = obj.scale || [1, 1, 1];
  const Rt = mat3T(eulerXYZToMat3(...(obj.rotation || [0, 0, 0])));
  const q = mat3MulVec(Rt, sub(p, obj.position));
  return [q[0] / s[0], q[1] / s[1], q[2] / s[2]];
}
export function worldToLocalDir(obj, d) {
  const s = obj.scale || [1, 1, 1];
  const Rt = mat3T(eulerXYZToMat3(...(obj.rotation || [0, 0, 0])));
  const q = mat3MulVec(Rt, d);
  return [q[0] / s[0], q[1] / s[1], q[2] / s[2]];
}

/** Ray vs axis-aligned box (slab test). Returns entry distance t >= 0 or null. */
export function rayAABB(origin, dir, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (origin[i] < min[i] || origin[i] > max[i]) return null;
    } else {
      let t1 = (min[i] - origin[i]) / dir[i], t2 = (max[i] - origin[i]) / dir[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

/** Corners of a box given local center/size inside an object transform. */
export function boxCorners(obj, center, size) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const p = [
      center[0] + (i & 1 ? 0.5 : -0.5) * size[0],
      center[1] + (i & 2 ? 0.5 : -0.5) * size[1],
      center[2] + (i & 4 ? 0.5 : -0.5) * size[2],
    ];
    out.push(localToWorld(obj, p));
  }
  return out;
}

/** Deterministic smooth noise in [-1, 1] from a sum of incommensurate sines. */
export function noise1(t, seed = 1, freq = 1) {
  const s = seed * 12.9898;
  return (
    0.55 * Math.sin(2 * Math.PI * freq * t + s) +
    0.30 * Math.sin(2 * Math.PI * freq * 1.731 * t + s * 1.7 + 1.3) +
    0.15 * Math.sin(2 * Math.PI * freq * 2.917 * t + s * 2.3 + 2.9)
  );
}
export const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
export const roundV = (v, n = 3) => [round(v[0], n), round(v[1], n), round(v[2], n)];
