// Edit report: each cut (eye-trace, 30° rule, 180° line, eyelines, screen direction, sound across the cut), each shot's
// timing against what it carries (lines, move, action, reading), and the rhythm of the scene (ASL, CV, acceleration).
// usage: node tools/edit_report.mjs <scene.json> [--tempo drama|dialogue|tension|action|contemplative] [--md out.md] [--json out.json]
import fs from 'node:fs';
import * as core from '../core/index.js';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const file = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (!file) { console.error('usage: node tools/edit_report.mjs <scene.json> [--tempo drama] [--md out.md] [--json out.json]'); process.exit(2); }
const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
const rep = core.editReview(scene, { tempo: opt('tempo', null) });
const p = rep.pacing;
console.log(`edit ${rep.score}/100 · craft ${rep.craft} · ${p.shots} shots ${rep.duration}s · ASL ${p.asl}s median ${p.median}s CV ${p.cv} · accel ${p.accel}× · J ${rep.dialogue.j} L ${rep.dialogue.l} · reactions ${rep.dialogue.reactions}`);
for (const n of rep.notes) console.log(`  ${n.level === 'warn' ? '⚠' : '·'} ${n.shot ? n.shot + ': ' : ''}${n.msg}${n.fix ? ` → ${n.fix}` : ''}`);
for (const c of rep.cuts) if (c.notes.length) for (const n of c.notes) console.log(`  ${c.from} → ${c.to}: ${n.level === 'info' ? '·' : '⚠'} ${n.msg}${n.fix ? ` → ${n.fix}` : ''}`);
if (opt('md')) { fs.writeFileSync(opt('md'), core.editReviewMarkdown(scene, rep)); console.log('markdown:', opt('md')); }
if (opt('json')) { fs.writeFileSync(opt('json'), JSON.stringify(rep, null, 1)); console.log('json:', opt('json')); }
