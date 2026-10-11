/** Seal geometry and release decision shared by worklets and logic tests. */
export const SEAL_WIDTH = 190;
export function sealProgress(distance: number): number {
  "worklet";
  return Math.min(1, Math.max(0, distance / SEAL_WIDTH));
}

export function completesSeal(distance: number, velocityPxPerSecond: number): boolean {
  "worklet";
  // Reverse motion cannot complete a flick. Slow motion must traverse the whole seam.
  return distance >= SEAL_WIDTH || (distance >= SEAL_WIDTH * 0.35 && velocityPxPerSecond >= 1100);
}
