// What each move looks like on the stage: a recipe built from a few primitives (how the user moves, what travels to
// the target, what happens on impact) and the move type's palette. Every move gets a template by type × category;
// HANDMADE (step 7) overrides the most-used ones. Pure (tested in Node over Showdown's whole move list).

export const PRIMITIVES = {
  user: ['lunge', 'charge', 'spin', 'jump', 'none'],
  carrier: ['none', 'orb', 'beam', 'wave', 'rain', 'slash', 'ring', 'stream', 'meteor'],
  impact: ['burst', 'slash', 'ring', 'shards', 'splash', 'quake', 'sparks', 'none', 'shield', 'hex', 'coins', 'rocks'],
};

// main: particles, glow: light around them, core: hottest centre
export const PALETTES = {
  Normal: {main: '#e8e2d0', glow: '#ffffff', core: '#ffffff'},
  Fire: {main: '#ff6a1f', glow: '#ffb347', core: '#fff1a8'},
  Water: {main: '#3d8bff', glow: '#8cc8ff', core: '#e6f4ff'},
  Electric: {main: '#ffd21f', glow: '#fff27a', core: '#ffffff'},
  Grass: {main: '#43c24a', glow: '#a6f07a', core: '#eaffd6'},
  Ice: {main: '#7fe3ff', glow: '#c9f6ff', core: '#ffffff'},
  Fighting: {main: '#ff7b2e', glow: '#ffc07a', core: '#fff0d6'},
  Poison: {main: '#a24fd6', glow: '#d58cff', core: '#f3dcff'},
  Ground: {main: '#c98b45', glow: '#e8c07e', core: '#fff0cc'},
  Flying: {main: '#9cc3ff', glow: '#dcecff', core: '#ffffff'},
  Psychic: {main: '#ff4f9a', glow: '#ff9cc8', core: '#ffe6f2'},
  Bug: {main: '#a8c21a', glow: '#dcf07a', core: '#f7ffd6'},
  Rock: {main: '#b8a878', glow: '#e0d4a8', core: '#fff8e0'},
  Ghost: {main: '#7a55c8', glow: '#b69cff', core: '#efe6ff'},
  Dragon: {main: '#6a60ff', glow: '#a9a2ff', core: '#ecebff'},
  Dark: {main: '#5a4a60', glow: '#a08aa8', core: '#f0e6f4'},
  Steel: {main: '#7fb0c8', glow: '#cfe6f0', core: '#ffffff'},
  Fairy: {main: '#ff8ce8', glow: '#ffc4f3', core: '#fff0fc'},
  Stellar: {main: '#40b5a5', glow: '#9ff0e4', core: '#ffffff'},
  '???': {main: '#68a090', glow: '#a8d8c8', core: '#ffffff'},
};

const PHYS_IMPACT = {Fire: 'burst', Water: 'splash', Electric: 'sparks', Grass: 'burst', Ice: 'shards', Fighting: 'burst',
  Poison: 'burst', Ground: 'quake', Flying: 'slash', Psychic: 'ring', Bug: 'slash', Rock: 'shards', Ghost: 'burst',
  Dragon: 'slash', Dark: 'slash', Steel: 'slash', Fairy: 'sparks', Normal: 'burst'};
const SPEC_CARRIER = {Fire: 'stream', Water: 'beam', Electric: 'beam', Grass: 'orb', Ice: 'beam', Fighting: 'orb',
  Poison: 'orb', Ground: 'wave', Flying: 'wave', Psychic: 'wave', Bug: 'stream', Rock: 'rain', Ghost: 'orb',
  Dragon: 'beam', Dark: 'wave', Steel: 'beam', Fairy: 'orb', Normal: 'wave'};
const SPEC_IMPACT = {Fire: 'burst', Water: 'splash', Electric: 'sparks', Grass: 'burst', Ice: 'shards', Fighting: 'burst',
  Poison: 'burst', Ground: 'quake', Flying: 'burst', Psychic: 'ring', Bug: 'burst', Rock: 'shards', Ghost: 'burst',
  Dragon: 'burst', Dark: 'burst', Steel: 'sparks', Fairy: 'sparks', Normal: 'burst'};

const SPREAD = new Set(['allAdjacentFoes', 'allAdjacent', 'foeSide']);
const SELFISH = new Set(['self', 'allySide', 'allyTeam', 'adjacentAllyOrSelf', 'allies']);
const FIELD = new Set(['all']);

// the most-used moves in our Champions VGC, Doubles OU and OU packs get their own look
const H = (shot, user, carrier, impact, palette) => ({shot, user, carrier, impact, palette});
export const HANDMADE = {
  // protection: a see-through dome of hexagons on the user (Protect and its variants); Wide/Quick Guard a bubble
  protect: H('close', 'charge', 'none', 'hex', 'Grass'), detect: H('close', 'charge', 'none', 'hex', 'Fighting'),
  spikyshield: H('close', 'charge', 'none', 'hex', 'Grass'), kingsshield: H('close', 'charge', 'none', 'hex', 'Steel'),
  banefulbunker: H('close', 'charge', 'none', 'hex', 'Poison'), obstruct: H('close', 'charge', 'none', 'hex', 'Dark'),
  silktrap: H('close', 'charge', 'none', 'hex', 'Bug'), burningbulwark: H('close', 'charge', 'none', 'hex', 'Fire'),
  maxguard: H('close', 'charge', 'none', 'hex', 'Fighting'),
  wideguard: H('wide', 'charge', 'none', 'shield', 'Rock'), quickguard: H('wide', 'charge', 'none', 'shield', 'Fighting'),
  // support
  fakeout: H('pair', 'jump', 'none', 'burst', 'Normal'), followme: H('close', 'spin', 'none', 'ring', 'Normal'),
  ragepowder: H('close', 'spin', 'none', 'ring', 'Bug'), helpinghand: H('close', 'jump', 'none', 'sparks', 'Normal'),
  tailwind: H('wide', 'charge', 'stream', 'none', 'Flying'), trickroom: H('wide', 'charge', 'none', 'ring', 'Psychic'),
  icywind: H('spread', 'charge', 'wave', 'shards', 'Ice'), electroweb: H('spread', 'charge', 'beam', 'sparks', 'Electric'),
  snarl: H('spread', 'charge', 'wave', 'burst', 'Dark'), partingshot: H('pair', 'none', 'orb', 'sparks', 'Dark'),
  // pivots and priority
  uturn: H('pair', 'lunge', 'none', 'slash', 'Bug'), voltswitch: H('pair', 'charge', 'beam', 'sparks', 'Electric'),
  flipturn: H('pair', 'lunge', 'none', 'splash', 'Water'), knockoff: H('pair', 'lunge', 'none', 'slash', 'Dark'),
  suckerpunch: H('pair', 'lunge', 'none', 'burst', 'Dark'), extremespeed: H('pair', 'lunge', 'none', 'burst', 'Normal'),
  aquajet: H('pair', 'lunge', 'none', 'splash', 'Water'),
  // big physical hits
  closecombat: H('pair', 'lunge', 'none', 'burst', 'Fighting'), flareblitz: H('pair', 'lunge', 'none', 'burst', 'Fire'),
  wavecrash: H('pair', 'lunge', 'none', 'splash', 'Water'), headlongrush: H('pair', 'lunge', 'none', 'quake', 'Ground'),
  earthquake: H('spread', 'jump', 'none', 'quake', 'Ground'), rockslide: H('spread', 'charge', 'rain', 'rocks', 'Rock'),
  stoneedge: H('pair', 'charge', 'rain', 'shards', 'Rock'), dragonclaw: H('pair', 'lunge', 'none', 'slash', 'Dragon'),
  kowtowcleave: H('pair', 'lunge', 'none', 'slash', 'Dark'),
  // special attacks
  heatwave: H('spread', 'charge', 'stream', 'burst', 'Fire'), dazzlinggleam: H('spread', 'charge', 'wave', 'sparks', 'Fairy'),
  hypervoice: H('spread', 'charge', 'wave', 'ring', 'Normal'), moonblast: H('pair', 'charge', 'orb', 'burst', 'Fairy'),
  dracometeor: H('pair', 'charge', 'meteor', 'burst', 'Dragon'), dragonpulse: H('pair', 'charge', 'beam', 'burst', 'Dragon'),
  shadowball: H('pair', 'charge', 'orb', 'burst', 'Ghost'), thunderbolt: H('pair', 'charge', 'beam', 'sparks', 'Electric'),
  icebeam: H('pair', 'charge', 'beam', 'shards', 'Ice'), surf: H('spread', 'charge', 'wave', 'splash', 'Water'),
  hydropump: H('pair', 'charge', 'beam', 'splash', 'Water'), makeitrain: H('spread', 'charge', 'rain', 'coins', 'Steel'),
  astralbarrage: H('spread', 'charge', 'stream', 'burst', 'Ghost'), glaciallance: H('spread', 'charge', 'rain', 'shards', 'Ice'),
  expandingforce: H('pair', 'charge', 'wave', 'ring', 'Psychic'),
  // status on the target
  spore: H('pair', 'none', 'stream', 'sparks', 'Grass'), willowisp: H('pair', 'none', 'orb', 'burst', 'Fire'),
  thunderwave: H('pair', 'none', 'beam', 'sparks', 'Electric'), toxic: H('pair', 'none', 'orb', 'splash', 'Poison'),
  // set-up and field
  swordsdance: H('close', 'spin', 'none', 'ring', 'Steel'), nastyplot: H('close', 'charge', 'none', 'ring', 'Dark'),
  calmmind: H('close', 'charge', 'none', 'ring', 'Psychic'), dragondance: H('close', 'spin', 'none', 'ring', 'Dragon'),
  recover: H('close', 'charge', 'none', 'ring', 'Normal'), stealthrock: H('spread', 'charge', 'rain', 'rocks', 'Rock'),
  reflect: H('close', 'charge', 'none', 'shield', 'Psychic'), lightscreen: H('close', 'charge', 'none', 'shield', 'Psychic'),
  substitute: H('close', 'charge', 'none', 'burst', 'Normal'),
};

export function recipeFor(move) {
  const id = String(move.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (HANDMADE[id]) return {...HANDMADE[id], handmade: true};
  const palette = PALETTES[move.type] ? move.type : '???';
  const target = move.target || 'normal';
  const shotKind = SPREAD.has(target) ? 'spread' : SELFISH.has(target) ? 'close' : FIELD.has(target) ? 'wide' : 'pair';
  const cat = move.category;
  let r;
  if (cat === 'Physical') r = {user: 'lunge', carrier: 'none', impact: PHYS_IMPACT[palette] || 'burst'};
  else if (cat === 'Special') r = {user: 'charge', carrier: SPEC_CARRIER[palette] || 'orb', impact: SPEC_IMPACT[palette] || 'burst'};
  else if (SELFISH.has(target) || FIELD.has(target)) r = {user: 'charge', carrier: 'none', impact: 'ring'};
  else r = {user: 'none', carrier: 'orb', impact: 'sparks'};
  // Max and Z moves hit harder: a bigger wave to the target and a burst
  if (move.isMax && cat !== 'Status') r = {user: 'charge', carrier: 'wave', impact: 'burst'};
  if (move.isZ && cat !== 'Status') r = {...r, user: 'charge', carrier: r.carrier === 'none' ? 'beam' : r.carrier};
  return {shot: shotKind, ...r, palette, handmade: false, big: !!(move.isMax || move.isZ)};
}
