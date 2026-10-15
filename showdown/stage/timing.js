// The timing contract Showdown's Battle expects from its renderer (vendor/battle.js nextStep):
// - finishAnimations() returns nothing when there is nothing to wait for (seeking, or no animation queued), so Battle
//   carries on in its own loop instead of recursing through an already-resolved promise;
// - otherwise a jQuery promise, resolved on a timer (the Clock), never on animation frames;
// - interruptionCount goes up whenever queued waits must be forgotten (pause, seek, stop, destroy): Battle ignores a
//   wait that resolves after the count changed, so an old wait can never start a second step loop.
export class SceneTiming {
  constructor({clock, Deferred}) {
    this.clock = clock;
    this.Deferred = Deferred;
    this.interruptionCount = 1;
  }
  interrupt() {
    this.interruptionCount++;
    this.clock.cancel();
  }
  finish(animating) {
    if (!animating || !this.clock.pending()) { this.clock.reset(); return undefined; }
    const d = this.Deferred();
    this.clock.finish().then(() => d.resolve());
    return d.promise();
  }
}
