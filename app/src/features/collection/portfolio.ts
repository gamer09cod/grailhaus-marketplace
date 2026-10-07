import type { PackCategory } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { categoryLabel, formatBasisPoints, shelfCategories } from "../shelf/packs";

export type PortfolioFilter = "ALL" | PackCategory | "LISTED";
export type PortfolioSort = "value" | "pnl" | "recent";

export type PortfolioMoney = {
  category: PackCategory;
  estimatedValueCents: bigint;
  acquisitionPriceCents: bigint;
  acquiredAt: string;
  state?: "OWNED" | "LISTED";
};

/** Current catalog value minus what was paid. Both amounts are integer cents from the server. */
export function profitCents(currentCents: bigint, acquisitionCents: bigint): bigint {
  return currentCents - acquisitionCents;
}

export function portfolioTotals(items: readonly PortfolioMoney[]): { valueCents: bigint; profitCents: bigint } {
  let valueCents = 0n;
  let profit = 0n;
  for (const item of items) {
    valueCents += item.estimatedValueCents;
    profit += profitCents(item.estimatedValueCents, item.acquisitionPriceCents);
  }
  return { valueCents, profitCents: profit };
}

export function selectHoldings<T extends PortfolioMoney>(
  items: readonly T[],
  filter: PortfolioFilter,
  sort: PortfolioSort,
): T[] {
  const filtered = items.filter((item) => {
    if (filter === "ALL") {
      return true;
    }
    if (filter === "LISTED") {
      return item.state === "LISTED";
    }
    return item.category === filter;
  });
  const ranked = [...filtered];
  ranked.sort((left, right) => compareHoldings(left, right, sort));
  return ranked;
}

export function categoryAllocation(items: readonly PortfolioMoney[]): {
  category: PackCategory;
  label: string;
  valueCents: bigint;
  percentLabel: string;
  share: number;
}[] {
  let total = 0n;
  const byCategory = new Map<PackCategory, bigint>();
  for (const item of items) {
    total += item.estimatedValueCents;
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0n) + item.estimatedValueCents);
  }
  if (total <= 0n) {
    return [];
  }
  const rows: { category: PackCategory; label: string; valueCents: bigint; percentLabel: string; share: number }[] = [];
  for (const category of shelfCategories) {
    const valueCents = byCategory.get(category) ?? 0n;
    if (valueCents <= 0n) {
      continue;
    }
    const points = Number((valueCents * 10000n) / total);
    rows.push({
      category,
      label: categoryLabel(category),
      valueCents,
      percentLabel: points === 0 ? "<1%" : formatBasisPoints(points),
      share: Math.max(2, Math.min(100, Math.round(points / 100))),
    });
  }
  return rows;
}

export function topGainers<T extends PortfolioMoney>(items: readonly T[], limit = 3): T[] {
  return selectHoldings(items, "ALL", "pnl")
    .filter((item) => profitCents(item.estimatedValueCents, item.acquisitionPriceCents) > 0n)
    .slice(0, limit);
}

/** All-time change versus acquisition cost. Not a period return. */
export function allTimePercentLabel(currentCents: bigint, acquisitionCents: bigint): string | null {
  if (acquisitionCents <= 0n || currentCents === acquisitionCents) {
    return null;
  }
  const delta = currentCents > acquisitionCents
    ? currentCents - acquisitionCents
    : acquisitionCents - currentCents;
  const points = Number((delta * 10000n) / acquisitionCents);
  const percentLabel = points === 0 ? "<1%" : formatBasisPoints(points);
  return currentCents > acquisitionCents ? `+${percentLabel}` : `-${percentLabel}`;
}

function compareHoldings(left: PortfolioMoney, right: PortfolioMoney, sort: PortfolioSort): number {
  if (sort === "recent") {
    return compareRecent(left.acquiredAt, right.acquiredAt);
  }
  const leftAmount = sort === "value"
    ? left.estimatedValueCents
    : profitCents(left.estimatedValueCents, left.acquisitionPriceCents);
  const rightAmount = sort === "value"
    ? right.estimatedValueCents
    : profitCents(right.estimatedValueCents, right.acquisitionPriceCents);
  if (leftAmount === rightAmount) {
    return compareRecent(left.acquiredAt, right.acquiredAt);
  }
  return leftAmount > rightAmount ? -1 : 1;
}

function compareRecent(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
}

export function formatSignedCents(cents: bigint): string {
  if (cents > 0n) {
    return `+${formatCents(cents)}`;
  }
  return formatCents(cents);
}

export function listedStateLabel(state: "OWNED" | "LISTED"): string {
  if (state === "LISTED") {
    return "Listed";
  }
  return "Not listed";
}
