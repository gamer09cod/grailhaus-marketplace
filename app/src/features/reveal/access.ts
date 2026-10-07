import { packsOpenedLabel } from "./pacing";

export type RevealMotion = {
  travelPx: number;
  scaleFrom: number;
  fadeMs: number;
};

/** Large sleeve travel is replaced by a fade and a small scale. The stored card stays the same. */
export function revealMotion(reduced: boolean): RevealMotion {
  if (reduced) {
    return { travelPx: 0, scaleFrom: 0.96, fadeMs: 180 };
  }
  return { travelPx: 280, scaleFrom: 1, fadeMs: 0 };
}

export function sealedDirection(reduced: boolean): string {
  if (reduced) {
    return "Sealed. Reveal next card.";
  }
  return "Sealed. Drag down to tear it open.";
}

export function nextCardLabel(hasAnother: boolean): "Reveal next card" | "Done" {
  if (hasAnother) {
    return "Reveal next card";
  }
  return "Done";
}

export function spokenRarity(rarity: string): string {
  if (rarity === "COMMON") {
    return "Common";
  }
  if (rarity === "UNCOMMON") {
    return "Uncommon";
  }
  if (rarity === "RARE") {
    return "Rare";
  }
  if (rarity === "EPIC") {
    return "Epic";
  }
  if (rarity === "LEGENDARY") {
    return "Legendary";
  }
  return rarity;
}

/** Whole dollars stay whole. A remainder is spoken as cents, from the integer cent amount. */
export function spokenCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const dollars = absolute / 100n;
  const remainder = absolute % 100n;
  const parts: string[] = [];
  if (dollars > 0n || remainder === 0n) {
    parts.push(`${dollars.toString()} ${dollars === 1n ? "dollar" : "dollars"}`);
  }
  if (remainder > 0n) {
    parts.push(`${remainder.toString()} ${remainder === 1n ? "cent" : "cents"}`);
  }
  const phrase = parts.join(" and ");
  return negative ? `minus ${phrase}` : phrase;
}

export function cardAnnouncement(card: {
  rarity: string;
  name: string;
  estimatedValueCents: bigint;
}): string {
  return `${spokenRarity(card.rarity)} card revealed. ${card.name}. Estimated value ${spokenCents(card.estimatedValueCents)}.`;
}

export function summaryAnnouncement(
  count: number,
  spentCents: bigint,
  estimatedCents: bigint,
  bestName: string,
): string {
  return `${packsOpenedLabel(count)}. Total spent ${spokenCents(spentCents)}. Collection value ${spokenCents(estimatedCents)}. Best pull ${bestName}.`;
}
