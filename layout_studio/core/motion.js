// Easing curves for camera moves. A curve maps t in [0,1] (time) to s in [0,1] (progress).

export const CURVE_PRESETS = {
  linear:       { type: 'linear',   name: 'Linear (constant speed)' },
  easeIn:       { type: 'bezier',   name: 'Ease in',        p: [0.42, 0, 1, 1] },
  easeOut:      { type: 'bezier',   name: 'Ease out (settle)', p: [0, 0, 0.58, 1] },
  easeInOut:    { type: 'bezier',   name: 'Ease in-out',    p: [0.42, 0, 0.58, 1] },
  smooth:       { type: 'smoothstep',   name: 'Smoothstep' },
  smoother:     { type: 'smootherstep', name: 'Smootherstep (very soft)' },
  cinematic:    { type: 'bezier',   name: 'Cinematic (soft start, long settle)', p: [0.33, 0, 0.18, 1] },
  quickStart:   { type: 'bezier',   name: 'Quick start, slow landing', p: [0.1, 0.6, 0.3, 1] },
  holdMoveHold: { type: 'hmh',      name: 'Hold · move · hold', hold: [0.15, 0.15], inner: 'smoothstep' },
  easeInOutCubic: { type: 'bezier', name: 'Smooth S (cubic): slow start, slow landing', p: [0.65, 0, 0.35, 1] },
  easeInOutQuint: { type: 'bezier', name: 'Very smooth S (quint)', p: [0.83, 0, 0.17, 1] },
};
export const CURVE_IDS = Object.keys(CURVE_PRESETS);

export function resolveCurve(c) {
  if (!c) return CURVE_PRESETS.easeInOut;
  if (typeof c === 'string') return CURVE_PRESETS[c] || CURVE_PRESETS.easeInOut;
  if (Array.isArray(c)) return { type: 'bezier', p: c };
  return c;
}
/** Bezier control points of a curve (for editors), or null when the curve is not a bezier. */
export function curvePoints(c) { const r = resolveCurve(c); return r.type === 'bezier' ? r.p.slice() : r.type === 'linear' ? [0, 0, 1, 1] : null; }

/** CSS-style cubic bezier easing: control points (x1,y1),(x2,y2); solve x(t)=x for t then return y(t). */
export function cubicBezier(x1, y1, x2, y2, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const e = sx(t) - x;
    if (Math.abs(e) < 1e-6) return sy(t);
    const d = dx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= e / d;
  }
  // bisection fallback
  let lo = 0, hi = 1;
  t = x;
  while (hi - lo > 1e-6) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
  return sy(t);
}

const smoothstep = (t) => t * t * (3 - 2 * t);
const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function ease(curve, t) {
  const c = resolveCurve(curve);
  t = Math.min(1, Math.max(0, t));
  switch (c.type) {
    case 'linear': return t;
    case 'smoothstep': return smoothstep(t);
    case 'smootherstep': return smootherstep(t);
    case 'bezier': { const [a, b, d, e] = c.p; return cubicBezier(a, b, d, e, t); }
    case 'hmh': {
      const [h0, h1] = c.hold || [0.15, 0.15];
      if (t <= h0) return 0;
      if (t >= 1 - h1) return 1;
      const u = (t - h0) / (1 - h0 - h1);
      return ease(c.inner || 'smoothstep', u);
    }
    default: return smoothstep(t);
  }
}

/** Numeric derivative ds/dt — useful to find the fastest moment of a move. */
export function easeRate(curve, t, h = 1e-3) {
  const a = ease(curve, Math.max(0, t - h)), b = ease(curve, Math.min(1, t + h));
  return (b - a) / (Math.min(1, t + h) - Math.max(0, t - h));
}
