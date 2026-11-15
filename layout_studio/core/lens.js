// Filmbacks, field of view and depth-of-field math. Values in millimetres / metres.
import { toRad, toDeg } from './vec.js';

export const FILMBACKS = [
  { id: 'ALEXA35_OG',        brand: 'ARRI',       name: 'ALEXA 35 · 4.6K 3:2 Open Gate',     w: 27.99, h: 19.22, coc: 0.020 },
  { id: 'ALEXA35_169',       brand: 'ARRI',       name: 'ALEXA 35 · 4.6K 16:9',              w: 27.99, h: 15.75, coc: 0.020 },
  { id: 'ALEXA_MINI_LF_OG',  brand: 'ARRI',       name: 'ALEXA Mini LF · 4.5K 3:2 Open Gate', w: 36.70, h: 25.54, coc: 0.030 },
  { id: 'ALEXA_MINI_LF_169', brand: 'ARRI',       name: 'ALEXA Mini LF · 3.8K 16:9 LF',      w: 31.68, h: 17.82, coc: 0.030 },
  { id: 'ALEXA_MINI_OG',     brand: 'ARRI',       name: 'ALEXA Mini · 3.4K Open Gate S35',   w: 28.25, h: 18.17, coc: 0.020 },
  { id: 'ALEXA_MINI_169',    brand: 'ARRI',       name: 'ALEXA Mini · 2.8K 16:9 S35',        w: 23.76, h: 13.37, coc: 0.020 },
  { id: 'ALEXA65_OG',        brand: 'ARRI',       name: 'ALEXA 65 · 6.5K Open Gate',         w: 54.12, h: 25.58, coc: 0.040 },
  { id: 'VENICE2_86K_32',    brand: 'Sony',       name: 'VENICE 2 · 8.6K 3:2 Full Frame',    w: 36.20, h: 24.10, coc: 0.030 },
  { id: 'VENICE2_86K_179',   brand: 'Sony',       name: 'VENICE 2 · 8.6K 17:9 Full Frame',   w: 36.20, h: 19.10, coc: 0.030 },
  { id: 'RED_VRAPTOR_8KVV',  brand: 'RED',        name: 'V-RAPTOR · 8K VV 17:9',             w: 40.96, h: 21.60, coc: 0.030 },
  { id: 'RED_KOMODO_6K',     brand: 'RED',        name: 'KOMODO · 6K S35 17:9',              w: 27.03, h: 14.26, coc: 0.020 },
  { id: 'BMPCC6K',           brand: 'Blackmagic', name: 'Pocket 6K · S35',                   w: 23.10, h: 12.99, coc: 0.020 },
  { id: 'S35_4PERF',         brand: 'Film',       name: 'Super 35 · 4-perf',                 w: 24.89, h: 18.66, coc: 0.025 },
  { id: 'S35_3PERF',         brand: 'Film',       name: 'Super 35 · 3-perf',                 w: 24.89, h: 13.87, coc: 0.025 },
  { id: 'FF_STILLS',         brand: 'Generic',    name: 'Full Frame 36×24',                  w: 36.00, h: 24.00, coc: 0.030 },
  { id: 'S16',               brand: 'Film',       name: 'Super 16',                          w: 12.52, h: 7.41,  coc: 0.015 },
  { id: 'IMAX_1570',         brand: 'Film',       name: 'IMAX 15/70',                        w: 70.41, h: 52.63, coc: 0.060 },
];
export const FILMBACK_BY_ID = Object.fromEntries(FILMBACKS.map((f) => [f.id, f]));
export const DEFAULT_FILMBACK = 'ALEXA35_OG';
export const getFilmback = (id) => FILMBACK_BY_ID[id] || FILMBACK_BY_ID[DEFAULT_FILMBACK];

export const ASPECTS = [
  { id: '2.39', value: 2.39, name: '2.39:1 Scope' },
  { id: '2.00', value: 2.0, name: '2.00:1 Univisium' },
  { id: '1.85', value: 1.85, name: '1.85:1 Flat' },
  { id: '1.78', value: 16 / 9, name: '16:9' },
  { id: '1.66', value: 1.66, name: '1.66:1' },
  { id: '1.43', value: 1.43, name: '1.43:1 IMAX' },
  { id: '1.33', value: 4 / 3, name: '4:3' },
  { id: '2.76', value: 2.76, name: '2.76:1 Ultra Panavision' },
  { id: '0.5625', value: 9 / 16, name: '9:16 Vertical' },
];
export const SQUEEZES = [1, 1.3, 1.5, 1.8, 2];

export const LENS_KITS = {
  'S35 spherical primes': [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135, 150],
  'LF spherical primes': [16, 18, 21, 25, 29, 35, 47, 65, 75, 100, 150],
  'Anamorphic 2x': [28, 32, 40, 50, 65, 75, 100, 135],
};

/** Portion of the sensor actually used for a delivery aspect, de-squeezed (mm). */
export function activeGate(filmbackOrId, aspect = 2.39, squeeze = 1) {
  const fb = typeof filmbackOrId === 'string' ? getFilmback(filmbackOrId) : filmbackOrId;
  const desqW = fb.w * squeeze;
  const fbAspect = desqW / fb.h;
  let w, h;
  if (fbAspect >= aspect) { h = fb.h; w = h * aspect; } else { w = desqW; h = w / aspect; }
  return { w, h, sensorW: w / squeeze, sensorH: h, fullW: fb.w, fullH: fb.h, coc: fb.coc, filmback: fb };
}

/** Field of view in degrees for a lens setup {filmback, focal_mm, aspect, squeeze}. */
export function fovFor(cam) {
  const gate = activeGate(cam.filmback, cam.aspect ?? 2.39, cam.squeeze ?? 1);
  const f = cam.focal_mm || 35;
  const hfov = toDeg(2 * Math.atan(gate.w / (2 * f)));
  const vfov = toDeg(2 * Math.atan(gate.h / (2 * f)));
  const dfov = toDeg(2 * Math.atan(Math.hypot(gate.w, gate.h) / (2 * f)));
  return { hfov, vfov, dfov, gate };
}
export const focalForVFOV = (vfovDeg, gateH) => gateH / (2 * Math.tan(toRad(vfovDeg) / 2));
export const focalForHFOV = (hfovDeg, gateW) => gateW / (2 * Math.tan(toRad(hfovDeg) / 2));

/** Full-frame equivalent focal length (diagonal based). */
export function equivalentFocal(cam) {
  const gate = activeGate(cam.filmback, cam.aspect ?? 2.39, cam.squeeze ?? 1);
  const diag = Math.hypot(gate.w, gate.h);
  const ffDiag = Math.hypot(36, 24); // 43.27 mm
  return (cam.focal_mm || 35) * (ffDiag / diag);
}

/** Depth of field (metres). focus in metres, focal in mm, coc in mm. */
export function dof({ focal_mm = 35, fstop = 2.8, focus_m = 3, coc } = {}, filmback = DEFAULT_FILMBACK) {
  const c = coc ?? getFilmback(filmback).coc;
  const f = focal_mm, s = focus_m * 1000;
  const H = (f * f) / (fstop * c) + f; // hyperfocal, mm
  const near = (s * (H - f)) / (H + s - 2 * f);
  const far = s >= H ? Infinity : (s * (H - f)) / (H - s);
  return {
    hyperfocal_m: H / 1000,
    near_m: near / 1000,
    far_m: far === Infinity ? Infinity : far / 1000,
    total_m: far === Infinity ? Infinity : (far - near) / 1000,
  };
}

export function lensLabel(cam) {
  const fb = getFilmback(cam.filmback);
  const { hfov } = fovFor(cam);
  const sq = (cam.squeeze ?? 1) !== 1 ? ` ${cam.squeeze}x ana` : '';
  return `${cam.focal_mm}mm${sq} · ${fb.name} · ${(cam.aspect ?? 2.39).toFixed(2)}:1 · HFOV ${hfov.toFixed(1)}°`;
}
