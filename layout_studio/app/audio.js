// Sound in the browser, on the edit clock (core/edit.js): live playback in sync with the playhead, and the mixed track
// for Export MP4. Dialogue lines and spot effects start when the playhead reaches them (mid-sound at the right offset),
// ambience beds loop under their span. Clip paths are relative to the scene file; `base` is that file's folder URL.

const isAbs = (p) => /^(https?:|blob:|data:)/.test(p);

/** +4 dB of make-up gain into a gentle limiter: a comfortable level, and nothing clips when sounds pile up. */
function masterChain(ctx) {
  const gain = ctx.createGain(), comp = ctx.createDynamicsCompressor();
  gain.gain.value = 1.585;
  comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.2;
  gain.connect(comp); comp.connect(ctx.destination);
  return gain;
}

export class SoundPlayer {
  constructor() { this.ctx = null; this.out = null; this.base = ''; this.buffers = new Map(); this.events = []; this.beds = []; this.live = new Map(); this.fired = new Set(); this.prev = -1; this.muted = false; }
  /** Create / resume the audio context. Browsers allow it only from a click or key press, so call it from those. */
  unlock() {
    if (!this.ctx) { const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); this.out = masterChain(this.ctx); }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  /** New scene: forget clips, preload every file it uses. */
  setScene(scene, base = '') {
    this.stop(); this.base = base; this.buffers.clear();
    const files = new Set();
    for (const sh of (scene && scene.shots) || []) { for (const d of sh.dialogue || []) if (d.audio) files.add(d.audio); for (const e of sh.sfx || []) if (e.file) files.add(e.file); }
    for (const a of (scene && scene.sound && scene.sound.ambience) || []) if (a.file) files.add(a.file);
    for (const f of files) this.load(f);
  }
  /** Sounds of the edit in plain seconds (core.editSounds(scene)). */
  setSounds(sounds) { this.events = [...sounds.dialogue, ...sounds.sfx].filter((e) => e.file); this.beds = sounds.ambience.filter((e) => e.file); }
  url(path) { return isAbs(path) ? path : this.base + path; }
  /** Decoded clip (cached promise; null when the file is missing or undecodable). */
  load(path) {
    if (!this.buffers.has(path)) this.buffers.set(path, fetch(this.url(path)).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? decode(b) : null)).catch(() => null));
    return this.buffers.get(path);
  }
  /** Call every frame with the edit time: starts what the playhead enters, keeps beds looping, stops on pause or a jump. */
  update(T, playing) {
    if (!playing || this.muted) { if (this.live.size || this.fired.size) this.stop(); this.prev = T; return; }
    if (T < this.prev - 0.05 || T > this.prev + 1.0) this.stop(); // scrub, loop or a cut to another place: start over
    this.prev = T;
    for (const e of this.events) {
      const key = `${e.kind}:${e.shotId}:${e.index ?? e.name}:${e.start.toFixed(3)}`;
      if (this.fired.has(key) || T < e.start || T >= e.end) continue;
      this.fired.add(key); this.play(e.file, T - e.start, key, e.gain ?? 1);
    }
    this.beds.forEach((b, i) => {
      const key = `bed:${i}`, inside = T >= b.start && T < b.end;
      if (inside && !this.fired.has(key)) { this.fired.add(key); this.play(b.file, (T - b.start) + (b.offset || 0), key, b.gain ?? 0.5, true); }
      if (!inside && this.live.has(key)) { try { this.live.get(key).stop(); } catch (e) { /* ended */ } this.live.delete(key); this.fired.delete(key); }
    });
  }
  play(path, offset, key, gain = 1, loop = false) {
    const ctx = this.unlock(); if (!ctx) return;
    this.load(path).then((buf) => {
      if (!buf || !this.fired.has(key)) return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; src.loop = loop; g.gain.value = gain; src.connect(g); g.connect(this.out);
      const off = loop ? offset % buf.duration : Math.max(0, Math.min(offset, buf.duration - 0.01));
      src.start(0, off);
      src.onended = () => { if (this.live.get(key) === src) this.live.delete(key); };
      this.live.set(key, src);
    });
  }
  /** Preview one clip (Sound step). */
  preview(path) { this.stop(); const key = 'preview'; this.fired.add(key); this.play(path, 0, key); }
  stop() { for (const s of this.live.values()) { try { s.stop(); } catch (e) { /* already ended */ } } this.live.clear(); this.fired.clear(); }
}

// decodeAudioData needs a context; a tiny offline one works before any user gesture.
let decoder = null;
function decode(arrayBuffer) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) return Promise.resolve(null);
  if (!decoder) decoder = new OAC(1, 1, 48000);
  return decoder.decodeAudioData(arrayBuffer).catch(() => null);
}

/**
 * Mix the sounds of an export (core.editSounds(scene, { fps, shotIds })) into one stereo AudioBuffer as long as the
 * video: dialogue and effects at their frames, ambience looped with fades, through the limiter.
 * Returns { buffer, placed, missing, lines } or null when there is nothing to hear.
 */
export async function mixEdit(sounds, seconds, base = '', sampleRate = 48000) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const events = [...sounds.dialogue, ...sounds.sfx, ...sounds.ambience].filter((e) => e.file && e.start < seconds && e.end > 0);
  if (!OAC || !events.length || !(seconds > 0)) return null;
  const ctx = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate), out = masterChain(ctx), cache = new Map();
  const load = (f) => { if (!cache.has(f)) cache.set(f, fetch(isAbs(f) ? f : base + f).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? ctx.decodeAudioData(b) : null)).catch(() => null)); return cache.get(f); };
  let placed = 0, missing = 0;
  for (const e of events) {
    const buf = await load(e.file); if (!buf) { missing++; continue; }
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; src.connect(g); g.connect(out);
    if (e.kind === 'ambience') {
      const t0 = Math.max(0, e.start), t1 = Math.min(seconds, e.end), fi = Math.max(0.01, e.fadeIn || 0), fo = Math.max(0.01, e.fadeOut || 0), v = e.gain ?? 0.5;
      src.loop = e.loop !== false;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, Math.min(t1, t0 + fi));
      g.gain.setValueAtTime(v, Math.max(t0 + fi, t1 - fo)); g.gain.linearRampToValueAtTime(0, t1);
      src.start(t0, ((e.offset || 0) + (t0 - e.start)) % buf.duration); src.stop(t1);
    } else {
      g.gain.value = e.gain ?? 1;
      if (e.start >= 0) src.start(e.start); else src.start(0, -e.start);
    }
    placed++;
  }
  if (!placed) return null;
  return { buffer: await ctx.startRendering(), placed, missing, lines: sounds.dialogue.filter((d) => d.file).length };
}
