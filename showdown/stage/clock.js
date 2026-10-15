// Timing for the stage: every animation is placed on a cursor (ms from the start of the current step) and Battle's
// wait (finishAnimations) resolves on a plain timer at the end of the queue. Never on animation frames, so a hidden
// tab or pane can't hold a battle up. A watchdog caps any single wait.

export class Clock {
  constructor({now = () => (globalThis.performance ? performance.now() : Date.now()), setTimer = (fn, ms) => setTimeout(fn, ms), watchdog = 6000} = {}) {
    this.now = now;
    this.setTimer = setTimer;
    this.watchdog = watchdog;
    this.scale = 1; // 1 normal, 0.4 fast
    this.gen = 0;
    this.reset();
  }
  reset() {
    this.cursor = 0;
    this.started = this.now();
  }
  /** drop everything queued: a wait already running resolves but won't reset the newer queue */
  cancel() {
    this.gen++;
    this.reset();
  }
  /** is anything still to play? */
  pending() { return this.cursor > this.now() - this.started + 1; }
  /** Reserve `ms` (times scale) after everything already queued; returns when that part starts, in ms from now's base. */
  enqueue(ms) {
    // never start in the past: after an idle gap the next animation starts now, not at the old cursor
    const at = Math.max(this.cursor, this.now() - this.started);
    this.cursor = at + Math.max(0, ms) * this.scale;
    return at;
  }
  wait(ms) { return this.enqueue(ms); }
  /** Resolves when everything queued has played (+50 ms), or at the watchdog, whichever comes first. */
  finish() {
    const left = Math.max(0, this.cursor - (this.now() - this.started));
    const ms = Math.min(this.watchdog, Math.round(left) + 50);
    const gen = this.gen;
    return new Promise(resolve => this.setTimer(() => { if (gen === this.gen) { this.gen++; this.reset(); } resolve(); }, ms));
  }
}
