/** UI-thread presentation curve. No outcome or financial data is calculated here. */
export function backRotation(progress: number): number {
  "worklet";
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0.25) return 0;
  let start: number;
  let end: number;
  let base: number;
  if (p <= 0.65) { start = 0.25; end = 0.65; base = 0; }
  else if (p <= 0.85) { start = 0.65; end = 0.85; base = 180; }
  else { start = 0.85; end = 1; base = 360; }
  const u = (p - start) / (end - start);
  // Slow at either face-on endpoint, fast through the narrow edge.
  return base + 180 * u * u * (3 - 2 * u);
}

/** Discrete artwork changes happen only when both back surfaces are edge-on. */
export function backPaletteProgress(angle: number): number {
  "worklet";
  if (angle < 90) return 0;
  if (angle < 270) return 0.65;
  if (angle < 450) return 0.85;
  return 1;
}

export function shouldRotateBack(durationMs: number, reduced: boolean): boolean {
  return !reduced && durationMs >= 600;
}
