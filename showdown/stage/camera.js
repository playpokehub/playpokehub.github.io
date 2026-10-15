// Camera framing for the 800 × 450 stage. A frame {x, y, s} is the world transform translate(x, y) scale(s);
// frames are clamped so the edge of the art never shows. Pure (tested in Node).
export const W = 800, H = 450;

/** Centre `point` at zoom `s`, then clamp so the world still covers the whole stage. */
export function frame(point, s, w = W, h = H) {
  const z = Math.max(1, s);
  let x = w / 2 - point.x * z, y = h / 2 - point.y * z;
  x = Math.min(0, Math.max(w - w * z, x));
  y = Math.min(0, Math.max(h - h * z, y));
  return {x, y, s: z};
}

// the body's middle, not the feet: anchors are feet positions
const body = a => ({x: a.x, y: a.y - 60 * (a.scale || 1)});
const mid = pts => ({x: pts.reduce((m, p) => m + p.x, 0) / pts.length, y: pts.reduce((m, p) => m + p.y, 0) / pts.length});

/** kind: wide | close (one anchor) | pair (user, target) | spread (all anchors in view) | push (Tera/Mega close-up). */
export function shot(kind, anchors, s) {
  if (kind === 'wide' || !anchors || !anchors.length) return {x: 0, y: 0, s: 1};
  const zoom = s || {close: 1.35, pair: 1.22, spread: 1.15, push: 1.7}[kind] || 1.2;
  return frame(mid(anchors.map(body)), zoom);
}
