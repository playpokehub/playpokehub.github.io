// The renderer interface Showdown's client Battle (vendor/battle.js) calls: every method of its BattleScene
// (vendor/graphics.js). StageBase defines each one as a safe no-op, so a call the stage doesn't handle (or one a
// future Showdown adds) never throws. tests/stage.mjs checks this list against the vendored file.

export const SCENE_METHODS = [
  'reset', 'animationOff', 'stopAnimation', 'animationOn', 'pause', 'resume', 'setMute', 'wait', 'addSprite',
  'showEffect', 'animateEffect', 'backgroundEffect', 'pos', 'posT', 'waitFor', 'startAnimations', 'finishAnimations',
  'preemptCatchup', 'message', 'maybeCloseMessagebar', 'closeMessagebar', 'runMoveAnim', 'runOtherAnim',
  'runStatusAnim', 'runResidualAnim', 'runPrepareAnim', 'updateGen', 'getDetailsText', 'getSidebarHTML',
  'updateSidebar', 'updateLeftSidebar', 'updateRightSidebar', 'updateSidebars', 'updateStatbars', 'resetSides',
  'rebuildTooltips', 'teamPreview', 'showJoinButtons', 'hideJoinButtons', 'turnsLeft', 'pseudoWeatherLeft',
  'sideConditionLeft', 'weatherLeft', 'sideConditionsLeft', 'upkeepWeather', 'updateWeather', 'resetTurn',
  'incrementTurn', 'updateAcceleration', 'addPokemonSprite', 'addSideCondition', 'removeSideCondition',
  'resetSideConditions', 'typeAnim', 'resultAnim', 'abilityActivateAnim', 'damageAnim', 'healAnim', 'removeEffect',
  'addEffect', 'animSummon', 'animUnsummon', 'animDragIn', 'animDragOut', 'resetStatbar', 'updateStatbar',
  'updateStatbarIfExists', 'animTransform', 'clearEffects', 'removeTransform', 'animFaint', 'animReset', 'anim',
  'beforeMove', 'afterMove', 'setFrameHTML', 'setControlsHTML', 'preloadImage', 'preloadEffects', 'rollBgm', 'setBgm',
  'updateBgm', 'resetBgm', 'destroy', 'getHPColor',
];

const TEXT = new Set(['getDetailsText', 'getSidebarHTML', 'turnsLeft', 'pseudoWeatherLeft', 'sideConditionLeft',
  'weatherLeft', 'sideConditionsLeft']);

export class StageBase {
  constructor() {
    this.animating = true;
    this.acceleration = 1;
    this.interruptionCount = 1;
    this.timeOffset = 0;
    this.activeCount = 1;
  }
  finishAnimations() {
    const $ = globalThis.jQuery;
    return $ ? $.Deferred().resolve().promise() : Promise.resolve();
  }
  addPokemonSprite() { return {destroy() {}, animSub() {}, removeSub() {}, reset() {}}; }
  getHPColor(p) {
    const r = p && p.maxhp ? p.hp / p.maxhp : 1;
    return r > 0.5 ? 'g' : r > 0.2 ? 'y' : 'r';
  }
}
for (const name of SCENE_METHODS) {
  if (Object.prototype.hasOwnProperty.call(StageBase.prototype, name)) continue;
  StageBase.prototype[name] = TEXT.has(name) ? function () { return ''; } : function () {};
}
