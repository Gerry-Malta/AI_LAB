// Dialogue audio in the browser: live playback in sync with the playhead, and the mixed track for Export MP4.
// Clip paths in the scene are relative to the scene file; `base` is that file's folder URL.
import * as core from '../core/index.js';

export class DialoguePlayer {
  constructor() { this.ctx = null; this.base = ''; this.buffers = new Map(); this.sources = new Map(); this.fired = new Set(); this.shotId = null; this.prev = 0; this.muted = false; }
  /** Create / resume the audio context. Browsers allow it only from a click or key press, so call it from those. */
  unlock() {
    if (!this.ctx) { const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  setScene(scene, base = '') {
    this.stop(); this.base = base; this.buffers.clear();
    for (const sh of (scene && scene.shots) || []) for (const d of sh.dialogue || []) if (d.audio) this.load(d.audio);
  }
  url(path) { return /^(https?:|blob:|data:)/.test(path) ? path : this.base + path; }
  /** Decoded clip (cached promise; null when the file is missing or undecodable). */
  load(path) {
    if (!this.buffers.has(path)) {
      this.buffers.set(path, fetch(this.url(path)).then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => (b ? decode(b) : null)).catch(() => null));
    }
    return this.buffers.get(path);
  }
  /** Call every frame: starts the lines the playhead enters (mid-line too, at the right offset), stops on pause or jumps. */
  update(shot, ts, playing) {
    if (!shot || !playing || this.muted) { if (this.sources.size || this.fired.size) this.stop(); this.prev = ts; this.shotId = shot ? shot.id : null; return; }
    if (shot.id !== this.shotId || ts < this.prev - 0.05) { this.stop(); this.shotId = shot.id; }
    this.prev = ts;
    for (const l of core.dialogueTimeline(shot)) {
      const key = `${shot.id}:${l.index}`;
      if (!l.audio || this.fired.has(key) || ts < l.start || ts >= l.end) continue;
      this.fired.add(key); this.play(l.audio, ts - l.start, key);
    }
  }
  play(path, offset, key) {
    const ctx = this.unlock(); if (!ctx) return;
    this.load(path).then((buf) => {
      if (!buf || !this.fired.has(key)) return;
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
      src.start(0, Math.max(0, Math.min(offset, buf.duration - 0.01)));
      src.onended = () => this.sources.delete(key);
      this.sources.set(key, src);
    });
  }
  /** Preview one clip (shot editor). */
  preview(path) { this.stop(); const key = 'preview'; this.fired.add(key); this.play(path, 0, key); }
  stop() { for (const s of this.sources.values()) { try { s.stop(); } catch (e) { /* already ended */ } } this.sources.clear(); this.fired.clear(); }
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
 * Mix the dialogue of the exported shots into one stereo AudioBuffer as long as the video.
 * lines: core.sequenceDialogue(scene, shotIds, fps); seconds: video length. Returns { buffer, placed, missing } or null.
 */
export async function mixDialogue(lines, seconds, base = '', sampleRate = 48000) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const voiced = lines.filter((l) => l.audio);
  if (!OAC || !voiced.length || !(seconds > 0)) return null;
  const ctx = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
  let placed = 0, missing = 0;
  for (const l of voiced) {
    const url = /^(https?:|blob:|data:)/.test(l.audio) ? l.audio : base + l.audio;
    const buf = await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? ctx.decodeAudioData(b) : null)).catch(() => null);
    if (!buf) { missing++; continue; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(Math.max(0, l.start));
    placed++;
  }
  if (!placed) return null;
  return { buffer: await ctx.startRendering(), placed, missing };
}
