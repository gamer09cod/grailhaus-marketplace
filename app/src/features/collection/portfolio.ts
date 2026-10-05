import type { PackCategory } from "../../navigation/types";
import { formatCents } from "../../utils/money";

export type PortfolioFilter = "ALL" | PackCategory;
export type PortfolioSort = "value" | "pnl" | "recent";

export type PortfolioMoney = {
  category: PackCategory;
  estimatedValueCents: bigint;
  acquisitionPriceCents: bigint;
  acquiredAt: string;
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
  const filtered = items.filter((item) => filter === "ALL" || item.category === filter);
  const ranked = [...filtered];
  ranked.sort((left, right) => compareHoldings(left, right, sort));
  return ranked;
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
