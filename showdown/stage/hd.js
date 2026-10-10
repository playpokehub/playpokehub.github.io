// HD sprites: the popular Pokémon's Showdown sprites upscaled (hd-sprites.mjs builds them into hd/, listed in
// hd/index.json). The stage shows Showdown's sprite first and swaps in the HD one once it has loaded; everyone else,
// and every sprite the index doesn't list, keeps Showdown's. Pure (tested in Node) except loadHdIndex.

/** index.json → {scale, has: Set of Showdown paths like 'ani/garchomp.gif', scales: the ones built at another scale},
 *  or null if it's missing or broken */
export function hdIndex(json) {
  if (!json || !Array.isArray(json.sprites)) return null;
  return {scale: json.scale || 2, has: new Set(json.sprites), scales: json.scales || {}};
}

/** how many times Showdown's size an HD sprite is (4 for the Z-A Megas' stills, else the index's scale) */
export function hdScale(url, index) {
  const m = index && /\/sprites\/([a-z0-9-]+\/[a-z0-9-]+\.(?:gif|png))$/.exec(url || '');
  return (m && index.scales?.[m[1]]) || index?.scale || 2;
}

/** Showdown sprite URL → its HD version's URL (under base, the stage folder), or null when there's none */
export function hdUrl(url, index, base) {
  if (!index || !url) return null;
  const m = /\/sprites\/([a-z0-9-]+\/[a-z0-9-]+\.(?:gif|png))$/.exec(url);
  if (!m || !index.has.has(m[1])) return null;
  return `${base}hd/${m[1].replace(/\.(gif|png)$/, '.webp')}`;
}

/** fetch hd/index.json (null when the HD sprites weren't built) */
export async function loadHdIndex(base) {
  try {
    const res = await fetch(`${base}hd/index.json`, {cache: 'no-cache'});
    return res.ok ? hdIndex(await res.json()) : null;
  } catch (e) {
    return null;
  }
}

// The 3D battle's game sprites: the real in-game renders, front and back, from Scarlet/Violet or another 3D game
// (sv-sprites.mjs). Too big for the site (3.3 GB), so they're hosted on Cloudflare Pages with their index.json.
export const SV_BASE = 'https://pokehub-sprites.pages.dev/';

/** index.json (fetched from base) → {base, sprites: Map of Showdown path without extension ('ani/garchomp') →
 *  [file, drawn height in HD pixels]}, or null */
export function svIndex(json, base = SV_BASE) {
  return json && json.sprites && typeof json.sprites === 'object' ? {base, sprites: new Map(Object.entries(json.sprites))} : null;
}

/** Showdown sprite URL → its game sprite {src, hdHeight} (drawn as tall as the HD sprite would be), or null */
export function svSprite(url, index) {
  if (!index || !url) return null;
  const m = /\/sprites\/([a-z0-9-]+\/[a-z0-9-]+)\.(?:gif|png)$/.exec(url);
  const hit = m && index.sprites.get(m[1]);
  return hit ? {src: index.base + hit[0], hdHeight: hit[1]} : null;
}

/** fetch the game sprites' index (null when it can't be reached: the HD sprites stand in) */
export async function loadSvIndex(base = SV_BASE) {
  try {
    const res = await fetch(`${base}index.json`, {cache: 'no-cache'});
    return res.ok ? svIndex(await res.json(), base) : null;
  } catch (e) {
    return null;
  }
}
