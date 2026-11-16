// Contact sheet: one frame (or the two ends of a moving shot) of every shot, tiled, each with the composition grid,
// the shot's size, lens and DP intent, and the DP and edit scores. The visual check the DP and editor skills use.
// usage: node tools/contact_sheet.mjs <scene.json> <out.png> [--shots 1A,1B] [--t auto|0.5|0,1] [--grid thirds|phi|quarters|center|none]
//                                     [--width 480] [--cols 4] [--ss 1]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const pos = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (pos.length < 2) { console.error('usage: node tools/contact_sheet.mjs <scene.json> <out.png> [--shots 1A,1B] [--t auto] [--grid thirds] [--width 480] [--cols 4]'); process.exit(2); }
const sceneFile = path.resolve(pos[0]), out = path.resolve(pos[1]);
const rel = path.relative(root, sceneFile);
if (rel.startsWith('..')) { console.error('the scene file must be inside the layout_studio folder'); process.exit(2); }
const { chromium } = createRequire(import.meta.url)('playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://localhost:${server.address().port}/index.html?scene=${encodeURI(rel)}&render=fast`);
await page.waitForFunction(() => window.LS && LS.S.scene && LS.S.scene.shots.length > 0, null, { timeout: 30000 });
await page.waitForTimeout(800);
const conf = { shots: opt('shots', '') ? opt('shots', '').split(',') : null, t: opt('t', 'auto'), grid: opt('grid', 'thirds'), width: +opt('width', 480), cols: +opt('cols', 4), ss: +opt('ss', 1) };
const dataUrl = await page.evaluate(async (conf) => {
  const { S, core } = LS;
  LS.api.hold(true);
  const list = S.scene.shots.filter((s) => !conf.shots || conf.shots.includes(s.name) || conf.shots.includes(s.id));
  const dp = core.dpReport(S.scene, { shots: list.map((s) => s.id) });
  const ed = core.editReview(S.scene);
  const tiles = [];
  for (const sh of list) {
    const moving = sh.keys && sh.keys.B;
    const ts = conf.t === 'auto' ? (moving ? [0.04, 0.96] : [0.5]) : conf.t.split(',').map(Number);
    for (const t of ts) tiles.push({ sh, t, dp: dp.shots.find((r) => r.id === sh.id), timing: ed.timing.find((x) => x.id === sh.id) });
  }
  const aspect = (list[0] && list[0].camera && list[0].camera.aspect) || 2.39;
  const W = conf.width, H = Math.round(W / aspect), cap = 34, gap = 6, cols = Math.min(conf.cols, tiles.length);
  const rows = Math.ceil(tiles.length / cols);
  const sheet = document.createElement('canvas'); sheet.width = cols * W + (cols + 1) * gap; sheet.height = rows * (H + cap) + (rows + 1) * gap + 40;
  const g = sheet.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, sheet.width, sheet.height);
  g.fillStyle = '#eee'; g.font = '600 18px Arial, sans-serif'; g.textBaseline = 'top';
  g.fillText(`${S.scene.project || ''} · Sc. ${(S.scene.scene && S.scene.scene.number) || ''} · DP ${dp.score}/100 · edit ${ed.score}/100 · ${list.length} shots · grid: ${conf.grid}`, gap, 10);
  const gridLines = { thirds: [1 / 3, 2 / 3], phi: [0.382, 0.618], quarters: [0.25, 0.5, 0.75], center: [0.5], none: [] }[conf.grid] || [];
  const tmp = document.createElement('canvas');
  tiles.forEach((tile, i) => {
    const x = gap + (i % cols) * (W + gap), y = 40 + gap + Math.floor(i / cols) * (H + cap + gap);
    const c = LS.api.frameCanvas(tile.sh.id, tile.t, W, H, { ss: conf.ss, keep: true, burnIn: false, canvas: tmp });
    g.drawImage(c, x, y, W, H);
    g.strokeStyle = 'rgba(255,230,120,0.55)'; g.lineWidth = 1;
    for (const f of gridLines) { g.beginPath(); g.moveTo(x + f * W, y); g.lineTo(x + f * W, y + H); g.stroke(); g.beginPath(); g.moveTo(x, y + f * H); g.lineTo(x + W, y + f * H); g.stroke(); }
    // the subject's eyes as the DP measured them (frame A or B)
    const fr = tile.dp && tile.dp.frames[tile.t > 0.5 && tile.dp.frames[1] ? 1 : 0];
    const e = fr && fr.subject && (fr.subject.eyes || fr.subject.center);
    if (e) { g.strokeStyle = '#ff5a5a'; g.lineWidth = 2; g.beginPath(); g.arc(x + e[0] * W, y + e[1] * H, 5, 0, 2 * Math.PI); g.stroke(); }
    const lens = `${tile.sh.camera.focal_mm}mm`, intent = (tile.sh.dp && tile.sh.dp.intent) || 'neutral';
    g.fillStyle = '#1d1d1d'; g.fillRect(x, y + H, W, cap);
    g.fillStyle = '#fff'; g.font = '600 13px Arial, sans-serif';
    g.fillText(`${tile.sh.name} ${tile.sh.size} ${lens} · ${tile.sh.duration_s}s${tile.t !== 0.5 ? ` · t ${tile.t}` : ''}`, x + 6, y + H + 3);
    g.fillStyle = fr && fr.score < 80 ? '#ffb86b' : '#9fe0a0'; g.font = '12px Arial, sans-serif';
    const warn = fr ? fr.notes.filter((n) => n.level !== 'info').length : 0;
    g.fillText(`${intent} · DP ${fr ? fr.score : '—'}${warn ? ` · ${warn} warning${warn > 1 ? 's' : ''}` : ''}${tile.timing && tile.timing.duration < tile.timing.need - 0.05 ? ` · short (${tile.timing.need}s)` : ''}`, x + 6, y + H + 18);
  });
  LS.vp.endStills();
  return sheet.toDataURL('image/png');
}, conf);
fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`contact sheet: ${out}`);
await browser.close(); server.close();
