// DP report: every shot read against its intent (grid, look room, headroom, angle, face, lens, mergers) and the
// coverage rules across shots (matched reverse singles, lens family).
// usage: node tools/dp_report.mjs <scene.json> [--shots 1A,1B] [--md out.md] [--json out.json]
import fs from 'node:fs';
import * as core from '../core/index.js';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const file = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (!file) { console.error('usage: node tools/dp_report.mjs <scene.json> [--shots 1A,1B] [--md out.md] [--json out.json]'); process.exit(2); }
const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
const rep = core.dpReport(scene, { shots: opt('shots', '') ? opt('shots', '').split(',') : null });
console.log(`DP ${rep.score}/100 · lenses ${rep.lenses.join(', ')} mm · sizes ${Object.entries(rep.sizes).map(([k, v]) => `${k} ${v}`).join(' ')}`);
for (const c of rep.coverage) console.log(`  reverse ${c.pair.join(' ↔ ')}: ${c.matched ? 'matched' : c.issues.join('; ')}`);
for (const r of rep.shots) {
  console.log(`${r.name.padEnd(5)} ${String(r.size).padEnd(6)} ${String(r.focal_mm).padStart(3)}mm ${r.intent.padEnd(13)} ${String(r.score).padStart(3)}`);
  for (const f of r.frames) for (const n of f.notes) if (n.level !== 'info' || n.cost >= 3) console.log(`      ${r.frames.length > 1 ? f.key + ' ' : ''}${n.level === 'info' ? '·' : n.level === 'warn' ? '⚠' : '✖'} ${n.msg}${n.fix ? ` → ${n.fix}` : ''}`);
}
if (opt('md')) { fs.writeFileSync(opt('md'), core.dpReportMarkdown(scene, rep)); console.log('markdown:', opt('md')); }
if (opt('json')) { fs.writeFileSync(opt('json'), JSON.stringify(rep, null, 1)); console.log('json:', opt('json')); }
