import { FINAL_REVEAL_BEAT_MS } from "./suspenseTiming";

export const FLIP_TOTAL_MS = FINAL_REVEAL_BEAT_MS;
// The turn/punch finishes at 500ms, leaving 150ms to see the face alone.
export function finalFlipPose(progress: number) {
  "worklet";
  const p = Math.max(0, Math.min(1, progress));
  const turn = Math.min(1, p / (400 / FLIP_TOTAL_MS));
  const angle = 180 * (turn * turn * (3 - 2 * turn));
  const elapsed = p * FLIP_TOTAL_MS;
  const scale = elapsed <= 400
    ? 0.94 + 0.11 * (elapsed / 400)
    : elapsed < 500 ? 1.05 - 0.05 * ((elapsed - 400) / 100) : 1;
  return { angle, scale, frontVisible: angle >= 90 };
}
