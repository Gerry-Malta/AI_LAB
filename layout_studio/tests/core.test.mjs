import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../core/index.js';

test('lens: FOV matches known values', () => {
  const f = core.fovFor({ filmback: 'ALEXA35_OG', focal_mm: 32, aspect: 2.39 });
  assert.ok(Math.abs(f.hfov - 47.2) < 0.2, `hfov ${f.hfov}`);
  const ana = core.fovFor({ filmback: 'ALEXA35_OG', focal_mm: 40, aspect: 2.39, squeeze: 2 });
  assert.ok(Math.abs(ana.hfov - 59.7) < 0.2, `ana hfov ${ana.hfov}`);
  const ff = core.fovFor({ filmback: 'FF_STILLS', focal_mm: 50, aspect: 1.5 });
  assert.ok(Math.abs(ff.dfov - 46.8) < 0.2, `dfov ${ff.dfov}`);
});

test('lens: depth of field is sane', () => {
  const d = core.dof({ focal_mm: 50, fstop: 2, focus_m: 3 }, 'ALEXA35_OG');
  assert.ok(d.near_m < 3 && d.far_m > 3 && d.total_m < 0.5);
});

test('motion: curves are monotonic with fixed endpoints', () => {
  for (const id of core.CURVE_IDS) {
    let prev = -1;
    for (let i = 0; i <= 100; i++) { const s = core.ease(id, i / 100); assert.ok(s >= prev - 1e-9, `${id} not monotonic`); prev = s; }
    assert.equal(core.ease(id, 0), 0); assert.ok(Math.abs(core.ease(id, 1) - 1) < 1e-9);
  }
});

test('rigs: sticks cannot translate, dolly flags excessive speed, crane reach', () => {
  const st = core.solveRig({ rig: { type: 'static' }, keys: { A: { position: [0, 1.5, 5], target: [0, 1, 0] }, B: { position: [3, 1.5, 5], target: [2, 1, 0] } }, duration_s: 4 });
  assert.deepEqual(st.pose(1).position, [0, 1.5, 5]);
  assert.ok(st.warnings.some((w) => /constrained/.test(w)));
  const dolly = core.solveRig({ rig: { type: 'dolly' }, keys: { A: { position: [0, 1.2, 10], target: [0, 1, 0] }, B: { position: [0, 1.2, 2], target: [0, 1, 0] } }, duration_s: 2, curve: 'linear' });
  assert.ok(dolly.warnings.some((w) => /speed/.test(w)));
  assert.ok(Math.abs(dolly.info.pathLength - 8) < 0.01);
  const crane = core.solveRig({ rig: { type: 'crane', arm: 3 }, keys: { A: { position: [0, 8, 10], target: [0, 1, 0] }, B: { position: [0, 1.5, 4], target: [0, 1, 0] } }, duration_s: 8 });
  assert.ok(crane.warnings.some((w) => /reach/.test(w)));
});

test('rigs: handheld noise is deterministic and bounded', () => {
  const mk = () => core.solveRig({ rig: { type: 'handheld', seed: 9 }, keys: { A: { position: [0, 1.5, 3], target: [0, 1.4, 0] } }, duration_s: 6 });
  const a = mk().pose(0.37), b = mk().pose(0.37);
  assert.deepEqual(a, b);
  assert.ok(core.dist(a.position, [0, 1.5, 3]) < 0.08);
});

test('framing: solver output is measured back as the requested size', () => {
  const subject = { position: [1, 0, -2], facing: 120, pose: 'stand', height: 1.8 };
  const scene = { objects: [{ id: 'C', kind: 'standin', name: 'C', position: subject.position, rotation: [0, 120, 0], pose: 'stand', height: 1.8 }] };
  for (const size of ['FS', 'MLS', 'MS', 'MCU', 'CU', 'BCU']) {
    for (const focal of [25, 40, 65]) {
      const r = core.solveFraming({ subject, size, lens: { focal_mm: focal }, azimuth: 30, elevation: 0 });
      const shot = { size, subject: 'C', camera: { focal_mm: focal, filmback: 'ALEXA35_OG', aspect: 2.39 } };
      const m = core.evaluateFrame(scene, shot, { position: r.position, target: r.target, roll: 0 }, {});
      assert.equal(m.size.measured, size, `${size} @ ${focal}mm read as ${m.size.measured}`);
      assert.ok(m.headroom.ok, `${size} headroom ${JSON.stringify(m.headroom)}`);
      assert.ok(!m.flags.some((f) => f.level === 'bad'), `${size}: ${JSON.stringify(m.flags)}`);
    }
  }
});

test('framing: prone and seated poses frame too', () => {
  for (const pose of ['lie_prone', 'sit_ground', 'crouch', 'kneel', 'sit_chair']) {
    const subject = { position: [0, 0, 0], facing: 0, pose, height: 1.6 };
    const scene = { objects: [{ id: 'C', kind: 'standin', name: 'C', position: [0, 0, 0], rotation: [0, 0, 0], pose, height: 1.6 }] };
    const r = core.solveFraming({ subject, size: 'MS', lens: { focal_mm: 40 }, azimuth: 20, elevation: 5 });
    const m = core.evaluateFrame(scene, { size: 'MS', subject: 'C', camera: { focal_mm: 40 } }, { position: r.position, target: r.target, roll: 0 }, {});
    assert.ok(['MS', 'MCU', 'MLS'].includes(m.size.measured), `${pose}: ${m.size.measured}`);
  }
});

test('framing: two-shot keeps both subjects in frame on the chosen side of the line', () => {
  const a = { position: [-0.6, 0, 0], facing: 20, pose: 'sit_ground', height: 1.7 };
  const b = { position: [0.6, 0, 0], facing: 340, pose: 'sit_ground', height: 1.8 };
  const r = core.solveTwoShot({ a, b, size: 'MS', lens: { focal_mm: 40 }, side: 1, cameraHeight: 1.0 });
  assert.ok(r.position[2] > 0, 'camera on +Z side');
  const basis = core.cameraBasis(r.position, r.target, 0);
  const { vfov } = core.fovFor({ focal_mm: 40, filmback: 'ALEXA35_OG', aspect: 2.39 });
  for (const s of [a, b]) { const kp = core.keypoints(s); for (const k of ['headTop', 'hips']) assert.ok(core.projectPoint(kp[k], r.position, basis, vfov, 2.39).inFrame, `${k} in frame`); }
  const r2 = core.solveTwoShot({ a, b, size: 'MS', lens: { focal_mm: 40 }, side: -1, cameraHeight: 1.0 });
  assert.ok(r2.position[2] < 0, 'camera on -Z side');
});

test('framing: OTS puts the background subject on the far third with lead room', () => {
  const fg = { position: [0.6, 0, 0], facing: 270, pose: 'sit_ground', height: 1.8 };
  const bg = { position: [-0.6, 0, 0], facing: 90, pose: 'sit_ground', height: 1.7 };
  const scene = { objects: [{ id: 'FG', kind: 'standin', name: 'FG', position: fg.position, rotation: [0, 270, 0], pose: 'sit_ground', height: 1.8 }, { id: 'BG', kind: 'standin', name: 'BG', position: bg.position, rotation: [0, 90, 0], pose: 'sit_ground', height: 1.7 }] };
  const r = core.solveOTS({ fg, bg, side: 1, fitSize: 'MCU' });
  const m = core.evaluateFrame(scene, { size: 'MCU', subject: 'BG', camera: { focal_mm: r.focal_mm }, allowOcclusion: true }, { position: r.position, target: r.target, roll: 0 }, {});
  assert.ok(m.thirds.eyesX < 0.45, `bg subject on the far (left) third, got ${JSON.stringify(m.thirds)}`);
  assert.ok(m.leadRoom.front >= m.leadRoom.behind - 0.01, `lead room ${JSON.stringify(m.leadRoom)}`);
  assert.ok(!m.flags.some((f) => f.level === 'bad'), JSON.stringify(m.flags));
  assert.ok(['MCU', 'MS', 'CU'].includes(m.size.measured));
});

test('metrics: occlusion and depth layers are detected', () => {
  const scene = { objects: [
    { id: 'C', kind: 'standin', name: 'C', position: [0, 0, 0], rotation: [0, 0, 0], pose: 'stand', height: 1.8 },
    { id: 'WALL', kind: 'box', name: 'Wall', position: [0, 0, 2], size: [3, 2.5, 0.2] },
    { id: 'TREE', kind: 'tree', name: 'Tree', position: [1, 0, -8], size: [4, 10, 0.4] },
  ] };
  const shot = { size: 'MS', subject: 'C', camera: { focal_mm: 35 } };
  const m = core.evaluateFrame(scene, shot, { position: [0, 1.4, 5], target: [0, 1.2, 0], roll: 0 }, {});
  assert.ok(m.occlusion.occluded && m.occlusion.by.includes('Wall'));
  assert.ok(m.depth.fg.includes('Wall') && m.depth.bg.includes('Tree'));
});

test('metrics: 180 degree line crossing is reported', () => {
  const scene = { objects: [{ id: 'A', kind: 'standin', position: [-1, 0, 0] }, { id: 'B', kind: 'standin', position: [1, 0, 0] }] };
  const shots = [{ id: 's1', beat: 'b1', line: ['A', 'B'] }, { id: 's2', beat: 'b1', line: ['A', 'B'] }];
  const issues = core.checkLine(scene, shots, [{ position: [0, 1, 3] }, { position: [0, 1, -3] }], [{}, {}]);
  assert.equal(issues.length, 1);
  assert.equal(core.checkLine(scene, shots, [{ position: [0, 1, 3] }, { position: [2, 1, 3] }], [{}, {}]).length, 0);
});

test('schema + exporters: normalize, validate, Blender script and camera sheet', () => {
  const raw = { project: 'T', objects: [{ id: 'C', kind: 'standin', name: 'C', position: [0, 0, 0], height: 1.8, color: '#c33' }, { id: 'P', kind: 'box', position: [1, 0, -1], size: [0.5, 0.5, 0.5], rotation: [0, 30, 0] }], beats: [{ id: 'b1', blocking: { C: { position: [0, 0, 0], facing: 45, pose: 'sit_ground' } } }], shots: [{ id: 's1', name: '1A', beat: 'b1', size: 'CU', subject: 'C', camera: { focal_mm: 50 }, rig: { type: 'dolly' }, duration_s: 2, keys: { A: { position: [2, 1.2, 2], target: [0, 0.5, 0] }, B: { position: [1.5, 1.2, 2.2], target: [0, 0.5, 0] } } }] };
  const s = core.normalizeScene(raw);
  assert.deepEqual(core.validateScene(s), []);
  assert.ok(core.validateScene({ objects: [{ id: 'x' }, { id: 'x' }], shots: [{ id: 's', subject: 'nope' }] }).length >= 3);
  const py = core.toBlenderScript(s);
  assert.ok(py.includes('add_cam("CAM_1A"') && (py.match(/key_cam\(cam, /g) || []).length === 49, 'one key per frame at 24 fps for 2 s');
  const sheet = core.toCameraSheet(s);
  assert.ok(sheet.includes('| 1A | CU |') && sheet.includes('Dolly on track'));
});

test('keys: re-solving a shot from its framing definition reproduces the keys', () => {
  const scene = core.normalizeScene({ objects: [{ id: 'C', kind: 'standin', name: 'C', position: [0, 0, 0], height: 1.8 }], beats: [{ id: 'b1', blocking: { C: { position: [2, 0, 1], facing: 90, pose: 'stand' } } }], shots: [{ id: 's', beat: 'b1', size: 'MS', subject: 'C', camera: { focal_mm: 40, filmback: 'ALEXA35_OG', aspect: 2.39 }, rig: { type: 'static' }, framing: { A: { type: 'single', azimuth: 30, cameraHeight: 1.5 }, B: { type: 'single', azimuth: 10, cameraHeight: 1.5 } }, keys: { A: { position: [0, 0, 0], target: [0, 0, 0] } } }] });
  assert.ok(core.resolveShotKeys(scene, scene.shots[0]));
  const k = scene.shots[0].keys;
  assert.deepEqual(k.B.position, k.A.position, 'static rig: B position equals A');
  assert.ok(core.dist(k.A.position, [2, 0, 1]) > 1);
});

test('metrics: analytic cone occlusion does not use the bounding box', () => {
  // a wide cone to the side of the sight line must not hide the subject, a cone on the line must
  const scene = { objects: [
    { id: 'C', kind: 'standin', name: 'C', position: [0, 0, 0], rotation: [0, 0, 0], pose: 'stand', height: 1.8 },
    { id: 'CONE', kind: 'cone', name: 'Cone', position: [3, 0, 3], size: [8, 1.2, 8] },
  ] };
  const shot = { size: 'MS', subject: 'C', camera: { focal_mm: 35 } };
  const m = core.evaluateFrame(scene, shot, { position: [0, 1.4, 5], target: [0, 1.2, 0], roll: 0 }, {});
  assert.ok(!m.occlusion.occluded, 'bbox of the wide cone crosses the ray but the cone itself does not');
  scene.objects[1] = { id: 'CONE', kind: 'cone', name: 'Cone', position: [0, 0, 2.5], size: [1.5, 3, 1.5] };
  const m2 = core.evaluateFrame(scene, shot, { position: [0, 1.4, 5], target: [0, 1.2, 0], roll: 0 }, {});
  assert.ok(m2.occlusion.occluded, 'cone on the sight line hides the subject');
});
