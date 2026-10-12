import { FINAL_REVEAL_BEAT_MS } from "./suspenseTiming";

export const FLIP_TOTAL_MS = FINAL_REVEAL_BEAT_MS;

/**
 * Final Y-flip pose.
 * Scale never drops below 1 — shrinking the face against a static stage rim
 * exposed the dark container behind the card mid-turn.
 * Mild foreshortening compensation keeps coverage near edge-on, then a short punch settles.
 */
export function finalFlipPose(progress: number) {
  "worklet";
  const p = Math.max(0, Math.min(1, progress));
  const turn = Math.min(1, p / (400 / FLIP_TOTAL_MS));
  const angle = 180 * (turn * turn * (3 - 2 * turn));
  const elapsed = p * FLIP_TOTAL_MS;
  const rad = (angle * Math.PI) / 180;
  // Clamp so edge-on does not explode scale; floor keeps visual coverage ≥ full frame.
  const facing = Math.max(0.78, Math.abs(Math.cos(rad)));
  const cover = 1 / facing;
  const punch = 1 + 0.05 * turn;
  const scale = elapsed <= 400
    ? Math.max(1, cover * punch)
    : elapsed < 500
      ? 1.05 - 0.05 * ((elapsed - 400) / 100)
      : 1;
  return { angle, scale, frontVisible: angle >= 90 };
}
