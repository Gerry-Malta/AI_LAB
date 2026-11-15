// In-browser MP4 export. Frames come from the viewer (this computer's GPU), WebCodecs encodes them and
// mp4-muxer writes the container. Nothing is uploaded: the file is assembled in memory and downloaded.
// mp4-muxer loads on the first export only: the viewer never depends on it to start.
const loadMuxer = () => import('../vendor/mp4-muxer/mp4-muxer.js');

export const canEncode = () => typeof globalThis.VideoEncoder === 'function' && typeof globalThis.VideoFrame === 'function';

/** H.264 level (hex byte of the codec string) that fits a frame size and rate: 3.1 … 5.2. */
export function avcLevel(w, h, fps) {
  const fs = Math.ceil(w / 16) * Math.ceil(h / 16), mbps = fs * fps;
  const table = [['1f', 3600, 108000], ['20', 5120, 216000], ['28', 8192, 245760], ['2a', 8704, 522240], ['32', 22080, 589824], ['33', 36864, 983040], ['34', 36864, 2073600]];
  for (const [hex, maxFs, maxMbps] of table) if (fs <= maxFs && mbps <= maxMbps) return hex;
  return '34';
}

/** About 0.1 bit per pixel per frame: clean for flat-shaded previs, 2 to 40 Mbit/s. */
export const defaultBitrate = (w, h, fps) => Math.round(Math.min(40e6, Math.max(2e6, w * h * fps * 0.1)));

export const codecName = (codec) => (codec.startsWith('avc1') ? 'H.264' : codec.startsWith('vp09') ? 'VP9' : codec.startsWith('av01') ? 'AV1' : codec);

/** First encoder this browser supports: H.264 High, Main, Baseline (plays everywhere), then VP9, then AV1. */
export async function pickCodec(width, height, fps, bitrate = defaultBitrate(width, height, fps)) {
  if (!canEncode()) return null;
  const lv = avcLevel(width, height, fps);
  const candidates = [
    ['avc', `avc1.6400${lv}`], ['avc', `avc1.4d00${lv}`], ['avc', `avc1.42e0${lv}`],
    ['vp9', 'vp09.00.40.08'], ['vp9', 'vp09.00.51.08'], ['av1', 'av01.0.08M.08'], ['av1', 'av01.0.12M.08'],
  ];
  for (const [mux, codec] of candidates) {
    const config = { codec, width, height, bitrate, framerate: fps, latencyMode: 'quality' };
    if (mux === 'avc') config.avc = { format: 'avc' };
    try { const res = await VideoEncoder.isConfigSupported(config); if (res && res.supported) return { mux, config }; } catch (e) { /* next candidate */ }
  }
  return null;
}

/** First audio encoder the browser has: AAC (plays everywhere), else Opus. */
export async function pickAudioCodec(sampleRate, numberOfChannels) {
  if (typeof globalThis.AudioEncoder !== 'function' || typeof globalThis.AudioData !== 'function') return null;
  for (const [mux, codec] of [['aac', 'mp4a.40.2'], ['opus', 'opus']]) {
    const config = { codec, sampleRate, numberOfChannels, bitrate: 128000 };
    try { const res = await AudioEncoder.isConfigSupported(config); if (res && res.supported) return { mux, config }; } catch (e) { /* next */ }
  }
  return null;
}

// Yield to the page without timers (timers are throttled in background tabs): progress bar and Cancel stay live.
const yieldToPage = () => new Promise((resolve) => { const ch = new MessageChannel(); ch.port1.onmessage = () => resolve(); ch.port2.postMessage(0); });

async function drain(encoder, max, failed) {
  while (encoder.encodeQueueSize > max && !failed()) {
    await new Promise((resolve) => {
      const done = () => { encoder.removeEventListener('dequeue', done); clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 40);
      encoder.addEventListener('dequeue', done);
    });
  }
}

/**
 * Encode frames to an MP4 Blob.
 * opts: { width, height, fps, frames, renderFrame(i) -> canvas (or a promise of one), bitrate?, keyEvery?, signal?, onProgress?,
 *         audio?: AudioBuffer (the mixed track, as long as the video) }
 * Returns { blob, codec, codecName, bitrate, frames, seconds, audioCodec }.
 */
export async function encodeMP4(opts) {
  const { width, height, fps, frames, renderFrame, signal, onProgress } = opts;
  if (!canEncode()) throw new Error('This browser cannot encode video (no WebCodecs). Use a recent Chrome, Edge, Safari or Firefox.');
  if (width % 2 || height % 2) throw new Error('Width and height must be even numbers.');
  const bitrate = opts.bitrate || defaultBitrate(width, height, fps);
  const pick = await pickCodec(width, height, fps, bitrate);
  if (!pick) throw new Error(`This browser has no video encoder for ${width}×${height}. Try a smaller size.`);
  const audio = opts.audio || null;
  const apick = audio ? await pickAudioCodec(audio.sampleRate, audio.numberOfChannels) : null;
  const { Muxer, ArrayBufferTarget } = await loadMuxer();
  const muxer = new Muxer({
    target: new ArrayBufferTarget(), video: { codec: pick.mux, width, height, frameRate: fps },
    audio: apick ? { codec: apick.mux, sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels } : undefined,
    fastStart: 'in-memory', firstTimestampBehavior: 'offset',
  });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => { try { muxer.addVideoChunk(chunk, meta); } catch (e) { failure = failure || e; } },
    error: (e) => { failure = failure || e; },
  });
  encoder.configure(pick.config);
  const step = 1e6 / fps, gop = opts.keyEvery || Math.round(fps * 2), t0 = performance.now();
  try {
    for (let i = 0; i < frames; i++) {
      if (signal && signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (failure) throw failure;
      const canvas = await renderFrame(i);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * step), duration: Math.round(step) });
      encoder.encode(frame, { keyFrame: i % gop === 0 });
      frame.close();
      await drain(encoder, 6, () => failure);
      if (onProgress) onProgress({ done: i + 1, total: frames, elapsed: (performance.now() - t0) / 1000 });
      await yieldToPage();
    }
    await encoder.flush();
    if (failure) throw failure;
    if (apick) await encodeAudio(audio, apick, muxer, signal);
    muxer.finalize();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  return { blob, codec: pick.config.codec, codecName: codecName(pick.config.codec), bitrate, frames, seconds: (performance.now() - t0) / 1000, audioCodec: apick ? apick.mux : null };
}

/** Encode an AudioBuffer in blocks and hand the chunks to the muxer. */
async function encodeAudio(buffer, pick, muxer, signal) {
  let failure = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => { try { muxer.addAudioChunk(chunk, meta); } catch (e) { failure = failure || e; } },
    error: (e) => { failure = failure || e; },
  });
  enc.configure(pick.config);
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, N = buffer.length, block = 4800;
  const planes = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  try {
    for (let off = 0; off < N; off += block) {
      if (signal && signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (failure) throw failure;
      const n = Math.min(block, N - off), data = new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) data.set(planes[c].subarray(off, off + n), c * n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((off / sr) * 1e6), data });
      enc.encode(ad); ad.close();
      if (enc.encodeQueueSize > 24) await yieldToPage();
    }
    await enc.flush();
    if (failure) throw failure;
  } finally { if (enc.state !== 'closed') enc.close(); }
}
