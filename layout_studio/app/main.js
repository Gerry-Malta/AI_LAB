// Layout Studio — viewer application: panels, shots, timeline, metrics, exports. Three.js lives in scene3d.js, maths in ../core.
import * as THREE from 'three';
import * as core from '../core/index.js';
import { Viewport, ROLE_COLORS } from './scene3d.js';
import { canEncode, encodeMP4, pickCodec, codecName } from './export_mp4.js';
import { SoundPlayer, mixEdit } from './audio.js';
import { installTooltips } from './tooltip.js';
import { FIELD_TIPS } from './tips.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, n = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(n) : '—');
const r3 = (v) => Math.round(v * 1000) / 1000;
const rd = (rad) => Math.round(THREE.MathUtils.radToDeg(rad) * 10) / 10;
const opt = (list, value, label = (x) => x, val = (x) => x) => list.map((x) => `<option value="${esc(val(x))}" ${String(val(x)) === String(value) ? 'selected' : ''}>${esc(label(x))}</option>`).join('');

const S = { scene: null, fileName: '', selectedId: null, shotId: null, t: 0, playing: false, loop: true, lookThrough: false, editKey: 'A', beatId: null, tab: 'outliner', pipSize: 'M', snap: false, undo: [], dirty: false, solvedCache: new Map(), scoreCache: new Map(), version: 0, filter: '', lastEval: null, compGrid: 'thirds' };
const QUERY = new URLSearchParams(location.search);
const vp = new Viewport($('#gl'), { fast: QUERY.get('render') === 'fast' });
vp.gateInset = { top: 34, bottom: 50 }; // look-through frame stays clear of the view toolbar and the timeline
const sound = new SoundPlayer(); // dialogue, effects and ambience on the edit clock
window.LS = { S, vp, core, sound }; // handy for debugging / automation
// browsers start audio only after a click or a key press
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => sound.unlock(), { capture: true });
installTooltips(FIELD_TIPS); // rest the cursor on any control for a short explanation

// ------------------------------------------------------------------ accessors ---------------------------------------------
const shots = () => (S.scene && S.scene.shots) || [];
const objects = () => (S.scene && S.scene.objects) || [];
const beats = () => (S.scene && S.scene.beats) || [];
const currentShot = () => shots().find((s) => s.id === S.shotId) || null;
const getObj = (id) => objects().find((o) => o.id === id);
const getBeat = (id) => beats().find((b) => b.id === id);
const beatBlocking = (id) => (getBeat(id) || {}).blocking || {};
const standins = () => objects().filter((o) => o.kind === 'standin');
const activeBeatId = () => { const sh = currentShot(); return sh ? (sh.beat || null) : S.beatId; };

const blockingAt = (shot, t) => core.blockingAt(S.scene, shot, t);
const currentBlocking = () => { const sh = currentShot(); return sh ? blockingAt(sh, S.t) : beatBlocking(S.beatId); };

function solvedFor(shot) {
  const key = S.version;
  const c = S.solvedCache.get(shot.id);
  if (c && c.key === key) return c.res;
  const res = core.solveShot(S.scene, shot);
  S.solvedCache.set(shot.id, { key, res });
  return res;
}
function evaluateAt(shot, t) {
  const solved = solvedFor(shot);
  const def = (t < 0.5 ? shot.framing && shot.framing.A : shot.framing && shot.framing.B) || {};
  return core.evaluateFrame(S.scene, shot, solved.pose(t), blockingAt(shot, t), { expectedSize: def.size || shot.size, wantForeground: def.wantForeground });
}
function scoreFor(shot) {
  const c = S.scoreCache.get(shot.id);
  if (c && c.key === S.version) return c.score;
  let score = evaluateAt(shot, 0).score;
  if (shot.keys.B || (shot.beatA && shot.beatB && shot.beatA !== shot.beatB)) score = Math.min(score, evaluateAt(shot, 0.5).score, evaluateAt(shot, 1).score);
  S.scoreCache.set(shot.id, { key: S.version, score });
  return score;
}
const invalidate = () => { S.version++; };

// ------------------------------------------------------------------ undo / dirty / autosave -----------------------------
function snapshot() { S.undo.push(JSON.stringify(S.scene)); if (S.undo.length > 40) S.undo.shift(); }
function undo() { const j = S.undo.pop(); if (!j) return toast('Nothing to undo'); const keepShot = S.shotId, keepSel = S.selectedId; S.scene = core.normalizeScene(JSON.parse(j)); invalidate(); vp.buildObjects(objects()); S.selectedId = getObj(keepSel) ? keepSel : null; vp.setSelected(S.selectedId); S.shotId = shots().some((s) => s.id === keepShot) ? keepShot : null; vp.applyBlocking(objects(), currentBlocking()); refreshAll(); markDirty(); toast('Undo'); }
let saveTimer = null;
function markDirty() { S.dirty = true; refreshTitle(); clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem('layout_studio:autosave', JSON.stringify({ name: S.fileName, base: S.sceneBase || '', when: Date.now(), scene: S.scene })); } catch (_) {} }, 800); }

// ------------------------------------------------------------------ load --------------------------------------------------
async function loadFromURL(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    loadScene(await r.json(), url.split('/').pop(), url.slice(0, url.lastIndexOf('/') + 1));
  } catch (e) {
    toast(`Cannot load ${url}: ${e.message}`);
    if (!S.scene) loadScene(core.newScene({ project: 'New scene' }), 'new_scene.json');
  }
}
function loadScene(json, name, base = '') {
  const errors = core.validateScene(json);
  S.sceneBase = base; // folder of the scene file: dialogue clips are relative to it
  if (errors.length) toast('Scene warnings: ' + errors.slice(0, 3).join(' · '));
  S.scene = core.normalizeScene(json); S.fileName = name || 'scene.json';
  S.selectedId = null; S.shotId = null; S.beatId = (beats()[0] || {}).id || null; S.t = 0; S.playing = false; S.undo = []; S.dirty = false; S.lookThrough = false; vp.lookThrough = false;
  invalidate();
  vp.setWorld(S.scene.world); vp.buildObjects(objects()); vp.applyBlocking(objects(), currentBlocking()); vp.setSelected(null);
  fitShadows();
  frameAll();
  refreshAll();
  sound.setScene(S.scene, base); liveKey = -1;
  if (shots().length) selectShot(shots()[0].id, { fly: false });
}
function fitShadows() {
  const pts = objects().filter((o) => o.role !== 'ENV' && o.kind !== 'plane').map((o) => o.position);
  for (const b of beats()) for (const v of Object.values(b.blocking || {})) if (v.position) pts.push(v.position);
  if (!pts.length) return vp.fitShadows([0, 0, 0], 30);
  const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
  for (const p of pts) { min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[2]); max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[2]); }
  vp.fitShadows([(min[0] + max[0]) / 2, 0, (min[1] + max[1]) / 2], Math.hypot(max[0] - min[0], max[1] - min[1]) / 2 + 14);
}
function frameAll() {
  const pts = objects().filter((o) => o.role !== 'ENV' && o.kind !== 'plane').map((o) => o.position);
  if (!pts.length) return vp.flyTo([9, 4.5, 11], [0, 1, 0]);
  const min = [Infinity, 0, Infinity], max = [-Infinity, 2, -Infinity];
  for (const p of pts) { min[0] = Math.min(min[0], p[0]); min[2] = Math.min(min[2], p[2]); max[0] = Math.max(max[0], p[0]); max[2] = Math.max(max[2], p[2]); }
  vp.frameBox([min[0] - 1, 0, min[2] - 1], [max[0] + 1, 2.5, max[2] + 1]);
  vp.flyCam.position.y = Math.max(vp.flyCam.position.y, 2.5);
  vp.lookAtPoint(vp.focusPoint);
}

// ------------------------------------------------------------------ selection --------------------------------------------
function selectObject(id, opts = {}) { S.selectedId = id; vp.setSelected(id); refreshOutliner(); refreshProps(); if (opts.frame && id) vp.frameObject(id); }
function selectShot(id, opts = {}) {
  S.shotId = id; S.t = opts.t ?? 0; S.playing = false; refreshPlayBtn();
  const sh = currentShot(); if (sh && sh.beat) S.beatId = sh.beat;
  vp.applyBlocking(objects(), currentBlocking());
  updateHelpers(); refreshShotList(); refreshShotEditor(); refreshBeats(); layoutPip();
  $('#timeline').classList.toggle('hidden', !sh);
  if (opts.fly && sh) vp.flyTo(sh.keys.A.position, sh.keys.A.target);
  if (sh) vp.focusDist = core.dist(sh.keys.A.position, sh.keys.A.target);
  refreshRight();
}
function updateHelpers() { vp.setShotHelpers(shots(), S.shotId, currentShot() ? solvedFor(currentShot()) : null); }

// ------------------------------------------------------------------ panels: outliner + props ----------------------------
function refreshTitle() { const sc = S.scene ? S.scene.scene : {}; $('#scene-title').textContent = S.scene ? `${S.scene.project || ''} · Sc. ${sc.number ?? ''} ${sc.heading || ''}${S.dirty ? ' •' : ''}` : '—'; document.title = `Layout Studio · ${S.scene ? S.scene.project : ''}`; }
function refreshOutliner() {
  const box = $('#outliner');
  const groups = { CHAR: [], HERO: [], PROP: [], SET: [], FX: [], ENV: [] };
  const f = S.filter.toLowerCase();
  for (const o of objects()) { if (f && !(`${o.name} ${o.id} ${o.kind}`.toLowerCase().includes(f))) continue; (groups[o.role] || groups.ENV).push(o); }
  let html = '';
  for (const [role, list] of Object.entries(groups)) {
    if (!list.length) continue;
    html += `<div class="group">${role} · ${list.length}</div>`;
    const shown = role === 'ENV' && list.length > 60 && !f ? list.slice(0, 60) : list;
    for (const o of shown) html += `<div class="row ${o.id === S.selectedId ? 'selected' : ''}" data-id="${esc(o.id)}"><span class="dot" style="background:${esc(o.color || ROLE_COLORS[o.role] || '#888')}"></span><span class="name">${esc(o.name || o.id)}</span><span class="tag">${esc(o.kind === 'standin' ? core.poseKey(o.pose) : o.kind)}</span><span class="eye ${o.visible === false ? 'off' : ''}" data-eye="${esc(o.id)}" title="toggle visibility">◉</span></div>`;
    if (shown.length < list.length) html += `<div class="row"><span class="tag">… ${list.length - shown.length} more (use the filter)</span></div>`;
  }
  box.innerHTML = html || '<div class="empty">No objects. Add proxies with the buttons above.</div>';
}
function refreshProps() {
  const box = $('#props');
  const o = getObj(S.selectedId);
  if (!o) { box.innerHTML = '<div class="empty">Click an object in the viewport or in the list.</div>'; return; }
  const beatId = o.kind === 'standin' ? activeBeatId() : null;
  const bl = beatId ? (beatBlocking(beatId)[o.id] || null) : null;
  const xyz = (f, v, step = 0.01) => `<div class="xyz">${[0, 1, 2].map((i) => `<input type="number" step="${step}" data-f="${f}.${i}" value="${v ? r3(v[i]) : 0}">`).join('')}</div>`;
  let html = `<h4>${esc(o.kind)} · <span class="mini">${esc(o.id)}</span></h4>`;
  html += `<div class="field"><label>name</label><input data-f="name" value="${esc(o.name || '')}"></div>`;
  html += `<div class="field"><label>role</label><select data-f="role">${opt(core.ROLES, o.role)}</select></div>`;
  html += `<div class="field"><label>source</label><select data-f="source">${opt(['script', 'observed', 'inferred', 'reference'], o.source || 'inferred')}</select></div>`;
  html += `<div class="field"><label>color</label><div class="pair"><input type="color" data-f="color" value="${esc(/^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : '#888888')}"><input data-f="color" value="${esc(o.color || '')}"></div></div>`;
  if (o.kind === 'standin') {
    html += `<div class="field"><label>height m</label><input type="number" step="0.01" data-f="height" value="${o.height || 1.75}"></div>`;
    html += `<div class="field"><label>age</label><input type="number" step="1" data-f="age" value="${o.age ?? ''}" placeholder="auto from height"></div>`;
    if (beatId) {
      html += `<h4>blocking · beat ${esc(beatId)} ${bl ? '' : '<span class="badge warn">not set (using rest)</span>'}</h4>`;
      const p = bl ? bl.position : o.position;
      html += `<div class="field"><label>position</label>${xyz('bl.position', p)}</div>`;
      html += `<div class="field"><label>facing °</label><input type="number" step="1" data-f="bl.facing" value="${bl ? (bl.facing ?? o.rotation[1]) : o.rotation[1]}"></div>`;
      html += `<div class="field"><label>pose</label><select data-f="bl.pose">${opt(core.POSES, core.poseKey(bl ? (bl.pose || o.pose) : o.pose), (p) => core.POSE_NAMES[p])}</select></div>`;
      html += `<div class="field"><label>visible</label><input type="checkbox" data-f="bl.visible" ${(bl ? bl.visible : o.visible) === false ? '' : 'checked'}></div>`;
      html += actingHTML(bl ? (bl.pose || o.pose) : o.pose);
      html += `<div class="note">Gizmo moves edit this beat. Rest transform below.</div>`;
    }
    html += `<h4>rest transform</h4>`;
    html += `<div class="field"><label>position</label>${xyz('position', o.position)}</div>`;
    html += `<div class="field"><label>facing °</label><input type="number" step="1" data-f="rotation.1" value="${o.rotation[1]}"></div>`;
    html += `<div class="field"><label>pose</label><select data-f="pose">${opt(core.POSES, core.poseKey(o.pose), (p) => core.POSE_NAMES[p])}</select></div>`;
  } else {
    html += `<div class="field"><label>position</label>${xyz('position', o.position)}</div>`;
    html += `<div class="field"><label>rotation °</label>${xyz('rotation', o.rotation, 1)}</div>`;
    html += `<div class="field"><label>scale</label>${xyz('scale', o.scale, 0.01)}</div>`;
    if (o.kind !== 'gltf') html += `<div class="field"><label>size m</label>${xyz('size', o.size)}</div>`;
    if (o.kind === 'gltf') html += `<div class="field"><label>url</label><input data-f="url" value="${esc(o.url || '')}"></div>`;
    if (o.kind === 'tree') html += `<div class="note">size = canopy diameter, total height, trunk fraction</div>`;
  }
  html += `<div class="field"><label>visible</label><input type="checkbox" data-f="visible" ${o.visible === false ? '' : 'checked'}></div>`;
  html += `<div class="field"><label>notes</label><textarea data-f="notes">${esc(o.notes || '')}</textarea></div>`;
  html += `<div class="btnrow"><button class="small" data-act="frame">Frame (F)</button><button class="small" data-act="dup">Duplicate</button><button class="small" data-act="ground">Drop to ground</button><button class="small" data-act="del" style="color:var(--bad)">Delete</button></div>`;
  box.innerHTML = html;
}
const ACTING = [['head', 'pitch', 'head down'], ['head', 'yaw', 'head turn ←'], ['neck', 'pitch', 'neck down'], ['spine', 'pitch', 'lean fwd'], ['spine', 'yaw', 'twist ←'],
  ['shoulderL', 'flex', 'L arm fwd'], ['shoulderL', 'abd', 'L arm out'], ['elbowL', 'flex', 'L elbow'], ['shoulderR', 'flex', 'R arm fwd'], ['shoulderR', 'abd', 'R arm out'], ['elbowR', 'flex', 'R elbow'],
  ['hipL', 'flex', 'L thigh up'], ['kneeL', 'flex', 'L knee'], ['hipR', 'flex', 'R thigh up'], ['kneeR', 'flex', 'R knee']];
/** Joint-angle fields for the acting of a stand-in in the current beat (values are the resolved angles, degrees). */
function actingHTML(pose) {
  const A = core.resolvePose(pose), custom = pose && typeof pose === 'object' && pose.base;
  let h = `<details class="acting" ${custom ? 'open' : ''}><summary class="note" style="cursor:pointer">acting · joint angles ${custom ? '<span class="badge ok">adjusted</span>' : ''}</summary><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-top:4px">`;
  for (const [j, k, label] of ACTING) h += `<label class="mini" style="display:flex;flex-direction:column">${esc(label)}<input type="number" step="1" data-f="act.${j}.${k}" value="${Math.round((A[j] && A[j][k]) || 0)}"></label>`;
  // hands: a gesture from the library, how closed it is, and the forearm turn that shows the palm or the back
  const handName = (side) => { const v = handOverride(pose, side); return typeof v === 'string' ? v : (v && v.preset) || ''; };
  for (const [S, label] of [['L', 'L hand'], ['R', 'R hand']]) {
    const cur = handName(S);
    h += `<label class="mini" style="display:flex;flex-direction:column">${label}<select data-f="hand.${S}"><option value="">${esc(cur ? '' : 'pose default')}</option>${Object.entries(core.HAND_NAMES).map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    h += `<label class="mini" style="display:flex;flex-direction:column">${label} closed %<input type="number" step="5" min="-20" max="110" data-f="handc.${S}" value="${Math.round(((A['hand' + S] || {}).curl || 0) * 100)}"></label>`;
    h += `<label class="mini" style="display:flex;flex-direction:column">${S} wrist turn<input type="number" step="5" data-f="act.wrist${S}.twist" value="${Math.round((A['wrist' + S] || {}).twist || 0)}"></label>`;
  }
  return h + `</div><div class="btnrow"><button class="small" data-act="acting-reset">Reset to ${esc(core.poseKey(pose))}</button></div></details>`;
}
/** The hand entry an acting override sets for one side (handL / handR, or hand for both), if any. */
function handOverride(pose, side) {
  if (!pose || typeof pose !== 'object') return null;
  return pose['hand' + side] ?? pose.hand ?? null;
}
function setHand(target, side, preset, curl) {
  const cur = target.pose, base = core.poseKey(cur);
  const over = cur && typeof cur === 'object' && cur.base ? JSON.parse(JSON.stringify(cur)) : { base };
  if (over.hand != null && over['hand' + side] == null) { over.handL = over.handL ?? over.hand; over.handR = over.handR ?? over.hand; delete over.hand; }
  const prev = over['hand' + side];
  if (preset !== undefined) over['hand' + side] = preset ? preset : undefined;
  if (curl !== undefined) over['hand' + side] = Object.assign(typeof prev === 'string' ? { preset: prev } : Object.assign({}, prev || {}), { curl });
  if (over['hand' + side] === undefined) delete over['hand' + side];
  target.pose = Object.keys(over).length > 1 ? over : base;
}
function setActing(target, joint, field, value) {
  const cur = target.pose, base = core.poseKey(cur);
  const over = cur && typeof cur === 'object' && cur.base ? JSON.parse(JSON.stringify(cur)) : { base };
  const lib = core.resolvePose(base)[joint] || {};
  over[joint] = Object.assign({}, over[joint] || {}, { [field]: value });
  if (Math.abs((lib[field] || 0) - value) < 1e-9 && Object.keys(over[joint]).length === 1) delete over[joint];
  target.pose = Object.keys(over).length > 1 ? over : base;
}
function setPath(obj, path, value) { const parts = path.split('.'); let o = obj; for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) o[parts[i]] = isNaN(+parts[i + 1]) ? {} : []; o = o[parts[i]]; } o[parts[parts.length - 1]] = value; }
function readInput(el) { if (el.type === 'checkbox') return el.checked; if (el.type === 'number') { const v = parseFloat(el.value); return isNaN(v) ? 0 : v; } return el.value; }
function ensureBlocking(beatId, objId) { const b = getBeat(beatId); if (!b) return null; b.blocking = b.blocking || {}; if (!b.blocking[objId]) { const o = getObj(objId); b.blocking[objId] = { position: o.position.slice(), facing: o.rotation[1], pose: o.pose || 'stand' }; } return b.blocking[objId]; }
$('#props').addEventListener('change', (e) => {
  const el = e.target; const o = getObj(S.selectedId); if (!o || !el.dataset.f) return;
  snapshot();
  let f = el.dataset.f; const v = readInput(el);
  if (f.startsWith('act.')) { const [, joint, field] = f.split('.'); const b = activeBeatId() ? ensureBlocking(activeBeatId(), o.id) : o; setActing(b, joint, field, v); }
  else if (f.startsWith('hand.') || f.startsWith('handc.')) { const side = f.slice(-1); const b = activeBeatId() ? ensureBlocking(activeBeatId(), o.id) : o; if (f.startsWith('hand.')) setHand(b, side, v || null); else setHand(b, side, undefined, v / 100); }
  else if (f.startsWith('bl.')) { const b = ensureBlocking(activeBeatId(), o.id); if (b) setPath(b, f.slice(3), f === 'bl.visible' ? v : v); }
  else if (f === 'color') { o.color = v; }
  else setPath(o, f, v);
  if (f.startsWith('rotation.') || f === 'pose') { /* rest */ }
  afterObjectEdit(o);
  refreshProps();
});
$('#props').addEventListener('click', (e) => {
  const act = e.target.dataset.act; const o = getObj(S.selectedId); if (!act || !o) return;
  if (act === 'frame') vp.frameObject(o.id);
  if (act === 'dup') { snapshot(); const c = JSON.parse(JSON.stringify(o)); c.id = core.uid(o.id.split('_')[0] || 'OBJ'); c.name = (o.name || o.id) + ' copy'; c.position = [o.position[0] + 0.5, o.position[1], o.position[2] + 0.5]; objects().push(c); vp.addObjectNode(c); selectObject(c.id); markDirty(); }
  if (act === 'ground') { snapshot(); o.position[1] = 0; afterObjectEdit(o); refreshProps(); }
  if (act === 'del') deleteObject(o.id);
  if (act === 'acting-reset') { snapshot(); const b = activeBeatId() ? ensureBlocking(activeBeatId(), o.id) : o; b.pose = core.poseKey(b.pose); afterObjectEdit(o); refreshProps(); }
});
function afterObjectEdit(o) { vp.refreshObject(o); vp.applyBlocking(objects(), currentBlocking()); invalidate(); markDirty(); refreshOutliner(); refreshRight(); }
function deleteObject(id) {
  snapshot();
  S.scene.objects = objects().filter((o) => o.id !== id);
  for (const b of beats()) if (b.blocking) delete b.blocking[id];
  for (const sh of shots()) if (sh.subject === id) sh.subject = null;
  vp.removeObject(id); S.selectedId = null; invalidate(); markDirty(); refreshOutliner(); refreshProps(); refreshShotEditor(); refreshRight();
}
$('#outliner').addEventListener('click', (e) => {
  const eye = e.target.dataset.eye; if (eye) { const o = getObj(eye); if (o) { snapshot(); o.visible = o.visible === false ? true : false; afterObjectEdit(o); } return; }
  const row = e.target.closest('.row'); if (row && row.dataset.id) selectObject(row.dataset.id);
});
$('#outliner').addEventListener('dblclick', (e) => { const row = e.target.closest('.row'); if (row && row.dataset.id) vp.frameObject(row.dataset.id); });
$('#outliner-filter').addEventListener('input', (e) => { S.filter = e.target.value; refreshOutliner(); });

function addObject(kind, extra = {}) {
  if (!S.scene) return;
  snapshot();
  const fp = vp.focusPoint;
  const base = { position: [r3(fp.x), 0, r3(fp.z)], source: 'inferred' };
  const presets = {
    box: { name: 'Box', role: 'PROP', kind: 'box', size: [1, 1, 1], color: '#b89a6a' },
    cylinder: { name: 'Cylinder', role: 'PROP', kind: 'cylinder', size: [0.6, 1, 0.6], color: '#b89a6a' },
    cone: { name: 'Cone', role: 'PROP', kind: 'cone', size: [1, 1.2, 1], color: '#8a9a6a' },
    sphere: { name: 'Sphere', role: 'PROP', kind: 'sphere', size: [1, 1, 1], color: '#9a8a7a' },
    tree: { name: 'Tree', role: 'ENV', kind: 'tree', size: [5, 14, 0.35], color: '#2f5d3a' },
    standin: { name: 'NEW CHARACTER', role: 'CHAR', kind: 'standin', height: 1.75, pose: 'stand', size: [0.5, 1.75, 0.3], color: '#' + Math.floor(Math.random() * 0x7fffff + 0x400000).toString(16).padStart(6, '0') },
    gltf: { name: 'GLB model', role: 'SET', kind: 'gltf', size: [1, 1, 1], color: '#cccccc' },
  };
  const o = core.newObject(Object.assign({ id: core.uid(kind === 'standin' ? 'CHAR' : kind === 'tree' ? 'ENV' : 'PROP') }, base, presets[kind] || presets.box, extra));
  objects().push(o); vp.addObjectNode(o); vp.applyBlocking(objects(), currentBlocking()); selectObject(o.id); markDirty(); invalidate(); refreshShotEditor();
  return o;
}
$('#outliner-tools').addEventListener('click', (e) => { const k = e.target.dataset.add; if (!k) return; if (k === 'gltf') return $('#file-gltf').click(); addObject(k); });
$('#file-gltf').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; const url = URL.createObjectURL(f); const o = addObject('gltf', { name: f.name.replace(/\.(glb|gltf)$/i, ''), url: f.name }); const n = vp.nodes.get(o.id); if (n) { vp.removeObject(o.id); vp.addObjectNode(Object.assign({}, o, { url })); vp.setSelected(o.id); } toast(`Loaded ${f.name}. Keep the file next to the JSON (url = "${f.name}") so it loads next time.`); e.target.value = ''; });
vp.onObjectMeasured = (id, size, min) => { const o = getObj(id); if (o && (!o.size || o.size.join() === '1,1,1')) { o.size = size.map(r3); refreshProps(); } };

// ------------------------------------------------------------------ panels: shots ---------------------------------------
function refreshShotList() {
  const box = $('#shotlist');
  if (!shots().length) { box.innerHTML = '<div class="empty">No shots yet. Add one and place the camera.</div>'; $('#line-issues').innerHTML = ''; return; }
  let html = '';
  for (const sh of shots()) {
    const subj = getObj(sh.subject);
    let score = null; try { score = scoreFor(sh); } catch (e) { score = null; }
    const cls = score == null ? '' : score >= 85 ? 'ok' : score >= 65 ? 'warn' : 'bad';
    html += `<div class="row ${sh.id === S.shotId ? 'selected' : ''}" data-id="${esc(sh.id)}"><span class="name"><b>${esc(sh.name || sh.id)}</b> <span class="tag">${esc(sh.size || '')}</span> ${esc(subj ? subj.name : '')}</span><span class="tag">${esc((sh.rig && sh.rig.type) || 'static')} · ${esc(sh.camera.focal_mm)}mm · ${esc(sh.duration_s)}s</span><span class="badge ${cls}">${score == null ? '?' : score}</span></div>`;
  }
  box.innerHTML = html;
  // 180° line check between consecutive shots sharing a declared axis
  try {
    const poses = shots().map((sh) => solvedFor(sh).pose(0)); const bls = shots().map((sh) => beatBlocking(sh.beat));
    const issues = core.checkLine(S.scene, shots(), poses, bls);
    $('#line-issues').innerHTML = issues.map((i) => `<div class="flag bad" style="margin:4px 8px">${esc(i.msg)}</div>`).join('');
  } catch (e) { $('#line-issues').innerHTML = ''; }
}
$('#shotlist').addEventListener('click', (e) => { const row = e.target.closest('.row'); if (row && row.dataset.id) selectShot(row.dataset.id, { fly: false }); });
$('#shotlist').addEventListener('dblclick', (e) => { const row = e.target.closest('.row'); if (row && row.dataset.id) selectShot(row.dataset.id, { fly: true }); });

/** DP panel of the shot editor: the intent, a Compose button, and the composition read at the current time. */
function dpPanelHTML(sh) {
  const dp = sh.dp || {}, intent = dp.intent || '';
  let h = `<h4>DP · composition</h4>`;
  h += `<div class="field"><label>intent</label><select data-f="dp.intent"><option value="">classical (neutral)</option>${core.INTENT_IDS.filter((k) => k !== 'neutral').map((k) => `<option value="${k}" ${k === intent ? 'selected' : ''}>${esc(core.INTENTS[k].label)}</option>`).join('')}</select></div>`;
  h += `<div class="btnrow"><button class="small primary" data-act="dp-compose" data-tip="Compose for this intent|The DP composer searches the lenses, face angles and heights the intent allows, solves the distance for the size, puts the eyes on the grid and keeps the best frame. Undo with Ctrl+Z.">Compose for this intent</button></div>`;
  let an = null;
  try {
    const subj = core.resolveSubject(S.scene, sh, blockingAt(sh, S.t));
    if (subj) an = core.composition(S.scene, sh, solvedFor(sh).pose(S.t), blockingAt(sh, S.t));
  } catch (e) { an = null; }
  if (an) {
    const s = an.subject || {};
    const cls = an.score >= 90 ? 'ok' : an.score >= 75 ? 'warn' : 'bad';
    h += `<div class="note"><span class="badge ${cls}">${an.score}</span> ${esc(an.profile)}${s.eyes ? ` · eyes ${Math.round(s.eyes[0] * 100)}%, ${Math.round(s.eyes[1] * 100)}%` : ''}${s.angle ? ` · ${esc(s.angle)} ${s.vAngle}°` : ''}${s.face ? ` · ${esc(s.face.reads)} ${s.face.offAxis}°` : ''} · ${an.lens.ffEq} mm FF</div>`;
    for (const n of an.notes.filter((n) => n.rule !== 'check')) h += `<div class="flag ${n.level === 'warn' ? 'warn' : n.level === 'bad' ? 'bad' : 'info'}">${esc(n.msg)}${n.fix ? ` <span class="mini">→ ${esc(n.fix)}</span>` : ''}</div>`;
  }
  if (dp.why && dp.why.length) h += `<div class="note mini">${dp.why.map(esc).join('<br>')}</div>`;
  return h;
}
/** Run the DP composer on the selected shot (key A; a moving shot keeps its B), store the framing and the reasoning. */
function composeShot(sh) {
  const intent = (sh.dp && sh.dp.intent) || 'neutral';
  snapshot();
  const def = { type: 'compose', intent };
  if (sh.line && sh.line.length === 2 && sh.keys.A) {
    const P = (id) => { const b = beatBlocking(sh.beatA || sh.beat)[id]; const o = getObj(id); return (b && b.position) || (o && o.position); };
    const a = P(sh.line[0]), b = P(sh.line[1]);
    if (a && b) { const side = Math.sign((b[0] - a[0]) * (sh.keys.A.position[2] - a[2]) - (b[2] - a[2]) * (sh.keys.A.position[0] - a[0])); if (side) def.side = side; } // stay on this side of the line
  }
  const keepB = sh.keys.B && !(sh.framing && sh.framing.B) ? { type: 'raw', position: sh.keys.B.position, target: sh.keys.B.target, roll: sh.keys.B.roll || 0 } : (sh.framing && sh.framing.B) || null;
  sh.framing = { A: def, B: keepB };
  core.resolveShotKeys(S.scene, sh);
  const r = core.compose(S.scene, sh, def);
  sh.dp = Object.assign({}, sh.dp || {}, { intent: r.intent, why: r.why });
  invalidate(); refreshShotList(); refreshShotEditor(); refreshRight(); markDirty();
  toast(`Composed: ${r.focal_mm} mm, composition ${r.analysis.score}/100`);
}
function refreshShotEditor() {
  const box = $('#shot-editor');
  const sh = currentShot();
  if (!sh) { box.innerHTML = '<div class="empty">Select a shot.</div>'; return; }
  const cam = sh.camera, rig = sh.rig || { type: 'static' };
  const xyz = (f, v, step = 0.01) => `<div class="xyz">${[0, 1, 2].map((i) => `<input type="number" step="${step}" data-f="${f}.${i}" value="${v ? r3(v[i]) : 0}">`).join('')}</div>`;
  const beatOpts = (val, allowNone) => (allowNone ? `<option value="">(same as shot)</option>` : `<option value="">— none —</option>`) + opt(beats(), val || '', (b) => `${b.id} · ${b.label || ''}`, (b) => b.id);
  const subjOpts = `<option value="">— none —</option>` + opt([...standins(), ...objects().filter((o) => o.kind !== 'standin' && o.role !== 'ENV')], sh.subject || '', (o) => `${o.name || o.id}`, (o) => o.id);
  const charOpts = (val) => `<option value="">—</option>` + opt(standins(), val || '', (o) => o.name || o.id, (o) => o.id);
  let html = `<h4>shot <span class="mini">${esc(sh.id)}</span></h4>`;
  html += `<div class="field"><label>name</label><input data-f="name" value="${esc(sh.name || '')}"></div>`;
  html += `<div class="field"><label>beat</label><select data-f="beat">${beatOpts(sh.beat)}</select></div>`;
  html += `<div class="field"><label>beat A → B</label><div class="pair"><select data-f="beatA">${beatOpts(sh.beatA, true)}</select><select data-f="beatB">${beatOpts(sh.beatB, true)}</select></div></div>`;
  html += `<div class="field"><label>size</label><select data-f="size">${opt(core.SHOT_SIZE_IDS, sh.size, (s) => `${s} · ${core.SHOT_SIZES[s].name}`)}</select></div>`;
  html += `<div class="field"><label>subject</label><select data-f="subject">${subjOpts}</select></div>`;
  html += `<div class="field"><label>intent</label><textarea data-f="intent">${esc(sh.intent || '')}</textarea></div>`;
  html += `<h4>lens</h4>`;
  html += `<div class="field"><label>filmback</label><select data-f="camera.filmback">${opt(core.FILMBACKS, cam.filmback, (f) => `${f.brand} ${f.name}`, (f) => f.id)}</select></div>`;
  html += `<div class="field"><label>focal mm</label><div class="pair"><input type="number" step="1" data-f="camera.focal_mm" value="${cam.focal_mm}"><select data-f="camera.focal_mm">${opt(core.LENS_KITS['S35 spherical primes'], cam.focal_mm, (f) => `${f}mm`)}</select></div></div>`;
  html += `<div class="field"><label>aspect</label><select data-f="camera.aspect">${opt(core.ASPECTS, (+cam.aspect).toFixed(2), (a) => a.name, (a) => a.value.toFixed(2))}</select></div>`;
  html += `<div class="field"><label>squeeze</label><select data-f="camera.squeeze">${opt(core.SQUEEZES, cam.squeeze || 1, (s) => `${s}x`)}</select></div>`;
  html += `<div class="field"><label>T-stop / focus</label><div class="pair"><input type="number" step="0.1" data-f="camera.fstop" value="${cam.fstop || 2.8}"><input type="number" step="0.1" data-f="camera.focus_m" value="${cam.focus_m || ''}" placeholder="auto"></div></div>`;
  html += `<h4>rig · move</h4>`;
  html += `<div class="field"><label>rig</label><select data-f="rig.type">${opt(core.RIG_IDS, rig.type, (r) => core.RIGS[r].name)}</select></div>`;
  if (rig.type === 'crane') { html += `<div class="field"><label>arm max m</label><input type="number" step="0.5" data-f="rig.arm" value="${rig.arm || 9}"></div><div class="field"><label>pivot</label>${xyz('rig.pivot', rig.pivot || null, 0.1)}</div><div class="btnrow"><button class="small" data-act="pivot-focus">Pivot = focus point</button><button class="small" data-act="pivot-auto">Auto pivot</button></div>`; }
  if (['dolly', 'steadicam', 'handheld', 'gimbal', 'drone', 'vehicle'].includes(rig.type)) html += `<div class="field"><label>curved path</label><div class="pair"><button class="small" data-act="via-view">via = view pos</button><button class="small" data-act="via-clear">${rig.via ? 'clear via' : 'straight'}</button></div></div>`;
  if (core.RIGS[rig.type].noise) html += `<div class="field"><label>shake</label><div class="xyz"><label class="mini"><input type="checkbox" data-f="rig.noiseOn" ${rig.noise === false ? '' : 'checked'}> on</label><input type="number" step="0.1" min="0" max="3" data-f="rig.shake" value="${rig.shake ?? 1}" title="intensity (1 = default)"><input type="number" step="1" data-f="rig.seed" value="${rig.seed ?? 7}" title="seed"></div></div>`;
  html += `<div class="field"><label>options</label><div class="pair"><label class="mini"><input type="checkbox" data-f="rig.aimSubject" ${rig.aim === 'subject' ? 'checked' : ''}> aim follows subject</label><label class="mini"><input type="checkbox" data-f="rig.follow" ${rig.follow ? 'checked' : ''}> camera follows subject</label><label class="mini"><input type="checkbox" data-f="rig.lowMode" ${rig.lowMode ? 'checked' : ''}> low mode</label></div></div>`;
  html += `<div class="field"><label>duration s</label><input type="number" step="0.5" data-f="duration_s" value="${sh.duration_s}"></div>`;
  { const mv = Array.isArray(sh.move) ? sh.move : null, ac = sh.action;
    html += `<div class="field"><label>move s</label><div class="pair"><input type="number" step="0.1" data-f="move.0" value="${mv ? mv[0] : ''}" placeholder="0"><input type="number" step="0.1" data-f="move.1" value="${mv && mv[1] != null ? mv[1] : ''}" placeholder="${sh.duration_s}"></div></div>`;
    if (sh.beatA && sh.beatB && sh.beatA !== sh.beatB) html += Array.isArray(ac) || !ac
      ? `<div class="field"><label>action s</label><div class="pair"><input type="number" step="0.1" data-f="action.0" value="${ac ? ac[0] : ''}" placeholder="0"><input type="number" step="0.1" data-f="action.1" value="${ac && ac[1] != null ? ac[1] : ''}" placeholder="${sh.duration_s}"></div></div>`
      : `<div class="field"><label>action s</label><span class="mini" data-tip="Action per actor|This shot times each actor separately (in the build script): ${esc(Object.entries(ac).map(([k, w]) => `${(getObj(k) || {}).name || k} ${w[0]}–${w[1]} s`).join(', '))}.">per actor · ${esc(Object.entries(ac).map(([k, w]) => `${w[0]}–${w[1]}`).join(' · '))} s</span></div>`; }
  html += `<div class="field"><label>curve</label><select data-f="curve">${opt([...core.CURVE_IDS, 'custom'], typeof sh.curve === 'string' ? sh.curve : 'custom', (c) => (c === 'custom' ? 'Custom bezier…' : core.CURVE_PRESETS[c].name))}</select></div>`;
  const cp = core.curvePoints(sh.curve);
  if (cp) html += `<div class="field"><label>bezier x1 y1 x2 y2</label><div class="xyz" style="grid-template-columns:repeat(4,1fr)">${cp.map((v, i) => `<input type="number" step="0.05" data-f="curvep.${i}" value="${r3(v)}">`).join('')}</div></div>`;
  html += `<div class="field"><label></label>${curveSVG(sh.curve)}</div>`;
  html += `<h4>keys</h4>`;
  for (const k of ['A', 'B']) {
    const key = sh.keys[k];
    html += `<div class="note"><b>Key ${k}</b> ${key ? '' : '<span class="mini">(not set — static shot)</span>'}</div>`;
    if (key) { html += `<div class="field"><label>position</label>${xyz(`keys.${k}.position`, key.position)}</div><div class="field"><label>target</label>${xyz(`keys.${k}.target`, key.target)}</div><div class="field"><label>roll °</label><input type="number" step="0.5" data-f="keys.${k}.roll" value="${key.roll || 0}"></div>`; }
    html += `<div class="btnrow"><button class="small" data-act="set-${k}">Set ${k} from view</button>${key ? `<button class="small" data-act="go-${k}">Go to ${k}</button>` : ''}${k === 'B' ? (key ? `<button class="small" data-act="clear-B">Clear B</button>` : `<button class="small" data-act="copy-AB">B = A</button>`) : ''}${key ? `<button class="small" data-act="aim-${k}">Aim ${k} at subject</button>` : ''}</div>`;
  }
  if (sh.framing && sh.framing.A) html += `<div class="btnrow"><button class="small" data-act="resolve">↻ Re-solve framing (${esc(sh.framing.A.type || 'single')}${sh.framing.B ? ` → ${esc(sh.framing.B.type || 'single')}` : ''})</button></div><div class="note">Recomputes both keys from the stored framing definition with the current lens, size and blocking.</div>`;
  html += dpPanelHTML(sh);
  html += `<h4>checks</h4>`;
  html += `<div class="field"><label>wants FG</label><input type="checkbox" data-f="wantForeground" ${sh.wantForeground ? 'checked' : ''}></div>`;
  html += `<div class="field"><label>allow occlusion</label><input type="checkbox" data-f="allowOcclusion" ${sh.allowOcclusion ? 'checked' : ''}></div>`;
  html += `<div class="field"><label>180° axis</label><div class="pair"><select data-f="line.0">${charOpts(sh.line && sh.line[0])}</select><select data-f="line.1">${charOpts(sh.line && sh.line[1])}</select></div></div>`;
  html += `<div class="field"><label>notes</label><textarea data-f="notes">${esc(sh.notes || '')}</textarea></div>`;
  box.innerHTML = html;
}
$('#shot-editor').addEventListener('change', (e) => {
  const el = e.target; const sh = currentShot(); if (!sh || !el.dataset.f) return;
  snapshot();
  const f = el.dataset.f; let v = readInput(el);
  if (f === 'rig.noiseOn') sh.rig.noise = v ? undefined : false;
  else if (f === 'rig.aimSubject') { if (v) sh.rig.aim = 'subject'; else delete sh.rig.aim; }
  else if (f === 'rig.follow') { if (v) sh.rig.follow = true; else delete sh.rig.follow; }
  else if (f === 'camera.aspect' || f === 'camera.squeeze' || f === 'camera.focal_mm') { setPath(sh, f, parseFloat(v)); }
  else if (f === 'camera.focus_m') sh.camera.focus_m = v || null;
  else if (f.startsWith('move.') || f.startsWith('action.')) { // timing windows: empty = the whole shot
    const [key, idx] = f.split('.'), D = sh.duration_s || 0, raw = el.value.trim();
    const w = Array.isArray(sh[key]) ? sh[key].slice() : [0, D]; w[+idx] = raw === '' ? (+idx ? D : 0) : clampN(parseFloat(raw), 0, D);
    if (w[1] < w[0]) w[1] = w[0];
    if (w[0] <= 0.001 && w[1] >= D - 0.001) delete sh[key]; else sh[key] = w;
  }
  else if (f.startsWith('line.')) { sh.line = sh.line || [null, null]; sh.line[+f.split('.')[1]] = v || null; if (!sh.line[0] && !sh.line[1]) sh.line = null; }
  else if (f === 'beat' || f === 'beatA' || f === 'beatB') { sh[f] = v || null; }
  else if (f === 'curve') { sh.curve = v === 'custom' ? { type: 'bezier', p: core.curvePoints(sh.curve) || [0.65, 0, 0.35, 1] } : v; }
  else if (f.startsWith('curvep.')) { const p = core.curvePoints(sh.curve) || [0.65, 0, 0.35, 1]; p[+f.split('.')[1]] = clampN(v, -1, 2); p[0] = clampN(p[0], 0, 1); p[2] = clampN(p[2], 0, 1); sh.curve = { type: 'bezier', p }; }
  else setPath(sh, f, v);
  if (f === 'rig.type') { if (sh.rig.type === 'static' && sh.keys.B) { sh.keys.B.position = sh.keys.A.position.slice(); } }
  afterShotEdit(); refreshShotEditor();
});
$('#shot-editor').addEventListener('click', (e) => {
  const act = e.target.dataset.act; const sh = currentShot(); if (!act || !sh) return;
  snapshot();
  const view = S.lookThrough ? vp.getShotCamPose() : vp.getFlyPose();
  if (act === 'set-A') sh.keys.A = Object.assign({ roll: 0 }, sh.keys.A, { position: view.position, target: view.target });
  if (act === 'set-B') { sh.keys.B = Object.assign({ roll: 0 }, sh.keys.B || {}, { position: view.position, target: view.target }); if (sh.rig.type === 'static') sh.keys.B.position = sh.keys.A.position.slice(); }
  if (act === 'go-A') { vp.flyTo(sh.keys.A.position, sh.keys.A.target); S.t = 0; }
  if (act === 'go-B' && sh.keys.B) { vp.flyTo(sh.keys.B.position, sh.keys.B.target); S.t = 1; }
  if (act === 'clear-B') sh.keys.B = null;
  if (act === 'copy-AB') sh.keys.B = JSON.parse(JSON.stringify(sh.keys.A));
  if (act === 'aim-A' || act === 'aim-B') { const k = act.slice(-1); const subj = core.resolveSubject(S.scene, sh, blockingAt(sh, k === 'A' ? 0 : 1)); if (subj && subj.kind === 'standin') { const aim = core.aimFromPosition({ position: sh.keys[k].position, subject: subj, lens: sh.camera }); sh.keys[k].target = aim.target; } else toast('Aim needs a stand-in subject'); }
  if (act === 'pivot-focus') { sh.rig.pivot = [r3(vp.focusPoint.x), 0, r3(vp.focusPoint.z)]; }
  if (act === 'pivot-auto') { delete sh.rig.pivot; }
  if (act === 'via-view') { sh.rig.via = view.position; }
  if (act === 'via-clear') { delete sh.rig.via; }
  if (act === 'resolve') { try { core.resolveShotKeys(S.scene, sh); toast('Framing re-solved'); } catch (err) { toast('Re-solve failed: ' + err.message); } }
  if (act === 'dp-compose') { try { composeShot(sh); } catch (err) { toast('Compose: ' + err.message); } return; }
  afterShotEdit(); refreshShotEditor();
});
const clampN = (v, a, b) => Math.min(b, Math.max(a, +v || 0));
/** Small plot of a timing curve: time on x, progress on y. */
function curveSVG(curve) {
  const pts = []; for (let i = 0; i <= 40; i++) { const x = i / 40; pts.push(`${(6 + x * 148).toFixed(1)},${(66 - core.ease(curve, x) * 60).toFixed(1)}`); }
  return `<svg viewBox="0 0 160 72" width="160" height="72" style="background:#0c0e11;border:1px solid var(--line);border-radius:4px"><line x1="6" y1="66" x2="154" y2="6" stroke="#3a414b" stroke-dasharray="3 3"/><polyline points="${pts.join(' ')}" fill="none" stroke="#f2c14e" stroke-width="2"/></svg>`;
}
function afterShotEdit() { invalidate(); markDirty(); updateHelpers(); layoutPip(); refreshShotList(); refreshRight(); }
$('#btn-add-shot').addEventListener('click', () => {
  if (!S.scene) return; snapshot();
  const view = vp.getFlyPose();
  const n = shots().length + 1;
  const sh = core.newShot({ id: core.uid('SH'), name: `${S.scene.scene.number || 1}${String.fromCharCode(64 + Math.min(26, n))}`, beat: activeBeatId(), subject: (standins()[0] || {}).id || null, keys: { A: { position: view.position, target: view.target, roll: 0 }, B: null } });
  shots().push(sh); markDirty(); selectShot(sh.id); switchTab('shots');
});
$('#btn-dup-shot').addEventListener('click', () => { const sh = currentShot(); if (!sh) return; snapshot(); const c = JSON.parse(JSON.stringify(sh)); c.id = core.uid('SH'); c.name = (sh.name || sh.id) + "'"; shots().splice(shots().indexOf(sh) + 1, 0, c); markDirty(); invalidate(); selectShot(c.id); });
$('#btn-del-shot').addEventListener('click', () => { const sh = currentShot(); if (!sh) return; snapshot(); S.scene.shots = shots().filter((s) => s !== sh); markDirty(); invalidate(); selectShot((shots()[0] || {}).id || null); });
$('#btn-check-all').addEventListener('click', () => { invalidate(); refreshShotList(); toast('All shots re-evaluated'); });

// ------------------------------------------------------------------ panels: beats ---------------------------------------
function refreshBeats() {
  const box = $('#beatlist');
  box.innerHTML = beats().map((b) => `<div class="row ${b.id === S.beatId ? 'selected' : ''}" data-id="${esc(b.id)}"><span class="name"><b>${esc(b.id)}</b> ${esc(b.label || '')}</span><span class="tag">${esc(b.t0 ?? '')}–${esc(b.t1 ?? '')}s · ${Object.keys(b.blocking || {}).length} ch</span></div>`).join('') || '<div class="empty">No beats. A beat = a blocking state of the stand-ins.</div>';
  const b = getBeat(S.beatId); const ed = $('#beat-editor');
  if (!b) { ed.innerHTML = ''; return; }
  const sh = currentShot();
  ed.innerHTML = `<h4>beat ${esc(b.id)}</h4><div class="field"><label>label</label><input data-f="label" value="${esc(b.label || '')}"></div><div class="field"><label>time s</label><div class="pair"><input type="number" data-f="t0" value="${b.t0 ?? 0}"><input type="number" data-f="t1" value="${b.t1 ?? 0}"></div></div>` +
    `<div class="note">${sh ? `Shot ${esc(sh.name)} is selected: the viewport shows its beat. Select a stand-in and move it to edit the blocking of beat <b>${esc(activeBeatId())}</b>.` : 'Move stand-ins to edit this beat\'s blocking.'}</div>` +
    `<table class="kv">${standins().map((o) => { const bl = (b.blocking || {})[o.id]; return `<tr><td>${esc(o.name)}</td><td>${bl ? `${core.poseKey(bl.pose || o.pose)} · ${bl.position.map((v) => v.toFixed(1)).join(', ')} · ${Math.round(bl.facing ?? o.rotation[1])}°` : '<span class="mini">rest</span>'}</td></tr>`; }).join('')}</table>` +
    `<div class="btnrow"><button class="small" data-act="capture">Capture all stand-ins into this beat</button><button class="small" data-act="del" style="color:var(--bad)">Delete beat</button></div>`;
}
$('#beatlist').addEventListener('click', (e) => { const row = e.target.closest('.row'); if (!row) return; S.beatId = row.dataset.id; S.shotId = null; $('#timeline').classList.add('hidden'); layoutPip(); vp.applyBlocking(objects(), currentBlocking()); updateHelpers(); refreshBeats(); refreshShotList(); refreshProps(); refreshRight(); });
$('#beat-editor').addEventListener('change', (e) => { const b = getBeat(S.beatId); const f = e.target.dataset.f; if (!b || !f) return; snapshot(); setPath(b, f, readInput(e.target)); markDirty(); refreshBeats(); });
$('#beat-editor').addEventListener('click', (e) => {
  const act = e.target.dataset.act; const b = getBeat(S.beatId); if (!act || !b) return; snapshot();
  if (act === 'capture') { b.blocking = b.blocking || {}; for (const o of standins()) { const n = vp.nodes.get(o.id); if (!n) continue; b.blocking[o.id] = { position: [r3(n.group.position.x), r3(n.group.position.y), r3(n.group.position.z)], facing: rd(n.group.rotation.y), pose: n.pose || o.pose || 'stand' }; } }
  if (act === 'del') { S.scene.beats = beats().filter((x) => x !== b); for (const sh of shots()) { if (sh.beat === b.id) sh.beat = null; if (sh.beatA === b.id) sh.beatA = null; if (sh.beatB === b.id) sh.beatB = null; } S.beatId = (beats()[0] || {}).id || null; }
  markDirty(); invalidate(); refreshBeats(); refreshShotEditor(); refreshRight();
});
$('#btn-add-beat').addEventListener('click', () => { if (!S.scene) return; snapshot(); const prev = getBeat(S.beatId) || beats()[beats().length - 1]; const id = `b${beats().length + 1}`; beats().push({ id, label: 'New beat', t0: prev ? prev.t1 : 0, t1: (prev ? prev.t1 : 0) + 10, blocking: JSON.parse(JSON.stringify((prev && prev.blocking) || {})) }); S.beatId = id; markDirty(); refreshBeats(); refreshShotEditor(); });

// ------------------------------------------------------------------ right panel: metrics / rig / lens -------------------
function refreshRight() {
  const sh = currentShot();
  const M = $('#metrics'), R = $('#riginfo'), L = $('#lensinfo');
  if (!sh) { M.innerHTML = '<div class="empty">Select a shot to evaluate the frame.</div>'; R.innerHTML = ''; L.innerHTML = ''; return; }
  let solved, ev;
  try {
    solved = solvedFor(sh);
    const pose = (S.lookThrough && (vp.driving || vp.look)) ? vp.getShotCamPose() : solved.pose(S.t);
    const def = (S.t < 0.5 ? sh.framing && sh.framing.A : sh.framing && sh.framing.B) || {};
    ev = core.evaluateFrame(S.scene, sh, pose, blockingAt(sh, S.t), { expectedSize: def.size || sh.size, wantForeground: def.wantForeground });
    S.lastEval = { ev, pose, sh };
  } catch (e) { M.innerHTML = `<div class="flag bad">Evaluation error: ${esc(e.message)}</div>`; return; }
  const sc = ev.score, cls = sc >= 85 ? 'ok' : sc >= 65 ? 'warn' : 'bad';
  let html = `<div style="display:flex;align-items:baseline;gap:10px"><span class="score" style="color:var(--${cls})">${sc}</span><span class="mini">t = ${(S.t * (sh.duration_s || 0)).toFixed(1)} s · ${S.t < 0.5 ? 'towards key A' : 'towards key B'}</span></div>`;
  html += ev.flags.length ? ev.flags.map((f) => `<div class="flag ${f.level}">${esc(f.msg)}</div>`).join('') : '<div class="flag info">No issues found by the deterministic checks.</div>';
  html += '<table class="kv">';
  if (ev.size) html += `<tr><td>size</td><td>${esc(ev.size.measured)} ${ev.size.requested && ev.size.requested !== ev.size.measured ? `<span class="mini">(asked ${esc(ev.size.requested)})</span>` : ''} · subject ${(ev.size.subjectHeightFrac * 100).toFixed(0)}% of frame</td></tr>`;
  if (ev.headroom) html += `<tr><td>headroom</td><td>${(ev.headroom.value * 100).toFixed(0)}%</td></tr>`;
  if (ev.leadRoom) html += `<tr><td>lead room</td><td>front ${(ev.leadRoom.front * 100).toFixed(0)}% · behind ${(ev.leadRoom.behind * 100).toFixed(0)}% · faces ${esc(ev.leadRoom.facing)}</td></tr>`;
  if (ev.thirds) html += `<tr><td>eyes</td><td>x ${(ev.thirds.eyesX * 100).toFixed(0)}% · y ${(ev.thirds.eyesY * 100).toFixed(0)}% ${ev.thirds.centred ? '· centred' : ''}</td></tr>`;
  if (ev.eyeline) html += `<tr><td>eyeline</td><td>${esc(ev.eyeline.rel)} (${ev.eyeline.cameraMinusEyes > 0 ? '+' : ''}${ev.eyeline.cameraMinusEyes} m)</td></tr>`;
  html += `<tr><td>horizon</td><td>${ev.horizon.inFrame ? `${(ev.horizon.y * 100).toFixed(0)}% from bottom` : 'out of frame'}</td></tr>`;
  html += `<tr><td>depth</td><td>FG ${ev.depth.counts[0]} · MG ${ev.depth.counts[1]} · BG ${ev.depth.counts[2]}<div class="mini">${esc([ev.depth.fg.slice(0, 3).join(', '), ev.depth.mg.slice(0, 3).join(', '), ev.depth.bg.slice(0, 3).join(', ')].filter(Boolean).join(' | '))}</div></td></tr>`;
  if (ev.occlusion) html += `<tr><td>occlusion</td><td>${ev.occlusion.occluded ? esc(ev.occlusion.by.join(', ')) : 'clear'}</td></tr>`;
  if (ev.subjectDistance) html += `<tr><td>distance</td><td>${ev.subjectDistance} m · camera h ${ev.cameraHeight} m</td></tr>`;
  html += '</table>';
  M.innerHTML = html;
  R.innerHTML = `<div class="note">${esc(core.describeMove(solved.info))}</div>` + (solved.warnings.length ? solved.warnings.map((w) => `<div class="flag warn">${esc(w)}</div>`).join('') : '<div class="flag info">Within the rig limits.</div>') +
    `<table class="kv"><tr><td>path</td><td>${solved.info.pathLength} m · avg ${solved.info.avgSpeed} m/s · peak ${solved.info.maxSpeed} m/s</td></tr><tr><td>pan / tilt</td><td>${solved.info.panDelta}° / ${solved.info.tiltDelta}° · max ${solved.info.maxPanRate}°/s</td></tr><tr><td>lens height</td><td>${solved.info.heightA} → ${solved.info.heightB} m</td></tr>${solved.info.pivot ? `<tr><td>crane pivot</td><td>${solved.info.pivot.join(', ')} · arm ${solved.info.armA}→${solved.info.armB} m</td></tr>` : ''}</table>`;
  const cam = sh.camera; const fov = core.fovFor(cam); const dof = core.dof({ focal_mm: cam.focal_mm, fstop: cam.fstop || 2.8, focus_m: cam.focus_m || ev.subjectDistance || 3 }, cam.filmback);
  L.innerHTML = `<div class="note">${esc(core.lensLabel(cam))}</div><table class="kv"><tr><td>FOV h / v</td><td>${fov.hfov.toFixed(1)}° / ${fov.vfov.toFixed(1)}°</td></tr><tr><td>gate</td><td>${fov.gate.w.toFixed(2)} × ${fov.gate.h.toFixed(2)} mm</td></tr><tr><td>FF equiv.</td><td>${core.equivalentFocal(cam).toFixed(0)} mm</td></tr><tr><td>DOF @ T${cam.fstop || 2.8}</td><td>${cam.focus_m ? `focus ${cam.focus_m} m` : `focus ${fmt(ev.subjectDistance || 3)} m (auto)`} · ${dof.near_m.toFixed(2)}–${dof.far_m === Infinity ? '∞' : dof.far_m.toFixed(2)} m</td></tr></table>`;
}

// ------------------------------------------------------------------ PiP + guides ----------------------------------------
function layoutPip() {
  const sh = currentShot(); const pip = $('#pip');
  if (!sh || S.lookThrough) { pip.classList.add('hidden'); return; }
  pip.classList.remove('hidden');
  const w = { S: 300, M: 460, L: 660 }[S.pipSize] || 460; const aspect = sh.camera.aspect || 2.39;
  pip.style.width = `${w}px`; pip.style.height = `${Math.round(w / aspect)}px`;
  $('#pip-label').textContent = `${sh.name || sh.id} · ${sh.camera.focal_mm}mm · ${sh.size || ''} · ${(sh.rig && sh.rig.type) || 'static'}`;
}
function pipRect() { const pip = $('#pip'); if (pip.classList.contains('hidden')) return null; const r = pip.getBoundingClientRect(), c = vp.canvas.getBoundingClientRect(); return { x: Math.round(r.left - c.left), y: Math.round(c.height - (r.bottom - c.top)), w: Math.round(r.width), h: Math.round(r.height) }; }
function drawGuides() {
  const svg = $('#pip-guides'); const sh = currentShot(); if (!sh || S.lookThrough) { svg.innerHTML = ''; return; }
  const W = 1000, Hh = Math.round(1000 / (sh.camera.aspect || 2.39));
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('preserveAspectRatio', 'none');
  let g = `<g stroke="rgba(255,255,255,0.28)" stroke-width="1.5" fill="none">${gridLinesSVG(W, Hh)}<rect x="${W * 0.05}" y="${Hh * 0.05}" width="${W * 0.9}" height="${Hh * 0.9}" stroke-dasharray="6 6"/></g>`;
  const le = S.lastEval;
  if (le && le.sh === sh && le.ev) {
    const subj = core.resolveSubject(S.scene, sh, blockingAt(sh, S.t));
    if (subj && subj.kind === 'standin') {
      const { vfov } = core.fovFor(sh.camera); const basis = core.cameraBasis(le.pose.position, le.pose.target, le.pose.roll || 0);
      const kp = core.keypoints(subj); let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, any = false;
      for (const p of Object.values(kp)) { const q = core.projectPoint(p, le.pose.position, basis, vfov, sh.camera.aspect || 2.39); if (q.behind) continue; any = true; const x = (q.x + 1) / 2 * W, y = (1 - q.y) / 2 * Hh; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      if (any) { const pad = 0.1 * (subj.height || 1.75) / Math.max(0.1, le.ev.subjectDistance || 1) * 200; g += `<rect x="${minX - pad}" y="${minY - pad}" width="${maxX - minX + 2 * pad}" height="${maxY - minY + 2 * pad}" fill="none" stroke="rgba(242,193,78,0.8)" stroke-width="2" stroke-dasharray="4 4"/>`; const e = core.projectPoint(kp.eyes, le.pose.position, basis, vfov, sh.camera.aspect || 2.39); if (!e.behind) g += `<circle cx="${(e.x + 1) / 2 * W}" cy="${(1 - e.y) / 2 * Hh}" r="6" fill="none" stroke="rgba(242,193,78,0.9)" stroke-width="2"/>`; }
    }
    if (le.ev.horizon && le.ev.horizon.inFrame) { const y = (1 - le.ev.horizon.y) * Hh; g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(127,180,255,0.6)" stroke-width="1.5" stroke-dasharray="10 6"/>`; }
  }
  svg.innerHTML = g;
}
$('#pip-size').addEventListener('click', (e) => { const s = e.target.dataset.size; if (s) { S.pipSize = s; layoutPip(); } });

// ------------------------------------------------------------------ timeline / playback ---------------------------------
function refreshPlayBtn() { $('#tl-play').textContent = S.playing ? '❚❚' : '▶'; $('#tl-playall').classList.toggle('active', !!S.seqPlay); }
function updateTimelineUI() { const sh = currentShot(); if (!sh) return; const d = sh.duration_s || 0; $('#tl-range').value = Math.round(S.t * 1000); $('#tl-time').textContent = `${(S.t * d).toFixed(1)} / ${d.toFixed(1)} s`; }
$('#tl-play').addEventListener('click', () => { S.playing = !S.playing; S.seqPlay = false; if (S.playing && S.t >= 1) S.t = 0; refreshPlayBtn(); });
$('#tl-playall').addEventListener('click', () => {
  if (!shots().length) return;
  S.seqPlay = !S.seqPlay;
  if (S.seqPlay) { selectShot(shots()[0].id, { fly: false }); if (!S.lookThrough) setLookThrough(true); S.playing = true; S.loop = false; $('#tl-loop').checked = false; }
  else S.playing = false;
  refreshPlayBtn();
});
$('#tl-range').addEventListener('input', (e) => { S.t = (+e.target.value) / 1000; S.playing = false; refreshPlayBtn(); });
$('#tl-loop').addEventListener('change', (e) => { S.loop = e.target.checked; });
$('#tl-sound').addEventListener('click', () => { sound.muted = !sound.muted; $('#tl-sound').classList.toggle('active', !sound.muted); if (sound.muted) sound.stop(); });
$('#tl-prev').addEventListener('click', () => stepShot(-1));
$('#tl-next').addEventListener('click', () => stepShot(1));
function stepShot(d) { const list = shots(); if (!list.length) return; const i = Math.max(0, list.findIndex((s) => s.id === S.shotId)); selectShot(list[(i + d + list.length) % list.length].id, { fly: false }); }
$('#tl-keyA').addEventListener('click', () => setEditKey('A'));
$('#tl-keyB').addEventListener('click', () => setEditKey('B'));
function setEditKey(k) { S.editKey = k; $('#tl-keyA').classList.toggle('active', k === 'A'); $('#tl-keyB').classList.toggle('active', k === 'B'); S.t = k === 'A' ? 0 : 1; S.playing = false; refreshPlayBtn(); const sh = currentShot(); if (sh && S.lookThrough) { const key = sh.keys[k] || sh.keys.A; vp.focusDist = core.dist(key.position, key.target); } }

function setLookThrough(on) {
  const sh = currentShot(); if (on && !sh) return toast('Select a shot first');
  S.lookThrough = on; vp.lookThrough = on; $('#vt-look').classList.toggle('active', on);
  if (on) { const solved = solvedFor(sh); vp.setShotCamera(solved.pose(S.t), sh.camera); const key = sh.keys[S.editKey] || sh.keys.A; vp.focusDist = core.dist(key.position, key.target); }
  layoutPip(); refreshRight();
}
vp.onDriveEnd = () => {
  const sh = currentShot(); if (!S.lookThrough || !sh) return;
  snapshot();
  const pose = vp.getShotCamPose(); const k = S.editKey;
  if (!sh.keys[k]) sh.keys[k] = { position: pose.position, target: pose.target, roll: 0 };
  sh.keys[k].position = pose.position; sh.keys[k].target = pose.target;
  if (sh.rig.type === 'static' && sh.keys.B) { sh.keys.B.position = sh.keys.A.position.slice(); }
  afterShotEdit(); refreshShotEditor();
  toast(`Key ${k} updated from the camera`);
};

// ------------------------------------------------------------------ viewport interaction --------------------------------
vp.onClick = (e) => {
  const hit = vp.pick(e.clientX, e.clientY);
  if (!hit) { if (!e.shiftKey) selectObject(null); return; }
  if (hit.shotId) { selectShot(hit.shotId, { fly: false }); switchTab('shots'); return; }
  if (hit.objectId) {
    selectObject(hit.objectId);
    const o = getObj(hit.objectId), want = o && o.kind === 'standin' && S.tab !== 'outliner' ? 'beats' : 'outliner';
    if (S.tab !== want) switchTab(want);
    return;
  }
  selectObject(null);
};
vp.onGizmoDrag = (dragging) => { if (dragging) snapshot(); else { invalidate(); updateHelpers(); refreshRight(); refreshShotList(); refreshBeats(); } };
let propsThrottle = 0;
vp.onGizmoChange = (id, group) => {
  const o = getObj(id); if (!o) return;
  const pos = [r3(group.position.x), r3(group.position.y), r3(group.position.z)];
  const rot = [rd(group.rotation.x), rd(group.rotation.y), rd(group.rotation.z)];
  const sc = [r3(group.scale.x), r3(group.scale.y), r3(group.scale.z)];
  const beatId = o.kind === 'standin' ? activeBeatId() : null;
  if (beatId) { const b = ensureBlocking(beatId, o.id); b.position = pos; b.facing = rot[1]; group.rotation.set(0, group.rotation.y, 0); group.scale.set(1, 1, 1); }
  else { o.position = pos; o.rotation = rot; o.scale = sc; if (o.kind === 'standin') { o.rotation = [0, rot[1], 0]; o.scale = [1, 1, 1]; group.rotation.set(0, group.rotation.y, 0); group.scale.set(1, 1, 1); } }
  markDirty();
  const now = performance.now(); if (now - propsThrottle > 120) { propsThrottle = now; refreshProps(); }
};

// ------------------------------------------------------------------ tabs, toolbar, keys ---------------------------------
const STEP_HINTS = {
  outliner: '<b>1 · Set.</b> Build the location. <b>+</b> adds a proxy at its real size; click one here or in the viewport to edit it. <b>W E R</b> move, rotate, scale · <b>F</b> frame · <b>RMB + WASD</b> fly.',
  beats: '<b>2 · Blocking.</b> Pick a beat, then an actor, and put them on their mark: drag in the viewport or type the position, then facing, pose and acting. The floor rings are the marks; a dashed line is the move between beats.',
  shots: '<b>3 · Camera.</b> Pick a shot. Choose lens and rig, then the first and last frame (keys <b>A</b> and <b>B</b>): press <b>L</b> to look through and fly the camera by eye. The score on the right grades the frame.',
  sound: '<b>4 · Sound.</b> Voices, effects and ambience, and where each one sits in its shot. They come from Higgsfield: ask Claude to voice a scene or add a sound. <b>▶</b> previews a take.',
  review: '<b>5 · Review.</b> The whole edit at a glance. <b>Play the edit</b> screens it through the lens in real time with voices; <b>Export MP4</b> renders it on your GPU.',
};
function switchTab(name) {
  S.tab = name;
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== `tab-${name}`));
  $('#step-hint').innerHTML = STEP_HINTS[name] || '';
  // the property panel follows the step that edits it: objects in Set, the actor's mark in Blocking
  const host = name === 'beats' ? $('#blocking-props-host') : $('#tab-outliner');
  if ($('#props').parentElement !== host) host.appendChild($('#props'));
  vp.camerasRoot.visible = name !== 'beats'; // blocking reads cleaner without the camera icons
  if (name === 'beats') refreshCast();
  if (name === 'sound') refreshSound();
  if (name === 'review') refreshReview();
  updateMarks();
}
$$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('#vt-grid').addEventListener('click', () => { vp.setGridVisible(!vp.gridVisible); $('#vt-grid').classList.toggle('active', vp.gridVisible); });
$('#vt-labels').addEventListener('click', () => { vp.setLabelsVisible(!vp.labelsVisible); $('#vt-labels').classList.toggle('active', vp.labelsVisible); });
$('#vt-snap').addEventListener('click', () => { S.snap = !S.snap; vp.setSnap(S.snap); $('#vt-snap').classList.toggle('active', S.snap); });
$('#vt-look').addEventListener('click', () => setLookThrough(!S.lookThrough));
$('#vt-grid').classList.add('active'); $('#vt-labels').classList.add('active');

window.addEventListener('keydown', (e) => {
  if (!$('#export').classList.contains('hidden')) { if (e.code === 'Escape' && !EX.ctrl) closeExport(); return; }
  if (vp.isTyping()) return;
  const k = e.code;
  if ((e.ctrlKey || e.metaKey) && k === 'KeyZ') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'KeyS') { e.preventDefault(); saveJSON(); return; }
  if (vp.look) return; // flying
  if (k === 'KeyW') vp.setGizmoMode('translate');
  else if (k === 'KeyE') vp.setGizmoMode('rotate');
  else if (k === 'KeyR') vp.setGizmoMode('scale');
  else if (k === 'KeyF') { if (S.selectedId) vp.frameObject(S.selectedId); else if (currentShot()) vp.flyTo(currentShot().keys.A.position, currentShot().keys.A.target); }
  else if (k === 'Space') { e.preventDefault(); if (currentShot()) { S.playing = !S.playing; if (S.playing && S.t >= 1) S.t = 0; refreshPlayBtn(); } }
  else if (k === 'BracketLeft') stepShot(-1);
  else if (k === 'BracketRight') stepShot(1);
  else if (k === 'KeyL') setLookThrough(!S.lookThrough);
  else if (k === 'KeyG') $('#vt-grid').click();
  else if (k === 'KeyH') $('#vt-labels').click();
  else if (k === 'KeyM') $('#vt-marks').click();
  else if (k === 'Escape') { if (S.lookThrough) setLookThrough(false); else selectObject(null); }
  else if (k === 'Delete' || k === 'Backspace') { if (S.selectedId) deleteObject(S.selectedId); }
});

// ------------------------------------------------------------------ files / exports -------------------------------------
function downloadBlob(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); }
function download(name, text, mime = 'text/plain') { downloadBlob(name, new Blob([text], { type: mime })); }
const baseName = () => `${(S.scene.project || 'scene').replace(/\W+/g, '_')}_sc${String(S.scene.scene.number ?? 1).padStart(3, '0')}`;
function saveJSON() { if (!S.scene) return; download(`${baseName()}_layout.json`, core.toJSON(S.scene), 'application/json'); S.dirty = false; refreshTitle(); toast('JSON downloaded'); }
$('#btn-save').addEventListener('click', saveJSON);
$('#btn-sheet').addEventListener('click', () => { if (!S.scene) return; const evs = {}; for (const sh of shots()) { try { evs[sh.id] = evaluateAt(sh, 0); } catch (_) {} } download(`${baseName()}_camera_sheet.md`, core.toCameraSheet(S.scene, evs), 'text/markdown'); });
$('#btn-blender').addEventListener('click', () => { if (!S.scene) return; download(`${baseName()}_blender.py`, core.toBlenderScript(S.scene), 'text/x-python'); toast('Run it in Blender: Scripting → Open → Run'); });
$('#btn-open').addEventListener('click', () => $('#file-open').click());
$('#file-open').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => { try { loadScene(JSON.parse(t), f.name); toast(`Loaded ${f.name}`); } catch (err) { toast('Invalid JSON: ' + err.message); } }); e.target.value = ''; });
$('#btn-restore').addEventListener('click', () => { try { const j = JSON.parse(localStorage.getItem('layout_studio:autosave') || 'null'); if (!j) return toast('No autosaved draft'); loadScene(j.scene, j.name, j.base || ''); S.dirty = true; refreshTitle(); toast(`Restored draft of ${j.name} (${new Date(j.when).toLocaleString()})`); } catch (e) { toast('Cannot restore: ' + e.message); } });
$('#scene-picker').addEventListener('change', (e) => loadFromURL(e.target.value));
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (!f) return; if (/\.json$/i.test(f.name)) f.text().then((t) => { try { loadScene(JSON.parse(t), f.name); toast(`Loaded ${f.name}`); } catch (err) { toast('Invalid JSON'); } }); else if (/\.(glb|gltf)$/i.test(f.name)) { const url = URL.createObjectURL(f); const o = addObject('gltf', { name: f.name.replace(/\.(glb|gltf)$/i, ''), url: f.name }); vp.removeObject(o.id); vp.addObjectNode(Object.assign({}, o, { url })); vp.setSelected(o.id); } });
$('#btn-help').addEventListener('click', () => $('#help').classList.remove('hidden'));
$('#help-close').addEventListener('click', () => $('#help').classList.add('hidden'));
$('#help').addEventListener('click', (e) => { if (e.target.id === 'help') $('#help').classList.add('hidden'); });

let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function refreshAll() { refreshTitle(); refreshOutliner(); refreshProps(); refreshShotList(); refreshShotEditor(); refreshBeats(); refreshCast(); refreshSound(); refreshReview(); refreshRight(); layoutPip(); updateHelpers(); updateMarks(); }

// ------------------------------------------------------------------ the edit's sounds -----------------------------------
let liveSounds = null, liveKey = -1, fpsSounds = null;
/** Sounds of the whole edit in plain seconds (live playback, overlay); rebuilt when the scene changes. */
function soundsLive() {
  if (liveKey !== S.version || !liveSounds) { liveKey = S.version; liveSounds = core.editSounds(S.scene || { shots: [] }); sound.setSounds(liveSounds); }
  return liveSounds;
}
/** Sounds of the whole edit on the frame plan of an export (burn-in subtitles). */
function soundsAt(fps) {
  if (!fpsSounds || fpsSounds.key !== S.version || fpsSounds.fps !== fps) fpsSounds = { key: S.version, fps, s: core.editSounds(S.scene, { fps }) };
  return fpsSounds.s;
}
/** Edit time (seconds) of the playhead in the current shot. */
function liveTime(sh) { const p = soundsLive().plan.shots.find((x) => x.shot === sh); return (p ? p.start : 0) + S.t * (sh.duration_s || 0); }

// ------------------------------------------------------------------ main loop -------------------------------------------
let last = performance.now(), evalTimer = 0, marksKey = '';
function tick(now) {
  if (S.exporting) { last = now; requestAnimationFrame(tick); return; } // the export owns the renderer
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  vp.update(dt);
  const sh = currentShot();
  if (sh) {
    if (S.playing) {
      S.t += dt / (sh.duration_s || 5);
      if (S.t >= 1) {
        if (S.seqPlay) { // carry the time past the cut into the next shot, so the edit keeps real time
          const list = shots(); const i = list.findIndex((s) => s.id === sh.id); const over = (S.t - 1) * (sh.duration_s || 5);
          if (i < list.length - 1) { const nx = list[i + 1]; selectShot(nx.id, { fly: false, t: Math.min(0.999, over / (nx.duration_s || 5)) }); S.playing = true; } else { S.seqPlay = false; S.playing = false; S.t = 1; }
          refreshPlayBtn();
        }
        else if (S.loop) S.t -= 1;
        else { S.t = 1; S.playing = false; refreshPlayBtn(); }
      }
    }
    try {
      const solved = solvedFor(sh);
      if (!(S.lookThrough && (vp.driving || vp.look))) vp.setShotCamera(solved.pose(S.t), sh.camera);
      vp.applyBlocking(objects(), blockingAt(sh, S.t));
    } catch (e) { /* keep rendering */ }
    updateTimelineUI();
  }
  const mk = `${S.version}|${activeBeatId()}|${S.tab}|${S.marks}|${S.selectedId}`;
  if (mk !== marksKey) { marksKey = mk; updateMarks(); if (S.tab === 'beats') refreshCast(); }
  vp.render(sh && !S.lookThrough ? pipRect() : null);
  updateOverlay(sh);
  if (sh) sound.update(liveTime(sh), S.playing); else sound.update(0, false);
  if (sh && now - evalTimer > 250 && !(S.seqPlay && S.playing)) { evalTimer = now; refreshRight(); drawGuides(); } // no shot check during a screening
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ------------------------------------------------------------------ offline render API (used by tools/render_mp4.mjs) ----
function sequenceInfo() {
  let t0 = 0;
  return shots().map((sh) => { const o = { id: sh.id, name: sh.name, duration_s: sh.duration_s || 0, start_s: t0, size: sh.size, rig: (sh.rig && sh.rig.type) || 'static', focal_mm: sh.camera.focal_mm, aspect: sh.camera.aspect || 2.39 }; t0 += sh.duration_s || 0; return o; });
}
function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
function burnIn(canvas, sh, t, fps = 24) {
  const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height, u = H / 804;
  const pad = Math.round(12 * u), mono = '"DM Mono", Menlo, "DejaVu Sans Mono", monospace', sans = '"Helvetica Neue", Arial, "DejaVu Sans", sans-serif';
  const info = sequenceInfo().find((x) => x.id === sh.id); const tt = (info ? info.start_s : 0) + t * (sh.duration_s || 0);
  const ff = Math.floor((tt % 1) * fps + 1e-6);
  const tc = `${String(Math.floor(tt / 60)).padStart(2, '0')}:${String(Math.floor(tt % 60)).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
  const panel = (lines, x, y, size, o = {}) => {
    ctx.font = `${o.weight || 500} ${size}px ${o.font || mono}`;
    const lh = Math.round(size * 1.28), widths = lines.map((l) => ctx.measureText(l).width);
    const w = Math.max(...widths) + pad * 2, h = lh * lines.length + Math.round(pad * 0.9);
    const bx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x, by = o.anchor === 'bottom' ? y - h : y;
    ctx.fillStyle = o.bg || 'rgba(0,0,0,0.74)'; ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = o.color || '#fff'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, o.align === 'center' ? bx + (w - widths[i]) / 2 : bx + pad, by + Math.round(pad * 0.45) + i * lh));
    return { y: by, h };
  };
  const head = panel([`${S.scene.project || ''} · Sc.${S.scene.scene.number ?? ''} · ${sh.name} · ${sh.size || ''} · ${sh.camera.focal_mm}mm · ${(sh.rig && sh.rig.type) || 'static'} · ${sh.duration_s}s`], pad, pad, Math.round(24 * u));
  panel([tc], W - pad, pad, Math.round(24 * u), { align: 'right' });
  if (sh.intent) {
    const size = Math.round(26 * u); ctx.font = `400 ${size}px ${sans}`;
    let lines = wrapText(ctx, sh.intent, W * 0.66);
    if (lines.length > 2) { lines = lines.slice(0, 2); lines[1] = lines[1].replace(/\s*\S*$/, '') + ' …'; }
    panel(lines, pad, head.y + head.h + Math.round(6 * u), size, { font: sans, weight: 400, color: '#f3e7c8' });
  }
  const es = soundsAt(fps), pl = es.plan.shots.find((x) => x.shot === sh); const d = pl ? core.subtitleAt(es.dialogue, pl.at(t * (sh.duration_s || 0))) : null;
  if (d) {
    const size = Math.round(36 * u); ctx.font = `600 ${size}px ${sans}`;
    const lines = wrapText(ctx, `${d.who ? d.who + ':  ' : ''}${d.line}`, W * 0.78).slice(0, 2);
    panel(lines, W / 2, H - Math.round(18 * u), size, { font: sans, weight: 600, align: 'center', anchor: 'bottom', bg: 'rgba(0,0,0,0.78)' });
  }
}
/** Render one frame of a shot at time t (0..1) at an exact size into a canvas, burn-in included unless opts.burnIn === false. */
function renderFrameCanvas(sh, t, w = 1920, h = 804, opts = {}) {
  const pose = solvedFor(sh).pose(t);
  vp.applyBlocking(objects(), blockingAt(sh, t));
  const canvas = vp.renderStill(pose, sh.camera, w, h, opts.ss || 1, { keep: opts.keep, canvas: opts.canvas });
  if (opts.burnIn !== false) burnIn(canvas, sh, t, opts.fps || 24);
  return canvas;
}
/** Render one frame of a shot at time t (0..1) at an exact size; returns a data URL. */
function renderFrame(shotId, t, w = 1920, h = 804, opts = {}) {
  const sh = shots().find((s) => s.id === shotId); if (!sh) throw new Error('unknown shot ' + shotId);
  return renderFrameCanvas(sh, t, w, h, opts).toDataURL(opts.format || 'image/jpeg', opts.quality ?? 0.92);
}

// ------------------------------------------------------------------ Export MP4: render on this GPU, encode in the browser ---
/** Same frame timing as tools/render_mp4.mjs: each shot gets round(duration × fps) frames, first and last on keys A and B. */
function framePlan(list, fps) {
  const frames = [];
  for (const sh of list) { const n = Math.max(1, Math.round((sh.duration_s || 0) * fps)); for (let i = 0; i < n; i++) frames.push({ sh, t: n > 1 ? i / (n - 1) : 0 }); }
  return frames;
}
const evenHeight = (w, aspect) => 2 * Math.round(w / aspect / 2);
/** Render the edit (or some shots) frame by frame and encode it. Returns { blob, codec, codecName, frames, seconds, width, height }. */
async function exportSequence({ shotIds = null, width = 1920, height = 0, fps = 24, ss = 1.5, burnIn: burn = true, audio = true, maxFrames = 0, signal, onProgress } = {}) {
  const list = shotIds ? shots().filter((s) => shotIds.includes(s.id) || shotIds.includes(s.name)) : shots();
  if (!list.length) throw new Error('No shots to export');
  let frames = framePlan(list, fps); if (maxFrames) frames = frames.slice(0, maxFrames);
  height = height || evenHeight(width, list[0].camera.aspect || 2.39);
  const canvas = document.createElement('canvas');
  // sound: the lines, effects and ambience of these shots, placed on the frame plan and mixed into one track
  const mix = audio ? await mixEdit(core.editSounds(S.scene, { fps, shotIds: list.map((x) => x.id) }), frames.length / fps, S.sceneBase || '') : null;
  S.exporting = true; S.playing = false; S.seqPlay = false; refreshPlayBtn();
  try {
    const res = await encodeMP4({
      width, height, fps, frames: frames.length, signal, audio: mix ? mix.buffer : null,
      renderFrame: (i) => renderFrameCanvas(frames[i].sh, frames[i].t, width, height, { ss, fps, burnIn: burn, keep: true, canvas }),
      onProgress: onProgress && ((p) => onProgress(Object.assign(p, { shot: frames[p.done - 1].sh, canvas }))),
    });
    return Object.assign(res, { width, height, voicedLines: mix ? mix.lines : 0, sounds: mix ? mix.placed : 0 });
  } finally { vp.endStills(); S.exporting = false; }
}
/** Batch renders from tools/render_mp4.mjs: pause the live viewport (it would compete for the GPU) and keep the still size. */
function holdViewport(on) { S.exporting = !!on; if (!on) vp.endStills(); }
window.LS.api = { sequence: sequenceInfo, renderFrame, exportMP4: exportSequence, hold: holdViewport, load: (json, name) => loadScene(json, name),
  frameCanvas: (shotId, t, w, h, opts = {}) => { const sh = shots().find((s) => s.id === shotId || s.name === shotId); if (!sh) throw new Error('unknown shot ' + shotId); return renderFrameCanvas(sh, t, w, h, opts); } };

const EX = { ctrl: null, probe: 0 };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function exportOptions() {
  const sh = currentShot(); const list = $('#ex-range').value === 'shot' && sh ? [sh] : shots();
  const fps = +$('#ex-fps').value, width = +$('#ex-size').value, ss = +$('#ex-ss').value;
  const height = list.length ? evenHeight(width, list[0].camera.aspect || 2.39) : 0;
  const frames = list.reduce((a, x) => a + Math.max(1, Math.round((x.duration_s || 0) * fps)), 0);
  const voiced = list.reduce((a, x) => a + (x.dialogue || []).filter((d) => d.audio).length, 0);
  const effects = list.reduce((a, x) => a + (x.sfx || []).filter((e) => e.file).length, 0), beds = ((S.scene.sound || {}).ambience || []).filter((b) => b.file).length;
  return { list, fps, width, height, ss, burn: $('#ex-burn').checked, audio: $('#ex-audio').checked, voiced, effects, beds, frames };
}
function refreshExportDialog() {
  const o = exportOptions(), running = !!EX.ctrl;
  $('#ex-range option[value="shot"]').disabled = !currentShot();
  const ss = Math.max(1, Math.min(o.ss, 6144 / o.width)); // same cap as Viewport.renderStill
  $('#ex-summary').textContent = `${o.list.length} shot${o.list.length === 1 ? '' : 's'} · ${o.frames} frames · ${clock(o.frames / o.fps)} · ${o.width}×${o.height} px` + (ss > 1 ? ` · rendered at ${Math.round(o.width * ss)}×${Math.round(o.height * ss)} and filtered down` : '') + (o.audio && (o.voiced || o.effects || o.beds) ? ` · sound: ${o.voiced} voiced line${o.voiced === 1 ? '' : 's'}${o.effects ? `, ${o.effects} effects` : ''}${o.beds ? ', ambience' : ''}` : '');
  for (const el of $$('#export select, #export input')) el.disabled = running;
  $('#ex-start').disabled = running || !o.frames || !canEncode();
  $('#ex-close').textContent = running ? 'Cancel' : 'Close';
}
function probeEncoder() {
  const o = exportOptions(), id = ++EX.probe;
  if (!canEncode()) { $('#ex-codec').textContent = 'This browser cannot encode video (no WebCodecs). Use a recent Chrome, Edge, Safari or Firefox.'; return; }
  $('#ex-codec').textContent = 'Checking the video encoder…';
  pickCodec(o.width, o.height, o.fps).then((p) => { if (id !== EX.probe) return; $('#ex-codec').textContent = p ? `Encoder: ${codecName(p.config.codec)} (${p.config.codec}), on this computer.` : 'No encoder for this size in this browser: pick a smaller size.'; });
}
function openExport() {
  if (!S.scene || !shots().length) return toast('No shots to export');
  if (S.playing) { S.playing = false; S.seqPlay = false; refreshPlayBtn(); }
  $('#export').classList.remove('hidden'); $('#ex-progress').classList.add('hidden'); $('#ex-status').textContent = '';
  refreshExportDialog(); probeEncoder();
}
function closeExport() { if (EX.ctrl) EX.ctrl.abort(); else $('#export').classList.add('hidden'); }
async function startExport() {
  const o = exportOptions(); if (!o.frames || EX.ctrl) return;
  EX.ctrl = new AbortController(); refreshExportDialog();
  $('#ex-progress').classList.remove('hidden'); $('#ex-bar').style.width = '0%'; $('#ex-status').textContent = 'Starting…';
  const pv = $('#ex-preview'); pv.height = Math.round(pv.width * o.height / o.width); pv.getContext('2d').clearRect(0, 0, pv.width, pv.height);
  const name = `${baseName()}${o.list.length === 1 ? '_' + (o.list[0].name || o.list[0].id) : ''}_previs_${o.width}.mp4`;
  try {
    const res = await exportSequence({
      shotIds: o.list.map((x) => x.id), width: o.width, height: o.height, fps: o.fps, ss: o.ss, burnIn: o.burn, audio: o.audio, signal: EX.ctrl.signal,
      onProgress: ({ done, total, elapsed, shot, canvas }) => {
        const rate = done / Math.max(1e-3, elapsed);
        if (done % 4 === 1 || done === total) { const pv = $('#ex-preview'); pv.getContext('2d').drawImage(canvas, 0, 0, pv.width, pv.height); }
        $('#ex-bar').style.width = `${(100 * done / total).toFixed(1)}%`;
        $('#ex-status').textContent = `Frame ${done} / ${total} · shot ${shot.name || shot.id} · ${rate.toFixed(0)} fps · about ${clock((total - done) / rate)} left`;
      },
    });
    downloadBlob(name, res.blob);
    $('#ex-status').textContent = `Done in ${clock(res.seconds)} (${(res.frames / res.seconds).toFixed(0)} fps) · ${(res.blob.size / 1e6).toFixed(1)} MB · ${res.codecName}${res.audioCodec ? ` + ${res.audioCodec.toUpperCase()} sound (${res.sounds} clips)` : o.audio && (o.voiced || o.effects || o.beds) ? ' · no audio encoder in this browser, video only' : ''} · saved as ${name}`;
  } catch (e) {
    $('#ex-status').textContent = e && e.name === 'AbortError' ? 'Cancelled.' : `Export failed: ${(e && e.message) || e}`;
  } finally { EX.ctrl = null; refreshExportDialog(); }
}
$('#btn-export').addEventListener('click', openExport);
$('#ex-start').addEventListener('click', startExport);
$('#ex-close').addEventListener('click', closeExport);
$('#export').addEventListener('click', (e) => { if (e.target.id === 'export' && !EX.ctrl) closeExport(); });
for (const id of ['#ex-range', '#ex-ss', '#ex-burn', '#ex-audio']) $(id).addEventListener('change', refreshExportDialog);
for (const id of ['#ex-size', '#ex-fps']) $(id).addEventListener('change', () => { refreshExportDialog(); probeEncoder(); });

// ------------------------------------------------------------------ look-through overlay: shot label + subtitles, live ---
let overlayKey = '';
function updateOverlay(sh) {
  const ov = $('#lt-overlay');
  if (!S.lookThrough || !sh) { if (overlayKey) { ov.classList.add('hidden'); overlayKey = ''; } return; }
  const g = vp.gateRect(sh.camera.aspect || 2.39); if (!g) return;
  const d = core.subtitleAt(soundsLive().dialogue, liveTime(sh));
  const key = `${g.left},${g.top},${g.width},${g.height}|${sh.id}|${S.compGrid}|${d ? `${d.who}|${d.line}|${d.index}` : ''}`;
  if (key === overlayKey) return;
  overlayKey = key;
  ov.classList.remove('hidden');
  Object.assign(ov.style, { left: `${g.left}px`, top: `${g.top}px`, width: `${g.width}px`, height: `${g.height}px`, fontSize: `${Math.max(12, Math.round(g.height * 0.042))}px` });
  $('#lt-label').textContent = `${sh.name || sh.id} · ${sh.size || ''} · ${sh.camera.focal_mm}mm · ${(sh.rig && sh.rig.type) || 'static'}`;
  const sub = $('#lt-sub'); sub.textContent = d ? `${d.who ? d.who + ':  ' : ''}${d.line}` : ''; sub.classList.toggle('hidden', !d);
  const svg = $('#lt-grid'); const W = 1000, Hh = Math.round(1000 / (sh.camera.aspect || 2.39));
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = S.playing ? '' : `<g stroke="rgba(255,236,150,0.55)" stroke-width="1.6" fill="none">${gridLinesSVG(W, Hh)}</g>`;
}
/** Lines of the chosen composition grid (thirds, phi, quarters, centre) as SVG, in a W × H box. */
function gridLinesSVG(W, Hh) {
  const lines = S.compGrid === 'off' ? [] : ((core.GRIDS[S.compGrid] || core.GRIDS.thirds).lines.concat(S.compGrid === 'quarters' ? [0.5] : []));
  return lines.map((f) => `<line x1="${f * W}" y1="0" x2="${f * W}" y2="${Hh}"/><line x1="0" y1="${f * Hh}" x2="${W}" y2="${f * Hh}"/>`).join('');
}
const GRID_CYCLE = ['thirds', 'phi', 'quarters', 'center', 'off'];
function setCompGrid(id) {
  S.compGrid = id; $('#vt-comp').textContent = id === 'off' ? 'no grid' : id === 'center' ? 'centre' : id;
  $('#vt-comp').classList.toggle('active', id !== 'off'); overlayKey = ''; drawGuides(); updateOverlay(currentShot());
}

// ------------------------------------------------------------------ step 2: actors list + floor marks ------------------
function refreshCast() {
  const box = $('#castlist'); if (!box) return;
  const b = getBeat(activeBeatId());
  if (!standins().length) { box.innerHTML = '<div class="empty">No actors yet: add a stand-in in step 1.</div>'; return; }
  box.innerHTML = standins().map((o) => {
    const bl = b && b.blocking ? b.blocking[o.id] : null, off = bl && bl.visible === false;
    const where = bl && bl.position ? `${core.poseKey(bl.pose || o.pose)} · ${bl.position.map((v) => v.toFixed(1)).join(', ')} · ${Math.round(bl.facing ?? 0)}°` : 'no mark in this beat';
    return `<div class="row ${o.id === S.selectedId ? 'selected' : ''}" data-id="${esc(o.id)}" data-tip="${esc(o.name)}|Click to select, then drag in the viewport or edit the mark below. ${off ? 'Off stage in this beat.' : ''}"><span class="dot" style="background:${esc(o.color || '#ccc')}"></span><span class="name">${esc(o.name)}</span><span class="tag">${esc(off ? 'off stage' : where)}</span></div>`;
  }).join('');
}
$('#castlist').addEventListener('click', (e) => { const row = e.target.closest('.row'); if (row) selectObject(row.dataset.id); refreshCast(); });
/** Tape marks for the stand-ins: every beat's spot, the active beat bold. Shown in Blocking and Camera (toggle: marks / M). */
function updateMarks() {
  const on = S.scene && S.marks !== false && (S.tab === 'beats' || S.tab === 'shots');
  if (!on) return vp.setMarks([]);
  const cur = activeBeatId();
  vp.setMarks(standins().map((o) => ({
    color: o.color || '#f2c14e', name: (o.name || o.id).replace(/\s*\(.*\)$/, ''),
    marks: beats().map((b) => ({ b, bl: (b.blocking || {})[o.id] })).filter((x) => x.bl && x.bl.position && x.bl.visible !== false)
      .map((x) => ({ position: x.bl.position, facing: x.bl.facing ?? 0, beat: x.b.id, current: x.b.id === cur }))
      .filter((m, i, arr) => m.current || !arr.some((n, j) => j < i && core.dist(n.position, m.position) < 0.05)), // one ring per spot
  })));
}
S.marks = true; $('#vt-marks').classList.add('active');
$('#vt-marks').addEventListener('click', () => { S.marks = !S.marks; $('#vt-marks').classList.toggle('active', S.marks); updateMarks(); });
$('#vt-comp').addEventListener('click', () => setCompGrid(GRID_CYCLE[(GRID_CYCLE.indexOf(S.compGrid) + 1) % GRID_CYCLE.length]));
$('#vt-comp').classList.add('active');

// ------------------------------------------------------------------ step 4: sound -----------------------------------------
function refreshSound() {
  const box = $('#sound-panel'); if (!box || !S.scene) return;
  const list = shots().filter((sh) => (sh.dialogue || []).length || (sh.sfx || []).length);
  const all = shots().flatMap((sh) => sh.dialogue || []), voiced = all.filter((d) => d.audio).length;
  const nFx = shots().reduce((a, sh) => a + (sh.sfx || []).length, 0), beds = (S.scene.sound && S.scene.sound.ambience) || [];
  const cast = S.scene.cast || {};
  const whoColor = (who) => { const o = standins().find((x) => (x.name || '').toUpperCase().startsWith(String(who).toUpperCase())); return (o && o.color) || '#aab3bf'; };
  const playBtn = (file, tip) => `<button class="small" ${file ? `data-play="${esc(file)}" data-tip="${esc(tip)}"` : 'disabled data-tip="No recording|Timing estimated from the text."'}>▶</button>`;
  let html = `<h4 data-tip="Voices|One voice per character for the whole scene. Takes live next to the scene file (audio/<scene>/) with voices.json, which says which take belongs to which line.">Voices</h4>`;
  const whos = [...new Set(all.map((d) => d.who))];
  html += whos.length ? `<table class="kv">${whos.map((w) => `<tr><td><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(whoColor(w))}"></span> ${esc(w)}</td><td>${cast[w] ? `${esc(cast[w].voice || cast[w].voice_id)} <span class="mini">Higgsfield · ElevenLabs</span>` : '<span class="mini">no voice yet</span>'}</td></tr>`).join('')}</table>` : '<div class="empty">No dialogue in this scene.</div>';
  html += `<h4 data-tip="Ambience|Beds of room tone under the edit, looped and faded, from one shot to another. Generated with Higgsfield (Mirelo); sounds.json lists them.">Ambience</h4>`;
  html += beds.length ? `<table class="kv">${beds.map((b) => `<tr><td>${playBtn(b.file, 'Play|Hear the bed.')} ${esc(b.name || b.file)}</td><td class="mini">${esc(b.from || 'start')} → ${esc(b.to || 'end')} · level ${Math.round((b.gain ?? 0.5) * 100)}%</td></tr>`).join('')}</table>` : '<div class="note">No ambience yet.</div>';
  html += `<div class="note">${voiced} of ${all.length} lines voiced · ${nFx} effects. To voice lines or add sounds, ask Claude in the chat (for example “a dog barking far away in 1D”): it generates them with Higgsfield and they appear here.</div>`;
  for (const sh of list) {
    const D = sh.duration_s || 0, tl = core.dialogueTimeline(sh), fx = sh.sfx || [];
    const lo = Math.min(0, ...tl.map((l) => l.start), ...fx.map((e) => e.at || 0)), hi = Math.max(D, ...tl.map((l) => l.end), ...fx.map((e) => (e.at || 0) + (e.dur_s || 0)));
    const X = (t) => (100 * (t - lo) / Math.max(1e-6, hi - lo)).toFixed(1);
    html += `<div class="dl-shot"><span class="name" data-shot="${esc(sh.id)}" data-tip="${esc(sh.name)}|Open this shot in step 3.">${esc(sh.name)}</span><span class="mini">${esc(sh.size || '')} · ${D}s</span></div>`;
    html += `<div class="dl-bar" data-tip="Timing|The shot is the lit band; lines (colour of the speaker) and effects (grey) may start before the cut or run past it.">`
      + `<i style="left:${X(0)}%;width:${(X(D) - X(0)).toFixed(1)}%;background:#2a3038;top:0;bottom:0;opacity:1"></i>`
      + fx.map((e) => `<i style="left:${X(e.at || 0)}%;width:${Math.max(0.6, X((e.at || 0) + (e.dur_s || 0.3)) - X(e.at || 0)).toFixed(1)}%;background:#8a929d;top:5px;bottom:0"></i>`).join('')
      + tl.map((l) => `<i style="left:${X(l.start)}%;width:${(X(l.end) - X(l.start)).toFixed(1)}%;background:${esc(whoColor(l.who))};bottom:3px"></i>`).join('') + '</div>';
    for (const l of tl) {
      const cut = l.start < 0 ? ' <span class="badge" data-tip="J-cut|The line starts over the previous shot and the cut lands inside it.">starts before the cut</span>' : l.end > D + 1e-6 ? ` <span class="badge" ${l.lap ? 'data-tip="L-cut|The line carries over the next shot: we watch the listener."' : 'style="background:var(--warn);color:#111"'}>${l.lap ? 'runs into the next shot' : 'past the cut'}</span>` : '';
      html += `<div class="dl-line">${playBtn(l.audio, 'Play|Hear this take.')}<span><span class="who" style="color:${esc(whoColor(l.who))}">${esc(l.who)}</span> ${esc(l.line)}${cut}</span><span class="t">${l.start.toFixed(1)}–${l.end.toFixed(1)}s${l.audio ? '' : ' · est.'}</span></div>`;
    }
    for (const e of fx) html += `<div class="dl-line">${playBtn(e.file, 'Play|Hear this effect.')}<span class="mini">effect · ${esc(e.name || e.file)}${(e.gain ?? 1) < 1 ? ` · ${Math.round((e.gain ?? 1) * 100)}%` : ''}</span><span class="t">${(e.at || 0).toFixed(1)}s</span></div>`;
  }
  box.innerHTML = html;
}
$('#sound-panel').addEventListener('click', (e) => {
  const play = e.target.closest('[data-play]'); if (play) { sound.unlock(); sound.preview(play.dataset.play); return; }
  const shot = e.target.closest('[data-shot]'); if (shot) { selectShot(shot.dataset.shot, { fly: false }); switchTab('shots'); }
});

// ------------------------------------------------------------------ step 5: review ----------------------------------------
function refreshReview() {
  const box = $('#review-list'); if (!box || !S.scene) return;
  const list = shots(); let total = 0, sum = 0, n = 0, low = 0;
  box.innerHTML = list.map((sh) => {
    let score = null; try { score = scoreFor(sh); } catch (e) { score = null; }
    total += sh.duration_s || 0; if (score != null) { sum += score; n++; if (score < 85) low++; }
    const cls = score == null ? '' : score >= 85 ? 'ok' : score >= 65 ? 'warn' : 'bad';
    const lines = (sh.dialogue || []).length, voicedN = (sh.dialogue || []).filter((d) => d.audio).length;
    return `<div class="row ${sh.id === S.shotId ? 'selected' : ''}" data-id="${esc(sh.id)}" data-tip="${esc(sh.name)} · ${esc(sh.size || '')}|${esc(sh.intent || 'No action text.')}"><span class="score ${cls}">${score ?? '–'}</span><span class="name"><b>${esc(sh.name)}</b> <span class="tag">${esc(sh.size || '')} · ${esc(sh.camera.focal_mm)}mm · ${esc((sh.rig && sh.rig.type) || 'static')}</span></span><span class="tag">${lines ? `♪${voicedN}/${lines} · ` : ''}${sh.duration_s}s</span></div>`;
  }).join('') || '<div class="empty">No shots yet.</div>';
  let dpS = '–', edS = '–';
  try { dpS = core.dpReport(S.scene).score; } catch (e) { /* no subjects */ }
  try { edS = core.editReview(S.scene).score; } catch (e) { /* empty edit */ }
  $('#review-summary').innerHTML = list.length ? `<b>${list.length} shots · ${clock(total)}</b> · shot check ${n ? Math.round(sum / n) : '–'} · DP ${dpS} · edit ${edS}${low ? ` · <span style="color:var(--warn)">${low} to review</span>` : ' · all clean'}. Click a shot to look through it.` : '';
}
$('#review-list').addEventListener('click', (e) => { const row = e.target.closest('.row'); if (!row) return; selectShot(row.dataset.id, { fly: false }); if (!S.lookThrough) setLookThrough(true); refreshReview(); });
$('#btn-screen').addEventListener('click', () => { if (S.seqPlay) $('#tl-playall').click(); $('#tl-playall').click(); });
$('#btn-review-export').addEventListener('click', openExport);
$('#btn-review-sheet').addEventListener('click', () => $('#btn-sheet').click());
$('#btn-review-blender').addEventListener('click', () => $('#btn-blender').click());
$('#btn-review-dp').addEventListener('click', () => { if (!S.scene) return; const rep = core.dpReport(S.scene); download(`${baseName()}_dp_report.md`, core.dpReportMarkdown(S.scene, rep), 'text/markdown'); });
$('#btn-review-edit').addEventListener('click', () => { if (!S.scene) return; const rep = core.editReview(S.scene); download(`${baseName()}_edit_report.md`, core.editReviewMarkdown(S.scene, rep), 'text/markdown'); });

// ------------------------------------------------------------------ boot ------------------------------------------------
const initial = QUERY.get('scene') || 'scenes/demo/street_corner.json';
const picker = $('#scene-picker'); if (![...picker.options].some((o) => o.value === initial)) { const o = document.createElement('option'); o.value = initial; o.textContent = initial; picker.appendChild(o); } picker.value = initial;
switchTab(S.tab || 'outliner');
loadFromURL(initial);
