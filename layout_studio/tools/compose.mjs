// Compose one shot from a narrative intent with the DP composer and print the result (lens, angle, placement, why,
// alternatives). --apply writes the keys, lens and a 'compose' framing into the scene JSON (scenes with a build script:
// put the framing { type: 'compose', intent, ... } in the build script instead and rebuild).
// usage: node tools/compose.mjs <scene.json> <shot name|id> --intent intimacy [--size CU] [--side 1|-1] [--focal 65]
//                               [--grid thirds|phi|quarters|center] [--look long|short|centre] [--apply]
import fs from 'node:fs';
import * as core from '../core/index.js';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (pos.length < 2) { console.error('usage: node tools/compose.mjs <scene.json> <shot> --intent intimacy [--size CU] [--side 1] [--focal 65] [--apply]'); process.exit(2); }
const scene = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
const shot = scene.shots.find((s) => s.name === pos[1] || s.id === pos[1]);
if (!shot) { console.error('no shot ' + pos[1]); process.exit(2); }
const def = { type: 'compose', intent: opt('intent', (shot.dp && shot.dp.intent) || 'neutral') };
for (const k of ['size', 'grid', 'look']) if (opt(k)) def[k] = opt(k);
for (const k of ['side', 'focal']) if (opt(k)) def[k] = +opt(k);
const before = core.dpShotReport(scene, Object.assign({}, shot, { dp: Object.assign({}, shot.dp || {}, { intent: def.intent }) }));
const r = core.compose(scene, shot, def);
console.log(`${shot.name}: ${def.intent} · before ${before.score}/100 → composed ${r.analysis.score}/100 (shot check ${r.check.score})`);
for (const w of r.why) console.log('  ' + w);
console.log(`  position ${r.position.join(', ')} · target ${r.target.join(', ')} · ${r.focal_mm} mm`);
for (const n of r.analysis.notes) console.log(`  ${n.level === 'info' ? '·' : '⚠'} ${n.msg}${n.fix ? ` → ${n.fix}` : ''}`);
if (r.alternatives.length) console.log('  alternatives: ' + r.alternatives.map((a) => `${a.focal_mm}mm az ${a.azimuth}° v ${a.vAngle}° (${a.composition})`).join(' · '));
if (args.includes('--apply')) {
  shot.camera.focal_mm = r.focal_mm; shot.camera.focus_m = r.distance;
  shot.keys = { A: { position: r.position, target: r.target, roll: r.roll || 0 }, B: shot.rig && shot.rig.type !== 'static' ? shot.keys.B : null };
  shot.framing = Object.assign({}, shot.framing || {}, { A: def });
  shot.dp = Object.assign({}, shot.dp || {}, { intent: r.intent, why: r.why });
  fs.writeFileSync(pos[0], JSON.stringify(scene, null, 2));
  console.log('applied to ' + pos[0]);
}
