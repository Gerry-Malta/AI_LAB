// Headless smoke test: serve the folder, open the viewer, check console errors, screenshot main view + a few shots.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(root, 'docs', 'shots');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const scene = process.argv[3] || 'scenes/demo/street_corner.json';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [], logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); else logs.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(`http://localhost:${port}/index.html?scene=${scene}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.LS && window.LS.S.scene && window.LS.S.scene.shots.length >= 0, null, { timeout: 20000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({ project: LS.S.scene.project, objects: LS.S.scene.objects.length, shots: LS.S.scene.shots.map((s) => s.name), nodes: LS.vp.nodes.size, shotId: LS.S.shotId }));
console.log('loaded', JSON.stringify(info));
await page.screenshot({ path: path.join(out, 'overview.png') });
const shotNames = info.shots;
for (const name of shotNames.slice(0, Number(process.argv[4] || 6))) {
  await page.evaluate((n) => { const sh = LS.S.scene.shots.find((s) => s.name === n); const row = document.querySelector(`#shotlist .row[data-id="${sh.id}"]`); row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }, name);
  await page.waitForTimeout(600);
  // look through for a clean frame
  await page.keyboard.press('KeyL'); await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => { const le = LS.S.lastEval; return le ? { score: le.ev.score, size: le.ev.size && le.ev.size.measured, flags: le.ev.flags.map((f) => f.msg) } : null; });
  console.log(`shot ${name}:`, JSON.stringify(metrics));
  await page.screenshot({ path: path.join(out, `shot_${name}.png`) });
  await page.keyboard.press('KeyL'); await page.waitForTimeout(200);
}
// interaction smoke: select object, add box, move via properties, undo, export sheet in-page
const inter = await page.evaluate(() => {
  const o = LS.S.scene.objects.find((x) => x.kind === 'standin');
  document.querySelector(`#outliner .row[data-id="${o.id}"]`)?.click();
  document.querySelector('#outliner-tools [data-add="box"]').click();
  const added = LS.S.scene.objects[LS.S.scene.objects.length - 1];
  const sheet = LS.core.toCameraSheet(LS.S.scene);
  return { selected: LS.S.selectedId, addedKind: added.kind, sheetLines: sheet.split('\n').length };
});
console.log('interaction', JSON.stringify(inter));
await page.keyboard.press('Control+KeyZ'); await page.waitForTimeout(200);
const after = await page.evaluate(() => LS.S.scene.objects.length);
console.log('objects after undo', after, 'expected', info.objects);

// hover help: resting the cursor on a control shows its tooltip
const eb = await (await page.$('#btn-export')).boundingBox();
await page.mouse.move(eb.x + 8, eb.y + 8); await page.mouse.move(eb.x + 10, eb.y + 9);
await page.waitForFunction(() => document.querySelector('#tip') && document.querySelector('#tip').classList.contains('show'), null, { timeout: 5000 }).catch(() => {});
const tipText = await page.evaluate(() => { const t = document.querySelector('#tip'); return t && t.classList.contains('show') ? t.textContent : ''; });
console.log('tooltip', JSON.stringify(tipText));
if (!/graphics card/.test(tipText)) errors.push('pageerror: no tooltip on the Export MP4 button');
await page.mouse.move(5, 300);
// the five steps open and show their how-to line
const steps = await page.evaluate(() => [...document.querySelectorAll('#steps button')].map((b) => { b.click(); return [b.dataset.tab, document.querySelector('#step-hint').textContent.length > 40, !document.querySelector(`#tab-${b.dataset.tab}`).classList.contains('hidden')]; }));
console.log('steps', JSON.stringify(steps));
if (steps.some((x) => !x[1] || !x[2])) errors.push('pageerror: a workflow step did not open');
await page.evaluate(() => document.querySelector('#steps button[data-tab="outliner"]').click());

// Export MP4 dialog + a short in-browser encode (WebCodecs + mp4-muxer), checked with ffprobe when it is installed
await page.click('#btn-export'); await page.waitForTimeout(800);
const dlg = await page.evaluate(() => ({ open: !document.querySelector('#export').classList.contains('hidden'), summary: document.querySelector('#ex-summary').textContent, codec: document.querySelector('#ex-codec').textContent }));
console.log('export dialog', JSON.stringify(dlg));
if (!dlg.open || !/frames/.test(dlg.summary)) errors.push('pageerror: export dialog did not open');
await page.click('#ex-close');
const enc = await page.evaluate(async () => {
  try {
    const res = await LS.api.exportMP4({ shotIds: [LS.S.scene.shots[0].id], width: 640, fps: 24, ss: 1, maxFrames: 24 });
    const bytes = new Uint8Array(await res.blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { ok: true, codec: res.codec, frames: res.frames, width: res.width, height: res.height, size: bytes.length, b64: btoa(bin) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
if (!enc.ok) { console.log('export', enc.error); errors.push('pageerror: export failed: ' + enc.error); }
else {
  const file = path.join(out, 'export_test.mp4'); fs.writeFileSync(file, Buffer.from(enc.b64, 'base64'));
  console.log('export', JSON.stringify({ codec: enc.codec, frames: enc.frames, size: `${enc.width}x${enc.height}`, bytes: enc.size }));
  try {
    const { execFileSync } = await import('node:child_process');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,nb_read_frames,r_frame_rate', '-of', 'json', file]).toString()).streams[0];
    console.log('ffprobe', JSON.stringify(probe));
    if (+probe.nb_read_frames !== enc.frames || probe.width !== enc.width || probe.height !== enc.height) errors.push('pageerror: exported MP4 does not match: ' + JSON.stringify(probe));
  } catch (e) { console.log('ffprobe not available or failed:', e.message.split('\n')[0]); }
}
console.log('console errors:', errors.length ? errors.join('\n') : 'none');
await browser.close(); server.close();
if (errors.some((e) => /pageerror|TypeError|ReferenceError|Failed to load/.test(e))) { console.error('FAIL'); process.exit(1); }
console.log('SMOKE OK');
