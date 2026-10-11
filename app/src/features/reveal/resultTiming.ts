import { resultFadeMs, resultPauseMs, timingMode, type TimingMode } from "./revealTiming";
import type { RevealQuality } from "./quality";

export function resultTiming(reduced: boolean, compressed = false) {
  const mode: TimingMode = timingMode({
    quality: reduced ? "reduced" : "balanced",
    compressed,
  });
  return { pauseMs: resultPauseMs(mode), fadeMs: resultFadeMs(mode) };
}

/** Quality-aware result timing for the Phase A+ controller. */
export function resultTimingForQuality(quality: RevealQuality, compressed = false) {
  const mode = timingMode({ quality, compressed });
  return { pauseMs: resultPauseMs(mode), fadeMs: resultFadeMs(mode) };
}

export function resultIsReady(readyPackId: string | null, packId: string | undefined, revealed: boolean): boolean {
  return revealed && packId !== undefined && readyPackId === packId;
}
