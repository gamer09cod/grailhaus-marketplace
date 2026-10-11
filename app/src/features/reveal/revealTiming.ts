/**
 * Shared reveal timing tables. Presentation only — durable milestones stay on the server.
 * Values match the current balanced path; Phase B+ may tune with device FPS.
 */

import type { RevealQuality } from "./quality";

export type TimingMode = "full" | "compressed" | "reduced";

export function timingMode(opts: {
  quality: RevealQuality;
  compressed?: boolean;
}): TimingMode {
  if (opts.quality === "reduced") return "reduced";
  if (opts.compressed) return "compressed";
  return "full";
}

/** Seal snap after a successful flick. */
export const SEAL_SNAP_MS = 90;

/** Tear payoff + burst envelope. */
export function tearBurstMs(mode: TimingMode): number {
  switch (mode) {
    case "reduced":
      return 120;
    case "compressed":
      return 200;
    default:
      return 420;
  }
}

/** Pack exit after burst. */
export function packExitMs(mode: TimingMode): number {
  switch (mode) {
    case "reduced":
      return 140;
    case "compressed":
      return 220;
    default:
      return 380;
  }
}

/** Card launch from pack mouth to center (arrive beat before spin). */
export function cardLaunchMs(mode: TimingMode): number {
  switch (mode) {
    case "reduced":
      return 160;
    case "compressed":
      return 300;
    default:
      return 720;
  }
}

/**
 * Back-hold / suspense duration by stored rarity (spin beat after arrive).
 * Mirrors `anticipationMs` — keep both in sync until callers migrate.
 */
export function backHoldMs(rarity: string, mode: TimingMode = "full"): number {
  if (mode === "reduced") return 180;
  if (mode === "compressed") return 160;
  switch (rarity) {
    case "LEGENDARY":
      return 3800;
    case "EPIC":
      return 3200;
    case "RARE":
      return 2700;
    default:
      return 2200;
  }
}

/** Protected final flip beat (face-on pause included). Matches FINAL_REVEAL_BEAT_MS. */
export const FLIP_BEAT_MS = 650;

/** Rotating glow settle after face is up. */
export function glowSettleMs(mode: TimingMode): number {
  switch (mode) {
    case "reduced":
      return 180;
    case "compressed":
      return 320;
    default:
      return 900;
  }
}

/** Result metadata cascade stagger between name / rarity / estimate. */
export function resultStaggerMs(mode: TimingMode): number {
  return mode === "reduced" ? 0 : 120;
}

export function resultPauseMs(mode: TimingMode): number {
  switch (mode) {
    case "reduced":
      return 180;
    case "compressed":
      return 120;
    default:
      return 420;
  }
}

export function resultFadeMs(mode: TimingMode): number {
  switch (mode) {
    case "reduced":
      return 180;
    case "compressed":
      return 140;
    default:
      return 280;
  }
}
