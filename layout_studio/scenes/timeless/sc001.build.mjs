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
B.box('PROP_basket', 'Cestino', 'PROP', [0.15, 0.02, 0.5], [0.45, 0.28, 0.3], { color: '#b08a5a', source: 'inferred' });
B.cylinder('PROP_plate', 'Piatto dei panini', 'PROP', [0.55, 0.02, 0.35], [0.32, 0.03, 0.32], { color: '#e9e4d8', source: 'script' });
B.cylinder('PROP_bottle_1', 'Bibita', 'PROP', [-0.1, 0.02, 0.6], [0.07, 0.24, 0.07], { color: '#3a5f8a', source: 'script' });
B.cylinder('PROP_bottle_2', 'Bibita', 'PROP', [0.0, 0.02, 0.62], [0.07, 0.24, 0.07], { color: '#8a3a3a', source: 'script' });
B.box('PROP_chips', 'Sacchetto di patatine', 'PROP', [0.3, 0.02, 0.15], [0.18, 0.22, 0.08], { color: '#d9b43a', source: 'script' });
B.box('PROP_phone', 'Telefono di Claire (a faccia in giù)', 'PROP', [-0.35, 0.022, 0.42], [0.07, 0.01, 0.15], { color: '#222', source: 'script' });

// Rebecca's corner
B.box('PROP_teddy', 'Orsacchiotto (orecchio scucito)', 'HERO', [2.28, 0, -3.3], [0.22, 0.3, 0.14], { color: '#a67c52', source: 'script' });
B.box('PROP_drawing_1', 'Disegno 1 (tre figure)', 'HERO', [2.35, 0.002, -3.55], [0.3, 0.004, 0.21], { color: '#efe9d8', rotation: [0, 10, 0], source: 'script' });
B.box('PROP_drawing_2', 'Disegno 2', 'PROP', [2.72, 0.002, -3.62], [0.3, 0.004, 0.21], { color: '#efe9d8', rotation: [0, -8, 0], source: 'script' });
B.box('PROP_drawing_3', 'Disegno 3', 'PROP', [2.52, 0.006, -3.3], [0.3, 0.004, 0.21], { color: '#efe9d8', rotation: [0, 4, 0], source: 'script' });
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

// acting adjustments on top of the library poses (see core/standin.js)
const ARTHUR_SANDWICHES = { base: 'sit_ground', spine: { pitch: 30 }, shoulder: { flex: 62, abd: 10 }, elbow: { flex: 44 }, head: { pitch: 22 } };
const ARTHUR_CHIPS = { base: 'sit_ground', shoulderR: { flex: 72, abd: 22 }, elbowR: { flex: 46 }, head: { pitch: 4 } };
const ARTHUR_PICKS_UP = { base: 'crouch', head: { pitch: 10 }, shoulder: { flex: 72, abd: 10 }, elbow: { flex: 34 } }; // sheets lifted toward the face
const CLAIRE_PHONE = { base: 'sit_ground', neck: { pitch: 6 }, head: { pitch: 18 }, shoulder: { flex: 34, abd: 16 }, elbow: { flex: 124 }, wrist: { flex: 18 } }; // phone at chest height
const REBECCA_DRAWS = { base: 'lie_prone', head: { pitch: 30 } };
const REBECCA_LOOKS_UP = { base: 'lie_prone', neck: { pitch: -32 }, head: { pitch: -6 } };
const ARTHUR_TALKS = { base: 'sit_ground', spine: { pitch: 24 }, head: { pitch: -4 } };
const ARTHUR_GRASS = { base: 'sit_ground', spine: { pitch: 26 }, head: { pitch: 30 }, shoulder: { flex: 46, abd: 8 }, elbow: { flex: 96 } };
const CLAIRE_FACES = { base: 'sit_ground', spine: { pitch: 22 }, head: { pitch: -2 } };
const ARTHUR_LOOKS = { base: 'sit_ground', spine: { pitch: 10, yaw: 12 }, head: { pitch: 0, yaw: 10 } }; // turned toward Rebecca, chin up

// ---------------------------------------------------------------- beats --------------------------------------
B.beat('b1', 'Radura: Arthur sistema i panini, Claire al telefono, Rebecca disegna sul prato', 0, 12, {
  CHAR_arthur: { position: [0.55, 0, 0], facing: 340, pose: ARTHUR_SANDWICHES },
  CHAR_claire: { position: [-0.55, 0, 0.1], facing: 15, pose: CLAIRE_PHONE },
  CHAR_rebecca: { position: [2.6, 0, -2.8], facing: 180, pose: REBECCA_DRAWS },
});
B.beat('b1b', 'Arthur alza gli occhi dai panini e si gira a guardare Rebecca', 12, 14, {
  CHAR_arthur: { position: [0.55, 0, 0], facing: 120, pose: ARTHUR_LOOKS },
  CHAR_claire: { position: [-0.55, 0, 0.1], facing: 15, pose: CLAIRE_PHONE },
  CHAR_rebecca: { position: [2.6, 0, -2.8], facing: 180, pose: REBECCA_DRAWS },
});
B.beat('b2', 'Arthur si avvicina, si accovaccia accanto a Rebecca, guarda i disegni, la bacia', 14, 44, {
  CHAR_arthur: { position: [1.9, 0, -2.6], facing: 110, pose: ARTHUR_PICKS_UP },
  CHAR_claire: { position: [-0.55, 0, 0.1], facing: 15, pose: CLAIRE_PHONE },
  CHAR_rebecca: { position: [2.6, 0, -2.8], facing: 180, pose: REBECCA_DRAWS },
});
B.beat('b3', 'Arthur torna al telo. Rebecca alza lo sguardo: la montagna oltre gli alberi. Foglio nuovo', 44, 54, {
  CHAR_arthur: { position: [0.55, 0, 0], facing: 340, pose: 'sit_ground' },
  CHAR_claire: { position: [-0.55, 0, 0.1], facing: 15, pose: CLAIRE_PHONE },
  CHAR_rebecca: { position: [2.6, 0, -2.8], facing: 180, pose: REBECCA_LOOKS_UP },
});
B.beat('b4', 'Sul telo: le patatine, "che giorno è oggi", Claire al telefono', 54, 80, {
  CHAR_arthur: { position: [0.55, 0, 0], facing: 276, pose: ARTHUR_CHIPS },
  CHAR_claire: { position: [-0.55, 0, 0.1], facing: 90, pose: CLAIRE_PHONE },
  CHAR_rebecca: { position: [2.6, 0, -2.8], facing: 180, pose: REBECCA_DRAWS },
});
B.beat('b5', 'Claire posa il telefono a faccia in giù: il confronto', 80, 108, {
  CHAR_arthur: { position: [0.55, 0, 0], facing: 276, pose: ARTHUR_TALKS },
  CHAR_claire: { position: [-0.55, 0, 0.1], facing: 90, pose: CLAIRE_FACES },
  CHAR_rebecca: { position: [2.6, 0, -2.8], facing: 180, pose: REBECCA_DRAWS },
});
B.beat('b6', 'Il telefono vibra: Claire lo guarda, poi lo prende. Arthur strappa un filo d\'erba', 108, 125, {
  CHAR_arthur: { position: [0.55, 0, 0], facing: 290, pose: ARTHUR_GRASS },
  CHAR_claire: { position: [-0.55, 0, 0.1], facing: 90, pose: CLAIRE_PHONE },
  CHAR_rebecca: { position: [2.6, 0, -2.8], facing: 180, pose: REBECCA_DRAWS },
});

// ---------------------------------------------------------------- shots --------------------------------------
const LINE = ['CHAR_claire', 'CHAR_arthur'];
const ts = B.core.solveTwoShot({ a: B.char('CHAR_claire', 'b1'), b: B.char('CHAR_arthur', 'b1'), size: 'FS', lens: { focal_mm: 32 }, side: 1, cameraHeight: 0.85 });

B.shot({ id: 'sh010', name: '1A', beat: 'b1', size: 'EWS', subject: null, intent: 'Apertura: il mare di pini, Rushmore lontano; scendendo la montagna dalla cima spezzata si alza più vicina, poi il telo nella radura.', lens: { focal_mm: 18 }, rig: { type: 'drone' }, duration_s: 18, curve: [0.55, 0, 0.45, 1], notes: 'Drone. Da riprendere in location con il sole basso; qui serve solo per il timing della rivelazione.',
  A: { type: 'raw', position: [12, 95, 60], target: [-1200, 110, -2600] }, B: { type: 'raw', position: [4.5, 10, 17], target: [1.0, 0.5, -1.0] } });
B.shot({ id: 'sh020', name: '1B', beat: 'b1', size: 'WS', subject: 'CHAR_arthur', intent: 'Campo del telo, lento push-in oltre l\'erba in primo piano: Arthur e Claire ai due lati, il mezzo metro vuoto al centro; Rebecca piccola sul prato dietro di loro.', lens: { focal_mm: 32 }, rig: { type: 'dolly' }, duration_s: 9, curve: 'easeInOutCubic', wantForeground: true, line: LINE,
  A: { type: 'two', a: 'CHAR_claire', b: 'CHAR_arthur', size: 'WS', side: 1, cameraHeight: 0.85, distance: +(ts.distance + 2.2).toFixed(2) }, B: { type: 'two', a: 'CHAR_claire', b: 'CHAR_arthur', size: 'FS', side: 1, cameraHeight: 0.85, wantForeground: false } });
B.shot({ id: 'sh030', name: '1C', beat: 'b1', size: 'MS', subject: 'CHAR_rebecca', intent: 'Rebecca a pancia in giù disegna, orsacchiotto in primo piano, i genitori sfocati sullo sfondo.', lens: { focal_mm: 35, fstop: 2 }, rig: { type: 'static' }, duration_s: 6, wantForeground: true,
  A: { type: 'single', azimuth: -55, cameraHeight: 0.32, leadRoom: 0.1 } });
B.shot({ id: 'sh040', name: '1D', beat: 'b2', beatA: 'b1b', beatB: 'b2', size: 'FS', subject: 'CHAR_arthur', intent: 'Arthur la guarda, si alza e la raggiunge: Steadicam lo segue dal telo fino a Rebecca e si posa sul due.', lens: { focal_mm: 40 }, rig: { type: 'steadicam', follow: true, followVertical: 1 }, duration_s: 10, curve: 'easeInOut',
  A: { type: 'single', beat: 'b1b', azimuth: -80, cameraHeight: 0.85, leadRoom: 0.15, size: 'MCU' }, B: { type: 'two', beat: 'b2', a: 'CHAR_arthur', b: 'CHAR_rebecca', size: 'FS', side: 1, cameraHeight: 0.8, azimuthOffset: -20 } });
B.shot({ id: 'sh050', name: '1E', beat: 'b2', size: 'MCU', subject: 'CHAR_arthur', intent: '"Posso?" Arthur accovacciato raccoglie i fogli e li guarda. Macchina a mano appena viva.', lens: { focal_mm: 65, fstop: 2 }, rig: { type: 'handheld', seed: 3, shake: 0.8 }, duration_s: 8, dialogue: [{ who: 'ARTHUR', line: 'Posso?' }],
  A: { type: 'single', azimuth: -35, cameraHeight: 0.75 }, B: { type: 'single', azimuth: -35, cameraHeight: 0.75 } }); // below his eyes: he looks down at the sheets
B.shot({ id: 'sh060', name: '1F', beat: 'b2', size: 'INSERT', subject: 'PROP_drawing_1', intent: 'Inserto: il disegno. Tre figure. La mamma e il papà senza piedi, galleggiano sopra la linea del prato.', lens: { focal_mm: 75, fstop: 2.8 }, rig: { type: 'static' }, duration_s: 4,
  A: { type: 'object', object: 'PROP_drawing_1', elevation: 72, azimuth: 20, fill: 0.75 } });
B.shot({ id: 'sh070', name: '1G', beat: 'b2', size: 'BCU', subject: 'CHAR_arthur', intent: 'Il sorriso di Arthur si spegne. Sfoglia ancora. Sempre senza piedi.', lens: { focal_mm: 75, fstop: 1.8 }, rig: { type: 'static' }, duration_s: 5,
  A: { type: 'single', azimuth: -15, cameraHeight: 0.62, leadRoom: 0.1 } }); // low: the smile fading has to read
B.shot({ id: 'sh080', name: '1H', beat: 'b2', beatA: 'b2', beatB: 'b3', size: 'FS', subject: 'CHAR_arthur', intent: 'Profilo: Arthur bacia Rebecca sulla testa, "Ti voglio bene, scimmietta", si alza e torna al telo; la macchina panoramica con lui e ritrova Claire.', lens: { focal_mm: 35 }, rig: { type: 'static', aim: 'subject' }, duration_s: 9, curve: 'holdMoveHold', dialogue: [{ who: 'ARTHUR', line: 'Ti voglio bene, scimmietta.' }],
  A: { type: 'two', beat: 'b2', a: 'CHAR_arthur', b: 'CHAR_rebecca', size: 'FS', side: -1, cameraHeight: 0.9, margin: 0.1 }, B: { type: 'single', beat: 'b3', azimuth: 40, cameraHeight: 0.9, size: 'WS' } });
B.shot({ id: 'sh090', name: '1I', beat: 'b3', size: 'CU', subject: 'CHAR_rebecca', intent: 'Rebecca alza lo sguardo oltre la macchina: la montagna. La fissa.', lens: { focal_mm: 65, fstop: 2 }, rig: { type: 'static' }, duration_s: 5,
  A: { type: 'single', azimuth: 15, cameraHeight: 0.3, leadRoom: 0.05 } });
B.shot({ id: 'sh100', name: '1J', beat: 'b3', size: 'WS', subject: 'ENV_mountain_main', intent: 'Soggettiva di Rebecca: oltre gli alberi, la montagna dalla cima spezzata. Lento tilt verso la vetta.', lens: { focal_mm: 40 }, rig: { type: 'handheld', seed: 5, lowMode: true, shake: 0.7 }, duration_s: 6, curve: 'easeInOutCubic',
  A: { type: 'raw', position: [2.6, 0.32, -2.3], target: [250, 120, -1100] }, B: { type: 'raw', position: [2.6, 0.32, -2.3], target: [250, 630, -1100] } });
B.shot({ id: 'sh110', name: '1K', beat: 'b3', size: 'INSERT', subject: 'PROP_sheets', intent: 'Inserto: prende un foglio nuovo e comincia a disegnare la montagna.', lens: { focal_mm: 75 }, rig: { type: 'static' }, duration_s: 3,
  A: { type: 'object', object: 'PROP_sheets', elevation: 55, azimuth: -30, fill: 0.7 } });
// ---- on the blanket: the confrontation, covered line by line (180° line Claire–Arthur, camera south) ----
const A_ = 'CHAR_arthur', C_ = 'CHAR_claire';
const otsOnArthur = (fit) => ({ type: 'ots', fg: C_, bg: A_, side: -1, fitSize: fit });
const otsOnClaire = (fit) => ({ type: 'ots', fg: A_, bg: C_, side: 1, fitSize: fit, heightOffset: -0.06 }); // just under the shoulder line: her face, not her crown
B.shot({ id: 'sh120', name: '1L', beat: 'b4', size: 'FS', subject: C_, intent: 'Sul telo, due. Arthur porge a Claire un sacchetto di patatine. Il mezzo metro vuoto tra loro al centro del quadro.', lens: { focal_mm: 40 }, rig: { type: 'static' }, duration_s: 6, line: LINE,
  dialogue: [{ who: 'ARTHUR', line: 'Ne vuoi?' }, { who: 'CLAIRE', line: 'No, grazie.' }],
  A: { type: 'two', a: C_, b: A_, side: 1, cameraHeight: 1.0 } });
B.shot({ id: 'sh130', name: '1M', beat: 'b4', size: 'MCU', subject: A_, intent: 'Arthur mangia una patatina. Guarda il telefono nelle mani di lei.', lens: { focal_mm: 50 }, rig: { type: 'static' }, duration_s: 4, line: LINE,
  dialogue: [{ who: 'ARTHUR', line: 'Che giorno è oggi?' }], A: otsOnArthur('MCU') });
B.shot({ id: 'sh140', name: '1N', beat: 'b4', size: 'MCU', subject: C_, intent: 'Claire risponde senza alzare gli occhi dal telefono.', lens: { focal_mm: 50 }, rig: { type: 'static' }, duration_s: 3.5, line: LINE,
  dialogue: [{ who: 'CLAIRE', line: 'Sabato. Perché?' }], A: otsOnClaire('MCU') });
B.shot({ id: 'sh150', name: '1O', beat: 'b4', size: 'MCU', subject: A_, intent: 'Arthur insiste, a voce bassa.', lens: { focal_mm: 50 }, rig: { type: 'static' }, duration_s: 4, line: LINE,
  dialogue: [{ who: 'ARTHUR', line: 'Sabato. Avevamo detto niente lavoro.' }], A: otsOnArthur('MCU') });
B.shot({ id: 'sh160', name: '1P', beat: 'b4', size: 'MCU', subject: C_, intent: 'Claire, gli occhi sempre sullo schermo.', lens: { focal_mm: 50 }, rig: { type: 'static' }, duration_s: 3, line: LINE,
  dialogue: [{ who: 'CLAIRE', line: 'È una cosa veloce.' }], A: otsOnClaire('MCU') });
B.shot({ id: 'sh170', name: '1Q', beat: 'b4', size: 'CU', subject: A_, intent: 'Più stretti su Arthur.', lens: { focal_mm: 65 }, rig: { type: 'static' }, duration_s: 3.5, line: LINE,
  dialogue: [{ who: 'ARTHUR', line: 'È sempre una cosa veloce.' }], A: otsOnArthur('CU') });
B.shot({ id: 'sh180', name: '1R', beat: 'b5', size: 'INSERT', subject: 'PROP_phone', intent: 'Claire posa il telefono sul telo, a faccia in giù.', lens: { focal_mm: 75, fstop: 2.8 }, rig: { type: 'static' }, duration_s: 3,
  A: { type: 'object', object: 'PROP_phone', elevation: 58, azimuth: 30, fill: 0.55 } });
B.shot({ id: 'sh190', name: '1S', beat: 'b5', size: 'CU', subject: C_, intent: 'Claire lo guarda, finalmente.', lens: { focal_mm: 65 }, rig: { type: 'static' }, duration_s: 3.5, line: LINE,
  dialogue: [{ who: 'CLAIRE', line: 'Vuoi farlo adesso? Qui?' }], A: otsOnClaire('CU') });
B.shot({ id: 'sh200', name: '1T', beat: 'b5', size: 'CU', subject: A_, intent: 'Arthur.', lens: { focal_mm: 65 }, rig: { type: 'static' }, duration_s: 4, line: LINE,
  dialogue: [{ who: 'ARTHUR', line: 'Voglio solo una giornata. Una.' }], A: otsOnArthur('CU') });
B.shot({ id: 'sh210', name: '1U', beat: 'b5', size: 'CU', subject: C_, intent: 'Claire abbassa la voce. Il carrello entra lentissimo sul suo viso, primo piano pulito.', lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'slider' }, duration_s: 6, curve: 'easeInOutCubic', line: LINE,
  dialogue: [{ who: 'CLAIRE', line: 'Siamo qui per lei, Arthur.' }, { who: 'CLAIRE', line: 'Lo sappiamo tutti e due.' }],
  A: { type: 'single', azimuth: -28, cameraHeight: 0.9, size: 'CU' }, B: { type: 'single', azimuth: -24, cameraHeight: 0.9, size: 'BCU' } });
B.shot({ id: 'sh220', name: '1V', beat: 'b5', size: 'CU', subject: A_, intent: 'Arthur, primo piano pulito.', lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'static' }, duration_s: 3, line: LINE,
  dialogue: [{ who: 'ARTHUR', line: 'Anch\'io sono qui.' }], A: { type: 'single', azimuth: 26, cameraHeight: 0.95 } });
B.shot({ id: 'sh230', name: '1W', beat: 'b5', size: 'CU', subject: C_, intent: 'Claire.', lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'static' }, duration_s: 4, line: LINE,
  dialogue: [{ who: 'CLAIRE', line: 'Sei seduto qui. È diverso.' }], A: { type: 'single', azimuth: -24, cameraHeight: 0.9, size: 'BCU' } });
B.shot({ id: 'sh240', name: '1X', beat: 'b5', size: 'BCU', subject: A_, intent: 'Arthur apre la bocca. La richiude.', lens: { focal_mm: 85, fstop: 1.8 }, rig: { type: 'static' }, duration_s: 4, line: LINE,
  A: { type: 'single', azimuth: 22, cameraHeight: 0.95 } });
B.shot({ id: 'sh250', name: '1Y', beat: 'b6', size: 'INSERT', subject: 'PROP_phone', intent: 'Il telefono di Claire vibra contro il telo.', lens: { focal_mm: 100, fstop: 2.8 }, rig: { type: 'static' }, duration_s: 3,
  A: { type: 'object', object: 'PROP_phone', elevation: 62, azimuth: 10, fill: 0.6 } });
B.shot({ id: 'sh260', name: '1Z', beat: 'b6', size: 'FS', subject: C_, intent: 'Lei lo guarda. Non lo prende. Poi lo prende. Arthur strappa un filo d\'erba e lo arrotola tra le dita. Il carrello si allontana piano.', lens: { focal_mm: 40 }, rig: { type: 'dolly' }, duration_s: 10, curve: 'easeInOutCubic', line: LINE,
  A: { type: 'two', a: C_, b: A_, size: 'FS', side: 1, cameraHeight: 0.95 }, B: { type: 'two', a: C_, b: A_, size: 'WS', side: 1, cameraHeight: 0.95 } });

console.log(B.report());
console.log('saved', B.save(path.join(here, 'sc001.json')));
