// three.js side of the viewer: scene graph for proxies and stand-ins, UE-style navigation, gizmo, shot camera helpers, PiP rendering.
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as core from '../core/index.js';

export const HELPER_LAYER = 1;
export const ROLE_COLORS = { ENV: '#7d8a76', SET: '#9c8f7c', PROP: '#b89a6a', HERO: '#d9b35c', CHAR: '#4f7fbf', FX: '#b06ad0' };
const deg = THREE.MathUtils.degToRad;

const unitGeo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  cone: new THREE.ConeGeometry(0.5, 1, 24),
  sphere: new THREE.SphereGeometry(0.5, 24, 16),
  capsule: new THREE.CapsuleGeometry(0.25, 0.5, 6, 16),
  plane: new THREE.PlaneGeometry(1, 1),
};

function makeLabel(text, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = '500 40px DM Mono, Menlo, monospace';
  const w = Math.min(500, ctx.measureText(text).width + 36);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.roundRect((512 - w) / 2, 14, w, 68, 14); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.8, 0.34, 1);
  sprite.layers.set(HELPER_LAYER);
  sprite.renderOrder = 10;
  return sprite;
}

const _m4 = new THREE.Matrix4();
/** Place a mannequin part mesh from its centre and 3x3 rotation (character-local frame). */
function setPartTransform(mesh, p) {
  const m = p.m;
  _m4.set(m[0][0], m[0][1], m[0][2], 0, m[1][0], m[1][1], m[1][2], 0, m[2][0], m[2][1], m[2][2], 0, 0, 0, 0, 1);
  mesh.quaternion.setFromRotationMatrix(_m4);
  mesh.position.set(p.center[0], p.center[1], p.center[2]);
}
const standinTop = (obj, pose) => core.skeleton(pose || obj.pose || 'stand', obj.height || 1.75, obj.age).keypoints.headTop[1] + 0.3;

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.flyCam = new THREE.PerspectiveCamera(60, 1, 0.05, 30000);
    this.flyCam.layers.enable(HELPER_LAYER);
    this.shotCam = new THREE.PerspectiveCamera(30, 2.39, 0.05, 30000);
    this.objectsRoot = new THREE.Group(); this.objectsRoot.name = 'objects';
    this.helpersRoot = new THREE.Group(); this.helpersRoot.name = 'helpers';
    this.camerasRoot = new THREE.Group(); this.camerasRoot.name = 'cameras';
    this.scene.add(this.objectsRoot, this.helpersRoot, this.camerasRoot);
    this.nodes = new Map();
    this.labelsVisible = true;
    this.gridVisible = true;
    this.lookThrough = false;
    this.selectedId = null;
    this.focusPoint = new THREE.Vector3(0, 1, 0);
    this.focusDist = 8;
    this.flyYaw = 0; this.flyPitch = 0; this.flySpeed = 4;
    this.keys = {};
    this.look = false; this.pan = false; this.orbit = false; this.driving = false;
    this.onClick = null; this.onDriveEnd = null; this.onObjectMeasured = null;
    this.gltfLoader = new GLTFLoader();
    this.selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xf2c14e); this.selBox.visible = false; this.selBox.layers.set(HELPER_LAYER); this.helpersRoot.add(this.selBox);
    this.setupGizmo();
    this.setupNav();
    this.flyTo([9, 4.5, 11], [0, 1, 0]);
    this.w = 0; this.h = 0;
  }

  // ------------------------------------------------------------------ world ---------------------------------------------
  setWorld(world = {}) {
    const sky = new THREE.Color(world.sky || '#9fb8d6');
    this.scene.background = sky;
    this.scene.fog = new THREE.FogExp2(sky, world.fog ?? 0.0009);
    this.renderer.setClearColor(sky);
    if (this.worldGroup) { this.scene.remove(this.worldGroup); }
    this.worldGroup = new THREE.Group(); this.worldGroup.name = 'world';
    const g = world.ground || { size: 200, color: '#5a6b4a' };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(g.size || 200, g.size || 200), new THREE.MeshStandardMaterial({ color: g.color || '#5a6b4a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'GROUND'; ground.userData.ground = true;
    this.worldGroup.add(ground);
    const fine = new THREE.GridHelper(40, 40, 0x6b7280, 0x3b4150); fine.position.y = 0.01; fine.layers.set(HELPER_LAYER); fine.material.transparent = true; fine.material.opacity = 0.35;
    const coarse = new THREE.GridHelper(Math.min(400, g.size || 200), Math.min(400, g.size || 200) / 10, 0x8a929d, 0x4a515b); coarse.position.y = 0.012; coarse.layers.set(HELPER_LAYER); coarse.material.transparent = true; coarse.material.opacity = 0.45;
    this.grids = [fine, coarse]; this.worldGroup.add(fine, coarse);
    const axes = new THREE.AxesHelper(1.5); axes.position.y = 0.02; axes.layers.set(HELPER_LAYER); this.worldGroup.add(axes);
    const hemi = new THREE.HemisphereLight(sky, new THREE.Color(g.color || '#5a6b4a'), 1.1);
    const sun = world.sun || { azimuth: 135, elevation: 45 };
    const dir = new THREE.DirectionalLight(0xfff2dd, 2.6);
    const az = deg(sun.azimuth), el = deg(sun.elevation);
    dir.position.set(Math.sin(az) * Math.cos(el) * 150, Math.sin(el) * 150, Math.cos(az) * Math.cos(el) * 150);
    dir.castShadow = true; dir.shadow.mapSize.set(4096, 4096);
    Object.assign(dir.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 500 });
    dir.shadow.bias = -0.0006; dir.shadow.normalBias = 0.02;
    this.sunLight = dir; this.sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    this.worldGroup.add(hemi, dir, dir.target);
    this.scene.add(this.worldGroup);
    this.setGridVisible(this.gridVisible);
  }
  /** Concentrate the sun's shadow map on the area where the action is: sharp shadows, no acne or crawling edges. */
  fitShadows(center, radius) {
    const dir = this.sunLight; if (!dir) return;
    const r = Math.max(8, Math.min(60, radius));
    dir.position.set(center[0] + this.sunDir.x * 150, this.sunDir.y * 150, center[2] + this.sunDir.z * 150);
    dir.target.position.set(center[0], 0, center[2]);
    dir.target.updateMatrixWorld();
    Object.assign(dir.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 400 });
    dir.shadow.camera.updateProjectionMatrix();
    dir.shadow.bias = -0.0002; dir.shadow.normalBias = 0.012 * Math.max(1, r / 20);
    dir.shadow.needsUpdate = true;
  }
  setGridVisible(v) { this.gridVisible = v; if (this.grids) for (const g of this.grids) g.visible = v; }
  labelWanted(obj) { return obj.kind !== 'plane' && (obj.kind === 'standin' || obj.role === 'HERO' || obj.role === 'SET' || obj.role === 'CHAR' || obj.id === this.selectedId); }
  setLabelsVisible(v) { this.labelsVisible = v; for (const n of this.nodes.values()) if (n.label) n.label.visible = v && this.labelWanted(n.data); }

  // ------------------------------------------------------------------ objects -------------------------------------------
  clearObjects() {
    for (const n of this.nodes.values()) this.objectsRoot.remove(n.group);
    this.nodes.clear();
    this.gizmo.detach();
  }
  buildObjects(objects) { this.clearObjects(); for (const o of objects) this.addObjectNode(o); }

  material(color, opts = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color || '#999'), roughness: 0.92, metalness: 0 }, opts)); }

  buildMeshes(obj, group) {
    const s = obj.size || [1, 1, 1];
    const color = obj.color || ROLE_COLORS[obj.role] || '#999';
    const add = (m) => { m.castShadow = true; m.receiveShadow = true; m.userData.objectId = obj.id; group.add(m); return m; };
    switch (obj.kind) {
      case 'plane': { const m = add(new THREE.Mesh(unitGeo.plane, this.material(color))); m.rotation.x = -Math.PI / 2; m.scale.set(s[0], s[2] ?? s[0], 1); m.castShadow = false; break; }
      case 'tree': {
        const [dia, h, trunkFrac = 0.35] = s; const th = h * trunkFrac;
        const trunk = add(new THREE.Mesh(unitGeo.cylinder, this.material('#5a4330'))); trunk.scale.set(dia * 0.12, th, dia * 0.12); trunk.position.y = th / 2;
        const canopy = add(new THREE.Mesh(unitGeo.cone, this.material(color))); canopy.scale.set(dia, h - th, dia); canopy.position.y = th + (h - th) / 2;
        break;
      }
      case 'standin': {
        // Unreal-style mannequin: body plates in the character colour, dark joints and shoes, a nose to read the facing
        const mats = {
          body: new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.42, metalness: 0.08 }),
          joint: new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2e35'), roughness: 0.55, metalness: 0.05 }),
          accent: new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.72), roughness: 0.45, metalness: 0.05 }),
        };
        const meshes = [];
        for (const p of core.standinParts(obj.pose || 'stand', obj.height || 1.75, obj.age)) {
          const mat = mats[p.mat] || mats.body;
          let m;
          if (p.kind === 'capsule') m = add(new THREE.Mesh(new THREE.CapsuleGeometry(p.radius, p.length, 4, 14), mat));
          else { m = add(new THREE.Mesh(p.kind === 'box' ? unitGeo.box : unitGeo.sphere, mat)); m.scale.set(p.size[0], p.size[1], p.size[2]); }
          setPartTransform(m, p);
          m.userData.partTag = p.tag;
          meshes.push(m);
        }
        group.userData.partMeshes = meshes;
        break;
      }
      case 'gltf': {
        const holder = new THREE.Group(); group.add(holder);
        if (obj.url) this.gltfLoader.load(obj.url, (gltf) => {
          gltf.scene.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.userData.objectId = obj.id; } });
          holder.add(gltf.scene);
          const box = new THREE.Box3().setFromObject(gltf.scene); const size = new THREE.Vector3(); box.getSize(size);
          if (this.onObjectMeasured) this.onObjectMeasured(obj.id, [size.x, size.y, size.z], [box.min.x, box.min.y, box.min.z]);
        }, undefined, () => { const m = add(new THREE.Mesh(unitGeo.box, this.material('#aa4444', { wireframe: true }))); m.scale.set(...s); m.position.y = s[1] / 2; });
        else { const m = add(new THREE.Mesh(unitGeo.box, this.material(color, { wireframe: true }))); m.scale.set(...s); m.position.y = s[1] / 2; }
        break;
      }
      default: {
        const geo = unitGeo[obj.kind] || unitGeo.box;
        const m = add(new THREE.Mesh(geo, this.material(color)));
        m.scale.set(s[0], s[1], s[2] ?? s[0]); m.position.y = s[1] / 2;
      }
    }
  }

  addObjectNode(obj) {
    const group = new THREE.Group(); group.name = obj.id; group.userData.objectId = obj.id;
    this.buildMeshes(obj, group);
    const labelText = obj.kind === 'standin' ? (obj.name || obj.id) : (obj.name || obj.id);
    const label = makeLabel(labelText, obj.kind === 'standin' ? '#ffe9a6' : '#ffffff');
    const top = obj.kind === 'standin' ? standinTop(obj) : (obj.size ? obj.size[1] * (obj.scale ? obj.scale[1] : 1) + 0.3 : 1);
    label.position.set(0, top, 0); label.visible = this.labelsVisible && this.labelWanted(obj);
    group.add(label);
    this.objectsRoot.add(group);
    const node = { group, data: obj, label, pose: obj.pose, kind: obj.kind, sizeKey: this.shapeKey(obj) };
    this.nodes.set(obj.id, node);
    this.applyTransform(obj, group);
    group.visible = obj.visible !== false;
    return node;
  }
  applyTransform(obj, group) {
    group.position.set(...obj.position);
    const r = obj.rotation || [0, 0, 0]; group.rotation.set(deg(r[0]), deg(r[1]), deg(r[2]), 'XYZ');
    const sc = obj.scale || [1, 1, 1]; group.scale.set(sc[0], sc[1], sc[2]);
  }
  /** What forces a mesh rebuild: shape, colour, body measures. A stand-in's pose only moves its parts. */
  shapeKey(obj) { return JSON.stringify([obj.size, obj.color, obj.height, obj.age, obj.kind, obj.name, obj.url, obj.kind === 'standin' ? null : obj.pose]); }
  /** Re-sync a node from its JSON (transform, visibility; rebuild meshes if shape/colour/measures changed). */
  refreshObject(obj) {
    const n = this.nodes.get(obj.id);
    if (!n) return this.addObjectNode(obj);
    const key = this.shapeKey(obj);
    if (key !== n.sizeKey) {
      for (const c of [...n.group.children]) n.group.remove(c);
      n.group.userData.partMeshes = null;
      this.buildMeshes(obj, n.group);
      n.label = makeLabel(obj.name || obj.id, obj.kind === 'standin' ? '#ffe9a6' : '#ffffff');
      const top = obj.kind === 'standin' ? standinTop(obj) : (obj.size ? obj.size[1] + 0.3 : 1);
      n.label.position.set(0, top, 0); n.label.visible = this.labelsVisible && this.labelWanted(obj);
      n.group.add(n.label);
      n.sizeKey = key;
    }
    n.data = obj;
    if (obj.kind === 'standin') this.poseStandin(n, obj, obj.pose);
    this.applyTransform(obj, n.group);
    n.group.visible = obj.visible !== false;
    if (this.selectedId === obj.id) this.selBox.setFromObject(n.group);
  }
  /** Move a mannequin's parts to a pose (library name, blend or angle set) without rebuilding geometry. */
  poseStandin(n, obj, pose) {
    const meshes = n.group.userData.partMeshes;
    if (!meshes) return;
    const sk = core.skeleton(pose || 'stand', obj.height || 1.75, obj.age);
    for (let i = 0; i < meshes.length && i < sk.parts.length; i++) setPartTransform(meshes[i], sk.parts[i]);
    if (n.label) n.label.position.y = sk.keypoints.headTop[1] + 0.3;
    n.pose = pose;
  }
  removeObject(id) { const n = this.nodes.get(id); if (!n) return; if (this.gizmo.object === n.group) this.gizmo.detach(); this.objectsRoot.remove(n.group); this.nodes.delete(id); if (this.selectedId === id) this.setSelected(null); }

  /** Apply a blocking state to stand-ins (position / facing / pose, possibly a pose blend) without touching the JSON. */
  applyBlocking(objects, blocking) {
    for (const o of objects) {
      if (o.kind !== 'standin') continue;
      const n = this.nodes.get(o.id); if (!n) continue;
      const b = (blocking && blocking[o.id]) || {};
      this.poseStandin(n, o, b.pose || o.pose || 'stand');
      const pos = b.position || o.position;
      n.group.position.set(pos[0], pos[1], pos[2]);
      n.group.rotation.set(0, deg(b.facing ?? (o.rotation || [0, 0, 0])[1]), 0, 'XYZ');
      n.group.visible = (b.visible ?? o.visible) !== false;
      if (this.selectedId === o.id && !this.gizmo.dragging) this.selBox.setFromObject(n.group);
    }
  }

  setSelected(id) {
    this.selectedId = id;
    const n = id ? this.nodes.get(id) : null;
    for (const node of this.nodes.values()) node.group.traverse((c) => { if (c.isMesh && c.material && c.material.emissive) c.material.emissive.setHex(0x000000); });
    if (n) { n.group.traverse((c) => { if (c.isMesh && c.material && c.material.emissive) c.material.emissive.setHex(0x3a2e00); }); this.selBox.setFromObject(n.group); this.selBox.visible = true; this.gizmo.attach(n.group); }
    else { this.selBox.visible = false; this.gizmo.detach(); }
    for (const node of this.nodes.values()) if (node.label) node.label.visible = this.labelsVisible && this.labelWanted(node.data);
  }

  // ------------------------------------------------------------------ gizmo ---------------------------------------------
  setupGizmo() {
    const tc = new TransformControls(this.flyCam, this.canvas);
    tc.setSize(0.9);
    const helper = tc.getHelper ? tc.getHelper() : tc;
    helper.traverse((c) => c.layers && c.layers.set(HELPER_LAYER));
    this.scene.add(helper);
    tc.addEventListener('dragging-changed', (e) => { this.gizmoDragging = e.value; if (this.onGizmoDrag) this.onGizmoDrag(e.value); });
    tc.addEventListener('objectChange', () => { if (this.onGizmoChange && tc.object) this.onGizmoChange(tc.object.userData.objectId, tc.object); if (tc.object) this.selBox.setFromObject(tc.object); });
    this.gizmo = tc;
  }
  setGizmoMode(mode) { this.gizmo.setMode(mode); }
  setSnap(on) { this.gizmo.setTranslationSnap(on ? 0.1 : null); this.gizmo.setRotationSnap(on ? deg(5) : null); this.gizmo.setScaleSnap(on ? 0.1 : null); }

  // ------------------------------------------------------------------ shot cameras --------------------------------------
  makeCameraIcon(color, vfov, aspect, length, opacity = 1) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.34), mat); g.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 12), mat); lens.rotation.x = Math.PI / 2; lens.position.z = 0.25; g.add(lens);
    const hh = Math.tan(deg(vfov) / 2) * length, hw = hh * aspect;
    const pts = [];
    const corners = [[-hw, -hh, length], [hw, -hh, length], [hw, hh, length], [-hw, hh, length]];
    for (let i = 0; i < 4; i++) { pts.push(0, 0, 0, ...corners[i]); pts.push(...corners[i], ...corners[(i + 1) % 4]); }
    pts.push(-hw * 0.3, hh, length, 0, hh * 1.35, length, hw * 0.3, hh, length); // "up" triangle
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })));
    g.traverse((c) => { c.layers.set(HELPER_LAYER); });
    return g;
  }
  /** Rebuild shot camera helpers. solved: Map shotId -> solveRig result (for the path of the current shot). */
  setShotHelpers(shots, currentId, solvedCurrent) {
    for (const c of [...this.camerasRoot.children]) this.camerasRoot.remove(c);
    for (const shot of shots) {
      const A = shot.keys && shot.keys.A; if (!A) continue;
      const { vfov } = core.fovFor(shot.camera || {});
      const aspect = (shot.camera && shot.camera.aspect) || 2.39;
      const cur = shot.id === currentId;
      const len = THREE.MathUtils.clamp(core.dist(A.position, A.target) * 0.3, 0.6, 10);
      const icon = this.makeCameraIcon(cur ? 0xf2c14e : 0x9aa4b2, vfov, aspect, cur ? len : Math.min(len, 1.2));
      icon.position.set(...A.position); icon.lookAt(new THREE.Vector3(...A.target)); icon.rotateZ(-deg(A.roll || 0));
      icon.traverse((c) => { c.userData.shotId = shot.id; });
      this.camerasRoot.add(icon);
      const label = makeLabel(shot.name || shot.id, cur ? '#f2c14e' : '#dfe4ea'); label.position.set(...A.position); label.position.y += 0.45; label.scale.set(1.2, 0.26, 1); this.camerasRoot.add(label);
      if (cur && shot.keys.B) {
        const B = shot.keys.B;
        const ghost = this.makeCameraIcon(0xf2c14e, vfov, aspect, len, 0.35); ghost.position.set(...B.position); ghost.lookAt(new THREE.Vector3(...B.target)); ghost.rotateZ(-deg(B.roll || 0));
        ghost.traverse((c) => { c.userData.shotId = shot.id; });
        this.camerasRoot.add(ghost);
        if (solvedCurrent) {
          const pts = solvedCurrent.samples.flatMap((s) => s.position);
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf2c14e })); line.layers.set(HELPER_LAYER); this.camerasRoot.add(line);
          const tpts = solvedCurrent.samples.flatMap((s) => s.target);
          const tgeo = new THREE.BufferGeometry(); tgeo.setAttribute('position', new THREE.Float32BufferAttribute(tpts, 3));
          const tline = new THREE.Line(tgeo, new THREE.LineDashedMaterial({ color: 0x7fb4ff, dashSize: 0.2, gapSize: 0.15 })); tline.computeLineDistances(); tline.layers.set(HELPER_LAYER); this.camerasRoot.add(tline);
        }
      }
    }
  }
  setShotCamera(pose, cam) {
    const { vfov } = core.fovFor(cam || {});
    this.shotCam.fov = vfov; this.shotCam.aspect = (cam && cam.aspect) || 2.39; this.shotCam.updateProjectionMatrix();
    this.shotCam.position.set(...pose.position);
    this.shotCam.lookAt(new THREE.Vector3(...pose.target));
    if (pose.roll) this.shotCam.rotateZ(-deg(pose.roll));
  }
  getShotCamPose() {
    const p = this.shotCam.position; const d = new THREE.Vector3(); this.shotCam.getWorldDirection(d);
    const dist = this.focusDist || 5;
    return { position: [p.x, p.y, p.z], target: [p.x + d.x * dist, p.y + d.y * dist, p.z + d.z * dist], roll: 0 };
  }

  // ------------------------------------------------------------------ navigation ----------------------------------------
  setupNav() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.focus();
      if (this.gizmo.axis) return; // over the gizmo
      if (e.button === 2) { this.look = true; this.driving = this.lookThrough; try { c.requestPointerLock(); } catch (_) {} }
      else if (e.button === 1) { this.pan = true; c.setPointerCapture(e.pointerId); e.preventDefault(); }
      else if (e.button === 0) { if (e.altKey) { this.orbit = true; c.setPointerCapture(e.pointerId); } else this.clickStart = { x: e.clientX, y: e.clientY, t: performance.now() }; }
    });
    c.addEventListener('pointermove', (e) => {
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (this.look) {
        const cam = this.activeNavCam();
        const yp = this.camYawPitch(cam);
        yp.yaw -= dx * 0.0022; yp.pitch = THREE.MathUtils.clamp(yp.pitch - dy * 0.0022, -1.55, 1.55);
        cam.rotation.set(yp.pitch, yp.yaw, 0, 'YXZ');
        if (cam === this.flyCam) { this.flyYaw = yp.yaw; this.flyPitch = yp.pitch; }
      } else if (this.pan) {
        const cam = this.activeNavCam();
        const s = Math.max(0.002, this.focusDist * 0.0012);
        const right = new THREE.Vector3(), up = new THREE.Vector3(); cam.matrixWorld.extractBasis(right, up, new THREE.Vector3());
        cam.position.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
        if (cam === this.flyCam) this.focusPoint.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
      } else if (this.orbit) {
        const cam = this.flyCam;
        const off = cam.position.clone().sub(this.focusPoint);
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta -= dx * 0.005; sph.phi = THREE.MathUtils.clamp(sph.phi + dy * 0.005, 0.05, Math.PI - 0.05);
        cam.position.copy(this.focusPoint).add(off.setFromSpherical(sph));
        this.lookAtPoint(this.focusPoint);
      }
    });
    const release = (e) => {
      if (this.clickStart && e && e.button === 0 && !this.orbit) {
        const moved = Math.hypot(e.clientX - this.clickStart.x, e.clientY - this.clickStart.y);
        if (moved < 5 && this.onClick && !this.gizmo.dragging) this.onClick(e);
      }
      this.clickStart = null;
      if (this.look) { this.look = false; if (document.pointerLockElement === c) document.exitPointerLock(); if (this.driving) { this.driving = false; if (this.onDriveEnd) this.onDriveEnd(); } }
      this.pan = false; this.orbit = false;
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', release);
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== c && this.look) { this.look = false; if (this.driving) { this.driving = false; if (this.onDriveEnd) this.onDriveEnd(); } } });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.look) { this.flySpeed = THREE.MathUtils.clamp(this.flySpeed * Math.exp(-e.deltaY * 0.0015), 0.2, 300); if (this.onSpeedChange) this.onSpeedChange(this.flySpeed); }
      else {
        const cam = this.activeNavCam();
        const d = new THREE.Vector3(); cam.getWorldDirection(d);
        const step = Math.max(0.05, this.focusDist * 0.12) * -Math.sign(e.deltaY);
        cam.position.addScaledVector(d, step);
        if (cam === this.flyCam) this.focusDist = Math.max(0.3, this.focusDist - step);
        if (this.lookThrough && cam === this.shotCam) { this.driving = true; clearTimeout(this._driveT); this._driveT = setTimeout(() => { this.driving = false; if (this.onDriveEnd) this.onDriveEnd(); }, 350); }
      }
    }, { passive: false });
    window.addEventListener('keydown', (e) => { if (this.isTyping()) return; this.keys[e.code] = true; if (this.look && /^(Key[WASDQE]|ShiftLeft|ShiftRight)$/.test(e.code)) e.preventDefault(); });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  }
  isTyping() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable); }
  activeNavCam() { return this.lookThrough ? this.shotCam : this.flyCam; }
  camYawPitch(cam) { const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ'); return { yaw: e.y, pitch: e.x }; }
  lookAtPoint(p) { this.flyCam.lookAt(p); const yp = this.camYawPitch(this.flyCam); this.flyYaw = yp.yaw; this.flyPitch = yp.pitch; this.flyCam.rotation.set(yp.pitch, yp.yaw, 0, 'YXZ'); this.focusDist = this.flyCam.position.distanceTo(p); }
  flyTo(position, target) { this.flyCam.position.set(...position); this.focusPoint.set(...target); this.lookAtPoint(this.focusPoint); }
  frameObject(id) {
    const n = this.nodes.get(id); if (!n) return;
    const box = new THREE.Box3().setFromObject(n.group); const c = new THREE.Vector3(), s = new THREE.Vector3(); box.getCenter(c); box.getSize(s);
    const r = Math.max(0.5, s.length() / 2);
    const d = new THREE.Vector3(); this.flyCam.getWorldDirection(d);
    const dist = r / Math.tan(deg(this.flyCam.fov) / 2) * 1.1;
    this.flyCam.position.copy(c).addScaledVector(d, -dist);
    this.focusPoint.copy(c); this.lookAtPoint(c);
  }
  frameBox(min, max) { const c = new THREE.Vector3().addVectors(new THREE.Vector3(...min), new THREE.Vector3(...max)).multiplyScalar(0.5); const r = new THREE.Vector3(...max).distanceTo(new THREE.Vector3(...min)) / 2; const d = new THREE.Vector3(); this.flyCam.getWorldDirection(d); this.flyCam.position.copy(c).addScaledVector(d, -(r / Math.tan(deg(this.flyCam.fov) / 2)) * 1.1); this.focusPoint.copy(c); this.lookAtPoint(c); }
  update(dt) {
    const k = this.keys;
    if (!(this.look)) return false;
    const cam = this.activeNavCam();
    const speed = this.flySpeed * ((k.ShiftLeft || k.ShiftRight) ? 3 : 1) * dt;
    const f = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(0, 1, 0); cam.getWorldDirection(f); r.crossVectors(f, u).normalize();
    let moved = false;
    if (k.KeyW) { cam.position.addScaledVector(f, speed); moved = true; }
    if (k.KeyS) { cam.position.addScaledVector(f, -speed); moved = true; }
    if (k.KeyD) { cam.position.addScaledVector(r, speed); moved = true; }
    if (k.KeyA) { cam.position.addScaledVector(r, -speed); moved = true; }
    if (k.KeyE) { cam.position.y += speed; moved = true; }
    if (k.KeyQ) { cam.position.y -= speed; moved = true; }
    if (moved && cam === this.flyCam) this.focusPoint.copy(cam.position).addScaledVector(f, this.focusDist);
    return moved;
  }
  getFlyPose() { const p = this.flyCam.position; const d = new THREE.Vector3(); this.flyCam.getWorldDirection(d); const dist = this.focusDist || 5; return { position: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], target: [+(p.x + d.x * dist).toFixed(3), +(p.y + d.y * dist).toFixed(3), +(p.z + d.z * dist).toFixed(3)], roll: 0 }; }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.layers.enable(HELPER_LAYER); ray.setFromCamera(ndc, this.activeNavCam());
    const hits = ray.intersectObjects([this.objectsRoot, this.camerasRoot, ...(this.worldGroup ? [this.worldGroup.children[0]] : [])], true);
    for (const h of hits) {
      if (h.object.isSprite) continue;
      if (h.object.userData.shotId) return { shotId: h.object.userData.shotId, point: h.point };
      let o = h.object; while (o && !o.userData.objectId) o = o.parent;
      if (o && o.userData.objectId) { this.focusDist = h.distance; this.focusPoint.copy(h.point); return { objectId: o.userData.objectId, point: h.point }; }
      if (h.object.userData.ground) { this.focusDist = h.distance; this.focusPoint.copy(h.point); return { ground: true, point: h.point }; }
    }
    return null;
  }

  /** Offline still from the shot camera at an exact pixel size, helpers hidden. Returns a 2D canvas with the pixels. */
  renderStill(pose, cam, w, h, ss = 1) {
    const r = this.renderer;
    const prevW = this.w, prevH = this.h, prevRatio = r.getPixelRatio();
    const W = Math.round(w * ss), Hh = Math.round(h * ss); // supersampling: render bigger, filter down (no crawling edges)
    this.setShotCamera(pose, cam);
    r.setPixelRatio(1); r.setSize(W, Hh, false);
    this.shotCam.aspect = w / h; this.shotCam.updateProjectionMatrix();
    const vis = this.camerasRoot.visible; this.camerasRoot.visible = false;
    const selVis = this.selBox.visible; this.selBox.visible = false;
    r.setScissorTest(false); r.setViewport(0, 0, W, Hh); r.clear(); r.render(this.scene, this.shotCam);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const g = out.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.canvas, 0, 0, W, Hh, 0, 0, w, h);
    this.camerasRoot.visible = vis; this.selBox.visible = selVis;
    r.setPixelRatio(prevRatio); if (prevW && prevH) r.setSize(prevW, prevH, false);
    return out;
  }

  // ------------------------------------------------------------------ render --------------------------------------------
  resize() {
    const w = this.canvas.clientWidth | 0, h = this.canvas.clientHeight | 0;
    if (w && h && (w !== this.w || h !== this.h)) { this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.flyCam.aspect = w / h; this.flyCam.updateProjectionMatrix(); }
  }
  render(pipRect) {
    this.resize();
    if (!this.w || !this.h) return;
    const r = this.renderer;
    r.setScissorTest(false); r.setViewport(0, 0, this.w, this.h);
    if (this.lookThrough) {
      const vis = this.camerasRoot.visible; this.camerasRoot.visible = false;
      const labelState = [];
      for (const n of this.nodes.values()) if (n.label) { labelState.push([n.label, n.label.visible]); n.label.visible = false; }
      const selVis = this.selBox.visible; this.selBox.visible = false;
      this.shotCam.layers.enable(HELPER_LAYER); r.render(this.scene, this.shotCam); this.shotCam.layers.disable(HELPER_LAYER);
      for (const [l, v] of labelState) l.visible = v;
      this.selBox.visible = selVis;
      this.camerasRoot.visible = vis;
      return;
    }
    r.render(this.scene, this.flyCam);
    if (pipRect && pipRect.w > 10 && pipRect.h > 10) {
      r.setScissorTest(true); r.setViewport(pipRect.x, pipRect.y, pipRect.w, pipRect.h); r.setScissor(pipRect.x, pipRect.y, pipRect.w, pipRect.h);
      const vis = this.camerasRoot.visible; this.camerasRoot.visible = false;
      r.clear();
      r.render(this.scene, this.shotCam);
      this.camerasRoot.visible = vis;
      r.setScissorTest(false);
    }
  }
}
