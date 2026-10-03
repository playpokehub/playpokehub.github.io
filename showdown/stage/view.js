// The stage's DOM: layers, Pokémon, corner plates, texts, and the player for the director's timelines.
// Steps start on timers (setTimeout), and each runs as a Web Animation; nothing here decides when Battle may go on.
import {plateModel} from './hud.js?v=0adcc7af57';
import {fxLayer} from './fx.js?v=0adcc7af57';
import {shot} from './camera.js?v=0adcc7af57';
import {PALETTES} from './recipes.js?v=0adcc7af57';
import {sidePill} from './field.js?v=0adcc7af57';
import {teraFilterId, crownSVG, TERA_COLORS} from './tera.js?v=0adcc7af57';
import {hdUrl, loadHdIndex} from './hd.js?v=0adcc7af57';

export const W = 800, H = 450;
const BASE = new URL('.', import.meta.url).href; // …/showdown/stage/
const key = t => `${t.side}${t.i}`;
const rnd = (a, b) => a + Math.random() * (b - a);
const EASE = 'cubic-bezier(.2,.8,.2,1)', WHIP = 'cubic-bezier(.7,0,.3,1)';

// Protect's dome: pointy-top hexagons inside a circle (viewBox -100…100), each lighting up after a delay that grows
// with its distance from the middle, so the shield ripples out
let HEX_SVG = '';
function hexDome() {
  if (HEX_SVG) return HEX_SVG;
  const R = 94, r = 12.5, w = Math.sqrt(3) * r, cells = [];
  for (let row = -9; row <= 9; row++) {
    for (let col = -9; col <= 9; col++) {
      const x = col * w + (row & 1 ? w / 2 : 0), y = row * 1.5 * r, d = Math.hypot(x, y);
      if (d > R + r * 0.3) continue;
      const pts = [0, 1, 2, 3, 4, 5].map(k => { const t = Math.PI / 180 * (60 * k - 90); return `${(x + r * 0.9 * Math.cos(t)).toFixed(1)},${(y + r * 0.9 * Math.sin(t)).toFixed(1)}`; });
      cells.push(`<polygon points="${pts.join(' ')}" style="--d:${(d / R * 0.32).toFixed(3)}"/>`);
    }
  }
  HEX_SVG = `<svg viewBox="-100 -100 200 200" aria-hidden="true"><defs><clipPath id="stg-hex-clip"><circle r="${R}"/></clipPath></defs>
    <circle class="stg-hex-fill" r="${R}"/><circle class="stg-hex-edge" r="${R - 7}"/><g class="stg-hex-cells" clip-path="url(#stg-hex-clip)">${cells.join('')}</g>
    <circle class="stg-hex-rim" r="${R}"/><ellipse class="stg-hex-shine" cx="-38" cy="-50" rx="26" ry="11" transform="rotate(-32 -38 -50)"/></svg>`;
  return HEX_SVG;
}
function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export class StageView {
  constructor(host, {reduced = false} = {}) {
    this.host = host;
    this.reduced = reduced;
    const root = el('div', 'stg', host);
    root.innerHTML = `
      <div class="stg-shake"><div class="stg-cam">
        <div class="stg-far"></div>
        <div class="stg-world"><div class="stg-near"></div><div class="stg-terrain"></div><div class="stg-room"></div>
          <div class="stg-side stg-side-far"></div><div class="stg-side stg-side-near"></div>
          <div class="stg-lineup"></div><div class="stg-actors"></div><canvas class="stg-fx"></canvas></div>
      </div></div>
      <div class="stg-overlay"></div><div class="stg-vignette"></div>
      <div class="stg-hud stg-hud-far"></div><div class="stg-hud stg-hud-near"></div>
      <div class="stg-turn" hidden></div><div class="stg-pill" hidden></div><div class="stg-banner"></div><div class="stg-pops"></div>
      <div class="stg-msg"></div><div class="stg-flash"></div>`;
    this.root = root;
    const q = s => root.querySelector(s);
    Object.assign(this, {shaker: q('.stg-shake'), cam: q('.stg-cam'), far: q('.stg-far'), world: q('.stg-world'), near: q('.stg-near'),
      lineup: q('.stg-lineup'), actorsEl: q('.stg-actors'), hudFar: q('.stg-hud-far'), hudNear: q('.stg-hud-near'), turnEl: q('.stg-turn'),
      banner: q('.stg-banner'), pops: q('.stg-pops'), msg: q('.stg-msg'), flashEl: q('.stg-flash'), overlay: q('.stg-overlay'),
      terrain: q('.stg-terrain'), room: q('.stg-room'), sideFar: q('.stg-side-far'), sideNear: q('.stg-side-near'), pill: q('.stg-pill')});
    this.overlay.innerHTML = '<div class="stg-wx"></div><div class="stg-wx stg-wx2"></div><div class="stg-wx stg-wx3"></div>';
    // Tailwind's leaves, riding the wind on each side (shown while that side has it)
    for (const s of [this.sideNear, this.sideFar]) s.innerHTML = '<span class="stg-tw"><i></i><i></i><i></i><i></i><i></i><i></i></span>';
    this.actors = new Map(); // slot key -> {wrap, body, img, shadow, species}
    this.plates = new Map(); // slot key -> {el, bar, trail, hp, ...}
    this.timers = new Set();
    this.gameType = 'singles';
    this.fx = fxLayer(root.querySelector('.stg-fx'), {reduced});
    this.frame = {x: 0, y: 0, s: 1};
    // a slow drift so a quiet scene never looks frozen
    if (!reduced) this.drift = setInterval(() => {
      if (this.frame.s === 1 && !this.timers.size) this.far.animate([{transform: 'none'}, {transform: 'translate(-6px, -2px) scale(1.012)'}, {transform: 'none'}], {duration: 9000});
    }, 9000);
    this.fit();
    this.onResize = () => this.fit();
    window.addEventListener('resize', this.onResize);
    // the iframe can change size without a resize event reaching us (layout changes, a hidden pane): watch the box too
    if (window.ResizeObserver) { this.ro = new ResizeObserver(this.onResize); this.ro.observe(document.documentElement); }
    // HD sprites (hd.js): once the list has loaded, upgrade the Pokémon already out
    this.hd = null;
    loadHdIndex(BASE).then(index => {
      this.hd = index;
      if (index && !this.destroyed) for (const a of this.actors.values()) this.upgrade(a);
    });
  }

  // ---- layout ----
  fit() {
    const w = window.innerWidth || W, h = window.innerHeight || H;
    const s = Math.min(w / W, h / H) || 1;
    this.root.style.transform = `translate(${(w - W * s) / 2}px, ${(h - H * s) / 2}px) scale(${s})`;
  }
  setBackdrop(bd, gameType) {
    this.backdrop = bd;
    this.gameType = gameType === 'doubles' ? 'doubles' : 'singles';
    this.relayout();
    const img = (layer, url) => {
      const probe = new Image();
      probe.onload = () => { layer.style.backgroundImage = `url("${BASE}${url}")`; layer.classList.remove('stg-missing'); };
      probe.onerror = () => layer.classList.add('stg-missing'); // gradient court, the stage carries on
      probe.src = BASE + url;
    };
    img(this.far, bd.far);
    img(this.near, bd.near);
    // framing: the painting is zoomed (z) around (fx, fy) so its court sits under the Pokémon's spots
    const {z = 1, fx = W / 2, fy = H / 2} = bd.view || {};
    const h0 = bd.horizon * H;
    this.far.style.backgroundSize = `${W * z}px ${H * z}px`;
    this.far.style.backgroundPosition = `${fx * (1 - z)}px ${fy * (1 - z)}px`;
    this.near.style.top = `${fy + (h0 - fy) * z}px`;
    this.near.style.backgroundSize = `${W * z}px ${(H - h0) * z}px`;
    this.near.style.backgroundPosition = `${fx * (1 - z)}px 0px`;
    if (this.debugCourt) this.drawCourt();
  }
  /** the stage lab's &debug=court: draw the court outline and the Pokémon's spots */
  drawCourt() {
    this.debugCourt = true;
    const bd = this.backdrop, {z = 1, fx = 400, fy = 225} = bd.view || {};
    const pts = (bd.court || []).map(([x, y]) => `${fx + (x - fx) * z},${fy + (y - fy) * z}`).join(' ');
    let svg = this.world.querySelector('.stg-debug');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'stg-debug'); svg.setAttribute('viewBox', '0 0 800 450'); this.world.appendChild(svg); }
    const dots = ['near', 'far'].flatMap(side => (bd.slots[this.gameType] || bd.slots.singles)[side].map(a => `<circle cx="${a.x}" cy="${a.y}" r="5" fill="${side === 'near' ? '#d9ff3d' : '#ff6a48'}"/>`));
    svg.innerHTML = `<polygon points="${pts}" fill="rgba(217,255,61,.12)" stroke="#d9ff3d" stroke-width="3"/>${dots.join('')}`;
  }
  anchor(t) {
    const set = (this.backdrop.slots[this.gameType] || this.backdrop.slots.singles)[t.side] || [];
    return set[t.i] || set[set.length - 1] || {x: W / 2, y: H * 0.8, scale: 1};
  }

  /** move every Pokémon to its spot for the current background and battle type (the scene may learn it's doubles
   * after the first Pokémon already appeared); effects aim at the same spots, so attacks land on the right Pokémon */
  relayout() {
    for (const [k, a] of this.actors) {
      const at = this.anchor({side: k.startsWith('near') ? 'near' : 'far', i: +k.slice(-1)});
      a.wrap.style.left = `${at.x}px`;
      a.wrap.style.top = `${at.y}px`;
      a.scale = at.scale;
      a.body.style.setProperty('--s', String(at.scale));
    }
  }

  // ---- Pokémon ----
  actor(t) {
    const k = key(t);
    let a = this.actors.get(k);
    if (a) return a;
    const at = this.anchor(t);
    const wrap = el('div', `stg-actor stg-a-${t.side}`, this.actorsEl);
    wrap.dataset.slot = k;
    wrap.style.left = `${at.x}px`;
    wrap.style.top = `${at.y}px`;
    wrap.style.zIndex = String(t.side === 'near' ? 20 + t.i : 10 + t.i);
    const shadow = el('div', 'stg-shadow', wrap);
    const body = el('div', 'stg-body', wrap);
    const img = el('img', 'stg-img', body);
    img.alt = '';
    el('div', 'stg-sfx', wrap).innerHTML = '<span></span><span></span><span></span>';
    body.style.setProperty('--s', String(at.scale));
    a = {wrap, body, img, shadow, species: '', scale: at.scale};
    this.actors.set(k, a);
    return a;
  }
  /** keep: a forme change (Mega, Transform…) keeps showing the old picture until the new one has loaded */
  setSprite(t, sprite, {keep = false} = {}) {
    const a = this.actor(t);
    if (!sprite) { a.wrap.hidden = true; a.species = ''; return a; }
    a.wrap.hidden = false;
    if (a.url !== sprite.url) {
      const had = !!a.url;
      a.url = sprite.url;
      if (keep && had) this.swapSprite(a, sprite.url);
      else this.showSprite(a, sprite.url);
      // drop a Substitute doll the last one left behind
      if (a.species && a.species !== sprite.species) this.sub(t, false);
    }
    a.species = sprite.species;
    a.shadow.style.width = `${Math.round((sprite.w || 96) * a.scale * 0.8)}px`;
    a.wrap.style.setProperty('--h', `${Math.round((sprite.h || 96) * a.scale)}px`);
    return a;
  }
  /**
   * A new Pokémon: start the sprite fallback chain afresh (scene.js retries a missing sprite with the still Gen 5
   * picture). The old picture is hidden until the new one loads: with its width cleared, an HD sprite would otherwise
   * show at its full, doubled size for a moment.
   */
  showSprite(a, url) {
    const img = a.img;
    img.style.visibility = 'hidden';
    img.onload = () => { img.style.visibility = ''; };
    img.removeAttribute('data-tries');
    img.style.width = '';
    img.src = url;
    this.upgrade(a);
  }
  /** A forme change: load the new picture (HD when there is one) first, then switch to it at its own size in one go. */
  swapSprite(a, url) {
    const hd = hdUrl(url, this.hd, BASE);
    const load = (src, scale, otherwise) => {
      const im = new Image();
      im.onload = () => {
        if (a.url !== url || this.destroyed) return;
        if (!im.naturalWidth) { otherwise(); return; }
        a.img.removeAttribute('data-tries');
        a.img.style.visibility = '';
        a.img.style.width = `${im.naturalWidth / scale}px`;
        a.img.src = src;
      };
      im.onerror = () => { if (a.url === url && !this.destroyed) otherwise(); };
      im.src = src;
    };
    const plain = () => load(url, 1, () => this.showSprite(a, url));
    if (hd) load(hd, this.hd.scale, plain);
    else plain();
  }
  /** swap in the HD sprite once it has loaded: Showdown's shows meanwhile, and stays if there's none or it fails */
  upgrade(a) {
    const url = a.url, hd = hdUrl(url, this.hd, BASE);
    if (!hd) return;
    const im = new Image();
    im.onload = () => {
      if (a.url !== url || !im.naturalWidth || this.destroyed) return; // a different Pokémon by now
      a.img.style.width = `${im.naturalWidth / this.hd.scale}px`; // same size on screen as Showdown's, twice the detail
      a.img.src = hd;
    };
    im.src = hd;
  }
  sub(t, on) {
    const a = this.actor(t);
    a.body.classList.toggle('stg-subbed', !!on);
    let s = a.wrap.querySelector('.stg-sub');
    if (on && !s) {
      s = el('img', 'stg-sub', a.wrap);
      s.alt = '';
      s.src = `https://play.pokemonshowdown.com/sprites/substitutes/gen5${t.side === 'near' ? '-back' : ''}/substitute.png`;
    } else if (!on && s) s.remove();
  }

  // ---- plates ----
  plate(t) {
    const k = key(t);
    let p = this.plates.get(k);
    if (p) return p;
    const host = t.side === 'near' ? this.hudNear : this.hudFar;
    const e = el('div', `stg-plate stg-plate-${t.side}`, host);
    e.dataset.slot = k;
    e.style.order = String(t.i);
    e.innerHTML = `<div class="stg-pt"><b class="stg-pn"></b><i class="stg-pg"></i><span class="stg-st"></span><span class="stg-tera"></span><span class="stg-lv"></span></div>
      <div class="stg-hp"><s></s><i></i></div><div class="stg-pb"><span class="stg-chips"></span><span class="stg-hpn"></span></div>`;
    p = {el: e, name: e.querySelector('.stg-pn'), gender: e.querySelector('.stg-pg'), status: e.querySelector('.stg-st'), tera: e.querySelector('.stg-tera'),
      level: e.querySelector('.stg-lv'), bar: e.querySelector('.stg-hp i'), trail: e.querySelector('.stg-hp s'), chips: e.querySelector('.stg-chips'),
      hpn: e.querySelector('.stg-hpn'), pct: -1};
    this.plates.set(k, p);
    return p;
  }
  setPlate(t, m, {animate = false} = {}) {
    const p = this.plate(t);
    this.actor(t).wrap.dataset.status = m ? m.status.toLowerCase() : '';
    this.setTera(t, m && m.tera);
    this.actor(t).wrap.classList.toggle('stg-dyna', !!(m && m.dyna));
    if (!m) { p.el.hidden = true; return; }
    p.el.hidden = false;
    p.name.textContent = m.name;
    p.gender.textContent = m.gender === 'M' ? '♂' : m.gender === 'F' ? '♀' : '';
    p.gender.dataset.g = m.gender;
    p.level.textContent = `Lv.${m.level}`;
    p.status.textContent = m.status;
    p.status.hidden = !m.status;
    p.status.dataset.s = m.status.toLowerCase();
    p.tera.hidden = !m.tera;
    p.tera.textContent = m.tera ? `Tera ${m.tera}` : '';
    p.chips.textContent = m.chips.join('  ');
    p.hpn.textContent = m.hpText;
    p.bar.dataset.c = m.color;
    const from = p.pct < 0 ? m.hpPct : p.pct;
    p.pct = m.hpPct;
    p.bar.style.width = `${m.hpPct}%`;
    p.trail.style.width = `${m.hpPct}%`;
    if (!animate || from === m.hpPct) return;
    p.bar.animate([{width: `${from}%`}, {width: `${m.hpPct}%`}], {duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)'});
    // a red trail shows the HP just lost, then catches up
    if (m.hpPct < from) p.trail.animate([{width: `${from}%`}, {width: `${from}%`, offset: 0.45}, {width: `${m.hpPct}%`}], {duration: 900, easing: 'ease-in'});
  }

  // ---- full picture (seek, instant, resets) ----
  /** state: {slots: [{t, sprite, plate, sub}], turn, lineup: {near: sprite[], far: sprite[]}|null} */
  apply(state) {
    this.cancel();
    if (state.field) this.setField(state.field, state.pill);
    this.fx.clear();
    this.frame = {x: 0, y: 0, s: 1};
    this.world.getAnimations().forEach(x => x.cancel());
    this.far.getAnimations().forEach(x => x.cancel());
    this.banner.innerHTML = '';
    const seen = new Set();
    for (const s of state.slots) {
      seen.add(key(s.t));
      const a = this.setSprite(s.t, s.sprite);
      a.wrap.getAnimations().forEach(x => x.cancel());
      a.body.getAnimations().forEach(x => x.cancel());
      a.body.style.opacity = '';
      this.setPlate(s.t, s.sprite ? s.plate : null);
      this.sub(s.t, s.sub);
    }
    for (const [k, a] of this.actors) if (!seen.has(k)) { a.wrap.hidden = true; const p = this.plates.get(k); if (p) p.el.hidden = true; }
    this.setTurn(state.turn);
    this.setLineup(state.lineup);
  }
  setTurn(n) {
    this.turnEl.hidden = !(n > 0);
    this.turnEl.textContent = `Turn ${n}`;
  }
  setLineup(lineup) {
    this.lineup.innerHTML = '';
    if (!lineup) return;
    for (const side of ['far', 'near']) {
      const row = el('div', `stg-row stg-row-${side}`, this.lineup);
      for (const sp of lineup[side] || []) { const i = el('img', '', row); i.alt = ''; i.src = sp.url; }
    }
  }
  message(text) {
    if (!text) return;
    this.msg.textContent = text;
    this.msg.getAnimations().forEach(a => a.cancel());
    this.msg.animate([{opacity: 0, transform: 'translateY(6px)'}, {opacity: 1, transform: 'none', offset: 0.08},
      {opacity: 1, offset: 0.85}, {opacity: 0}], {duration: 2600, fill: 'forwards'});
  }

  // ---- timelines ----
  cancel() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
  /** Play a director timeline starting at `startAt` (performance.now() time); ctx = {sprite, plate, cry} snapshots. */
  play(tl, startAt, ctx = {}) {
    for (const step of tl.steps) {
      const delay = Math.max(0, startAt + step.at - performance.now());
      const id = setTimeout(() => { this.timers.delete(id); try { this.run(step, ctx); } catch (e) { /* a lost frame is fine */ } }, delay);
      this.timers.add(id);
    }
  }
  run(s, ctx) {
    const dur = Math.max(1, s.dur);
    const t = s.target;
    switch (s.kind) {
      case 'cam': return this.camera(shot(s.shot, (s.targets || []).map(x => this.anchor(x)), s.s), dur, s.ease === 'whip' ? WHIP : EASE);
      case 'actor': return this.act(s, t, dur, ctx);
      case 'hud':
        if (s.act === 'turn') return this.setTurn(s.turn);
        if (s.act === 'hide') { this.plate(t).el.animate([{opacity: 1}, {opacity: 0}], {duration: dur, fill: 'forwards'}); return; }
        if (s.act === 'gone') { const p = this.plate(t); p.el.hidden = true; p.el.getAnimations().forEach(x => x.cancel()); return; }
        if (s.act === 'show') { this.plate(t).el.getAnimations().forEach(x => x.cancel()); this.setPlate(t, ctx.plate); this.plate(t).el.animate([{opacity: 0, transform: 'translateX(24px)'}, {opacity: 1, transform: 'none'}], {duration: dur, easing: 'cubic-bezier(.2,.8,.2,1)'}); return; }
        if (s.act === 'tera') { this.setTera(t, s.teraType); return this.plate(t) && this.setPlate(t, ctx.plate ? {...ctx.plate, tera: s.teraType} : null); }
        return this.setPlate(t, ctx.plate, {animate: s.act === 'hp'});
      case 'flash': return this.flash(t, s.opacity ?? 0.6, dur, s.color);
      case 'shake': return this.shaker.animate([{transform: 'none'}, {transform: `translate(${-s.px}px, ${s.px * 0.6}px)`}, {transform: `translate(${s.px * 0.8}px, ${-s.px * 0.5}px)`},
        {transform: `translate(${-s.px * 0.4}px, ${s.px * 0.3}px)`}, {transform: 'none'}], {duration: dur});
      case 'text':
        if (s.act === 'line') return this.message(s.text);
        return this.pop(t, s.act === 'types' ? (s.types || []).join(' / ') : s.text, s.tone, dur);
      case 'banner': return s.act === 'move' ? this.moveBanner(s.text, s.palette, ctx.user, s.big, dur) : this.abilityPop(t, s.text, dur);
      case 'fx': return s.role ? this.effect(s, dur) : this.puff(t, s.fx, s.color, dur, s.amount ?? 1);
      case 'field': return this.fieldStep(s, dur);
      default: return undefined;
    }
  }
  act(s, t, dur, ctx) {
    if (s.act === 'lineup') return this.lineup.animate([{opacity: 0}, {opacity: 1}], {duration: dur});
    const a = this.actor(t);
    const b = a.body;
    const ease = 'cubic-bezier(.2,.8,.2,1)';
    switch (s.act) {
      case 'ball': {
        this.setLineup(null);
        b.getAnimations().forEach(x => x.cancel());
        const ball = el('div', 'stg-ball', a.wrap);
        const from = t.side === 'near' ? 'translate(-160px, -40px)' : 'translate(160px, -120px)';
        ball.animate([{transform: `${from} rotate(0)`}, {transform: 'translate(0, -120px) rotate(360deg)', offset: 0.6}, {transform: 'translate(0, -40px) rotate(540deg)'}],
          {duration: dur, easing: 'ease-out'}).onfinish = () => ball.remove();
        a.wrap.hidden = false;
        b.style.opacity = '0';
        return undefined;
      }
      case 'appear':
        this.setLineup(null);
        b.getAnimations().forEach(x => x.cancel());
        a.wrap.hidden = false;
        if (ctx.sprite) this.setSprite(t, ctx.sprite);
        if (s.cry && ctx.cry) this.cry(ctx.cry);
        b.style.opacity = '';
        return b.animate([{transform: 'scale(.2)', opacity: 0, filter: 'brightness(3)'}, {transform: 'scale(1.08)', opacity: 1, offset: 0.6, filter: 'brightness(1.4)'},
          {transform: 'scale(1)', opacity: 1, filter: 'none'}], {duration: dur, easing: ease});
      case 'recall':
        return b.animate([{transform: 'scale(1)', filter: 'none', opacity: 1}, {transform: 'scale(.6)', filter: 'brightness(.6) sepia(1) hue-rotate(-50deg) saturate(6)', opacity: 0.8, offset: 0.5},
          {transform: 'scale(.05)', opacity: 0}], {duration: dur, easing: 'ease-in', fill: 'forwards'});
      case 'slideout':
        return b.animate([{transform: 'none', opacity: 1}, {transform: `translateX(${t.side === 'near' ? -120 : 120}px)`, opacity: 0}], {duration: dur, easing: 'ease-in', fill: 'forwards'});
      case 'faint':
        if (s.cry && ctx.cry) this.cry(ctx.cry);
        return b.animate([{transform: 'none', opacity: 1, filter: 'none'}, {transform: 'translateY(10px)', opacity: 1, filter: 'saturate(0) brightness(.8)', offset: 0.3},
          {transform: 'translateY(46px) scaleY(.7)', opacity: 0, filter: 'saturate(0) brightness(.5)'}], {duration: dur, easing: 'ease-in', fill: 'forwards'});
      case 'hide':
        a.wrap.hidden = true;
        b.getAnimations().forEach(x => x.cancel());
        return undefined;
      case 'sub':
        return this.sub(t, s.on);
      case 'hurt':
        return b.animate([{filter: 'brightness(3) saturate(0)', transform: 'translateX(0)'}, {filter: 'none', transform: `translateX(${t.side === 'near' ? -8 : 8}px)`, offset: 0.35},
          {filter: 'brightness(3) saturate(0)', offset: 0.55}, {filter: 'none', transform: 'none'}], {duration: dur});
      case 'swap':
        if (ctx.sprite) this.setSprite(t, ctx.sprite, {keep: true});
        return undefined;
      case 'jump':
        return b.animate([{transform: 'none'}, {transform: 'translateY(-34px)', offset: 0.45}, {transform: 'translateY(3px) scaleY(.94)', offset: 0.85}, {transform: 'none'}], {duration: dur, easing: 'ease-out'});
      case 'spin':
        return b.animate([{scale: '1 1'}, {scale: '-1 1', offset: 0.5}, {scale: '1 1'}], {duration: dur, easing: 'ease-in-out'});
      case 'glow':
        return b.animate([{filter: 'none'}, {filter: `drop-shadow(0 0 18px ${s.color || '#fff'}) brightness(2.2) saturate(0)`}], {duration: dur, fill: 'forwards'})
          .finished.then(() => b.getAnimations().forEach(x => x.cancel())).catch(() => {});
      case 'grow':
        a.wrap.classList.add('stg-dyna');
        return b.animate([{scale: '1'}, {scale: '2'}, {scale: '1.8'}], {duration: dur, easing: EASE});
      case 'shrink':
        a.wrap.classList.remove('stg-dyna');
        return b.animate([{scale: '1.8'}, {scale: '1'}], {duration: dur, easing: EASE});
      case 'lunge': {
        const from = this.anchor(t), to = this.anchor((s.to && s.to[0]) || t);
        const dx = (to.x - from.x) * 0.78, dy = (to.y - from.y) * 0.78, sc = 1 + ((to.scale || 1) / (from.scale || 1) - 1) * 0.78;
        const end = `translate(${dx}px, ${dy}px) scale(${sc})`;
        this.afterimages(a, dx, dy, sc, dur);
        a.lunged = b.animate([{transform: 'none'}, {transform: end}], {duration: dur, easing: 'cubic-bezier(.6,0,.9,.5)', fill: 'forwards'});
        return a.lunged;
      }
      case 'return': {
        const cur = a.lunged ? getComputedStyle(b).transform : 'none';
        if (a.lunged) { a.lunged.cancel(); a.lunged = null; }
        return b.animate([{transform: cur === 'none' ? 'none' : cur}, {transform: 'none'}], {duration: dur, easing: 'ease-out'});
      }
      default: return undefined;
    }
  }
  // ---- Tera ----
  setTera(t, type) {
    const a = this.actor(t);
    if (a.tera === (type || null)) return;
    a.tera = type || null;
    a.wrap.querySelectorAll('.stg-crown, .stg-aura').forEach(x => x.remove());
    if (!type) { a.img.style.filter = ''; return; }
    a.img.style.filter = `url(#${teraFilterId(type, this.root.ownerDocument)}) drop-shadow(0 6px 10px rgba(30, 20, 0, .25))`;
    const crown = el('div', 'stg-crown', a.wrap);
    crown.innerHTML = crownSVG(type);
    const aura = el('div', 'stg-aura', a.wrap);
    aura.style.setProperty('--tc', TERA_COLORS[type] || TERA_COLORS.Stellar);
    a.wrap.insertBefore(aura, a.wrap.firstChild);
  }

  // ---- field ----
  /** model: fieldModel(); pill: turn counts text (Showdown's), else the model's */
  setField(model, pill) {
    if (!model) return;
    this.overlay.dataset.wx = model.weather || '';
    this.terrain.dataset.t = model.terrain || '';
    this.room.dataset.r = (model.rooms || []).join(' ');
    this.sideNear.dataset.c = (model.sides.near || []).join(' ');
    this.sideFar.dataset.c = (model.sides.far || []).join(' ');
    const text = [pill !== undefined ? pill : model.pill, sidePill(model)].filter(Boolean).join(' · ');
    this.pill.hidden = !text;
    this.pill.textContent = text || '';
  }
  fieldStep(s, dur) {
    if (s.act === 'card') return this.fieldCard(s.card, s.on, dur);
    if (s.act === 'wash') return this.fieldWash(s, dur);
    this.setField(s.model, s.pill);
    if (!s.fresh) return;
    // a new weather/terrain/room eases in with a pulse
    const target = s.side ? (s.side === 'near' ? this.sideNear : this.sideFar) : /terrain$/.test(s.fresh) ? this.terrain
      : ['trickroom', 'magicroom', 'wonderroom', 'gravity'].includes(s.fresh) ? this.room : this.overlay;
    target.animate([{opacity: 0}, {opacity: 1}], {duration: dur, easing: EASE});
  }

  /** The announcement: the effect's name big in its colour and Showdown's line under it; an ending is smaller and quieter. */
  fieldCard(card, on, dur) {
    const pal = PALETTES[card.palette] || PALETTES['???'];
    const c = el('div', 'stg-fcard' + (on ? '' : ' stg-fcard-end') + (card.side ? ` stg-fcard-${card.side}` : ''), this.root);
    c.style.setProperty('--tc', pal.main);
    c.style.setProperty('--tg', pal.glow);
    el('b', '', c).textContent = card.title;
    el('span', '', c).textContent = card.text;
    if (this.reduced) { c.animate([{opacity: 0}, {opacity: 1, offset: 0.15}, {opacity: 1, offset: 0.85}, {opacity: 0}], {duration: dur, fill: 'forwards'}).onfinish = () => c.remove(); return; }
    c.animate(on
      ? [{opacity: 0, transform: 'translate(-50%, -50%) scale(1.35)', filter: 'blur(6px)'}, {opacity: 1, transform: 'translate(-50%, -50%) scale(1)', filter: 'none', offset: 0.14},
        {opacity: 1, transform: 'translate(-50%, -50%) scale(1.03)', offset: 0.82}, {opacity: 0, transform: 'translate(-50%, -50%) scale(.96)'}]
      : [{opacity: 0, transform: 'translate(-50%, -40%)'}, {opacity: 1, transform: 'translate(-50%, -50%)', offset: 0.2}, {opacity: 1, offset: 0.8}, {opacity: 0, transform: 'translate(-50%, -58%)'}],
    {duration: dur, easing: EASE, fill: 'forwards'}).onfinish = () => c.remove();
  }
  /** A new effect washes the stage in its colour; Tailwind also sends a gust of streaks across from the side it helps. */
  fieldWash(s, dur) {
    const pal = PALETTES[s.palette] || PALETTES['???'];
    const w = el('div', 'stg-wash', this.root);
    w.style.background = `radial-gradient(ellipse at ${s.side === 'near' ? '30% 70%' : s.side === 'far' ? '70% 35%' : '50% 50%'}, ${pal.glow}, ${pal.main} 45%, transparent 80%)`;
    w.animate([{opacity: 0}, {opacity: 0.42, offset: 0.25}, {opacity: 0}], {duration: dur, easing: EASE, fill: 'forwards'}).onfinish = () => w.remove();
    if (this.reduced || s.id !== 'tailwind') return;
    const dir = s.side === 'far' ? -1 : 1; // your wind blows toward the foe (left → right), theirs the other way
    const g = el('div', 'stg-gust', this.root);
    for (let i = 0; i < 14; i++) {
      const line = el('i', '', g);
      line.style.top = `${8 + i * 6.3 + rnd(-2, 2)}%`;
      line.style.width = `${rnd(90, 220)}px`;
      line.animate([{transform: `translateX(${dir > 0 ? -260 : W + 40}px)`, opacity: 0}, {opacity: 0.9, offset: 0.2}, {transform: `translateX(${dir > 0 ? W + 40 : -260}px)`, opacity: 0}],
        {duration: dur * rnd(0.7, 1), delay: rnd(0, dur * 0.3), easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'both'});
    }
    setTimeout(() => g.remove(), dur * 1.4);
  }

  // ---- camera ----
  camera(f, dur, easing) {
    const from = this.frame;
    this.frame = f;
    const tf = x => `translate(${x.x}px, ${x.y}px) scale(${x.s})`;
    // the far layer moves 45 % as much (parallax), clamped so it still covers the stage
    const par = x => { const ps = 1 + (x.s - 1) * 0.45; return {x: Math.min(0, Math.max(W - W * ps, x.x * 0.45)), y: Math.min(0, Math.max(H - H * ps, x.y * 0.45)), s: ps}; };
    this.world.animate([{transform: tf(from)}, {transform: tf(f)}], {duration: dur, easing, fill: 'forwards'});
    this.far.animate([{transform: tf(par(from))}, {transform: tf(par(f))}], {duration: dur, easing, fill: 'forwards'});
  }
  bodyPt(t) { const a = this.anchor(t); return {x: a.x, y: a.y - 55 * (a.scale || 1)}; }
  afterimages(a, dx, dy, sc, dur) {
    for (let i = 1; i <= 3; i++) {
      const c = a.img.cloneNode();
      c.classList.add('stg-ghost');
      a.body.appendChild(c);
      c.animate([{translate: '0 0', opacity: 0.4 - i * 0.1}, {translate: `${-dx * 0.14 * i}px ${-dy * 0.14 * i}px`, opacity: 0}], {duration: dur * 1.4, fill: 'forwards'})
        .onfinish = () => c.remove();
    }
  }
  moveBanner(text, palette, user, big, dur) {
    const pal = PALETTES[palette] || PALETTES['???'];
    this.banner.innerHTML = '';
    const b = el('div', 'stg-move' + (big ? ' stg-move-big' : ''), this.banner);
    b.style.setProperty('--tc', pal.main);
    el('span', 'stg-mty', b).textContent = palette === '???' ? '' : palette;
    el('b', '', b).textContent = text;
    if (user) el('em', '', b).textContent = user;
    b.animate([{transform: 'translateX(-110%)'}, {transform: 'none', offset: 0.18}, {transform: 'none', offset: 0.85}, {transform: 'translateX(-110%)'}],
      {duration: dur, easing: EASE, fill: 'forwards'}).onfinish = () => b.remove();
  }
  /** particle steps: role charge | carrier | impact */
  effect(s, dur) {
    const pal = PALETTES[s.palette] || PALETTES['???'];
    const amt = s.amount ?? 1;
    const n = x => Math.max(1, Math.round(x * amt));
    const life = dur / 1000;
    if (s.role === 'charge') {
      const p = this.bodyPt(s.target);
      this.fx.ring(p.x, p.y + 45, 70, pal.glow, {life});
      for (let i = 0; i < n(12); i++) {
        const a = rnd(0, Math.PI * 2), r = rnd(50, 80);
        this.fx.orb(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.x, p.y, {size: 5, life: life * 0.8, c: pal.main, c0: pal.core, delay: rnd(0, life * 0.3)});
      }
      const b = this.actor(s.target).body;
      b.animate([{filter: 'none'}, {filter: `drop-shadow(0 0 14px ${pal.glow}) brightness(1.3)`}, {filter: 'none'}], {duration: dur});
      return;
    }
    if (s.role === 'gimmick') {
      const p = this.bodyPt(s.target);
      const tc = TERA_COLORS[s.teraType] || '#ffffff';
      switch (s.fx) {
        case 'teraform':
          this.fx.ring(p.x, p.y + 45, 110, tc, {life});
          this.fx.ring(p.x, p.y + 45, 70, '#ffffff', {life, delay: life * 0.3});
          for (let i = 0; i < n(18); i++) { const a = rnd(0, 6.28), r = rnd(70, 110); this.fx.orb(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.x, p.y, {size: 5, life: life * 0.8, c: tc, c0: '#fff', delay: rnd(0, life * 0.2)}); }
          return;
        case 'shards': this.fx.shards(p.x, p.y, n(34), tc, {speed: 380}); this.fx.burst(p.x, p.y, n(20), {speed: 300, size: 4, life: 0.5, c: tc, c0: '#fff'}); return;
        case 'cocoon': case 'primal': {
          const cols = s.fx === 'primal' ? ['#ff4b3d', '#4b8dff'] : ['#ff7a7a', '#ffd84a', '#7dffb0', '#7ab8ff', '#e07aff'];
          cols.forEach((c, i) => this.fx.ring(p.x, p.y + 10, 90 - i * 10, c, {life, delay: i * 0.06}));
          for (let i = 0; i < n(24); i++) { const a = rnd(0, 6.28), r = rnd(60, 100); this.fx.orb(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.x, p.y, {size: 5, life: life * 0.8, c: cols[i % cols.length], delay: rnd(0, life * 0.2)}); }
          return;
        }
        case 'burst': this.fx.burst(p.x, p.y, n(30), {speed: 320, size: 6, life: 0.5, c: '#ffffff', c0: '#ffffff'}); this.fx.ring(p.x, p.y + 20, 100, '#ffffff', {life: 0.4}); return;
        case 'dyna': for (let i = 0; i < n(26); i++) this.fx.burst(p.x + rnd(-60, 60), p.y + 60, 1, {speed: 40, up: 120, size: 14, life: 0.9, c: 'rgba(255,40,80,.8)', c0: '#ff8aa0', delay: rnd(0, 0.5)}); return;
        case 'zaura': this.fx.ring(p.x, p.y + 40, 90, '#ffd84a', {life}); this.fx.burst(p.x, p.y + 30, n(20), {speed: 60, up: 150, size: 5, life: 0.8, c: '#ffd84a', c0: '#fff'}); return;
        default: return;
      }
    }
    if (s.role === 'boost') {
      const p = this.bodyPt(s.target);
      this.fx.streaks(p.x, p.y + 20, s.dir, s.dir > 0 ? '#ff8a3d' : '#4f9dff', s.intensity || 1);
      return;
    }
    if (s.role === 'status') {
      const p = this.bodyPt(s.target);
      const S = {brn: ['#ff6a1f', '#ffd27a'], psn: ['#a24fd6', '#e3b8ff'], tox: ['#8a2fd0', '#e3b8ff'], par: ['#ffd21f', '#fff7b0'],
        slp: ['#9a8cff', '#e6e0ff'], frz: ['#7fe3ff', '#ffffff'], confusion: ['#ffd84a', '#ffffff']}[s.fx] || ['#bdb6d8', '#ffffff'];
      if (s.fx === 'par') for (let i = 0; i < n(4); i++) { const a = rnd(0, 6.28); this.fx.bolt(p.x, p.y, p.x + Math.cos(a) * 50, p.y + Math.sin(a) * 50, {c: S[0], delay: i * 0.05}); }
      else if (s.fx === 'frz') this.fx.shards(p.x, p.y, n(14), S[0]);
      else if (s.fx === 'psn' || s.fx === 'tox') this.fx.burst(p.x, p.y + 20, n(18), {speed: 60, up: 90, size: 7, life: 0.8, c: S[0], c0: S[1]});
      else if (s.fx === 'brn') this.fx.burst(p.x, p.y + 30, n(20), {speed: 80, up: 140, size: 5, life: 0.7, c: S[0], c0: S[1]});
      else this.fx.ring(p.x, p.y + 20, 70, S[0], {life});
      return;
    }
    if (s.role === 'carrier') {
      const u = this.bodyPt(s.from);
      for (const t of s.to || []) {
        const p = this.bodyPt(t);
        switch (s.fx) {
          case 'beam':
            if (s.palette === 'Electric') { for (let i = 0; i < 3; i++) this.fx.bolt(u.x, u.y, p.x, p.y, {c: pal.glow, life: life * 0.5, delay: i * life * 0.25}); }
            else this.fx.beam(u.x, u.y, p.x, p.y, {c: pal.main, c0: pal.core, w: 16, life});
            break;
          case 'wave': this.fx.orb(u.x, u.y, p.x, p.y, {n: n(12), size: 8, life, c: pal.main, c0: pal.core, spread: 20}); break;
          case 'rain': for (let i = 0; i < n(12); i++) this.fx.orb(p.x + rnd(-50, 50), p.y - 240, p.x + rnd(-40, 40), p.y + rnd(-10, 20), {size: 7, life: life * 0.8, c: pal.main, c0: pal.core, delay: rnd(0, life * 0.3)}); break;
          case 'slash': this.fx.slashes(p.x, p.y, pal.glow); break;
          case 'ring': this.fx.ring(u.x, u.y + 30, 80, pal.glow, {life: life * 0.6}); this.fx.ring(p.x, p.y + 30, 80, pal.glow, {life, delay: life * 0.4}); break;
          case 'stream': this.fx.orb(u.x, u.y, p.x, p.y, {n: n(22), size: 7, life: life * 0.9, c: pal.main, c0: pal.core, wob: 10}); break;
          case 'meteor': for (let i = 0; i < n(4); i++) this.fx.orb(p.x - 220 + rnd(-30, 30), -40, p.x + rnd(-40, 40), p.y + rnd(-10, 20), {size: 16, life: life * 0.8, c: pal.main, c0: pal.core, delay: i * life * 0.05}); break;
          default: this.fx.orb(u.x, u.y, p.x, p.y, {size: 14, life, c: pal.main, c0: pal.core, wob: 6});
        }
      }
      return;
    }
    // impact
    const p = this.bodyPt(s.target);
    switch (s.fx) {
      case 'slash': this.fx.slashes(p.x, p.y, pal.glow); this.fx.burst(p.x, p.y, n(10), {speed: 220, size: 4, life: 0.35, c: pal.main, c0: pal.core}); break;
      case 'ring': this.fx.ring(p.x, p.y + 30, 90, pal.glow); this.fx.ring(p.x, p.y + 30, 60, pal.main, {delay: 0.1}); break;
      case 'shards': this.fx.shards(p.x, p.y, n(18), pal.main); this.fx.burst(p.x, p.y, n(8), {speed: 180, size: 4, life: 0.3, c: pal.glow}); break;
      case 'splash': this.fx.burst(p.x, p.y, n(26), {speed: 220, up: 160, g: 600, size: 5, life: 0.6, c: pal.main, c0: pal.core}); break;
      case 'quake': this.fx.burst(p.x, p.y + 50, n(26), {speed: 200, flat: 0.3, size: 7, life: 0.6, c: 'rgba(200,160,110,.9)', c0: '#f3e2c4'}); break;
      case 'sparks':
        for (let i = 0; i < n(4); i++) { const a = rnd(0, 6.28); this.fx.bolt(p.x, p.y, p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, {c: pal.glow, delay: i * 0.04}); }
        this.fx.burst(p.x, p.y, n(10), {speed: 200, size: 4, life: 0.3, c: pal.main, c0: pal.core});
        break;
      case 'shield': this.shield(s.target, pal, dur); break;
      case 'hex': this.hexShield(s.target, pal, dur, !!s.hit); break;
      case 'coins':
        for (let i = 0; i < n(16); i++) this.fx.orb(p.x + rnd(-60, 60), p.y - 200, p.x + rnd(-50, 50), p.y + rnd(20, 50), {size: 5, life: 0.4, c: '#ffcf3d', c0: '#fff6c2', delay: rnd(0, 0.2)});
        this.fx.shards(p.x, p.y + 20, n(14), '#ffcf3d', {speed: 220, delay: 0.25});
        break;
      case 'rocks':
        for (let i = 0; i < n(6); i++) this.fx.orb(p.x + rnd(-50, 50), p.y - 230, p.x + rnd(-40, 40), p.y + rnd(0, 30), {size: 11, life: 0.35, c: '#b8a878', c0: '#efe3bd', delay: i * 0.04});
        this.fx.shards(p.x, p.y + 20, n(12), '#b8a878', {speed: 200, delay: 0.3});
        break;
      case 'none': break;
      default: this.fx.burst(p.x, p.y, n(24), {speed: 260, size: 6, life: 0.45, c: pal.main, c0: pal.core}); this.fx.ring(p.x, p.y + 20, 60, pal.glow, {life: 0.35});
    }
  }
  /** Protect-style bubble around a Pokémon */
  shield(t, pal, dur) {
    const a = this.actor(t);
    const b = el('div', 'stg-shield', a.wrap);
    b.style.setProperty('--tc', pal.glow);
    b.animate([{transform: 'translate(-50%, 0) scale(.3)', opacity: 0}, {transform: 'translate(-50%, 0) scale(1.05)', opacity: 1, offset: 0.3},
      {transform: 'translate(-50%, 0) scale(1)', opacity: 0.9, offset: 0.8}, {transform: 'translate(-50%, 0) scale(1.1)', opacity: 0}],
      {duration: Math.max(dur, 700), easing: EASE}).onfinish = () => b.remove();
  }
  /** Protect: a see-through dome of glowing hexagons that lights up from the middle out; hit = an attack bounced off */
  hexShield(t, pal, dur, hit) {
    const a = this.actor(t);
    if (a.wrap.hidden) return;
    const b = el('div', 'stg-shield stg-hexshield' + (hit ? ' hit' : ''), a.wrap);
    b.style.setProperty('--tc', pal.glow);
    b.style.setProperty('--tm', pal.main);
    b.innerHTML = hexDome();
    const ms = hit ? Math.max(dur, 650) : Math.max(dur, 1300);
    b.style.setProperty('--hd', `${ms}ms`);
    const keys = hit
      ? [{transform: 'translate(-50%, 0) scale(1.06)', opacity: 1, easing: EASE}, {transform: 'translate(-50%, 0) scale(.98)', opacity: 1, offset: 0.25},
        {transform: 'translate(-50%, 0) scale(1)', opacity: 0}]
      : [{transform: 'translate(-50%, 0) scale(.2)', opacity: 0, easing: EASE}, {transform: 'translate(-50%, 0) scale(1.06)', opacity: 1, offset: 0.2, easing: 'ease-in-out'},
        {transform: 'translate(-50%, 0) scale(1)', opacity: 1, offset: 0.35}, {transform: 'translate(-50%, 0) scale(1)', opacity: 0.95, offset: 0.8, easing: 'ease-in'},
        {transform: 'translate(-50%, 0) scale(1.08)', opacity: 0}];
    b.animate(keys, {duration: ms}).onfinish = () => b.remove();
  }
  flash(t, opacity, dur, color = '#fff') {
    if (!t) { this.flashEl.style.background = color; return this.flashEl.animate([{opacity}, {opacity: 0}], {duration: dur}); }
    const b = this.actor(t).body;
    return b.animate([{filter: `brightness(${1 + opacity * 3}) saturate(0)`}, {filter: 'none'}], {duration: dur});
  }
  pop(t, text, tone, dur) {
    if (!text || !t) return;
    const at = this.anchor(t);
    const p = el('div', `stg-pop stg-tone-${tone || 'neutral'}`, this.pops);
    p.textContent = text;
    p.style.left = `${at.x}px`;
    p.style.top = `${at.y - (t.side === 'near' ? 170 : 120)}px`;
    p.animate([{opacity: 0, transform: 'translate(-50%, 8px) scale(.8)'}, {opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.15},
      {opacity: 1, offset: 0.8}, {opacity: 0, transform: 'translate(-50%, -10px)'}], {duration: Math.max(dur, 700)}).onfinish = () => p.remove();
  }
  abilityPop(t, text, dur) {
    const b = el('div', `stg-ability stg-ability-${t ? t.side : 'far'}`, this.pops);
    b.textContent = text;
    b.animate([{opacity: 0, transform: 'translateX(-30px)'}, {opacity: 1, transform: 'none', offset: 0.15}, {opacity: 1, offset: 0.8}, {opacity: 0}],
      {duration: Math.max(dur, 900)}).onfinish = () => b.remove();
  }
  puff(t, fx, color = '#fff', dur, amount = 1) {
    if (!t) return;
    const at = this.anchor(t);
    const p = el('div', `stg-puff stg-puff-${fx}`, this.actorsEl);
    p.style.left = `${at.x}px`;
    p.style.top = `${at.y - 40 * at.scale}px`;
    p.style.setProperty('--c', color);
    p.style.opacity = String(Math.min(1, amount));
    p.animate([{transform: 'translate(-50%, -50%) scale(.3)', opacity: Math.min(1, amount)}, {transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0}],
      {duration: dur, easing: 'ease-out'}).onfinish = () => p.remove();
  }
  cry(url) {
    try { if (window.BattleSound && url) window.BattleSound.playEffect(url); } catch (e) { /* no sound */ }
  }
  destroy() {
    this.destroyed = true;
    this.cancel();
    clearInterval(this.drift);
    if (this.ro) this.ro.disconnect();
    this.fx.clear();
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}
