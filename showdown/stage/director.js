// The director: turns what happened in the battle (an event from StageScene) into a timeline of steps with fixed
// times, which view.js plays. Pure (tested in Node): no DOM, no clocks.
//   Step = {at, dur, kind: 'cam'|'actor'|'fx'|'hud'|'text'|'flash'|'shake'|'banner'|'field', target?, ...}
//   Timeline = {steps: Step[], ms}   (every step ends by ms; speed and reduced motion are already applied)
import {recipeFor} from './recipes.js?v=0adcc7af57';

const RESULT_TEXT = {'Critical hit': 'Critical hit!', 'Super-effective': 'Super effective!', 'Resisted': 'Not very effective…',
  'Immune': 'No effect', 'Missed': 'Missed!'};

export function makeDirector({speed = 1, reduced = false} = {}) {
  const k = speed > 0 ? speed : 1;

  function finish(steps, ms) {
    let out = steps;
    if (reduced) {
      out = out.filter(s => s.kind !== 'cam' && s.kind !== 'shake')
        .map(s => (s.kind === 'flash' ? {...s, opacity: Math.min(0.3, s.opacity ?? 0.6)} : s.kind === 'fx' ? {...s, amount: (s.amount ?? 1) * 0.4} : s));
    }
    out = out.map(s => ({...s, at: s.at * k, dur: s.dur * k}));
    const end = out.reduce((m, s) => Math.max(m, s.at + s.dur), 0);
    return {steps: out, ms: Math.max(ms * k, end)};
  }
  const shakePx = (amount, ko) => (ko ? 10 : amount >= 0.5 ? 8 : amount >= 0.25 ? 5 : 3);

  const plans = {
    summon(e) {
      const t = e.slot;
      if (!e.fromBall) {
        return finish([{at: 0, dur: 400, kind: 'actor', target: t, act: 'appear', species: e.species},
          {at: 150, dur: 300, kind: 'hud', target: t, act: 'show'}], 450);
      }
      return finish([
        {at: 0, dur: 350, kind: 'actor', target: t, act: 'ball'},
        {at: 330, dur: 150, kind: 'flash', target: t, opacity: 0.5},
        {at: 330, dur: 300, kind: 'fx', target: t, fx: 'ring', color: '#ffffff', amount: 1},
        {at: 350, dur: 400, kind: 'actor', target: t, act: 'appear', species: e.species, cry: true},
        {at: 450, dur: 300, kind: 'hud', target: t, act: 'show'},
      ], 800);
    },
    unsummon(e) {
      const t = e.slot;
      // the Pokémon and its plate are hidden by timed steps (not when an animation reports it finished)
      return e.kind === 'drag'
        ? finish([{at: 0, dur: 340, kind: 'actor', target: t, act: 'slideout'}, {at: 0, dur: 240, kind: 'hud', target: t, act: 'hide'},
          {at: 340, dur: 1, kind: 'actor', target: t, act: 'hide'}, {at: 245, dur: 1, kind: 'hud', target: t, act: 'gone'}], 350)
        : finish([{at: 0, dur: 390, kind: 'actor', target: t, act: 'recall'}, {at: 0, dur: 240, kind: 'hud', target: t, act: 'hide'},
          {at: 392, dur: 1, kind: 'actor', target: t, act: 'hide'}, {at: 245, dur: 1, kind: 'hud', target: t, act: 'gone'}], 400);
    },
    faint(e) {
      const t = e.slot;
      return finish([
        {at: 0, dur: 150, kind: 'flash', target: t, opacity: 0.4, color: '#ff5c6c'},
        {at: 0, dur: 700, kind: 'actor', target: t, act: 'faint', cry: true},
        {at: 450, dur: 350, kind: 'fx', target: t, fx: 'dust', amount: 1},
        {at: 600, dur: 290, kind: 'hud', target: t, act: 'hide'},
        {at: 700, dur: 1, kind: 'actor', target: t, act: 'hide'},
        {at: 892, dur: 1, kind: 'hud', target: t, act: 'gone'},
      ], 900);
    },
    damage(e) {
      const t = e.slot;
      return finish([
        {at: 0, dur: 250, kind: 'actor', target: t, act: 'hurt'},
        {at: 0, dur: 260, kind: 'shake', px: shakePx(e.amount || 0, e.ko)},
        {at: 0, dur: 600, kind: 'hud', target: t, act: 'hp'},
      ], 600);
    },
    heal(e) {
      const t = e.slot;
      return finish([{at: 0, dur: 450, kind: 'fx', target: t, fx: 'sparkle', color: '#8dffb0', amount: 1},
        {at: 0, dur: 500, kind: 'hud', target: t, act: 'hp'}], 500);
    },
    result(e) {
      const text = RESULT_TEXT[e.text] || e.text;
      const tone = e.text === 'Critical hit' ? 'crit' : e.text === 'Super-effective' ? 'super' : e.tone || 'neutral';
      const steps = [{at: 0, dur: 700, kind: 'text', target: e.slot, text, tone}];
      // an attack bounced off Protect: the hexagon shield flashes up again
      if (e.text === 'Protected') steps.push({at: 0, dur: 650, kind: 'fx', role: 'impact', fx: 'hex', target: e.slot, palette: 'Grass', hit: true, amount: 1});
      return finish(steps, 700);
    },
    move(e) {
      const r = recipeFor(e.move || {});
      const fast = k < 1;
      const u = e.user;
      const ts = e.targets && e.targets.length ? e.targets : [u];
      const pal = r.palette;
      const hits = Math.max(1, Math.min(5, e.hits || 1));
      const steps = [{at: 0, dur: 1300, kind: 'banner', act: 'move', text: (e.move && e.move.name) || '', palette: pal, big: r.big}];
      steps.push({at: 0, dur: 420, kind: 'cam', shot: fast ? 'push' : 'close', targets: [u], s: fast ? 1.08 : undefined});
      let impactAt;
      if (r.user === 'lunge') {
        impactAt = 650;
        steps.push({at: 420, dur: 230, kind: 'actor', target: u, act: 'lunge', to: ts});
      } else if (r.user === 'charge') {
        impactAt = r.carrier === 'none' ? 700 : 1000;
        steps.push({at: 250, dur: 450, kind: 'fx', role: 'charge', target: u, fx: 'charge', palette: pal, amount: 1});
      } else {
        impactAt = r.carrier === 'none' ? 500 : 800;
        if (r.user === 'jump') steps.push({at: 150, dur: 350, kind: 'actor', target: u, act: 'jump'});
        if (r.user === 'spin') steps.push({at: 100, dur: 400, kind: 'actor', target: u, act: 'spin'});
      }
      if (r.carrier !== 'none') steps.push({at: impactAt - 300, dur: 300, kind: 'fx', role: 'carrier', fx: r.carrier, from: u, to: ts, palette: pal, amount: 1});
      const tShot = r.shot === 'spread' ? 'spread' : r.shot === 'pair' ? 'pair' : 'close';
      const whipAt = Math.max(420, impactAt - 260);
      steps.push({at: whipAt, dur: impactAt - whipAt, kind: 'cam', shot: fast ? 'push' : tShot, targets: tShot === 'pair' ? [u, ...ts] : tShot === 'spread' ? ts : [ts[0]],
        s: fast ? 1.08 : undefined, ease: 'whip'});
      for (let h = 0; h < (e.miss ? 0 : hits); h++) {
        for (const t of ts) steps.push({at: impactAt + h * 150, dur: 350, kind: 'fx', role: 'impact', fx: r.impact, target: t, palette: pal, amount: r.big ? 1.6 : 1});
      }
      const damaging = !e.miss && e.move && e.move.category !== 'Status' && r.impact !== 'none';
      if (damaging) {
        steps.push({at: impactAt, dur: 110, kind: 'flash', opacity: 0.35});
        steps.push({at: impactAt, dur: 260, kind: 'shake', px: r.big ? 10 : ts.length > 1 ? 8 : 6});
      }
      const lastHit = impactAt + (hits - 1) * 150;
      if (r.user === 'lunge') steps.push({at: lastHit + 120, dur: 350, kind: 'actor', target: u, act: 'return'});
      steps.push({at: lastHit + 350, dur: 550, kind: 'cam', shot: 'wide', targets: []});
      return finish(steps, lastHit + 900);
    },
    prepare(e) {
      const r = recipeFor(e.move || {});
      return finish([{at: 0, dur: 600, kind: 'fx', role: 'charge', target: e.user, fx: 'charge', palette: r.palette, amount: 1}], 600);
    },
    sub(e) {
      return finish([{at: 0, dur: 300, kind: 'actor', target: e.slot, act: 'sub', on: !!e.on},
        {at: 0, dur: 300, kind: 'fx', target: e.slot, fx: 'dust', amount: 1}], 350);
    },
    hit(e) { return finish([{at: 0, dur: 200, kind: 'flash', target: e.slot, opacity: 0.5}], 200); },
    gimmick(e) {
      const t = e.slot;
      const fast = k < 1;
      const push = {kind: 'cam', shot: 'push', targets: [t], s: fast ? 1.08 : undefined};
      const back = at => ({at, dur: 500, kind: 'cam', shot: 'wide', targets: []});
      switch (e.kind) {
        case 'tera': return finish([
          {at: 0, dur: 450, ...push},
          {at: 150, dur: 1100, kind: 'banner', act: 'move', text: 'Terastallized!', palette: e.teraType || 'Stellar', big: true},
          {at: 400, dur: 500, kind: 'fx', role: 'gimmick', fx: 'teraform', target: t, teraType: e.teraType, amount: 1},
          {at: 400, dur: 500, kind: 'actor', target: t, act: 'glow', color: '#ffffff'},
          {at: 900, dur: 200, kind: 'flash', opacity: 0.8},
          {at: 920, dur: 650, kind: 'fx', role: 'gimmick', fx: 'shards', target: t, teraType: e.teraType, amount: 1},
          {at: 950, dur: 300, kind: 'hud', target: t, act: 'tera', teraType: e.teraType},
          back(1350),
        ], 1850);
        case 'mega': case 'primal': case 'ultra': return finish([
          {at: 0, dur: 450, ...push},
          {at: 150, dur: 1100, kind: 'banner', act: 'move', text: e.kind === 'mega' ? 'Mega Evolution!' : e.kind === 'primal' ? 'Primal Reversion!' : 'Ultra Burst!', palette: '???', big: true},
          {at: 350, dur: 650, kind: 'fx', role: 'gimmick', fx: e.kind === 'primal' ? 'primal' : 'cocoon', target: t, amount: 1},
          {at: 350, dur: 650, kind: 'actor', target: t, act: 'glow', color: '#ffffff'},
          {at: 1000, dur: 200, kind: 'flash', opacity: 0.8},
          {at: 1050, dur: 300, kind: 'actor', target: t, act: 'swap'},
          {at: 1050, dur: 300, kind: 'hud', target: t, act: 'refresh'},
          {at: 1050, dur: 450, kind: 'fx', role: 'gimmick', fx: 'burst', target: t, amount: 1},
          back(1350),
        ], 1850);
        case 'dynamax': return finish([
          {at: 0, dur: 1000, kind: 'banner', act: 'move', text: 'Dynamax!', palette: 'Fire', big: true},
          {at: 100, dur: 800, kind: 'fx', role: 'gimmick', fx: 'dyna', target: t, amount: 1},
          {at: 250, dur: 700, kind: 'actor', target: t, act: 'grow'},
          {at: 250, dur: 300, kind: 'hud', target: t, act: 'refresh'},
        ], 1000);
        case 'undynamax': return finish([{at: 0, dur: 600, kind: 'actor', target: t, act: 'shrink'}, {at: 0, dur: 300, kind: 'hud', target: t, act: 'refresh'}], 600);
        case 'zmove': return finish([
          {at: 0, dur: 900, kind: 'banner', act: 'move', text: 'Z-Move', palette: 'Electric', big: true},
          {at: 0, dur: 800, kind: 'fx', role: 'gimmick', fx: 'zaura', target: t, amount: 1},
          {at: 0, dur: 800, kind: 'actor', target: t, act: 'glow', color: '#ffd84a'},
        ], 900);
        default: return finish([], 0);
      }
    },
    start() {
      return finish([
        {at: 0, dur: 1400, kind: 'banner', act: 'move', text: 'Battle start!', palette: '???', big: true},
        {at: 0, dur: 700, kind: 'cam', shot: 'spread', targets: [{side: 'far', i: 0}, {side: 'far', i: 1}], s: 1.25},
        {at: 700, dur: 800, kind: 'cam', shot: 'wide', targets: []},
      ], 1500);
    },
    win(e) {
      const text = e.side ? `${e.name || 'The winner'} wins!` : "It's a tie!";
      const steps = [{at: 0, dur: 2200, kind: 'banner', act: 'move', text, palette: '???', big: true}];
      if (e.side) steps.push({at: 0, dur: 800, kind: 'cam', shot: 'spread', targets: [{side: e.side, i: 0}, {side: e.side, i: 1}], s: 1.3});
      steps.push({at: 1600, dur: 700, kind: 'cam', shot: 'wide', targets: []});
      return finish(steps, 2300);
    },
    // a weather, terrain, room or side condition starting (a wash of its colour, a gust for Tailwind, a big card) or ending
    // (a smaller card); e = {kind, id, on, side, card: field.js fieldAnnouncement()}
    field(e) {
      const steps = [{at: 0, dur: 700, kind: 'field', act: 'apply', model: e.model, fresh: e.on ? e.id : '', side: e.side}];
      if (!e.card) return finish(steps, 600);
      if (e.on) steps.push({at: 0, dur: 900, kind: 'field', act: 'wash', palette: e.card.palette, id: e.id, side: e.side});
      steps.push({at: 80, dur: e.on ? 1400 : 1100, kind: 'field', act: 'card', card: e.card, on: e.on});
      return finish(steps, e.on ? 1400 : 1000);
    },
    status(e) {
      return finish([{at: 0, dur: 700, kind: 'fx', role: 'status', fx: e.status, target: e.slot, amount: 1},
        {at: 200, dur: 300, kind: 'hud', target: e.slot, act: 'refresh'}], 700);
    },
    boost(e) {
      const dir = e.amount > 0 ? 1 : -1;
      return finish([{at: 0, dur: 900, kind: 'fx', role: 'boost', fx: 'streaks', target: e.slot, dir, intensity: Math.min(3, Math.abs(e.amount) || 1), amount: 1},
        {at: 150, dur: 300, kind: 'hud', target: e.slot, act: 'refresh'}], 900);
    },
    turn(e) { return finish([{at: 0, dur: 300, kind: 'hud', act: 'turn', turn: e.turn}], 300); },
    preview() { return finish([{at: 0, dur: 600, kind: 'actor', act: 'lineup'}], 600); },
    transform(e) {
      const t = e.slot;
      return finish([{at: 0, dur: 200, kind: 'flash', target: t, opacity: 0.7},
        {at: 150, dur: 300, kind: 'actor', target: t, act: 'swap'}, {at: 150, dur: 300, kind: 'hud', target: t, act: 'refresh'}], 450);
    },
    message(e) { return finish([{at: 0, dur: 0, kind: 'text', act: 'line', text: e.text}], 0); },
    ability(e) { return finish([{at: 0, dur: 900, kind: 'banner', target: e.slot, act: 'ability', text: e.name}], 900); },
    types(e) { return finish([{at: 0, dur: 600, kind: 'text', target: e.slot, act: 'types', types: e.types}], 600); },
  };

  return {
    plan(event) {
      const f = plans[event && event.type];
      return f ? f(event) : {steps: [], ms: 0};
    },
  };
}
