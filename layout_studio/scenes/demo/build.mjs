// Public demo scene (fictional): a café terrace on a street corner, two characters, six shots.
import { createBuilder, rng } from '../_lib/build.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const B = createBuilder({
  project: 'DEMO',
  scene: { number: 1, heading: 'EXT. CAFÉ TERRACE - STREET CORNER - LATE AFTERNOON', int_ext: 'EXT', location: 'Street corner', time: 'LATE AFTERNOON', pages: '1', synopsis: 'Anna waits at a café table. Ben arrives late, sits, they argue quietly while the street keeps moving.' },
  world: { ground: { size: 160, color: '#6d6a63' }, sky: '#c9d6e3', sun: { azimuth: 240, elevation: 22 } },
});

// --- set: sidewalk, building, awning, street furniture -----------------------------------------
B.box('ENV_sidewalk', 'Sidewalk', 'ENV', [0, 0, 0], [30, 0.15, 6], { color: '#9a958c', source: 'inferred' });
B.box('ENV_building', 'Café building', 'SET', [0, 0, -6.5], [30, 12, 7], { color: '#b89a7a' });
B.box('ENV_awning', 'Awning', 'SET', [0, 3.0, -2.4], [8, 0.1, 2.2], { color: '#8a2f2f', rotation: [8, 0, 0] });
B.box('ENV_window', 'Café window', 'SET', [0, 0.8, -3.0], [6, 2.4, 0.1], { color: '#3a4a5a' });
B.box('ENV_door', 'Café door', 'SET', [4.5, 0.15, -3.0], [1.2, 2.3, 0.1], { color: '#4a2f1f' });
B.cylinder('PROP_lamppost', 'Lamppost', 'PROP', [-6, 0.15, 2.2], [0.2, 5.5, 0.2], { color: '#333' });
B.box('PROP_bench', 'Bench', 'PROP', [7, 0.15, 1.5], [1.8, 0.45, 0.5], { color: '#6b4a2a' });
B.box('PROP_planter', 'Planter', 'PROP', [-2.8, 0.15, 1.8], [1.2, 0.5, 0.5], { color: '#55634a' });
B.cone('PROP_shrub', 'Shrub', 'PROP', [-2.8, 0.65, 1.8], [1.0, 0.8, 1.0], { color: '#3f7a3a' });
B.box('PROP_car', 'Parked car', 'PROP', [3, 0, 6.5], [4.4, 1.45, 1.8], { color: '#2b3e5a', source: 'inferred' });
B.cylinder('PROP_table', 'Café table', 'HERO', [0, 0.15, 0.2], [0.8, 0.74, 0.8], { color: '#d8d3c8' });
B.box('PROP_chair_anna', 'Chair (Anna)', 'PROP', [-0.75, 0.15, 0.2], [0.45, 0.45, 0.45], { color: '#7a6a55' });
B.box('PROP_chair_ben', 'Chair (Ben)', 'PROP', [0.75, 0.15, 0.2], [0.45, 0.45, 0.45], { color: '#7a6a55' });
B.cylinder('PROP_cup', 'Coffee cup', 'PROP', [-0.15, 0.89, 0.1], [0.08, 0.09, 0.08], { color: '#f4f1ea' });
const r = rng(11);
for (let i = 0; i < 6; i++) B.tree(`ENV_tree_${i + 1}`, [-14 + i * 5.6, 0.15, 4.4], 3.5 + r(), 6 + r() * 2, { name: 'Street tree', color: '#4a7a3f', trunk: 0.45 });
B.box('ENV_building_far', 'Building across', 'ENV', [0, 0, 24], [40, 14, 10], { color: '#a99f90', source: 'inferred' });

// --- characters -------------------------------------------------------------------------------
B.standin('CHAR_anna', 'ANNA', 1.68, '#c2743b', [-0.75, 0.15, 0.2], 90, 'sit_chair');
B.standin('CHAR_ben', 'BEN', 1.84, '#3b6ea5', [6, 0.15, 1.0], 270, 'walk');

// --- beats ------------------------------------------------------------------------------------
B.beat('b1', 'Anna waits; Ben arrives from the corner', 0, 10, {
  CHAR_anna: { position: [-0.75, 0.15, 0.2], facing: 90, pose: 'sit_chair' },
  CHAR_ben: { position: [6, 0.15, 1.0], facing: 270, pose: 'walk' },
});
B.beat('b2', 'Ben sits; the argument', 10, 60, {
  CHAR_anna: { position: [-0.75, 0.15, 0.2], facing: 90, pose: 'sit_chair' },
  CHAR_ben: { position: [0.75, 0.15, 0.2], facing: 270, pose: 'sit_chair' },
});

// --- shots ------------------------------------------------------------------------------------
B.shot({ id: 'sh010', name: '1A', beat: 'b1', size: 'WS', subject: 'CHAR_anna', intent: 'Establishing: Anna alone at the table, the street alive around her; slow push.', lens: { focal_mm: 27 }, rig: { type: 'dolly' }, duration_s: 8, curve: 'cinematic', wantForeground: true,
  A: { type: 'single', azimuth: -40, cameraHeight: 1.3, distance: 11, leadRoom: 0.15 }, B: { type: 'single', azimuth: -40, cameraHeight: 1.3, distance: 7.5, leadRoom: 0.15 } });
B.shot({ id: 'sh020', name: '1B', beat: 'b1', beatA: 'b1', beatB: 'b2', size: 'MS', subject: 'CHAR_ben', intent: 'Steadicam follows Ben from the corner to the chair.', lens: { focal_mm: 32 }, rig: { type: 'steadicam' }, duration_s: 9,
  A: { type: 'single', azimuth: 30, cameraHeight: 1.5, leadRoom: 0.18 }, B: { type: 'two', a: 'CHAR_anna', b: 'CHAR_ben', size: 'FS', side: 1, cameraHeight: 1.25 } });
B.shot({ id: 'sh030', name: '1C', beat: 'b2', size: 'FS', subject: 'CHAR_anna', intent: 'Two-shot across the table, awning and window behind.', lens: { focal_mm: 40 }, rig: { type: 'static' }, duration_s: 10, line: ['CHAR_anna', 'CHAR_ben'],
  A: { type: 'two', a: 'CHAR_anna', b: 'CHAR_ben', side: 1, cameraHeight: 1.2 } });
B.shot({ id: 'sh040', name: '1D', beat: 'b2', size: 'MCU', subject: 'CHAR_anna', intent: 'OTS on Anna.', lens: { focal_mm: 50 }, rig: { type: 'static' }, duration_s: 8, line: ['CHAR_anna', 'CHAR_ben'],
  A: { type: 'ots', fg: 'CHAR_ben', bg: 'CHAR_anna', side: 1, fitSize: 'MCU' } });
B.shot({ id: 'sh050', name: '1E', beat: 'b2', size: 'MCU', subject: 'CHAR_ben', intent: 'OTS on Ben.', lens: { focal_mm: 50 }, rig: { type: 'static' }, duration_s: 8, line: ['CHAR_anna', 'CHAR_ben'],
  A: { type: 'ots', fg: 'CHAR_anna', bg: 'CHAR_ben', side: -1, fitSize: 'MCU' } });
B.shot({ id: 'sh060', name: '1F', beat: 'b2', size: 'CU', subject: 'CHAR_anna', intent: 'Clean close-up, slow slider drift.', lens: { focal_mm: 75, fstop: 2 }, rig: { type: 'slider' }, duration_s: 6, curve: 'easeInOut', line: ['CHAR_anna', 'CHAR_ben'],
  A: { type: 'single', azimuth: -35, cameraHeight: 1.15 }, B: { type: 'single', azimuth: -22, cameraHeight: 1.15 } });

console.log(B.report());
console.log('saved', B.save(path.join(here, 'street_corner.json')));
