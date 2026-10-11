export function nextCardIndex(index: number, count: number): number | null {
  return Number.isInteger(index) && index >= 0 && index + 1 < count ? index + 1 : null;
}
export function cardPresentationKey(packId: string, index: number): string { return `${packId}:${index}`; }
export function previousCardPositions(index: number): number[] {
  return Array.from({ length: Math.min(2, Math.max(0, index)) }, (_, offset) => index - offset - 1).reverse();
}

/**
 * Anonymous décor backs for the launch fan.
 * Never invents owned faces — when the server returns one card, we still may
 * show anonymous backs. When the server returns N>1 real cards, extras are
 * only for cards beyond the current winner (faces stay on PreviousCards / result).
 */
export function decorBackCount(serverCardCount: number, reduced: boolean): number {
  const count = Number.isFinite(serverCardCount) ? Math.max(0, Math.floor(serverCardCount)) : 0;
  if (count <= 0) return 0;
  if (reduced) return Math.min(2, Math.max(0, count - 1));
  if (count === 1) return 2;
  return Math.min(3, count - 1);
}
