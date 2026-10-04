export type OpenMode = "full" | "fast" | "premium";

export type SessionPull = {
  name: string;
  rarity: string;
  estimatedValueCents: bigint;
};

const rarityRank: Record<string, number> = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  EPIC: 4,
  LEGENDARY: 5,
};

/** Position is 1-based in the purchase. The first two packs stay on the full gesture. */
export function openMode(position: number, rarity: string): OpenMode {
  if (!Number.isInteger(position) || position <= 2) {
    return "full";
  }
  if (rarity === "EPIC" || rarity === "LEGENDARY") {
    return "premium";
  }
  return "fast";
}

export function bestPull<T extends SessionPull>(pulls: readonly T[]): T | null {
  let best: T | null = null;
  for (const pull of pulls) {
    if (!best) {
      best = pull;
      continue;
    }
    const rank = (rarityRank[pull.rarity] ?? 0) - (rarityRank[best.rarity] ?? 0);
    if (rank > 0 || (rank === 0 && pull.estimatedValueCents > best.estimatedValueCents)) {
      best = pull;
    }
  }
  return best;
}

export function sumCents(amounts: readonly bigint[]): bigint {
  let total = 0n;
  for (const amount of amounts) {
    total += amount;
  }
  return total;
}

/** Cards already opened, in the order they were opened. This does not sort by rarity. */
export function fanInOpenOrder<T>(opened: readonly T[]): T[] {
  return [...opened];
}

export function packsOpenedLabel(count: number): string {
  return count === 1 ? "1 Pack Opened" : `${count} Packs Opened`;
}
