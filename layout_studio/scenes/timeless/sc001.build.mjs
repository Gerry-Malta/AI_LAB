// TIMELESS — Scena 1: EST. BLACK HILLS, SOUTH DAKOTA - RADURA - GIORNO (pp. 1-3)
// Blockout inferito dalla sceneggiatura (nessuna immagine di reference ancora): tutte le geometrie sono proxy "inferred".
import { createBuilder, rng } from '../_lib/build.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const B = createBuilder({
  project: 'TIMELESS',
  scene: {
    number: 1, heading: 'EST. BLACK HILLS, SOUTH DAKOTA - RADURA - GIORNO', int_ext: 'EXT', location: 'Black Hills · radura tra i pini', time: 'GIORNO', pages: '1-3',
    synopsis: 'Picnic nella radura. Arthur sistema i panini, Claire scrive sul telefono, mezzo metro di telo vuoto tra loro. Rebecca, a pancia in giù sul prato, disegna: nei suoi disegni i genitori non hanno i piedi. Arthur la guarda, la bacia, torna al telo. Rebecca vede oltre gli alberi la montagna dalla cima spezzata e comincia a disegnarla. Sul telo: le patatine, "che giorno è oggi", il telefono a faccia in giù che vibra.',
  },
  world: { ground: { size: 30000, color: '#5b7340' }, sky: '#bdd3ea', sun: { azimuth: 135, elevation: 50 }, fog: 0.00035 },
  notes: 'Nord = -Z (montagna dalla cima spezzata). Est = +X. Origine = centro del telo. Rushmore a NO, lontano. Geometrie da sostituire con il blockout da reference quando arriva l\'immagine della location.',
});
const R = rng(2026);

// ---------------------------------------------------------------- set / props --------------------------------
B.box('PROP_blanket', 'Telo da picnic', 'HERO', [0, 0, 0], [2.0, 0.02, 1.6], { color: '#a8463a', source: 'script' });
B.box('PROP_basket', 'Cestino', 'PROP', [1.05, 0.02, 0.45], [0.45, 0.28, 0.3], { color: '#b08a5a', source: 'inferred' });
B.cylinder('PROP_plate', 'Piatto dei panini', 'PROP', [0.55, 0.02, 0.35], [0.32, 0.03, 0.32], { color: '#e9e4d8', source: 'script' });
B.cylinder('PROP_bottle_1', 'Bibita', 'PROP', [0.88, 0.02, -0.25], [0.07, 0.24, 0.07], { color: '#3a5f8a', source: 'script' });
B.cylinder('PROP_bottle_2', 'Bibita', 'PROP', [0.98, 0.02, -0.12], [0.07, 0.24, 0.07], { color: '#8a3a3a', source: 'script' });
B.box('PROP_chips', 'Sacchetto di patatine', 'PROP', [0.82, 0.02, 0.18], [0.18, 0.22, 0.08], { color: '#d9b43a', source: 'script' });
B.box('PROP_phone', 'Telefono di Claire (a faccia in giù)', 'PROP', [-0.35, 0.022, 0.42], [0.07, 0.01, 0.15], { color: '#222', source: 'script' });

// Rebecca's corner
B.box('PROP_teddy', 'Orsacchiotto (orecchio scucito)', 'HERO', [2.28, 0, -3.3], [0.22, 0.3, 0.14], { color: '#a67c52', source: 'script' });
B.box('PROP_drawing_1', 'Disegno 1 (tre figure)', 'HERO', [2.35, 0.002, -3.55], [0.3, 0.004, 0.21], { color: '#efe9d8', rotation: [0, 10, 0], source: 'script' });
B.box('PROP_drawing_2', 'Disegno 2', 'PROP', [2.72, 0.002, -3.62], [0.3, 0.004, 0.21], { color: '#efe9d8', rotation: [0, -8, 0], source: 'script' });
B.box('PROP_drawing_3', 'Disegno 3', 'PROP', [2.98, 0.006, -3.42], [0.3, 0.004, 0.21], { color: '#efe9d8', rotation: [0, 4, 0], source: 'script' });
B.box('PROP_sheets', 'Fogli nuovi', 'PROP', [2.15, 0.002, -3.3], [0.3, 0.008, 0.21], { color: '#f6f2e8', source: 'script' });
B.box('PROP_crayons', 'Pastelli', 'PROP', [2.9, 0.002, -3.4], [0.18, 0.02, 0.09], { color: '#d9a441', source: 'script' });

// clearing dressing
for (let i = 0; i < 16; i++) {
  const a = R() * Math.PI * 2, r = 1.6 + R() * 6;
  B.cone(`ENV_grass_${i + 1}`, "Ciuffo d'erba", 'ENV', [Math.cos(a) * r, 0, Math.sin(a) * r], [0.5 + R() * 0.4, 0.12 + R() * 0.12, 0.5 + R() * 0.4], { color: '#6f8a45', source: 'inferred' });
}
for (let i = 0; i < 6; i++) B.cone(`ENV_grass_fg_${i + 1}`, "Ciuffo d'erba alto", 'ENV', [-1.3 + i * 0.55 + (R() - 0.5) * 0.3, 0, 1.8 + R() * 1.2], [0.6 + R() * 0.3, 0.22 + R() * 0.1, 0.6 + R() * 0.3], { color: '#7a9448', source: 'inferred' });
B.cone('ENV_grass_fg_1C', "Ciuffo d'erba (primo piano 1C)", 'ENV', [2.92, 0, -3.76], [0.32, 0.24, 0.32], { color: '#7a9448', source: 'inferred' });
B.cylinder('ENV_log', 'Tronco caduto', 'ENV', [-3.4, 0.25, 4.3], [0.5, 3.2, 0.5], { color: '#6b5236', rotation: [0, 25, 90], source: 'inferred' });
B.sphere('ENV_rock_1', 'Masso', 'ENV', [4.5, 0, 2.5], [1.4, 0.7, 1.1], { color: '#8d8a84', source: 'inferred' });
B.sphere('ENV_rock_2', 'Masso', 'ENV', [-5.5, 0, -2.0], [0.9, 0.5, 0.8], { color: '#8d8a84', source: 'inferred' });

// ---------------------------------------------------------------- forest -------------------------------------
// near pines: annulus 17–60 m; the north sector (towards the mountain) opens up from 42 m so the peak reads above the tree line
let n = 0;
for (let i = 0; i < 400 && n < 95; i++) {
  const yaw = R() * 360, r = 17 + R() * 43;
  const north = Math.abs(((yaw + 180) % 360) - 180) > 145; // yaw ≈ 180 ± 35: the sector that must stay open towards the peak
  if (north && r < 60) continue;
  const x = Math.sin(yaw * Math.PI / 180) * r, z = Math.cos(yaw * Math.PI / 180) * r;
  B.tree(`ENV_pine_${++n}`, [+x.toFixed(2), 0, +z.toFixed(2)], 4.5 + R() * 3.5, north ? 12 + R() * 5 : 15 + R() * 9, { name: 'Pino ponderosa', color: R() > 0.5 ? '#2f5d3a' : '#3a6b42' });
}
for (let i = 0; i < 60; i++) {
  const yaw = R() * 360, r = 62 + R() * 180;
  const north = Math.abs(((yaw + 180) % 360) - 180) > 145;
  if (north && r < 120) continue;
  const x = Math.sin(yaw * Math.PI / 180) * r, z = Math.cos(yaw * Math.PI / 180) * r;
  B.cone(`ENV_pinewood_${i + 1}`, 'Pineta', 'ENV', [+x.toFixed(1), 0, +z.toFixed(1)], [18 + R() * 10, 20 + R() * 6, 18 + R() * 10], { color: '#2b4f34', source: 'inferred' });
}
for (let i = 0; i < 14; i++) {
  const yaw = R() * 360, r = 900 + R() * 2600;
  const x = Math.sin(yaw * Math.PI / 180) * r, z = Math.cos(yaw * Math.PI / 180) * r;
  B.cone(`ENV_hill_${i + 1}`, 'Collina di pini (mare di pini)', 'ENV', [+x.toFixed(0), 0, +z.toFixed(0)], [500 + R() * 500, 110 + R() * 120, 500 + R() * 500], { color: '#2a4a33', source: 'inferred' });
}
// the broken-peak mountain (north, steep) and Mount Rushmore (far north-west)
B.cone('ENV_mountain_main', 'Montagna dalla cima spezzata · punta 1', 'ENV', [250, 0, -1100], [1500, 650, 1500], { color: '#6e6a66', source: 'script' });
B.cone('ENV_mountain_peak2', 'Montagna dalla cima spezzata · punta 2', 'ENV', [330, 0, -1040], [800, 590, 800], { color: '#767270', source: 'script' });
B.box('ENV_rushmore_massif', 'Monte Rushmore · massiccio', 'ENV', [-3600, 0, -5300], [520, 190, 420], { color: '#8f8a84', source: 'script' });
B.box('ENV_rushmore_faces', 'Monte Rushmore · i quattro volti', 'ENV', [-3600, 120, -5080], [120, 50, 30], { color: '#b9b3ab', source: 'script' });

// ---------------------------------------------------------------- characters ---------------------------------
B.standin('CHAR_arthur', 'ARTHUR (38)', 1.82, '#3b6ea5', [0.55, 0, 0], 340, 'sit_ground', { age: 38, notes: 'barba di qualche giorno, matita dietro l\'orecchio' });
B.standin('CHAR_claire', 'CLAIRE (36)', 1.70, '#c2743b', [-0.55, 0, 0.1], 15, 'sit_ground', { age: 36, notes: 'elegante anche in jeans, telefono in mano' });
B.standin('CHAR_rebecca', 'REBECCA (6)', 1.15, '#7a4b2b', [2.6, 0, -2.8], 180, 'lie_prone', { age: 6, notes: 'felpa marrone, pantaloncini chiari, voglia sulla guancia sinistra' });


// a blade of grass Arthur tears at the end (only in his hand in the last beats)
B.box('PROP_grass_blade', "Filo d'erba (nelle dita di Arthur)", 'HERO', [0.16, 0.58, 0.32], [0.012, 0.14, 0.004], { color: '#7fae4a', visible: false, source: 'script' });

// ---------------------------------------------------------------- acting (on top of the library poses) ---------
const ARTHUR_SANDWICHES = { base: 'sit_ground', spine: { pitch: 30 }, shoulder: { flex: 62, abd: 10 }, elbow: { flex: 44 }, wrist: { twist: -40 }, head: { pitch: 22 }, handL: 'grip', handR: 'pinch' };
const ARTHUR_LOOKS = { base: 'sit_ground', spine: { pitch: 10, yaw: 12 }, head: { pitch: 0, yaw: 10 } }; // turned toward Rebecca, chin up
const ARTHUR_PICKS_UP = { base: 'crouch', head: { pitch: 10 }, shoulder: { flex: 72, abd: 10 }, elbow: { flex: 34 }, hand: 'pinch' }; // sheets lifted toward the face
const ARTHUR_KISS = { base: 'kneel', root: { pitch: 60 }, spine: { pitch: 25 }, neck: { pitch: 15 }, head: { pitch: 10 } }; // bowed over her head
const ARTHUR_OFFERS = { base: 'sit_ground', spine: { pitch: 12 }, shoulderL: { flex: 75, abd: 8 }, elbowL: { flex: 12 }, wristL: { twist: -20 }, handL: 'grip', head: { pitch: 4 } }; // the bag held out
const ARTHUR_WATCHES_PHONE = { base: 'sit_ground', spine: { pitch: 18 }, head: { pitch: 20 } }; // eyes on the phone in her hands
const ARTHUR_TALKS = { base: 'sit_ground', spine: { pitch: 24 }, head: { pitch: -4 } };
const ARTHUR_GRASS = { base: 'sit_ground', spine: { pitch: 26 }, head: { pitch: 30 }, shoulder: { flex: 50, abd: -10 }, elbow: { flex: 100 }, handR: 'pinch', handL: { preset: 'relaxed', curl: 0.45 } };
const CLAIRE_PHONE = { base: 'sit_ground', neck: { pitch: 6 }, head: { pitch: 18 }, shoulder: { flex: 34, abd: 16 }, elbow: { flex: 124 }, wrist: { flex: 18, twist: 30 }, hand: 'grip' }; // phone at chest height, in both hands
const CLAIRE_FACES = { base: 'sit_ground', spine: { pitch: 22 }, head: { pitch: -2 } };
const CLAIRE_LOOKS_DOWN = { base: 'sit_ground', spine: { pitch: 24 }, neck: { pitch: 8 }, head: { pitch: 26 } }; // at the phone buzzing on the blanket
const REBECCA_DRAWS = { base: 'lie_prone', head: { pitch: 30 }, handR: 'pinch' }; // a crayon in the right hand
const REBECCA_LOOKS_UP = { base: 'lie_prone', neck: { pitch: -32 }, head: { pitch: -6 } };

// props that change hands: the phone (in Claire's hands, face down on the blanket, back in her hands), the chips bag
// held props sit in the grip of the hands that hold them (core.gripPoint), at the mark and facing of that beat
const held = (charId, pos, facing, pose, side, drop = 0) => {
  const o = B.object(charId), g = B.core.gripPoint({ position: pos, facing, pose, height: o.height, age: o.age }, side);
  return [+g[0].toFixed(3), +(g[1] - drop).toFixed(3), +g[2].toFixed(3)];
};
const PHONE_IN_HAND = { position: held('CHAR_claire', [-0.55, 0, 0.1], 90, CLAIRE_PHONE, 'both', 0.012), facing: 90 };
const PHONE_WHILE_PICNIC = { position: held('CHAR_claire', [-0.55, 0, 0.1], 15, CLAIRE_PHONE, 'both', 0.012), facing: 15 }; // in her hands while she types
const BAG_HELD_OUT = { position: held('CHAR_arthur', [0.55, 0, 0], 276, ARTHUR_OFFERS, 'L', 0.17), facing: 276 };
const BLADE = { visible: true, position: held('CHAR_arthur', [0.55, 0, 0], 290, ARTHUR_GRASS, 'R', 0.07) };

// ---------------------------------------------------------------- beats --------------------------------------
const A_ = 'CHAR_arthur', C_ = 'CHAR_claire', R_ = 'CHAR_rebecca';
const at = (pos, facing, pose) => ({ position: pos, facing, pose });
const ARTHUR_BLANKET = [0.55, 0, 0], CLAIRE_BLANKET = [-0.55, 0, 0.1], REBECCA_SPOT = [2.6, 0, -2.8];
B.beat('b1', 'Radura: Arthur sistema i panini, Claire al telefono, Rebecca disegna sul prato', 0, 12, {
  [A_]: at(ARTHUR_BLANKET, 340, ARTHUR_SANDWICHES), [C_]: at(CLAIRE_BLANKET, 15, CLAIRE_PHONE), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS),
  PROP_phone: PHONE_WHILE_PICNIC });
B.beat('b1b', 'Arthur alza gli occhi dai panini e si gira a guardare Rebecca', 12, 14, {
  [A_]: at(ARTHUR_BLANKET, 120, ARTHUR_LOOKS), [C_]: at(CLAIRE_BLANKET, 15, CLAIRE_PHONE), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS),
  PROP_phone: PHONE_WHILE_PICNIC });
B.beat('b2', '"Posso?" Arthur accovacciato accanto a Rebecca raccoglie i fogli', 14, 34, {
  [A_]: at([1.9, 0, -2.6], 110, ARTHUR_PICKS_UP), [C_]: at(CLAIRE_BLANKET, 15, CLAIRE_PHONE), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS),
  PROP_phone: PHONE_WHILE_PICNIC });
B.beat('b2k', 'Rimette i fogli in ordine e la bacia sulla testa: "Ti voglio bene, scimmietta"', 34, 40, {
  [A_]: at([2.08, 0, -2.78], 132, ARTHUR_KISS), [C_]: at(CLAIRE_BLANKET, 15, CLAIRE_PHONE), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS),
  PROP_phone: PHONE_WHILE_PICNIC });
B.beat('b3', 'Arthur torna al telo. Rebecca alza lo sguardo: la montagna oltre gli alberi', 40, 54, {
  [A_]: at(ARTHUR_BLANKET, 340, 'sit_ground'), [C_]: at(CLAIRE_BLANKET, 15, CLAIRE_PHONE), [R_]: at(REBECCA_SPOT, 180, REBECCA_LOOKS_UP),
  PROP_phone: PHONE_WHILE_PICNIC });
B.beat('b3d', 'Rebecca prende un foglio nuovo e disegna la montagna', 54, 58, {
  [A_]: at(ARTHUR_BLANKET, 340, 'sit_ground'), [C_]: at(CLAIRE_BLANKET, 15, CLAIRE_PHONE), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS),
  PROP_phone: PHONE_WHILE_PICNIC });
B.beat('b4', 'Sul telo: Arthur porge le patatine. "Ne vuoi?" "No, grazie."', 58, 66, {
  [A_]: at(ARTHUR_BLANKET, 276, ARTHUR_OFFERS), [C_]: at(CLAIRE_BLANKET, 90, CLAIRE_PHONE), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS),
  PROP_phone: PHONE_IN_HAND, PROP_chips: BAG_HELD_OUT });
B.beat('b4c', 'Arthur mangia una patatina e guarda il telefono nelle mani di lei: "Che giorno è oggi?"', 66, 80, {
  [A_]: at(ARTHUR_BLANKET, 276, ARTHUR_WATCHES_PHONE), [C_]: at(CLAIRE_BLANKET, 90, CLAIRE_PHONE), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS),
  PROP_phone: PHONE_IN_HAND });
B.beat('b5', 'Claire posa il telefono a faccia in giù e lo guarda: il confronto', 80, 104, {
  [A_]: at(ARTHUR_BLANKET, 276, ARTHUR_TALKS), [C_]: at(CLAIRE_BLANKET, 90, CLAIRE_FACES), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS) });
B.beat('b6', 'Il telefono vibra contro il telo. Lei lo guarda. Non lo prende', 104, 114, {
  [A_]: at(ARTHUR_BLANKET, 290, ARTHUR_GRASS), [C_]: at(CLAIRE_BLANKET, 90, CLAIRE_LOOKS_DOWN), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS),
  PROP_grass_blade: BLADE });
B.beat('b6t', 'Poi lo prende. Arthur arrotola il filo d\'erba tra le dita', 114, 125, {
  [A_]: at(ARTHUR_BLANKET, 290, ARTHUR_GRASS), [C_]: at(CLAIRE_BLANKET, 90, CLAIRE_PHONE), [R_]: at(REBECCA_SPOT, 180, REBECCA_DRAWS),
  PROP_phone: PHONE_IN_HAND, PROP_grass_blade: BLADE });

// ---------------------------------------------------------------- sound library ------------------------------
B.sounds(path.join(here, 'audio', 'sc001', 'sounds.json'));

// ---------------------------------------------------------------- the edit -----------------------------------
// Visual idea: two worlds. Rebecca's is low and close to the grass; her parents' is eye level, separated by the empty
// half metre. The argument is covered so we watch the one who listens (lines over the other's face, J and L cuts),
// the frame tightens as it escalates, and the silences are held.
const LINE = [C_, A_];
// the OTS pair shares one lens (75 mm); distances mirrored so both read MCU with the eyes on opposite thirds
const otsOnArthur = () => ({ type: 'ots', fg: C_, bg: A_, side: -1, lateral: 1.1, back: 2.0 });
const otsOnClaire = () => ({ type: 'ots', fg: A_, bg: C_, side: 1, heightOffset: -0.06, lateral: 1.25, back: 1.5 }); // low (she looks down at the phone) and wide of his raised arm
// the DP composer: lens, angle and height inside the intent's ranges, the eyes on its grid; side 1 = the established side of the line
const compose = (intent, o = {}) => Object.assign({ type: 'compose', intent, side: 1 }, o);
const ts = B.core.solveTwoShot({ a: B.char(C_, 'b1'), b: B.char(A_, 'b1'), size: 'FS', lens: { focal_mm: 32 }, side: 1, cameraHeight: 0.5 });

// ---- 1. the place
B.shot({ id: 'sh010', name: '1A', beat: 'b1', size: 'EWS', subject: null, lens: { focal_mm: 18 }, rig: { type: 'drone' }, duration_s: 12, curve: 'easeInOutCubic', move: [1.0, 11.4],
  intent: 'Il mare di pini; in lontananza i quattro volti del Rushmore. Il drone gira e scende: più vicina, senza volti, la montagna dalla cima spezzata.',
  notes: 'Drone. Si apre sul Rushmore e lo lascia: la montagna senza volti prende il quadro.',
  A: { type: 'raw', position: [70, 190, 620], target: [-3600, 130, -5080] }, B: { type: 'raw', position: [64, 172, 596], target: [290, 470, -1070] } });
B.shot({ id: 'sh020', name: '1B', beat: 'b1', size: 'WS', subject: C_, lens: { focal_mm: 24 }, rig: { type: 'drone' }, duration_s: 8, curve: 'easeInOutCubic', move: [0, 7.4],
  intent: 'Dall\'alto, scendendo sulla radura: il telo, i due ai lati, il mezzo metro vuoto tra loro. Rebecca da sola, a qualche passo.',
  A: { type: 'raw', position: [4, 34, 18], target: [0.8, 0, -1.0] }, B: { type: 'raw', position: [1.2, 7.5, 4.2], target: [0.6, 0, -0.9] } });
B.shot({ id: 'sh030', name: '1C', beat: 'b1', size: 'WS', subject: A_, lens: { focal_mm: 32, fstop: 5.6 }, rig: { type: 'dolly' }, duration_s: 7, curve: 'easeInOutCubic', move: [0.4, 7], wantForeground: true, line: LINE,
  intent: 'Ad altezza d\'erba, simmetrico: Claire a sinistra scrive sul telefono, Arthur a destra sistema i panini, il telo vuoto al centro. Il carrello entra piano oltre l\'erba alta.',
  sfx: [{ sound: 'paper', at: 2.4, gain: 0.25 }],
  A: { type: 'two', a: C_, b: A_, size: 'WS', side: 1, cameraHeight: 0.5, distance: +(ts.distance + 2.4).toFixed(2) }, B: { type: 'two', a: C_, b: A_, size: 'FS', side: 1, cameraHeight: 0.5, headroom: 0.12, wantForeground: false } });
B.shot({ id: 'sh040', name: '1D', beat: 'b1', size: 'MS', subject: R_, lens: { focal_mm: 35, fstop: 2 }, rig: { type: 'static' }, duration_s: 6, wantForeground: true,
  intent: 'Il mondo di Rebecca, a filo d\'erba: a pancia in giù disegna, l\'orsacchiotto con l\'orecchio scucito in primo piano, i genitori lontani e sfocati.',
  sfx: [{ sound: 'crayon', at: 0.5, gain: 0.35, align: 'start' }, { sound: 'crayon', at: 3.3, gain: 0.3, align: 'start' }],
  A: { type: 'single', azimuth: -55, cameraHeight: 0.28, leadRoom: 0.2 } });
// ---- 2. Arthur and the drawings
B.shot({ id: 'sh050', name: '1E', beat: 'b2', beatA: 'b1b', beatB: 'b2', size: 'FS', subject: A_, lens: { focal_mm: 40 }, rig: { type: 'steadicam', follow: true, followVertical: 1 }, duration_s: 12, curve: 'easeInOut',
  action: [1.5, 10.0], move: [1.6, 11.7],
  intent: 'Arthur la guarda. Tiene lo sguardo, poi si alza e la raggiunge: la Steadicam parte con lui e si posa sul due, accanto a lei.',
  sfx: [{ sound: 'footsteps', at: 3.2, gain: 0.32, align: 'start' }],
  A: { type: 'single', beat: 'b1b', azimuth: -80, cameraHeight: 0.85, leadRoom: 0.15, size: 'MCU' }, B: { type: 'two', beat: 'b2', a: A_, b: R_, size: 'FS', side: 1, cameraHeight: 0.8, azimuthOffset: -20 } });
B.shot({ id: 'sh060', name: '1F', beat: 'b2', size: 'MCU', subject: A_, lens: { focal_mm: 40, fstop: 2 }, rig: { type: 'static' }, duration_s: 5.5,
  intent: '"Posso?" Dal basso, da dove lo vede Rebecca: lei non alza gli occhi. Arthur raccoglie i fogli sparsi.',
  dialogue: [{ who: 'ARTHUR', line: 'Posso?', at: 1.0 }],
  sfx: [{ sound: 'crayon', at: 0.2, gain: 0.3, align: 'start' }, { sound: 'paper', at: 3.9, gain: 0.55 }],
  A: compose('childhood', { povOf: R_, side: undefined }) });
B.shot({ id: 'sh070', name: '1G', beat: 'b2', size: 'INSERT', subject: 'PROP_drawing_1', lens: { focal_mm: 50, fstop: 2.8 }, rig: { type: 'gimbal' }, duration_s: 4, curve: 'easeInOut', move: [0.2, 4],
  intent: 'Il primo disegno: tre figure. Una donna con un telefono, un uomo con una matita, in mezzo una bambina. Lentamente dentro.',
  sfx: [{ sound: 'paper', at: 0.15, gain: 0.35 }],
  A: { type: 'object', object: 'PROP_drawing_1', elevation: 68, azimuth: 20, fill: 0.62 }, B: { type: 'object', object: 'PROP_drawing_1', elevation: 72, azimuth: 20, fill: 0.86 } });
B.shot({ id: 'sh080', name: '1H', beat: 'b2', size: 'INSERT', subject: 'PROP_drawing_2', lens: { focal_mm: 50, fstop: 2.8 }, rig: { type: 'static' }, duration_s: 1.5,
  intent: 'Il secondo: le stesse figure.', sfx: [{ sound: 'paper', at: 0.1, gain: 0.4 }],
  A: { type: 'object', object: 'PROP_drawing_2', elevation: 70, azimuth: -10, fill: 0.78 } });
B.shot({ id: 'sh090', name: '1I', beat: 'b2', size: 'INSERT', subject: 'PROP_drawing_3', lens: { focal_mm: 50, fstop: 2.8 }, rig: { type: 'static' }, duration_s: 1.5,
  intent: 'Il terzo: le stesse. Mamma e papà senza piedi, galleggiano sopra la linea del prato.', sfx: [{ sound: 'paper', at: 0.1, gain: 0.4 }],
  A: { type: 'object', object: 'PROP_drawing_3', elevation: 70, azimuth: 30, fill: 0.84 } });
B.shot({ id: 'sh100', name: '1J', beat: 'b2', size: 'BCU', subject: A_, lens: { focal_mm: 75, fstop: 1.8 }, rig: { type: 'static' }, duration_s: 4,
  intent: 'Il sorriso di Arthur si spegne. Sfoglia ancora. Sempre senza piedi. Teniamo il silenzio.',
  A: compose('intimacy', { focal: 75, side: undefined }) });
B.shot({ id: 'sh110', name: '1K', beat: 'b2k', beatA: 'b2', beatB: 'b2k', size: 'FS', subject: A_, lens: { focal_mm: 50, fstop: 2 }, rig: { type: 'static' }, duration_s: 5.6, allowOcclusion: true,
  action: [1.0, 2.6],
  intent: 'Profilo basso: rimette i fogli in ordine, con cura. Si china e la bacia sulla testa. "Ti voglio bene, scimmietta." Lei continua a disegnare.',
  dialogue: [{ who: 'ARTHUR', line: 'Ti voglio bene, scimmietta.', at: 2.9 }],
  sfx: [{ sound: 'paper', at: 0.6, gain: 0.3 }],
  A: { type: 'single', beat: 'b2', azimuth: -90, cameraHeight: 0.5, size: 'FS', leadRoom: 0.22 } });
B.shot({ id: 'sh120', name: '1L', beat: 'b3', beatA: 'b2k', beatB: 'b3', size: 'MCU', subject: R_, lens: { focal_mm: 35, fstop: 2 }, rig: { type: 'handheld', lowMode: true, shake: 0.25, seed: 9 }, duration_s: 6.5, allowBackOfHead: true,
  action: { [A_]: [0.1, 3.4], [R_]: [4.3, 5.4] },
  intent: 'Restiamo con lei mentre Arthur si alza ed esce di quadro. Rebecca disegna, sola. Poi alza lo sguardo.',
  sfx: [{ sound: 'footsteps', at: 0.4, gain: 0.25, align: 'start' }, { sound: 'crayon', at: 1.6, gain: 0.35, align: 'start' }],
  A: compose('childhood', { beat: 'b3', focal: 35, side: undefined }) });
B.shot({ id: 'sh130', name: '1M', beat: 'b3', size: 'WS', subject: 'ENV_mountain_main', lens: { focal_mm: 40 }, rig: { type: 'handheld', seed: 5, lowMode: true, shake: 0.5 }, duration_s: 5.5, curve: 'easeInOutCubic', move: [0.6, 4.6], allowOcclusion: true,
  intent: 'Soggettiva di Rebecca, dal basso: oltre gli alberi la montagna dalla cima spezzata. Lento tilt sulle due punte.',
  notes: 'Le due punte appartengono alla stessa montagna: la copertura reciproca è voluta.',
  A: { type: 'raw', position: [2.6, 0.28, -3.45], target: [250, 110, -1100] }, B: { type: 'raw', position: [2.6, 0.28, -3.45], target: [285, 560, -1070] } });
B.shot({ id: 'sh140', name: '1N', beat: 'b3d', size: 'INSERT', subject: 'PROP_sheets', lens: { focal_mm: 65 }, rig: { type: 'static' }, duration_s: 3.6,
  intent: 'Prende un foglio nuovo e comincia a disegnarla.',
  sfx: [{ sound: 'crayon', at: 0.4, gain: 0.45, align: 'start' }],
  A: { type: 'object', object: 'PROP_sheets', elevation: 58, azimuth: -30, fill: 0.72 } });
// ---- 3. on the blanket
B.shot({ id: 'sh150', name: '1O', beat: 'b4', beatA: 'b4', beatB: 'b4c', size: 'FS', subject: C_, lens: { focal_mm: 40, fstop: 4 }, rig: { type: 'static' }, duration_s: 6.2, line: LINE,
  action: [4.0, 5.2],
  intent: 'Sul telo, due, il vuoto tra loro al centro. Arthur porge il sacchetto. Lei non alza gli occhi. Lui mangia una patatina.',
  dialogue: [{ who: 'ARTHUR', line: 'Ne vuoi?', at: -0.5 }, { who: 'CLAIRE', line: 'No, grazie.', at: 1.5 }],
  sfx: [{ sound: 'chips_bag', at: -0.2, gain: 0.35, align: 'start' }, { sound: 'chip_crunch', at: 5.0, gain: 0.45 }],
  A: { type: 'two', a: C_, b: A_, side: 1, cameraHeight: 1.0 } });
B.shot({ id: 'sh160', name: '1P', beat: 'b4c', size: 'INSERT', subject: 'PROP_phone', lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'static' }, duration_s: 2.4,
  intent: 'Lo sguardo di Arthur: il telefono nelle mani di lei.',
  dialogue: [{ who: 'ARTHUR', line: 'Che giorno è oggi?', at: 1.4, lap: true }],
  A: { type: 'object', object: 'PROP_phone', elevation: 35, azimuth: 150, fill: 0.45 } });
B.shot({ id: 'sh170', name: '1Q', beat: 'b4c', size: 'MCU', subject: C_, lens: { focal_mm: 75 }, rig: { type: 'static' }, duration_s: 4.6, line: LINE,
  intent: 'Claire, senza alzare gli occhi. La domanda finisce su di lei; lei si prende il suo tempo.',
  dialogue: [{ who: 'CLAIRE', line: 'Sabato. Perché?', at: 1.3 }],
  A: otsOnClaire() });
B.shot({ id: 'sh180', name: '1R', beat: 'b4c', size: 'MCU', subject: A_, lens: { focal_mm: 75 }, rig: { type: 'static' }, duration_s: 4.8, line: LINE,
  intent: 'Arthur. La sua battuta parte su di lei e arriva su di lui; poi ascolta la scusa.',
  dialogue: [{ who: 'ARTHUR', line: 'Sabato. Avevamo detto niente lavoro.', at: -0.6 }, { who: 'CLAIRE', line: 'È una cosa veloce.', at: 2.9 }],
  A: otsOnArthur() });
B.shot({ id: 'sh190', name: '1S', beat: 'b5', beatA: 'b4c', beatB: 'b5', size: 'MCU', subject: C_, lens: { focal_mm: 75 }, rig: { type: 'static' }, duration_s: 4.4, line: LINE,
  action: { [C_]: [2.0, 3.4], [A_]: [0.2, 1.4] },
  intent: '"È sempre una cosa veloce" la colpisce. Smette di scrivere. Posa il telefono sul telo, a faccia in giù.',
  dialogue: [{ who: 'ARTHUR', line: 'È sempre una cosa veloce.', at: -0.2 }],
  sfx: [{ sound: 'phone_down', at: 2.75, gain: 0.55 }],
  A: otsOnClaire() });
B.shot({ id: 'sh200', name: '1T', beat: 'b5', size: 'INSERT', subject: 'PROP_phone', lens: { focal_mm: 75, fstop: 2.8 }, rig: { type: 'static' }, duration_s: 2.0,
  intent: 'Il telefono a faccia in giù. Silenzio.',
  A: { type: 'object', object: 'PROP_phone', elevation: 58, azimuth: 30, fill: 0.55 } });
B.shot({ id: 'sh210', name: '1U', beat: 'b5', size: 'CU', subject: C_, lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'static' }, duration_s: 3.6, line: LINE,
  intent: 'Claire lo guarda, finalmente. Primo piano pulito: lo sguardo è l\'evento, la battuta viene dopo.',
  dialogue: [{ who: 'CLAIRE', line: 'Vuoi farlo adesso? Qui?', at: 0.9 }],
  A: compose('intimacy', { focal: 75, size: 'CU' }) });
B.shot({ id: 'sh220', name: '1V', beat: 'b5', size: 'CU', subject: A_, lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'static' }, duration_s: 3.3, line: LINE,
  intent: 'Arthur, primo piano pulito.',
  dialogue: [{ who: 'ARTHUR', line: 'Voglio solo una giornata. Una.', at: 0.3 }],
  A: compose('intimacy', { focal: 75, size: 'CU' }) });
B.shot({ id: 'sh230', name: '1W', beat: 'b5', size: 'CU', subject: C_, lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'slider' }, duration_s: 5.0, curve: 'easeInOutCubic', move: [0.3, 5.0], line: LINE,
  intent: 'Claire abbassa la voce. Il carrello entra lentissimo sul suo viso.',
  dialogue: [{ who: 'CLAIRE', line: 'Siamo qui per lei, Arthur. Lo sappiamo tutti e due.', at: 0.7, lap: true }],
  A: compose('intimacy', { focal: 75, size: 'CU' }), B: compose('intimacy', { focal: 75, size: 'BCU' }) });
B.shot({ id: 'sh240', name: '1X', beat: 'b5', size: 'MLS', subject: R_, lens: { focal_mm: 65, fstop: 8 }, rig: { type: 'static' }, duration_s: 2.8,
  intent: '"Lei." Dal telo, oltre l\'erba: Rebecca piccola e sola, disegna la montagna. Non sa niente.',
  A: { type: 'raw', position: [-0.3, 0.82, -0.35], target: [2.55, 0.03, -3.0], frame: { subject: R_, u: 0.75, v: 0.36 } } });
B.shot({ id: 'sh250', name: '1Y', beat: 'b5', size: 'CU', subject: A_, lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'static' }, duration_s: 2.9, line: LINE,
  intent: 'Arthur. Poi riceve la risposta, e la prima metà gli arriva in faccia.',
  dialogue: [{ who: 'ARTHUR', line: 'Anch\'io sono qui.', at: -0.5 }, { who: 'CLAIRE', line: 'Sei seduto qui. È diverso.', at: 1.6, lap: true }],
  A: compose('intimacy', { focal: 75, size: 'CU' }) });
B.shot({ id: 'sh260', name: '1Z', beat: 'b5', size: 'BCU', subject: C_, lens: { focal_mm: 85, fstop: 2 }, rig: { type: 'static' }, duration_s: 2.6, line: LINE,
  intent: 'Claire: "È diverso." Lo tiene.',
  A: compose('tension', { focal: 85, size: 'BCU', ffEq: [100, 140], vAngle: [-3, 3] }) });
B.shot({ id: 'sh270', name: '1AA', beat: 'b5', size: 'BCU', subject: A_, lens: { focal_mm: 85, fstop: 1.8 }, rig: { type: 'static' }, duration_s: 4.6, line: LINE,
  intent: 'Arthur apre la bocca. La richiude. Il silenzio dura. Poi, sotto, il telefono vibra contro il telo.',
  sfx: [{ sound: 'phone_buzz', at: 3.7, gain: 0.6, align: 'start' }],
  A: compose('tension', { focal: 85, size: 'BCU', ffEq: [100, 140], vAngle: [-3, 3] }) });
B.shot({ id: 'sh280', name: '1AB', beat: 'b6', size: 'INSERT', subject: 'PROP_phone', lens: { focal_mm: 100, fstop: 2.8 }, rig: { type: 'static' }, duration_s: 2.5,
  intent: 'Il telefono vibra, a faccia in giù.',
  sfx: [{ sound: 'phone_buzz', at: 1.0, gain: 0.55, align: 'start' }],
  A: { type: 'object', object: 'PROP_phone', elevation: 62, azimuth: 10, fill: 0.6 } });
B.shot({ id: 'sh290', name: '1AC', beat: 'b6t', beatA: 'b6', beatB: 'b6t', size: 'MCU', subject: C_, lens: { focal_mm: 50, fstop: 2 }, rig: { type: 'static' }, duration_s: 6.4, line: LINE,
  action: { [C_]: [3.8, 5.0] },
  intent: 'Lei lo guarda. Non lo prende. Teniamo. Poi lo prende.',
  A: compose('vulnerability', { beat: 'b6t', focal: 50, side: undefined }) });
B.shot({ id: 'sh300', name: '1AD', beat: 'b6t', size: 'INSERT', subject: 'PROP_grass_blade', lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'static' }, duration_s: 4.2, allowOcclusion: true,
  intent: 'Le dita di Arthur: strappa un filo d\'erba e lo arrotola. L\'unico gesto che lo tiene a terra.',
  sfx: [{ sound: 'grass', at: 0.9, gain: 0.5 }],
  A: { type: 'object', object: 'PROP_grass_blade', elevation: 55, azimuth: 150, fill: 0.3 } });
B.shot({ id: 'sh310', name: '1AE', beat: 'b6t', size: 'WS', subject: C_, lens: { focal_mm: 32, fstop: 5.6 }, rig: { type: 'crane', arm: 9 }, duration_s: 11, curve: 'easeInOutCubic', move: [1.4, 10.4], line: LINE,
  intent: 'Il braccio si alza piano: i due sul telo, il vuoto tra loro; oltre, Rebecca piccola sul prato con la sua montagna.',
  A: { type: 'two', a: C_, b: A_, size: 'FS', side: 1, cameraHeight: 1.0 }, B: { type: 'raw', position: [0.9, 5.2, 6.2], target: [1.1, 0.2, -1.2] } });

// ---------------------------------------------------------------- DP intents, edit tempo -----------------------
// What each frame must make the audience feel: the DP report judges every shot against it (see the
// director-of-photography skill). Composed shots already carry theirs; overrides tune a profile to this film.
const DP = {
  '1A': { intent: 'establish' }, '1B': { intent: 'establish', vAngle: [5, 70], notes: 'From the map to the people: the drone starts overhead.' },
  '1C': { intent: 'establish', grid: 'center' }, '1D': { intent: 'childhood' }, '1E': { intent: 'observation', ffEq: [40, 120], notes: 'He watches her, then walks to her: the Steadicam goes with him.' },
  '1G': { intent: 'detail' }, '1H': { intent: 'detail' }, '1I': { intent: 'detail' }, '1K': { intent: 'observation' },
  '1M': { intent: 'wonder', ffEq: [14, 60] }, '1N': { intent: 'detail' }, '1O': { intent: 'establish', grid: 'center' }, '1P': { intent: 'detail' },
  '1Q': { intent: 'conflict' }, '1R': { intent: 'conflict' }, '1S': { intent: 'conflict' }, '1T': { intent: 'detail' },
  '1X': { intent: 'isolation', ffEq: [60, 200], notes: 'Seen from the blanket, far away: small and alone on the quarter line.' },
  '1Z': { intent: 'tension', ffEq: [100, 140], vAngle: [-3, 3], notes: 'Short-sided at the peak: each looks into the near edge, no shared space left. The eye jumps across the cut to 1AA on purpose.' },
  '1AA': { intent: 'tension', ffEq: [100, 140], vAngle: [-3, 3], notes: 'Mirror of 1Z, short-sided.' },
  '1AB': { intent: 'detail' }, '1AD': { intent: 'detail' }, '1AE': { intent: 'isolation' },
};
for (const sh of B.scene.shots) if (DP[sh.name]) sh.dp = Object.assign({}, DP[sh.name], sh.dp || {}, DP[sh.name].vAngle || DP[sh.name].ffEq ? { vAngle: DP[sh.name].vAngle, ffEq: DP[sh.name].ffEq } : {});
B.scene.edit = { tempo: 'drama' };

// ---------------------------------------------------------------- ambience -----------------------------------
B.ambience([
  { sound: 'high', gain: 0.32, from: '1A', to: '1B', fadeIn: 1.5, fadeOut: 2.5 },
  { sound: 'clearing', gain: 0.2, from: '1B', fadeIn: 3.0, fadeOut: 3.0 },
]);

console.log('voiced lines:', B.voices(path.join(here, 'audio', 'sc001', 'voices.json')));
console.log(B.report());
console.log('saved', B.save(path.join(here, 'sc001.json')));
