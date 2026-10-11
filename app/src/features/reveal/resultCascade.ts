import { resultFadeMs, resultPauseMs, resultStaggerMs, type TimingMode } from "./revealTiming";

/** Cascaded metadata entrance: name → rarity → estimate. */
export function resultCascadeDelays(mode: TimingMode) {
  const pause = resultPauseMs(mode);
  const stagger = resultStaggerMs(mode);
  const fade = resultFadeMs(mode);
  return {
    nameAt: pause,
    rarityAt: pause + stagger,
    valueAt: pause + stagger * 2,
    readyAt: pause + stagger * 2 + fade,
    fadeMs: fade,
  };
}
