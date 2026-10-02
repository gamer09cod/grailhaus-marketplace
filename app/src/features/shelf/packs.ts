import { supabase } from "../../api/supabase";
import type { PackCategory } from "../../navigation/types";
import { centsFromWire } from "../../utils/money";

export const shelfCategories = ["TRADING_CARD", "SNEAKER", "WATCH"] as const;

const rarityOrder = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;

export type Rarity = (typeof rarityOrder)[number];

export type ShelfPack = {
  id: string;
  category: PackCategory;
  name: string;
  tier: string;
  priceCents: bigint;
  reservable: bigint;
};

export type PackOdds = {
  rarity: Rarity;
  basisPoints: number;
};

export function isPackCategory(value: string): value is PackCategory {
  return shelfCategories.some((category) => category === value);
}

export function categoryLabel(category: PackCategory): string {
  switch (category) {
    case "TRADING_CARD":
      return "Trading Cards";
    case "SNEAKER":
      return "Sneakers";
    case "WATCH":
      return "Watches";
  }
}

export function rarityLabel(rarity: Rarity): string {
  switch (rarity) {
    case "COMMON":
      return "Common";
    case "UNCOMMON":
      return "Uncommon";
    case "RARE":
      return "Rare";
    case "EPIC":
      return "Epic";
    case "LEGENDARY":
      return "Legendary";
  }
}

export function formatBasisPoints(points: number): string {
  const whole = Math.trunc(points / 100);
  const fraction = Math.abs(points % 100);
  if (fraction === 0) {
    return `${whole}%`;
  }
  return `${whole}.${fraction.toString().padStart(2, "0")}%`;
}

export type TierPresence = "quiet" | "standard" | "elevated" | "grail";

export function tierPresence(priceCents: bigint): TierPresence {
  if (priceCents >= 200_000n) {
    return "grail";
  }
  if (priceCents >= 50_000n) {
    return "elevated";
  }
  if (priceCents >= 5_000n) {
    return "standard";
  }
  return "quiet";
}

export function stockLabel(reservable: bigint): string {
  if (reservable <= 0n) {
    return "Sold out";
  }
  return `${reservable.toString()} available`;
}

export function featuredPacks(packs: readonly ShelfPack[]): ShelfPack[] {
  return shelfCategories.flatMap((category) => {
    const inCategory = packs.filter((pack) => pack.category === category);
    const first = inCategory[0];
    if (!first) {
      return [];
    }
    const richest = inCategory.reduce((best, pack) =>
      pack.priceCents > best.priceCents ? pack : best,
    );
    return [richest];
  });
}

export function clampQuantity(requested: number, reservable: bigint): number {
  if (reservable <= 0n) {
    return 0;
  }
  const max = reservable > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(reservable);
  return Math.min(Math.max(Math.trunc(requested), 1), max);
}

export async function loadShelfPacks(): Promise<ShelfPack[]> {
  const { data, error } = await supabase
    .from("pack_skus")
    .select("id, category, name, tier, price_cents, stock_on_hand, stock_reserved")
    .eq("active", true)
    .eq("is_drop", false);

  if (error) {
    throw new Error(error.message);
  }

  const packs: ShelfPack[] = [];
  for (const row of data ?? []) {
    if (!isPackCategory(row.category)) {
      continue;
    }
    const onHand = centsFromWire(row.stock_on_hand);
    const reserved = centsFromWire(row.stock_reserved);
    packs.push({
      id: row.id,
      category: row.category,
      name: row.name,
      tier: row.tier,
      priceCents: centsFromWire(row.price_cents),
      reservable: onHand - reserved,
    });
  }

  packs.sort((left, right) => {
    const categoryDelta = shelfCategories.indexOf(left.category) - shelfCategories.indexOf(right.category);
    if (categoryDelta !== 0) {
      return categoryDelta;
    }
    if (left.priceCents < right.priceCents) {
      return -1;
    }
    if (left.priceCents > right.priceCents) {
      return 1;
    }
    return left.name.localeCompare(right.name);
  });

  return packs;
}

export async function loadPackOdds(packId: string): Promise<PackOdds[]> {
  const { data, error } = await supabase
    .from("pack_odds")
    .select("rarity, probability_basis_points")
    .eq("pack_sku_id", packId);

  if (error) {
    throw new Error(error.message);
  }

  const odds: PackOdds[] = [];
  for (const row of data ?? []) {
    const rarity = rarityOrder.find((candidate) => candidate === row.rarity);
    if (!rarity) {
      continue;
    }
    odds.push({ rarity, basisPoints: row.probability_basis_points });
  }

  odds.sort(
    (left, right) => rarityOrder.indexOf(left.rarity) - rarityOrder.indexOf(right.rarity),
  );
  return odds;
}
