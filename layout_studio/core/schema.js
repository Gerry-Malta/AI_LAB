// Scene file format: defaults, validation, factories.
export const FORMAT = 'layout-studio/scene';
export const VERSION = 1;
export const ROLES = ['ENV', 'SET', 'PROP', 'HERO', 'CHAR', 'FX'];
export const KINDS = ['box', 'cylinder', 'cone', 'sphere', 'capsule', 'plane', 'tree', 'standin', 'gltf'];

let counter = 0;
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newScene(partial = {}) {
  return Object.assign({
    format: FORMAT, version: VERSION, project: 'Untitled', units: 'm', up: 'Y',
    scene: { number: 1, heading: '', int_ext: 'EXT', location: '', time: 'DAY', pages: '', synopsis: '' },
    world: { ground: { size: 200, color: '#5a6b4a' }, sky: '#9fb8d6', sun: { azimuth: 135, elevation: 45 } },
    objects: [], beats: [], shots: [], notes: '',
  }, partial);
}

export function newObject(partial = {}) {
  return Object.assign({ id: uid('OBJ'), name: 'Object', role: 'PROP', kind: 'box', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], size: [1, 1, 1], color: '#b0a080', source: 'inferred', notes: '' }, partial);
}

export function newShot(partial = {}) {
  return Object.assign({
    id: uid('SH'), name: '', beat: null, size: 'MS', subject: null, intent: '',
    camera: { filmback: 'ALEXA35_OG', focal_mm: 35, aspect: 2.39, squeeze: 1, fstop: 2.8, focus_m: null },
    rig: { type: 'static' }, duration_s: 5, curve: 'easeInOut',
    keys: { A: { position: [0, 1.5, 5], target: [0, 1.2, 0], roll: 0 }, B: null }, notes: '',
  }, partial);
}

export function normalizeScene(raw) {
  const s = newScene(raw);
  s.scene = Object.assign(newScene().scene, raw.scene || {});
  s.world = Object.assign(newScene().world, raw.world || {});
  s.objects = (raw.objects || []).map((o) => Object.assign(newObject(), o));
  s.beats = (raw.beats || []).map((b, i) => Object.assign({ id: `b${i + 1}`, label: '', t0: 0, t1: 0, blocking: {} }, b));
  s.shots = (raw.shots || []).map((sh) => { const n = Object.assign(newShot(), sh); n.camera = Object.assign(newShot().camera, sh.camera || {}); n.rig = Object.assign({ type: 'static' }, sh.rig || {}); n.keys = Object.assign({ A: null, B: null }, sh.keys || {}); return n; });
  return s;
}

export function validateScene(s) {
  const errors = [];
  if (!s || typeof s !== 'object') return ['Not an object'];
  if (s.format && s.format !== FORMAT) errors.push(`Unknown format ${s.format}`);
  const ids = new Set();
  for (const o of s.objects || []) {
    if (!o.id) errors.push('Object without id');
    else if (ids.has(o.id)) errors.push(`Duplicate id ${o.id}`); else ids.add(o.id);
    if (!Array.isArray(o.position) || o.position.length !== 3) errors.push(`Object ${o.id}: bad position`);
  }
  const beatIds = new Set((s.beats || []).map((b) => b.id));
  for (const sh of s.shots || []) {
    if (!sh.keys || !sh.keys.A) errors.push(`Shot ${sh.id}: missing key A`);
    if (sh.beat && !beatIds.has(sh.beat)) errors.push(`Shot ${sh.id}: unknown beat ${sh.beat}`);
    if (sh.subject && !ids.has(sh.subject)) errors.push(`Shot ${sh.id}: unknown subject ${sh.subject}`);
  }
  return errors;
}
