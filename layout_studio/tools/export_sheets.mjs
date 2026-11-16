// Write the paperwork of a scene next to it: camera sheet, Blender script, DP report and edit report.
// usage: node tools/export_sheets.mjs <scene.json> [--tempo drama]
import fs from 'node:fs';
import path from 'node:path';
import * as core from '../core/index.js';
const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (!file) { console.error('usage: node tools/export_sheets.mjs <scene.json> [--tempo drama]'); process.exit(2); }
const ti = args.indexOf('--tempo'), tempo = ti >= 0 ? args[ti + 1] : null;
const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = file.replace(/\.json$/, '');
const evs = {};
for (const sh of scene.shots || []) {
  try { const size = (sh.framing && sh.framing.A && sh.framing.A.size) || sh.size; evs[sh.id] = core.evaluateFrame(scene, sh, core.solveShot(scene, sh).pose(0), core.blockingAt(scene, sh, 0), { expectedSize: size }); } catch (e) { /* a shot without a subject */ }
}
const out = {
  [`${base}_camera_sheet.md`]: core.toCameraSheet(scene, evs),
  [`${base}_blender.py`]: core.toBlenderScript(scene),
  [`${base}_dp_report.md`]: core.dpReportMarkdown(scene, core.dpReport(scene)),
  [`${base}_edit_report.md`]: core.editReviewMarkdown(scene, core.editReview(scene, { tempo })),
};
for (const [f, text] of Object.entries(out)) { fs.writeFileSync(f, text); console.log('wrote', path.relative(process.cwd(), f)); }
