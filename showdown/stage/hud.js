// What the corner plates show, from a Showdown client Pokémon. Pure (tested in Node).

export const STAT_LABEL = {atk: 'ATK', def: 'DEF', spa: 'SPA', spd: 'SPD', spe: 'SPE', accuracy: 'ACC', evasion: 'EVA'};
const MINUS = '−';

/** Which stage slot a Pokémon stands in: the viewer's own side is always "near". */
export function slotOf(pokemon, battle) {
  return {side: pokemon.side === battle.nearSide ? 'near' : 'far', i: pokemon.slot | 0};
}

export function hpColor(hp, maxhp) {
  const r = maxhp ? hp / maxhp : 0;
  return r > 0.5 ? 'g' : r > 0.2 ? 'y' : 'r';
}

/** near: the viewer's side, which shows exact HP; the other side shows percent. */
export function plateModel(p, near) {
  const hp = Math.max(0, p.hp || 0), maxhp = p.maxhp || 1;
  const hpPct = Math.max(0, Math.min(100, Math.round(100 * hp / maxhp)));
  const chips = [];
  for (const [k, v] of Object.entries(p.boosts || {})) {
    if (!v || !STAT_LABEL[k]) continue;
    chips.push(`${STAT_LABEL[k]} ${v > 0 ? '+' : MINUS}${Math.abs(v)}`);
  }
  return {
    name: p.name || '',
    level: p.level || 100,
    gender: p.gender === 'M' || p.gender === 'F' ? p.gender : '',
    hpPct,
    hpText: near ? `${hp}/${maxhp}` : `${hpPct}%`,
    color: hpColor(hp, maxhp),
    status: p.status ? String(p.status).toUpperCase() : '',
    chips,
    tera: p.terastallized || null,
  };
}
