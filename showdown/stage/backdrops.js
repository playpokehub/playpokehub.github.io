// The painted backgrounds (our own AI-painted art, split into a far layer and a near/court layer at the horizon) and
// where the Pokémon stand on each: feet position in stage pixels (800 × 450) and sprite scale.

// Where the Pokémon stand on screen (feet, stage px): left of the corner HP plates (far side: top right, near side:
// bottom right) and spread out. The same for every background: each painting is framed (zoomed on its court) so
// these spots fall inside its court — tests/stage.mjs checks every spot against the court outline.
const SPOTS = {
  singles: {near: [[265, 438]], far: [[470, 256]]},
  doubles: {near: [[150, 436], [385, 442]], far: [[385, 262], [555, 250]]},
};
const slotsFor = (far, near = 1.4) => {
  const out = {};
  for (const gt of ['singles', 'doubles']) out[gt] = {
    near: SPOTS[gt].near.map(([x, y]) => ({x, y, scale: near})),
    far: SPOTS[gt].far.map(([x, y]) => ({x, y, scale: far})),
  };
  return out;
};

// id, horizon (where the near/court layer starts, as a share of the height; both layers come from one painting),
// court: the court's outline in the unzoomed 800 × 450 painting, view: framing (zoom z around the point fx, fy),
// far: how big far-side Pokémon are drawn on this court (near-side ones are 1.4)
const B = (id, horizon, court, view, far) => ({id, far: `bg/${id}-far.jpg`, near: `bg/${id}-near.jpg`, horizon, court, view, slots: slotsFor(far)});
export const BACKDROPS = [
  B('outdoor', 0.34, [[0, 213], [800, 143], [800, 205], [385, 395], [0, 240]], {z: 1.4, fx: 590, fy: 100}, 1.1),
  B('stadium', 0.535, [[40, 287], [445, 242], [765, 270], [365, 440]], {z: 1.45, fx: 580, fy: 290}, 1.15),
  B('gym', 0.46, [[0, 236], [735, 218], [545, 440], [0, 318]], {z: 1.35, fx: 690, fy: 190}, 1.1),
  B('night', 0.47, [[0, 268], [335, 218], [730, 262], [405, 418], [0, 297]], {z: 1.55, fx: 510, fy: 250}, 1.2),
  B('beach', 0.355, [[85, 210], [520, 180], [800, 262], [800, 300], [155, 425]], {z: 1.25, fx: 260, fy: 100}, 1.05),
  B('cave', 0.49, [[210, 250], [640, 250], [705, 372], [95, 372]], {z: 1.85, fx: 400, fy: 270}, 1.25),
];

/** a point in the unzoomed painting → where it shows on the stage, and back */
export const toScreen = (bd, [x, y]) => { const {z, fx, fy} = bd.view; return [fx + (x - fx) * z, fy + (y - fy) * z]; };
export const toBase = (bd, [x, y]) => { const {z, fx, fy} = bd.view; return [fx + (x - fx) / z, fy + (y - fy) / z]; };

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Same battle → same background (replays match); the Gauntlet boss gets the night arena, Champions the stadium. */
export function pickBackdrop(battleId, {format = '', boss = false, bg = ''} = {}) {
  const by = id => BACKDROPS.find(b => b.id === id);
  if (bg && by(bg)) return by(bg); // a fixed choice (the stage lab)
  if (boss && by('night')) return by('night');
  if (boss) return BACKDROPS[0];
  if (format === 'championsvgc' && by('stadium')) return by('stadium');
  return BACKDROPS[hash(String(battleId || '')) % BACKDROPS.length];
}
