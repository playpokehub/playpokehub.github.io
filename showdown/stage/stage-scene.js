// StageScene: our renderer for Showdown's client Battle (see docs/superpowers/specs/2026-09-30-battle-stage-design.md).
// Battle keeps parsing the protocol and running the step queue; it calls these methods for everything it wants shown.
// Each call becomes a director event; its timeline is placed on the Clock and played by the view. Battle's waits
// (finishAnimations) resolve on the Clock's timers, never on animation frames.
import {StageBase} from './scene-methods.js?v=0adcc7af57';
import {Clock} from './clock.js?v=0adcc7af57';
import {SceneTiming} from './timing.js?v=0adcc7af57';
import {makeDirector} from './director.js?v=0adcc7af57';
import {plateModel, slotOf} from './hud.js?v=0adcc7af57';
import {pickBackdrop} from './backdrops.js?v=0adcc7af57';
import {StageView} from './view.js?v=0adcc7af57';
import {fieldModel, parseBoost, fieldChange, fieldAnnouncement} from './field.js?v=0adcc7af57';
import {gimmickOf} from './tera.js?v=0adcc7af57';

const classic = () => (window.ClassicScene && window.ClassicScene.prototype) || {};
const TONE = {good: 'good', bad: 'bad', neutral: 'neutral'};

export class StageScene extends StageBase {
  constructor(battle, $frame, $logFrame) {
    super();
    this.battle = battle;
    this.$frame = $frame;
    this.log = new window.BattleLog($logFrame[0], this);
    this.clock = new Clock();
    this.timing = new SceneTiming({clock: this.clock, Deferred: () => window.jQuery.Deferred()});
    this.gen = 9;
    this.mod = '';
    this.numericId = 0;
    this.fainted = new WeakSet(); // shown fainting already, before their |faint| line
    this.bgm = null;
    this.bgmNum = 0;
    this.speed = 1;
    this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.director = makeDirector({speed: this.speed, reduced: this.reduced});
    $frame[0].innerHTML = '';
    // Showdown's .battle box is 640 × 360; the stage fills the whole iframe instead
    $frame[0].classList.remove('battle');
    $frame[0].classList.add('stg-host');
    this.view = new StageView($frame[0], {reduced: this.reduced});
    this.view.setBackdrop(pickBackdrop(window.__stageKey || '', window.__stageHints || {}), 'singles');
    // the battle text: the hidden log gets every line; show the newest one on the stage's message line
    this.logObserver = new MutationObserver(recs => {
      if (!this.animating) return;
      for (const r of recs) for (const n of r.addedNodes) {
        if (n.nodeType !== 1 || !/battle-history/.test(n.className || '')) continue;
        const text = n.textContent.trim();
        if (text) this.view.play({steps: [{at: 0, dur: 0, kind: 'text', act: 'line', text}], ms: 0}, this.at(0));
      }
    });
    this.logObserver.observe($logFrame[0], {childList: true, subtree: true});
    this.setPerspective();
  }

  // Battle reads this to ignore waits that resolve after a pause/seek/stop (see timing.js)
  get interruptionCount() { return this.timing ? this.timing.interruptionCount : 1; }
  set interruptionCount(v) { if (this.timing) this.timing.interruptionCount = v; }
  /** the battle text speaks from the viewer's side ("The opposing …" is the other side) */
  setPerspective() {
    try { if (this.log.battleParser && this.battle.mySide) this.log.battleParser.perspective = this.battle.mySide.sideid; } catch (e) { /* older log */ }
  }

  // ---- helpers ----
  slot(p) { return slotOf(p, this.battle); }
  spriteOf(p) {
    const sp = window.Dex.getSpriteData(p, !!p.side.isFar, {gen: this.gen, mod: this.mod});
    return {url: sp.url, w: sp.w, h: sp.h, species: p.speciesForme, cry: sp.cryurl};
  }
  snapshot(p) {
    if (!p || !p.side) return {};
    const sprite = this.spriteOf(p);
    const plate = {...plateModel(p, p.side === this.battle.nearSide), dyna: !!(p.volatiles && p.volatiles.dynamax)};
    return {sprite, plate, cry: sprite.cry, user: p.name};
  }
  /** reserve ms on the clock and return the absolute start time */
  at(ms) { return this.clock.started + this.clock.enqueue(ms); }
  emit(event, p) {
    if (!this.animating) return;
    const tl = this.director.plan(event);
    this.view.play(tl, this.at(tl.ms), this.snapshot(p));
  }
  gameType() { return this.battle.gameType === 'doubles' || (this.battle.nearSide && this.battle.nearSide.active.length > 1) ? 'doubles' : 'singles'; }
  sync() {
    const b = this.battle;
    if (!b || !b.sides) return;
    const gt = this.gameType();
    if (gt !== this.view.gameType) this.view.setBackdrop(this.view.backdrop, gt);
    const slots = [];
    for (const side of b.sides) {
      for (let i = 0; i < side.active.length; i++) {
        const p = side.active[i];
        const t = {side: side === b.nearSide ? 'near' : 'far', i};
        const alive = p && !p.fainted && p.hp > 0 || (p && !p.fainted && p.maxhp === 0);
        const snap = p ? this.snapshot(p) : {};
        slots.push({t, sprite: alive ? snap.sprite : null, plate: snap.plate, sub: !!(p && p.volatiles && p.volatiles.substitute)});
      }
    }
    this.lastField = fieldModel(b);
    this.view.apply({slots, turn: b.turn, lineup: null, field: this.lastField, pill: this.pillText()});
  }
  /** the line Battle is running right now */
  currentLine() { return (this.battle.stepQueue || [])[this.battle.currentStep] || ''; }
  pillText() {
    try { return String(this.weatherLeft() || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); } catch (e) { return undefined; }
  }

  // ---- timing ----
  updateAcceleration() {
    this.speed = this.battle && this.battle.messageFadeTime < 300 ? 0.4 : 1;
    this.director = makeDirector({speed: this.speed, reduced: this.reduced});
  }
  wait(ms) { if (this.animating) this.clock.wait((ms || 0) * this.speed); }
  finishAnimations() {
    if (this.animating && this.battle.ended && !this.winShown) this.showWin();
    return this.timing.finish(this.animating);
  }
  animationOff() { this.animating = false; this.fainted = new WeakSet(); this.timing.interrupt(); this.view.cancel(); }
  pause() { this.timing.interrupt(); this.view.cancel(); this.updateBgm(); }
  resume() { this.updateBgm(); }
  animationOn() {
    this.animating = true;
    if (this.battle.turn > 0) this.introDone = true; // joined mid-battle: no intro
    if (this.battle.ended) this.winShown = true;
    this.sync();
  }
  /** the winner's close-up and banner, once */
  showWin() {
    this.winShown = true;
    const q = (this.battle.stepQueue || []).slice(0, this.battle.currentStep + 1);
    const line = q.reverse().find(l => /^\|(win|tie)(\||$)/.test(l)) || '|tie';
    const name = line.startsWith('|win|') ? line.slice(5) : '';
    const b = this.battle;
    const side = !name ? null : b.nearSide && b.nearSide.name === name ? 'near' : b.farSide && b.farSide.name === name ? 'far' : 'near';
    this.emit({type: 'win', side, name});
  }
  stopAnimation() { this.timing.interrupt(); this.view.cancel(); }
  reset() {
    this.fainted = new WeakSet();
    this.timing.interrupt();
    this.view.cancel();
    this.setPerspective();
    this.view.setBackdrop(pickBackdrop(window.__stageKey || '', window.__stageHints || {}), this.gameType());
    this.sync();
  }

  // ---- Pokémon ----
  addPokemonSprite(pokemon) {
    const scene = this;
    const slot = () => scene.slot(pokemon);
    return {
      destroy() {},
      animSub(instant) { if (pokemon.side && pokemon.side.active.includes(pokemon)) scene.view.sub(slot(), true); },
      removeSub() { if (pokemon.side) scene.view.sub(slot(), false); },
      reset() {},
    };
  }
  animSummon(p, slot, instant) {
    if (instant || !this.animating) { this.sync(); return; }
    if (!this.introDone) { this.introDone = true; this.emit({type: 'start'}); }
    this.emit({type: 'summon', slot: this.slot(p), species: p.speciesForme, fromBall: true}, p);
  }
  animDragIn(p) { this.emit({type: 'summon', slot: this.slot(p), species: p.speciesForme, fromBall: false}, p); if (!this.animating) this.sync(); }
  animUnsummon(p, instant) {
    if (instant || !this.animating) return;
    this.emit({type: 'unsummon', slot: this.slot(p), kind: 'return'}, p);
  }
  animDragOut(p) { this.emit({type: 'unsummon', slot: this.slot(p), kind: 'drag'}, p); }
  // a Pokémon faints the moment its HP hits 0 (damageAnim), not when Showdown's |faint| line comes after the rest of
  // the action (recoil, Life Orb, abilities…); the line then has nothing left to show
  animFaint(p) {
    if (this.fainted.has(p)) { this.fainted.delete(p); return; }
    this.emit({type: 'faint', slot: this.slot(p)}, p);
  }
  animTransform(p) {
    if (!this.animating) { this.updateStatbar(p); return; }
    const line = this.currentLine();
    // Showdown animates Mega/Primal/Ultra at the forme change (|detailschange|) just before the |-mega| line
    const next = (this.battle.stepQueue || [])[this.battle.currentStep + 1] || '';
    const g = gimmickOf(line) || (/^\|detailschange\|/.test(line) ? gimmickOf(next) : null);
    if (g) { this.emit({type: 'gimmick', slot: this.slot(p), kind: g.kind, teraType: g.teraType}, p); return; }
    this.emit({type: 'transform', slot: this.slot(p)}, p);
  }
  damageAnim(p, damage) {
    const amount = Math.max(0.05, Math.min(1, (parseFloat(String(damage)) || 10) / 100));
    const ko = p.hp <= 0;
    this.emit({type: 'damage', slot: this.slot(p), amount, ko}, p);
    if (ko && this.animating && p.side && p.side.active.includes(p)) { this.fainted.add(p); this.emit({type: 'faint', slot: this.slot(p)}, p); }
  }
  healAnim(p, damage) {
    const amount = Math.max(0.05, Math.min(1, (parseFloat(String(damage)) || 10) / 100));
    this.emit({type: 'heal', slot: this.slot(p), amount}, p);
  }
  resultAnim(p, result, type) {
    if (!p || !p.side) return;
    const boost = parseBoost(this.currentLine());
    if (boost && !/^already/i.test(String(result))) { this.emit({type: 'boost', slot: this.slot(p), stat: boost.stat, amount: boost.amount}, p); return; }
    this.emit({type: 'result', slot: this.slot(p), text: String(result || ''), tone: TONE[type] || (type ? 'bad' : 'neutral')}, p);
  }
  abilityActivateAnim(p, result) { if (p && p.side) this.emit({type: 'ability', slot: this.slot(p), name: String(result || '')}, p); }
  typeAnim(p, types) { if (p && p.side) this.emit({type: 'types', slot: this.slot(p), types: String(types || '').split('/')}, p); }
  updateStatbar(p) {
    if (!p || !p.side || !p.side.active.includes(p)) return;
    if (!this.animating) { this.view.setPlate(this.slot(p), plateModel(p, p.side === this.battle.nearSide)); return; }
    this.view.play({steps: [{at: 0, dur: 1, kind: 'hud', target: this.slot(p), act: 'refresh'}], ms: 0}, this.at(0), this.snapshot(p));
  }
  updateStatbarIfExists(p) { this.updateStatbar(p); }
  resetStatbar(p) { this.updateStatbar(p); }
  updateStatbars() { for (const side of this.battle.sides) for (const p of side.active) if (p) this.updateStatbar(p); }
  resetSides() { this.sync(); }
  teamPreview() {
    const b = this.battle;
    const row = side => side.pokemon.map(p => this.spriteOf(p));
    this.view.setBackdrop(this.view.backdrop, this.gameType());
    this.view.setLineup({near: row(b.nearSide), far: row(b.farSide)});
    this.emit({type: 'preview'});
  }
  incrementTurn() { this.emit({type: 'turn', turn: this.battle.turn}); if (!this.animating) this.view.setTurn(this.battle.turn); }
  resetTurn() { this.view.setTurn(this.battle.turn); }

  // ---- moves ----
  moveData(id) {
    const m = window.Dex.moves.get(id);
    return {id: m.id, name: m.name, type: m.type, category: m.category, target: m.target, isZ: m.isZ, isMax: m.isMax};
  }
  /** hits of a multi-hit move: Showdown reports them (|-hitcount|) after the move line, before the next action */
  peekHits() {
    const q = this.battle.stepQueue || [];
    for (let i = this.battle.currentStep + 1; i < q.length; i++) {
      const l = q[i] || '';
      if (/^\|(move|turn|upkeep|switch|drag|cant|faint)\|/.test(l)) break;
      const m = /^\|-hitcount\|[^|]*\|(\d+)/.exec(l);
      if (m) return +m[1];
    }
    return 1;
  }
  runMoveAnim(moveid, participants) {
    const user = participants && participants[0];
    if (!user || !user.side || !this.animating) return;
    const raw = participants.slice(1).filter(p => p && p.side);
    const missed = raw.filter(p => p === p.side.missedPokemon);
    const targets = raw.filter(p => p !== p.side.missedPokemon);
    const slots = (targets.length ? targets : missed).map(p => this.slot(p));
    this.emit({type: 'move', move: this.moveData(moveid), user: this.slot(user), targets: slots, hits: this.peekHits(), miss: !targets.length && missed.length > 0}, user);
  }
  runPrepareAnim(moveid, attacker, defender) {
    if (!attacker || !attacker.side) return;
    this.emit({type: 'prepare', move: this.moveData(moveid), user: this.slot(attacker), target: defender && defender.side ? this.slot(defender) : this.slot(attacker)}, attacker);
  }
  runOtherAnim(id, participants) {
    const p = participants && participants[0];
    if (id === 'hitmark' && p && p.side) this.emit({type: 'hit', slot: this.slot(p)}, p);
    else if (id === 'zpower' && p && p.side) this.emit({type: 'gimmick', slot: this.slot(p), kind: 'zmove'}, p);
  }

  // ---- field, status ----
  updateWeather(instant) {
    const b = this.battle;
    if (!b || !b.sides) return;
    const m = fieldModel(b), old = this.lastField || {weather: '', terrain: '', rooms: [], sides: {near: [], far: []}};
    this.lastField = m;
    const pill = this.pillText();
    if (instant || !this.animating) { this.view.setField(m, pill); return; }
    // what changed gets a card (field.js): "It started to rain!", "The Tailwind blew from behind your team!"…
    const c = fieldChange(old, m);
    const e = c ? {type: 'field', ...c, card: fieldAnnouncement(c)} : null;
    if (!e) { this.view.play({steps: [{at: 0, dur: 1, kind: 'field', act: 'apply', model: m, pill}], ms: 0}, this.at(0)); return; }
    const tl = this.director.plan({...e, model: m});
    for (const st of tl.steps) if (st.kind === 'field') st.pill = pill;
    this.view.play(tl, this.at(tl.ms));
  }
  upkeepWeather() { this.updateWeather(true); }
  addSideCondition() { this.updateWeather(false); }
  removeSideCondition() { this.updateWeather(false); }
  resetSideConditions() { this.updateWeather(true); }
  runStatusAnim(id, participants) {
    const p = participants && participants[0];
    if (p && p.side) this.emit({type: 'status', slot: this.slot(p), status: String(id)}, p);
  }
  // Substitute (and Shed Tail's) doll: Battle shows volatiles through add/remove/clearEffects
  addEffect(p, id, instant) { if (/^(substitute|shedtail)$/.test(String(id))) this.subEffect(p, true, instant); }
  removeEffect(p, id, instant) { if (/^(substitute|shedtail)$/.test(String(id))) this.subEffect(p, false, instant); }
  clearEffects(p) { if (p && p.side) this.view.sub(this.slot(p), false); }
  subEffect(p, on, instant) {
    if (!p || !p.side || !p.side.active.includes(p)) return;
    if (instant || !this.animating) { this.view.sub(this.slot(p), on); return; }
    this.emit({type: 'sub', slot: this.slot(p), on}, p);
  }
  runResidualAnim(id, p) { if (p && p.side) this.emit({type: 'status', slot: this.slot(p), status: String(id)}, p); }
  // Showdown's own texts for turns left (the pill and the tooltips)
  turnsLeft(...a) { return classic().turnsLeft ? classic().turnsLeft.apply(this, a) : ''; }
  pseudoWeatherLeft(...a) { return classic().pseudoWeatherLeft ? classic().pseudoWeatherLeft.apply(this, a) : ''; }
  sideConditionLeft(...a) { return classic().sideConditionLeft ? classic().sideConditionLeft.apply(this, a) : ''; }
  weatherLeft(...a) { return classic().weatherLeft ? classic().weatherLeft.apply(this, a) : ''; }
  sideConditionsLeft(...a) { return classic().sideConditionsLeft ? classic().sideConditionsLeft.apply(this, a) : ''; }

  // ---- music and sound: Showdown's own ----
  rollBgm() { if (classic().rollBgm) classic().rollBgm.call(this); }
  setBgm(n) { if (classic().setBgm) classic().setBgm.call(this, n); }
  updateBgm() { if (classic().updateBgm) classic().updateBgm.call(this); }
  resetBgm() { if (this.bgm) this.bgm.stop(); }
  setMute(muted) { try { window.BattleSound.setMute(muted); } catch (e) { /* no sound */ } }

  destroy() {
    this.timing.interrupt();
    this.resetBgm();
    this.logObserver.disconnect();
    this.view.destroy();
    this.$frame[0].classList.remove('stg-host');
    this.$frame[0].classList.add('battle');
    try { this.log.destroy(); } catch (e) { /* ignore */ }
  }
}
