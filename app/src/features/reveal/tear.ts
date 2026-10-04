export type TearDecision = "tear" | "spring";

export type StoredCard = {
  revealOrder: number;
  rarity: string;
};

// A flick needs speed and some distance. A slow drag only finishes once the
// tear has actually traveled. A tap, or a slow drag that stops at the flick
// distance, springs shut.
const TAP_PX = 12;
const FLICK_PX = 48;
const FLICK_PX_PER_MS = 1.1;
const PULL_THROUGH_PX = 200;

export function decideTear(distancePx: number, velocityPxPerMs: number): TearDecision {
  if (distancePx < TAP_PX) {
    return "spring";
  }
  const flicked = distancePx >= FLICK_PX && velocityPxPerMs >= FLICK_PX_PER_MS;
  const pulledThrough = distancePx >= PULL_THROUGH_PX;
  if (flicked || pulledThrough) {
    return "tear";
  }
  return "spring";
}

export function velocityPxPerMs(samples: { t: number; y: number }[]): number {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || samples.length < 2) {
    return 0;
  }
  const elapsed = Math.max(1, last.t - first.t);
  return (last.y - first.y) / elapsed;
}

export function cardsInStoredOrder<T extends StoredCard>(cards: T[]): T[] {
  return [...cards].sort((left, right) => left.revealOrder - right.revealOrder);
}

export function anticipationMs(rarity: string): number {
  switch (rarity) {
    case "LEGENDARY":
      return 1100;
    case "EPIC":
      return 900;
    case "RARE":
      return 700;
    default:
      return 280;
  }
}

export function isHighRarity(rarity: string): boolean {
  return anticipationMs(rarity) >= 700;
}
