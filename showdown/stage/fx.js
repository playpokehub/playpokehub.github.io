// Canvas particle engine for move effects (grown from the mock-up's). Times are in seconds of real time, so an effect
// lasts as long as the director says even at a low frame rate. Drawing uses requestAnimationFrame, which is only
// about looks: if frames stop (hidden tab), particles just don't draw; nothing waits on them.

const MAX = 400;
const rnd = (a, b) => a + Math.random() * (b - a);

export function fxLayer(canvas, {reduced = false} = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, (globalThis.devicePixelRatio || 1));
  const W = 800, H = 450;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const parts = [];
  let running = false, last = 0;
  const scaleN = n => Math.max(1, Math.round(n * (reduced ? 0.4 : 1)));

  function add(p) {
    if (parts.length >= MAX) parts.shift();
    parts.push(Object.assign({t: 0, delay: 0, vx: 0, vy: 0, g: 0, drag: 0.9, rot: 0, vr: 0, alpha: 1}, p));
    if (!running) { running = true; last = 0; requestAnimationFrame(tick); }
  }
  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      const k = p.t / p.life;
      draw(p, k, dt);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(tick); else { running = false; ctx.clearRect(0, 0, W, H); }
  }
  function draw(p, k, dt) {
    ctx.globalAlpha = p.alpha * (p.fade === false ? 1 : 1 - k);
    switch (p.kind) {
      case 'slash': {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.strokeStyle = p.c; ctx.lineWidth = p.w * (1 - k); ctx.shadowColor = p.c; ctx.shadowBlur = 16; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, p.r, -0.6, -0.6 + Math.min(1, k * 3) * p.len / p.r); ctx.stroke(); ctx.restore();
        return;
      }
      case 'ring': {
        ctx.strokeStyle = p.c; ctx.lineWidth = 6 * (1 - k); ctx.shadowColor = p.c; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * (0.25 + k), p.r * 0.45 * (0.25 + k), 0, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        return;
      }
      case 'beam': {
        const g = ctx.createLinearGradient(p.x, p.y, p.x2, p.y2);
        g.addColorStop(0, p.c0); g.addColorStop(1, p.c);
        ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.shadowColor = p.c; ctx.shadowBlur = 20;
        ctx.lineWidth = p.w * Math.sin(Math.PI * Math.min(1, k * 1.2));
        const e = Math.min(1, k * 2.5);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + (p.x2 - p.x) * e, p.y + (p.y2 - p.y) * e); ctx.stroke();
        ctx.shadowBlur = 0;
        return;
      }
      case 'bolt': {
        ctx.strokeStyle = p.c; ctx.lineWidth = 3; ctx.shadowColor = p.c; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(p.pts[0][0], p.pts[0][1]);
        for (const [x, y] of p.pts) ctx.lineTo(x, y);
        ctx.stroke(); ctx.shadowBlur = 0;
        return;
      }
      case 'shard': {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot += p.vr * dt;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(0, -p.s); ctx.lineTo(p.s * 0.5, 0); ctx.lineTo(0, p.s); ctx.lineTo(-p.s * 0.5, 0); ctx.fill(); ctx.restore();
        return;
      }
      case 'arrow': {
        p.y += p.vy * dt;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.moveTo(p.x - p.s, p.y + p.dir * p.s * 0.6); ctx.lineTo(p.x, p.y - p.dir * p.s * 0.6); ctx.lineTo(p.x + p.s, p.y + p.dir * p.s * 0.6);
        ctx.lineTo(p.x + p.s * 0.55, p.y + p.dir * p.s * 0.6); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x - p.s * 0.55, p.y + p.dir * p.s * 0.6); ctx.fill();
        return;
      }
      default: { // glowing dot
        if (p.tx !== undefined) { // homing: travel from start to (tx, ty) over its life
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          p.x = p.sx + (p.tx - p.sx) * e + Math.sin(k * 9 + p.ph) * p.wob;
          p.y = p.sy + (p.ty - p.sy) * e + Math.cos(k * 7 + p.ph) * p.wob;
        } else {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
          const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d;
        }
        const r = p.s * (1 - k * 0.6);
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
        grd.addColorStop(0, p.c0 || '#fff'); grd.addColorStop(0.4, p.c); grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  const api = {
    /** particles flying out from (x, y) */
    burst(x, y, n, {speed = 260, size = 5, life = 0.5, c = '#fff', c0 = '#fff', g = 0, up = 0, flat = 1, delay = 0} = {}) {
      for (let i = 0, m = scaleN(n); i < m; i++) {
        const a = Math.random() * Math.PI * 2, sp = speed * rnd(0.4, 1.2);
        add({x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * flat - up, s: size * rnd(0.6, 1.4), life: life * rnd(0.7, 1.3), c, c0, g, delay});
      }
    },
    /** three claw marks */
    slashes(x, y, c, {delay = 0} = {}) {
      [-22, 0, 22].forEach((d, i) => add({kind: 'slash', x: x + d - 30, y: y - 40 + d * 0.3, a: 0.9, r: 60, len: 150, w: 9, life: 0.35, c, delay: delay + i * 0.05}));
    },
    ring(x, y, r, c, {delay = 0, life = 0.5} = {}) { add({kind: 'ring', x, y, r, c, life, delay}); },
    shards(x, y, n, c, {delay = 0, speed = 320} = {}) {
      for (let i = 0, m = scaleN(n); i < m; i++) {
        const a = Math.random() * Math.PI * 2, sp = speed * rnd(0.4, 1);
        add({kind: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 700, rot: rnd(0, 6), vr: rnd(-8, 8), s: rnd(5, 12), life: rnd(0.6, 0.9), c, delay});
      }
    },
    beam(x1, y1, x2, y2, {c = '#fff', c0 = '#fff', w = 14, life = 0.35, delay = 0} = {}) {
      add({kind: 'beam', x: x1, y: y1, x2, y2, c, c0, w, life, delay, fade: false});
    },
    /** particles travelling from (x1, y1) to (x2, y2) */
    orb(x1, y1, x2, y2, {n = 1, size = 12, life = 0.3, c = '#fff', c0 = '#fff', wob = 0, delay = 0, spread = 0} = {}) {
      for (let i = 0, m = scaleN(n); i < m; i++) {
        add({sx: x1 + rnd(-spread, spread), sy: y1 + rnd(-spread, spread), tx: x2 + rnd(-spread, spread), ty: y2 + rnd(-spread, spread), x: x1, y: y1,
          s: size * rnd(0.7, 1.2), life, c, c0, wob, ph: rnd(0, 6), delay: delay + (m > 1 ? i * life / m * 0.8 : 0), fade: false, alpha: 1});
      }
    },
    bolt(x1, y1, x2, y2, {c = '#fff27a', life = 0.18, delay = 0} = {}) {
      const pts = [[x1, y1]];
      for (let i = 1; i < 6; i++) pts.push([x1 + (x2 - x1) * i / 6 + rnd(-14, 14), y1 + (y2 - y1) * i / 6 + rnd(-14, 14)]);
      pts.push([x2, y2]);
      add({kind: 'bolt', pts, c, life, delay});
    },
    /** stat change arrows rising (dir 1) or falling (-1) around (x, y) */
    streaks(x, y, dir, c, intensity = 1, {delay = 0} = {}) {
      for (let i = 0, m = scaleN(10 * intensity); i < m; i++) {
        add({kind: 'arrow', x: x + rnd(-45, 45), y: y + (dir > 0 ? rnd(10, 60) : rnd(-90, -40)), vy: -dir * rnd(90, 150), s: rnd(6, 10), dir, c, life: rnd(0.6, 0.9), delay: delay + rnd(0, 0.5)});
      }
    },
    clear() { parts.length = 0; ctx.clearRect(0, 0, W, H); },
    get live() { return parts.length; },
  };
  return api;
}
