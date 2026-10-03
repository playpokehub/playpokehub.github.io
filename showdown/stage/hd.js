// HD sprites: the popular Pokémon's Showdown sprites upscaled (hd-sprites.mjs builds them into hd/, listed in
// hd/index.json). The stage shows Showdown's sprite first and swaps in the HD one once it has loaded; everyone else,
// and every sprite the index doesn't list, keeps Showdown's. Pure (tested in Node) except loadHdIndex.

/** index.json → {scale, has: Set of Showdown paths like 'ani/garchomp.gif'}, or null if it's missing or broken */
export function hdIndex(json) {
  if (!json || !Array.isArray(json.sprites)) return null;
  return {scale: json.scale || 2, has: new Set(json.sprites)};
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
