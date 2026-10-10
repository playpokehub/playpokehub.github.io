// Battle music: a fixed rotation, one track per battle, in order: your own mp3s first (in tracks.json order), then Showdown's trainer and
// rival themes (half of them were dropped at random, 2026-09-30), then back to the top. Your own mp3s go in
// showdown/music/ and list them in showdown/music/tracks.json to add them:
//   [{"gen": 8, "file": "swsh-trainer.mp3", "name": "Sword & Shield trainer battle", "loopStart": 0, "loopEnd": 95000}]
// (loop points in ms; leave them out and the whole file loops). "gen" is just a label ("other" is fine).
// Pure: scene.js does the loading and playing.

// url is on Showdown's server (BattleSound adds https://play.pokemonshowdown.com/); loop points from Showdown's client
export const TRACKS = [
  {gen: 3, url: 'audio/oras-trainer.mp3', loopStart: 13579, loopEnd: 91548, name: 'Hoenn trainer battle'},
  {gen: 3, url: 'audio/colosseum-miror-b.mp3', loopStart: 896, loopEnd: 47462, name: 'Colosseum: Miror B.'},
  {gen: 3, url: 'audio/xd-miror-b.mp3', loopStart: 9000, loopEnd: 57815, name: 'XD: Miror B.'},
  {gen: 4, url: 'audio/dpp-trainer.mp3', loopStart: 13440, loopEnd: 96959, name: 'Sinnoh trainer battle'},
  {gen: 5, url: 'audio/bw-trainer.mp3', loopStart: 14629, loopEnd: 110109, name: 'Unova trainer battle'},
  {gen: 5, url: 'audio/bw-subway-trainer.mp3', loopStart: 15503, loopEnd: 110984, name: 'Battle Subway'},
  {gen: 5, url: 'audio/bw2-rival.mp3', loopStart: 7152, loopEnd: 68708, name: 'Unova rival battle (B2W2)'},
  {gen: 6, url: 'audio/xy-trainer.mp3', loopStart: 7802, loopEnd: 82469, name: 'Kalos trainer battle'},
  {gen: 6, url: 'audio/xy-rival.mp3', loopStart: 7802, loopEnd: 58634, name: 'Kalos rival battle'},
];
// a file with no loop points loops whole: BattleBGM needs a finite end, so use one far past any song's length
export const NO_LOOP_END = 10 * 3600 * 1000;

/** tracks.json entries → tracks (files are relative to the music folder); bad entries are skipped */
export function extraTracks(list, base) {
  return (Array.isArray(list) ? list : []).filter(t => t && t.file && /\.(mp3|ogg|m4a)$/i.test(t.file) && !/[/\\]|\.\./.test(t.file)).map(t => ({
    gen: typeof t.gen === 'string' && !/^\d+$/.test(t.gen) ? t.gen : Math.max(1, Math.min(9, t.gen | 0 || 9)), url: base + encodeURIComponent(t.file), own: true, name: String(t.name || t.file),
    loopStart: Math.max(0, +t.loopStart || 0), loopEnd: +t.loopEnd > 0 ? +t.loopEnd : NO_LOOP_END,
  }));
}

/** The track after `last` (a url) in the list; the first one if `last` is empty or no longer listed. */
export function nextTrack(tracks, last = '') {
  if (!tracks.length) return null;
  const i = tracks.findIndex(t => t.url === last);
  return tracks[(i + 1) % tracks.length];
}
