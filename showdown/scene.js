// Runs inside showdown/scene.html (an iframe on the battle screen): Pokémon Showdown's battle engine with either our
// Battle Stage renderer (stage/, default) or Showdown's own classic renderer, fed the simulator's protocol lines by
// the parent page (src/ui/scene.js) through postMessage.
//   parent → scene: {forge: 'init', lines, names: {p1: {name, avatar}, p2: {...}}, volume, speed, instant, viewpoint,
//                    renderer: 'stage'|'classic'}
//                   {forge: 'add', lines} · {forge: 'skip'} · {forge: 'volume', volume} · {forge: 'speed', value}
//   volume: {master, music, cries} as 0–100 (music and cries are scaled by master)
//   scene → parent: {forge: 'ready'} · {forge: 'idle', count} (all `count` lines shown) · {forge: 'error', message}
//                   · {forge: 'error', message, fallback: true} (the stage failed; the classic picture took over)
import {StageScene} from './stage/stage-scene.js?v=ef3bd64312';
import {SCENE_METHODS} from './stage/scene-methods.js?v=ef3bd64312';
import {TRACKS, extraTracks, nextTrack} from './stage/music.js?v=ef3bd64312';

(function () {
  'use strict';
  var ClassicScene = window.BattleScene;
  window.ClassicScene = ClassicScene; // the stage borrows Showdown's music handling
  window.StageScene = StageScene; // the stage lab patches it to test the fallback
  var battle = null;
  var lastInit = null;
  var allLines = [];
  var fellBack = false;
  var sent = 0;
  var names = {};
  var speed = 'normal';
  var replay = false; // replay mode: report the turn after every change (src/ui/replay.js)

  // Showdown has no sprite at all for some newer formes (Garchomp-Mega-Z from behind, Absol-Mega-Z, …), so the
  // battle would show an empty spot. On a failed sprite try the still Gen 5 picture, then the forme it comes from.
  // Showdown builds the <img> before adding it to the page, so the load can fail before we see it: check each sprite
  // as it arrives (and whenever its src changes) and retry on failure.
  // A forme with no back sprite (the Z-A Megas) falls back to its own front, mirrored to face the foe (front sprites face
  // left, towards your side), before giving up the forme for its base species' sprite.
  function nextSprite(src) {
    var m = /^(.*\/sprites\/)(ani|gen5)(-back)?(-shiny)?\/([a-z0-9-]+)\.(gif|png)$/.exec(src);
    if (!m) return null;
    var id = m[5];
    if (m[2] === 'gen5') {
      if (id.indexOf('-') < 0) return null;
      if (m[3]) return {src: m[1] + 'gen5' + (m[4] || '') + '/' + id + '.png', flip: true};
      id = id.replace(/-[a-z0-9]+$/, '');
    }
    return {src: m[1] + 'gen5' + (m[3] || '') + (m[4] || '') + '/' + id + '.png', flip: false};
  }
  function retry(img) {
    var tries = img.getAttribute('data-tries') | 0;
    var next = tries < 4 && nextSprite(img.src);
    if (!next) return;
    img.setAttribute('data-tries', tries + 1);
    if (next.flip) img.setAttribute('data-flip', '');
    img.setAttribute('data-ours', next.src);
    img.style.scale = img.hasAttribute('data-flip') ? '-1 1' : '';
    img.src = next.src;
  }
  function watchSprite(img) {
    if (img.tagName !== 'IMG' || !/\/sprites\//.test(img.src)) return;
    // a new picture (not one of our retries): drop any mirroring from the last one
    if (img.src !== img.getAttribute('data-ours') && (img.hasAttribute('data-flip') || img.hasAttribute('data-ours'))) {
      img.removeAttribute('data-flip');
      img.removeAttribute('data-ours');
      img.style.scale = '';
    }
    img.onerror = function () { retry(img); };
    if (img.complete && img.naturalWidth === 0) retry(img);
  }
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      if (r.type === 'attributes') return watchSprite(r.target);
      r.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        watchSprite(n);
        if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll('img'), watchSprite);
      });
    });
  }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['src']});

  // ---- battle music: the next track in a fixed order for every battle, in both pictures (stage/music.js) ----
  var tracks = TRACKS.slice();
  var musicDir = new URL('music/', location.href).href;
  // your own tracks come first in the rotation; rolling waits for the list so a battle that starts early doesn't skip them
  var tracksLoaded = false;
  var tracksReady = fetch(musicDir + 'tracks.json', {cache: 'no-cache'}).then(function (r) { return r.ok ? r.json() : []; })
    .then(function (list) { tracks = extraTracks(list, musicDir).concat(TRACKS); }).catch(function () { /* Showdown's tracks only */ })
    .then(function () { tracksLoaded = true; });
  if (window.BattleSound) {
    // Showdown's player only plays files from its own server; our own files (showdown/music/) have full URLs
    var showdownSound = BattleSound.getSound;
    BattleSound.getSound = function (url) {
      if (!/^https?:\/\//.test(url)) return showdownSound.call(this, url);
      if (this.soundCache[url]) return this.soundCache[url];
      try {
        var sound = document.createElement('audio');
        sound.src = url;
        sound.loop = true; // a file with no loop points repeats whole
        sound.volume = this.effectVolume / 100;
        this.soundCache[url] = sound;
        return sound;
      } catch (e) { return undefined; }
    };
  }
  // Showdown's updateBgm calls rollBgm and then this.bgm.resume() straight away, so this.bgm must be set before rollBgm
  // returns (a null bgm crashed the stage into the classic picture). Before tracks.json arrives, a silent stand-in holds
  // the place and the real track swaps in once the list is ready.
  function rollBgm() {
    var self = this;
    if (tracksLoaded) return playNext(self);
    var wait = {
      playing: false, stopped: false,
      resume: function () { this.playing = true; }, pause: function () { this.playing = false; }, stop: function () { this.stopped = true; },
    };
    if (self.bgm && self.bgm.stop) self.bgm.stop();
    self.bgm = wait;
    tracksReady.then(function () {
      if (self.bgm !== wait || wait.stopped) return; // the battle ended or rolled again meanwhile
      self.bgm = null;
      playNext(self);
    });
  }
  function playNext(scene) {
    var last = '';
    try { last = localStorage.getItem('forge.lastBgm') || ''; } catch (e) { /* no storage */ }
    var t = nextTrack(tracks, last);
    if (!t) return;
    try { localStorage.setItem('forge.lastBgm', t.url); } catch (e) { /* no storage */ }
    scene.bgmNum = t.url;
    scene.bgm = BattleSound.loadBgm(t.url, t.loopStart, t.loopEnd, scene.bgm);
    scene.updateBgm();
  }
  ClassicScene.prototype.rollBgm = rollBgm; // the stage borrows it too

  function post(msg) {
    msg.source = 'forge-scene';
    try { parent.postMessage(msg, location.origin === 'null' ? '*' : location.origin); } catch (e) { /* parent gone */ }
  }

  // the simulator calls the sides "You" and "Them"; show the trainer names the player picked instead
  function rename(line) {
    var m = /^\|player\|(p[12])\|/.exec(line);
    if (m && names[m[1]]) {
      var parts = line.split('|');
      parts[3] = names[m[1]].name || parts[3];
      if (names[m[1]].avatar) parts[4] = names[m[1]].avatar;
      return parts.join('|');
    }
    if (/^\|win\|/.test(line)) {
      var w = line.slice(5);
      var side = w === 'You' ? 'p1' : w === 'Them' ? 'p2' : '';
      return side && names[side] ? '|win|' + names[side].name : line;
    }
    return line;
  }

  function setSpeed(value) {
    speed = value === 'fast' ? 'fast' : 'normal';
    if (!battle) return;
    battle.messageShownTime = 1;
    battle.messageFadeTime = speed === 'fast' ? 50 : 300;
    battle.scene.updateAcceleration();
  }

  function setVolume(v) {
    if (!window.BattleSound) return;
    v = v || {};
    var pct = function (x) { x = Number(x); return isFinite(x) ? Math.max(0, Math.min(100, x)) : 0; };
    var master = pct(v.master);
    BattleSound.setMute(master === 0);
    BattleSound.setBgmVolume(master * pct(v.music) / 100);
    BattleSound.setEffectVolume(master * pct(v.cries) / 100);
    // music that is already playing keeps its old volume unless we update it too
    for (var i = 0; i < BattleSound.bgm.length; i++) {
      var s = BattleSound.bgm[i].sound;
      if (s) s.volume = Math.max(0, Math.min(1, BattleSound.bgmVolume / 100));
    }
  }

  function add(lines, instant) {
    allLines = allLines.concat(lines || []);
    lines = (lines || []).map(rename);
    sent += lines.length;
    if (lines.length) battle.addBatch(lines);
    if (instant) battle.seekTurn(Infinity);
    else if (battle.paused) battle.play();
    if (battle.atQueueEnd) post({forge: 'idle', count: sent});
  }

  // Any error inside the stage: tell the parent, rebuild with the classic renderer at the same point, carry on.
  function fallback(err) {
    if (fellBack) return;
    fellBack = true;
    post({forge: 'error', message: 'Battle stage: ' + String(err && err.message || err), fallback: true});
    var lines = allLines.slice();
    setTimeout(function () {
      init(Object.assign({}, lastInit, {renderer: 'classic', lines: lines, instant: true}));
    }, 0);
  }
  function guard(scene) {
    SCENE_METHODS.forEach(function (name) {
      var f = scene[name];
      if (typeof f !== 'function') return;
      scene[name] = function () {
        // after a fallback this scene is on its way out: only its own clean-up still runs
        if (fellBack) { if (name === 'destroy') { try { f.apply(scene, arguments); } catch (e) { /* ignore */ } } return undefined; }
        try { return f.apply(scene, arguments); } catch (e) {
          fallback(e);
          return undefined; // for finishAnimations: nothing to wait for
        }
      };
    });
    return scene;
  }

  function init(msg) {
    if (battle) { try { battle.destroy(); } catch (e) { /* ignore */ } }
    $('#battle').empty();
    $('#log').empty();
    names = msg.names || {};
    sent = 0;
    allLines = [];
    replay = !!msg.replay;
    lastInit = msg;
    // a stable name for this battle (same battle → same background); falls back to its opening lines
    window.__stageKey = String(msg.key || (msg.lines || []).slice(0, 12).join('\n'));
    window.__stageHints = msg.stage || {}; // {format, boss}: Champions → stadium, the Gauntlet's final boss → night arena
    var stage = msg.renderer !== 'classic';
    window.BattleScene = stage ? StageScene : ClassicScene;
    try {
      battle = new Battle({id: 'forge-battle', $frame: $('#battle'), $logFrame: $('#log'), log: [], paused: true, autoresize: true});
    } catch (err) {
      window.BattleScene = ClassicScene;
      if (!stage) throw err;
      // the stage couldn't even start: use the classic picture for this battle
      post({forge: 'error', message: 'Battle stage: ' + String(err && err.message || err), fallback: true});
      fellBack = true;
      $('#battle').empty().removeClass('stg-host').addClass('battle');
      init(Object.assign({}, msg, {renderer: 'classic'}));
      return;
    }
    window.BattleScene = ClassicScene;
    if (stage) guard(battle.scene);
    window.__forgeBattle = battle; // read by the stage lab (src/showdown/stage-lab.js)
    battle.subscribe(function (state) {
      if (state === 'atqueueend') post({forge: 'idle', count: sent});
      else if (state === 'error') post({forge: 'error', message: 'The battle scene could not show a move.'});
      if (replay) post({forge: 'state', turn: battle.turn, paused: !!battle.paused, atEnd: !!battle.atQueueEnd});
    });
    setVolume(msg.volume);
    setSpeed(msg.speed);
    // online player 2 watches from their own side
    if (msg.viewpoint === 'p2' && !battle.viewpointSwitched) battle.switchViewpoint();
    add(msg.lines, msg.instant);
  }

  window.addEventListener('message', function (e) {
    if (e.source !== parent || e.origin !== location.origin) return;
    var msg = e.data || {};
    try {
      if (msg.forge === 'init') { fellBack = false; init(msg); }
      else if (!battle) return;
      else if (msg.forge === 'add') add(msg.lines, false);
      else if (msg.forge === 'skip') battle.seekTurn(Infinity);
      else if (msg.forge === 'volume') setVolume(msg.volume);
      else if (msg.forge === 'speed') setSpeed(msg.value);
      // replay controls (src/ui/replay.js)
      else if (msg.forge === 'play') battle.play();
      else if (msg.forge === 'pause') battle.pause();
      else if (msg.forge === 'seek') battle.seekTurn(msg.turn === 'end' ? Infinity : Math.max(0, msg.turn | 0));
      else if (msg.forge === 'step') battle.seekBy(msg.by < 0 ? -1 : 1);
      if (replay && battle) post({forge: 'state', turn: battle.turn, paused: !!battle.paused, atEnd: !!battle.atQueueEnd});
    } catch (err) {
      post({forge: 'error', message: String(err && err.message || err)});
    }
  });

  if (typeof window.Battle === 'function' && window.jQuery) post({forge: 'ready'});
  else post({forge: 'error', message: 'The battle scene did not load.'});
})();
