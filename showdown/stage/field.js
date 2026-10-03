// The field as the stage shows it: weather, terrain, rooms and each side's conditions, read from Showdown's client
// Battle. Pure (tested in Node); view.js draws it.
const id = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const WEATHER_NAME = {raindance: 'Rain', primordialsea: 'Heavy rain', sunnyday: 'Sun', desolateland: 'Harsh sun',
  sandstorm: 'Sandstorm', hail: 'Hail', snow: 'Snow', snowscape: 'Snow', deltastream: 'Strong winds'};
export const ROOMS = ['trickroom', 'magicroom', 'wonderroom', 'gravity'];
const ROOM_NAME = {trickroom: 'Trick Room', magicroom: 'Magic Room', wonderroom: 'Wonder Room', gravity: 'Gravity'};
const TERRAIN_NAME = {electricterrain: 'Electric Terrain', grassyterrain: 'Grassy Terrain', mistyterrain: 'Misty Terrain', psychicterrain: 'Psychic Terrain'};

export function fieldModel(battle) {
  const pw = (battle.pseudoWeather || []).map(x => id(x[0]));
  const weather = id(battle.weather);
  const terrain = pw.find(x => /terrain$/.test(x)) || '';
  const rooms = pw.filter(x => ROOMS.includes(x));
  const conds = side => Object.keys((side && side.sideConditions) || {});
  const pill = [WEATHER_NAME[weather] || (weather ? weather : ''), TERRAIN_NAME[terrain] || '', ...rooms.map(r => ROOM_NAME[r])].filter(Boolean).join(' · ');
  return {weather, terrain, rooms, sides: {near: conds(battle.nearSide), far: conds(battle.farSide)}, pill};
}

/** |-boost|p1a: X|atk|2 → {stat: 'atk', amount: 2}; |-unboost| gives a negative amount; anything else → null */
export function parseBoost(line) {
  const m = /^\|-(un)?boost\|[^|]*\|([a-z]+)\|(\d+)/.exec(line || '');
  return m ? {stat: m[2], amount: (m[1] ? -1 : 1) * +m[3]} : null;
}

// ---- announcements: the big card when a weather, terrain, room or side condition starts or ends
const SIDE_NAME = {tailwind: 'Tailwind', reflect: 'Reflect', lightscreen: 'Light Screen', auroraveil: 'Aurora Veil', safeguard: 'Safeguard',
  mist: 'Mist', luckychant: 'Lucky Chant', stealthrock: 'Stealth Rock', spikes: 'Spikes', toxicspikes: 'Toxic Spikes', stickyweb: 'Sticky Web',
  gmaxsteelsurge: 'Sharp Steel', quickguard: 'Quick Guard', wideguard: 'Wide Guard'};
const HAZARDS = new Set(['stealthrock', 'spikes', 'toxicspikes', 'stickyweb', 'gmaxsteelsurge']);
const NAME = {...WEATHER_NAME, ...TERRAIN_NAME, ...ROOM_NAME, ...SIDE_NAME, sunnyday: 'Harsh sunlight', desolateland: 'Extremely harsh sunlight'};
/** Each effect's type (for the card's colour: recipes.js PALETTES). */
export const FIELD_TYPE = {raindance: 'Water', primordialsea: 'Water', sunnyday: 'Fire', desolateland: 'Fire', sandstorm: 'Rock', hail: 'Ice',
  snow: 'Ice', snowscape: 'Ice', deltastream: 'Flying', electricterrain: 'Electric', grassyterrain: 'Grass', mistyterrain: 'Fairy',
  psychicterrain: 'Psychic', trickroom: 'Psychic', magicroom: 'Psychic', wonderroom: 'Psychic', gravity: 'Psychic', tailwind: 'Flying',
  reflect: 'Psychic', lightscreen: 'Psychic', auroraveil: 'Ice', safeguard: 'Normal', mist: 'Ice', luckychant: 'Normal', stealthrock: 'Rock',
  spikes: 'Ground', toxicspikes: 'Poison', stickyweb: 'Bug', gmaxsteelsurge: 'Steel', quickguard: 'Fighting', wideguard: 'Rock'};
const START = {raindance: 'It started to rain!', primordialsea: 'A heavy rain began to fall!', sunnyday: 'The sunlight turned harsh!',
  desolateland: 'The sunlight turned extremely harsh!', sandstorm: 'A sandstorm kicked up!', hail: 'It started to hail!', snow: 'It started to snow!',
  snowscape: 'It started to snow!', deltastream: 'Mysterious strong winds are protecting Flying types!',
  electricterrain: 'An electric current ran across the battlefield!', grassyterrain: 'Grass grew to cover the battlefield!',
  mistyterrain: 'Mist swirled around the battlefield!', psychicterrain: 'The battlefield got weird!', trickroom: 'The dimensions were twisted!',
  magicroom: 'Held items lost their effects!', wonderroom: 'Defense and Sp. Def were swapped!', gravity: 'Gravity intensified!'};
const END = {raindance: 'The rain stopped.', primordialsea: 'The heavy rain has lifted.', sunnyday: 'The harsh sunlight faded.',
  desolateland: 'The extremely harsh sunlight faded.', sandstorm: 'The sandstorm subsided.', hail: 'The hail stopped.', snow: 'The snow stopped.',
  snowscape: 'The snow stopped.', deltastream: 'The mysterious strong winds have dissipated.', trickroom: 'The twisted dimensions returned to normal.',
  magicroom: 'Held items work again.', wonderroom: 'Defense and Sp. Def are back to normal.', gravity: 'Gravity returned to normal.'};

/**
 * What the card says: e = {kind: 'weather'|'terrain'|'room'|'side', id, on (started or ended), side: 'near'|'far' (side
 * conditions; near = you)} → {title, text, palette} or null for something without a card.
 */
export function fieldAnnouncement(e) {
  if (!e || !e.id || !NAME[e.id]) return null;
  const title = NAME[e.id], palette = FIELD_TYPE[e.id] || '???';
  if (e.kind !== 'side') {
    const text = e.on ? START[e.id] : END[e.id] || `${title} ended.`;
    return {title, text: text || title, palette};
  }
  const yours = e.side === 'near', team = yours ? 'your team' : 'the opposing team', whose = yours ? 'Your' : 'The opposing team\'s';
  let text;
  if (e.id === 'tailwind') text = e.on ? `The Tailwind blew from behind ${team}!` : `${whose} Tailwind petered out.`;
  else if (HAZARDS.has(e.id)) text = e.on ? `${title} was set around ${team}!` : `${title} disappeared from around ${team}.`;
  else text = e.on ? `${title} is protecting ${team}!` : `${whose} ${title} wore off.`;
  return {title, text, palette, side: e.side};
}

const PILL_SIDE = ['tailwind', 'reflect', 'lightscreen', 'auroraveil'];
/** Side conditions worth keeping on screen, for the pill: "Your Tailwind · Their Reflect". */
export function sidePill(model) {
  if (!model || !model.sides) return '';
  const part = (who, list) => (list || []).filter(c => PILL_SIDE.includes(c)).map(c => `${who} ${SIDE_NAME[c]}`);
  return [...part('Your', model.sides.near), ...part('Their', model.sides.far)].join(' · ');
}

/** The first thing that changed between two fieldModel()s, as an announcement event (see fieldAnnouncement), or null. */
export function fieldChange(old, m) {
  if (m.weather !== old.weather) return m.weather ? {kind: 'weather', id: m.weather, on: true} : {kind: 'weather', id: old.weather, on: false};
  if (m.terrain !== old.terrain) return m.terrain ? {kind: 'terrain', id: m.terrain, on: true} : {kind: 'terrain', id: old.terrain, on: false};
  const added = m.rooms.find(r => !old.rooms.includes(r)), gone = old.rooms.find(r => !m.rooms.includes(r));
  if (added || gone) return {kind: 'room', id: added || gone, on: !!added};
  for (const side of ['near', 'far']) {
    const a = m.sides[side] || [], b = old.sides[side] || [];
    const on = a.find(c => !b.includes(c)), off = b.find(c => !a.includes(c));
    if (on || off) return {kind: 'side', id: on || off, on: !!on, side};
  }
  return null;
}
