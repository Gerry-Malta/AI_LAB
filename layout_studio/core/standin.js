// Stand-in characters: poses, body keypoints and primitive parts.
// Local frame: origin on the ground under the character, +Z = facing direction, X = width, Y = up.
// All sizes are fractions of the character height H (metres).
import { rotateY, add, localToWorld } from './vec.js';

export const POSES = ['stand', 'walk', 'sit_ground', 'sit_chair', 'crouch', 'kneel', 'lie_prone', 'lie_supine'];
export const POSE_NAMES = {
  stand: 'Standing', walk: 'Walking', sit_ground: 'Sitting on the ground', sit_chair: 'Sitting on a chair',
  crouch: 'Crouching', kneel: 'Kneeling', lie_prone: 'Lying prone', lie_supine: 'Lying on the back',
};

// keypoint: [height fraction, forward offset fraction]
const KP = {
  stand:      { headTop: [1.00, 0], brow: [0.95, 0.02], eyes: [0.935, 0.03], mouth: [0.90, 0.03], chin: [0.88, 0.02], shoulders: [0.82, 0], chest: [0.72, 0], hips: [0.53, 0], thigh: [0.42, 0], knees: [0.28, 0], feet: [0, 0] },
  sit_ground: { headTop: [0.56, 0.02], brow: [0.52, 0.04], eyes: [0.505, 0.05], mouth: [0.48, 0.05], chin: [0.46, 0.04], shoulders: [0.42, 0.02], chest: [0.34, 0.03], hips: [0.10, 0], thigh: [0.12, 0.18], knees: [0.14, 0.30], feet: [0.03, 0.40] },
  sit_chair:  { headTop: [0.78, 0], brow: [0.74, 0.02], eyes: [0.72, 0.03], mouth: [0.69, 0.03], chin: [0.67, 0.02], shoulders: [0.63, 0], chest: [0.55, 0], hips: [0.30, 0], thigh: [0.31, 0.15], knees: [0.30, 0.28], feet: [0, 0.32] },
  crouch:     { headTop: [0.62, 0.05], brow: [0.58, 0.07], eyes: [0.56, 0.08], mouth: [0.53, 0.08], chin: [0.51, 0.07], shoulders: [0.47, 0.04], chest: [0.39, 0.06], hips: [0.24, -0.05], thigh: [0.25, 0.10], knees: [0.27, 0.20], feet: [0, 0.10] },
  kneel:      { headTop: [0.74, 0], brow: [0.70, 0.02], eyes: [0.68, 0.03], mouth: [0.65, 0.03], chin: [0.63, 0.02], shoulders: [0.59, 0], chest: [0.51, 0], hips: [0.38, 0], thigh: [0.25, 0.05], knees: [0.03, 0.10], feet: [0.03, -0.30] },
  lie_prone:  { headTop: [0.26, 0.50], brow: [0.25, 0.52], eyes: [0.23, 0.53], mouth: [0.20, 0.53], chin: [0.18, 0.51], shoulders: [0.17, 0.36], chest: [0.13, 0.26], hips: [0.09, 0], thigh: [0.08, -0.15], knees: [0.07, -0.30], feet: [0.09, -0.52] },
  lie_supine: { headTop: [0.12, 0.52], brow: [0.14, 0.49], eyes: [0.14, 0.47], mouth: [0.13, 0.46], chin: [0.12, 0.45], shoulders: [0.10, 0.36], chest: [0.12, 0.26], hips: [0.10, 0], thigh: [0.09, -0.15], knees: [0.08, -0.30], feet: [0.06, -0.52] },
};
KP.walk = KP.stand;

export const KEYPOINT_NAMES = Object.keys(KP.stand);

/** World-space keypoints for a character {position, facing (deg), pose, height}. */
export function keypoints(ch) {
  const H = ch.height || 1.75, table = KP[ch.pose] || KP.stand, out = {};
  for (const [k, [hy, fz]] of Object.entries(table)) {
    const local = rotateY([0, hy * H, fz * H], ch.facing || 0);
    out[k] = add(ch.position, local);
  }
  return out;
}

/**
 * Primitive parts in the local frame. kind: 'capsule' (radius, length along axis), 'sphere', 'box' (size).
 * Used by the viewer to build meshes and by the metrics to test occlusion, so both agree.
 */
export function standinParts(pose, H = 1.75) {
  const P = [];
  const cap = (center, radius, length, axis = 'y', tag = 'body') => P.push({ kind: 'capsule', center: center.map((v) => v * H), radius: radius * H, length: length * H, axis, tag });
  const sph = (center, radius, tag = 'head') => P.push({ kind: 'sphere', center: center.map((v) => v * H), radius: radius * H, tag });
  const box = (center, size, tag = 'nose') => P.push({ kind: 'box', center: center.map((v) => v * H), size: size.map((v) => v * H), tag });
  switch (pose) {
    case 'sit_ground':
      cap([0, 0.30, 0.02], 0.11, 0.20); sph([0, 0.50, 0.04], 0.065); box([0, 0.50, 0.105], [0.03, 0.03, 0.05]);
      cap([-0.07, 0.085, 0.20], 0.065, 0.32, 'z', 'leg'); cap([0.07, 0.085, 0.20], 0.065, 0.32, 'z', 'leg');
      cap([-0.16, 0.30, 0.04], 0.035, 0.34, 'y', 'arm'); cap([0.16, 0.30, 0.04], 0.035, 0.34, 'y', 'arm');
      break;
    case 'sit_chair':
      cap([0, 0.50, 0], 0.11, 0.24); sph([0, 0.715, 0.02], 0.065); box([0, 0.715, 0.085], [0.03, 0.03, 0.05]);
      cap([-0.07, 0.30, 0.16], 0.065, 0.28, 'z', 'leg'); cap([0.07, 0.30, 0.16], 0.065, 0.28, 'z', 'leg');
      cap([-0.07, 0.14, 0.30], 0.055, 0.24, 'y', 'leg'); cap([0.07, 0.14, 0.30], 0.055, 0.24, 'y', 'leg');
      cap([-0.16, 0.48, 0.02], 0.035, 0.40, 'y', 'arm'); cap([0.16, 0.48, 0.02], 0.035, 0.40, 'y', 'arm');
      break;
    case 'crouch':
      cap([0, 0.38, 0.04], 0.11, 0.18); sph([0, 0.555, 0.08], 0.065); box([0, 0.555, 0.145], [0.03, 0.03, 0.05]);
      cap([-0.08, 0.14, 0.10], 0.07, 0.28, 'z', 'leg'); cap([0.08, 0.14, 0.10], 0.07, 0.28, 'z', 'leg');
      cap([-0.17, 0.30, 0.10], 0.035, 0.30, 'y', 'arm'); cap([0.17, 0.30, 0.10], 0.035, 0.30, 'y', 'arm');
      break;
    case 'kneel':
      cap([0, 0.50, 0], 0.11, 0.26); sph([0, 0.675, 0.02], 0.065); box([0, 0.675, 0.085], [0.03, 0.03, 0.05]);
      cap([-0.07, 0.20, 0.02], 0.065, 0.32, 'y', 'leg'); cap([0.07, 0.20, 0.02], 0.065, 0.32, 'y', 'leg');
      cap([-0.07, 0.05, -0.18], 0.055, 0.32, 'z', 'leg'); cap([0.07, 0.05, -0.18], 0.055, 0.32, 'z', 'leg');
      cap([-0.16, 0.46, 0.02], 0.035, 0.40, 'y', 'arm'); cap([0.16, 0.46, 0.02], 0.035, 0.40, 'y', 'arm');
      break;
    case 'lie_prone':
      cap([0, 0.12, 0.26], 0.10, 0.34, 'z'); sph([0, 0.195, 0.50], 0.065); box([0, 0.19, 0.565], [0.03, 0.03, 0.05]);
      cap([-0.065, 0.08, -0.28], 0.06, 0.44, 'z', 'leg'); cap([0.065, 0.08, -0.28], 0.06, 0.44, 'z', 'leg');
      cap([-0.15, 0.10, 0.42], 0.035, 0.28, 'z', 'arm'); cap([0.15, 0.10, 0.42], 0.035, 0.28, 'z', 'arm');
      break;
    case 'lie_supine':
      cap([0, 0.11, 0.26], 0.10, 0.34, 'z'); sph([0, 0.085, 0.52], 0.065); box([0, 0.15, 0.50], [0.03, 0.05, 0.03]);
      cap([-0.065, 0.07, -0.28], 0.06, 0.44, 'z', 'leg'); cap([0.065, 0.07, -0.28], 0.06, 0.44, 'z', 'leg');
      cap([-0.15, 0.08, 0.20], 0.035, 0.40, 'z', 'arm'); cap([0.15, 0.08, 0.20], 0.035, 0.40, 'z', 'arm');
      break;
    default: // stand / walk
      cap([0, 0.66, 0], 0.11, 0.30); sph([0, 0.935, 0.02], 0.065); box([0, 0.93, 0.085], [0.03, 0.03, 0.05]);
      cap([-0.065, 0.27, 0], 0.065, 0.40, 'y', 'leg'); cap([0.065, 0.27, 0], 0.065, 0.40, 'y', 'leg');
      cap([-0.17, 0.58, 0], 0.035, 0.50, 'y', 'arm'); cap([0.17, 0.58, 0], 0.035, 0.50, 'y', 'arm');
  }
  return P;
}

/** Axis-aligned local bounds of a part (box used for occlusion / projection). */
export function partBox(part) {
  if (part.kind === 'sphere') return { center: part.center, size: [part.radius * 2, part.radius * 2, part.radius * 2] };
  if (part.kind === 'box') return { center: part.center, size: part.size };
  const d = part.radius * 2, L = part.length + part.radius * 2;
  const size = part.axis === 'z' ? [d, d, L] : part.axis === 'x' ? [L, d, d] : [d, L, d];
  return { center: part.center, size };
}

/** Local AABB of the whole stand-in. */
export function standinBounds(pose, H) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of standinParts(pose, H)) {
    const b = partBox(p);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.center[i] - b.size[i] / 2); max[i] = Math.max(max[i], b.center[i] + b.size[i] / 2); }
  }
  return { min, max };
}

/** Character as a pseudo-object for localToWorld (rotation = facing around Y). */
export const charTransform = (ch) => ({ position: ch.position, rotation: [0, ch.facing || 0, 0], scale: [1, 1, 1] });
export const charPartWorld = (ch, p) => localToWorld(charTransform(ch), p);
