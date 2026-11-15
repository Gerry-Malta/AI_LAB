// Render a scene's shots in sequence to an MP4 (previs of the edit), frame by frame from the shot cameras.
// usage: node tools/render_mp4.mjs <scene.json path relative to layout_studio> <out.mp4> [--fps 24] [--width 1920] [--height 804] [--ss 1.5] [--fast] [--shots 1A,1B] [--limit N] [--crf 18]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const positional = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
const scenePath = positional[0] || 'scenes/demo/street_corner.json';
const out = positional[1] || scenePath.replace(/\.json$/, '_previs.mp4');
const fps = +opt('fps', 24), W = +opt('width', 1920), H = +opt('height', 804), crf = +opt('crf', 18), limit = +opt('limit', 0), ss = +opt('ss', 1.5);
const onlyShots = opt('shots', '') ? opt('shots', '').split(',') : null;
const fast = args.includes('--fast');
const ffmpegBin = process.env.FFMPEG || 'ffmpeg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`http://localhost:${port}/index.html?scene=${scenePath}${fast ? '&render=fast' : ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.LS && window.LS.api && window.LS.S.scene && window.LS.S.scene.shots.length > 0, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(() => LS.api.hold(true)); // pause the live viewport: every GPU cycle goes to the frames
let seq = await page.evaluate(() => LS.api.sequence());
if (onlyShots) seq = seq.filter((s) => onlyShots.includes(s.name));
const total = seq.reduce((a, s) => a + Math.max(1, Math.round(s.duration_s * fps)), 0);
console.log(`scene ${scenePath}: ${seq.length} shots, ${total} frames at ${fps} fps, ${W}x${H} → ${out}`);

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const ff = spawn(ffmpegBin, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.resolve(out)], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((resolve, reject) => { ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg exited ' + code)))); ff.on('error', reject); });

const t0 = Date.now(); let done = 0;
outer: for (const s of seq) {
  const n = Math.max(1, Math.round(s.duration_s * fps));
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const dataUrl = await page.evaluate(([id, t, w, h, fps, ss]) => LS.api.renderFrame(id, t, w, h, { fps, ss, keep: true }), [s.id, t, W, H, fps, ss]);
    const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    done++;
    if (limit && done >= limit) break outer;
  }
  const el = (Date.now() - t0) / 1000;
  console.log(`  ${s.name.padEnd(4)} ${n} frames · ${done}/${total} · ${el.toFixed(0)}s elapsed · ${(done / el).toFixed(1)} fps`);
}
ff.stdin.end();
await ffDone;
await browser.close(); server.close();
const size = fs.statSync(path.resolve(out)).size;
console.log(`done: ${out} (${(size / 1e6).toFixed(1)} MB, ${done} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
