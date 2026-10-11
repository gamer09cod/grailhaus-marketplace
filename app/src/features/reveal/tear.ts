import { backHoldMs } from "./revealTiming";

export type StoredCard = {
  revealOrder: number;
  rarity: string;
};

export function cardsInStoredOrder<T extends StoredCard>(cards: T[]): T[] {
  return [...cards].sort((left, right) => left.revealOrder - right.revealOrder);
}

/** Kept for existing scripts; prefer `backHoldMs` from revealTiming. */
export function anticipationMs(rarity: string): number {
  return backHoldMs(rarity, "full");
}
