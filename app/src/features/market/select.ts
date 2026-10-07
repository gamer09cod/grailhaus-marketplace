import type { PackCategory } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import {
  formatBasisPoints,
  isRarity,
  packTierClass,
  type PackTierClass,
  type Rarity,
} from "../shelf/packs";
import type { MarketListing } from "./board";

export type MarketCategoryFilter = "ALL" | PackCategory;
export type MarketSort = "recent" | "priceAsc" | "priceDesc";

export type MarketQuery = {
  search: string;
  category: MarketCategoryFilter;
  rarity: Rarity | null;
  priceBand: PackTierClass | null;
  belowFmv: boolean;
  sort: MarketSort;
};

export function selectListings(listings: readonly MarketListing[], query: MarketQuery): MarketListing[] {
  const needle = query.search.trim().toLowerCase();
  const matches = listings.filter((listing) => {
    if (needle && !listing.name.toLowerCase().includes(needle)) {
      return false;
    }
    if (query.category !== "ALL" && listing.category !== query.category) {
      return false;
    }
    if (query.rarity && listing.rarity !== query.rarity) {
      return false;
    }
    if (query.priceBand && packTierClass(listing.priceCents) !== query.priceBand) {
      return false;
    }
    if (query.belowFmv) {
      if (listing.currentValueCents === null || listing.priceCents >= listing.currentValueCents) {
        return false;
      }
    }
    return true;
  });
  return [...matches].sort((left, right) => compareListings(left, right, query.sort));
}

export function emptyMarketCopy(listings: readonly MarketListing[], query: MarketQuery): string {
  if (listings.length === 0) {
    return "No listings are for sale.";
  }
  if (query.search.trim()) {
    return "No listings match that search.";
  }
  if (query.category !== "ALL" || query.rarity || query.priceBand || query.belowFmv) {
    return "No listings match those filters.";
  }
  return "No listings are for sale.";
}

export function listingRarity(listing: MarketListing): Rarity | null {
  return isRarity(listing.rarity) ? listing.rarity : null;
}

export function marketDeltaLabel(priceCents: bigint, estimateCents: bigint | null): string | null {
  const gap = marketGap(priceCents, estimateCents);
  if (!gap) {
    return null;
  }
  return gap.below ? `${gap.percentLabel} below market` : `${gap.percentLabel} above market`;
}

export function marketGap(priceCents: bigint, estimateCents: bigint | null): {
  below: boolean;
  amountCents: bigint;
  percentLabel: string;
  headline: string;
  detail: string;
} | null {
  if (estimateCents === null || estimateCents <= 0n || priceCents === estimateCents) {
    return null;
  }
  const below = priceCents < estimateCents;
  const amountCents = below ? estimateCents - priceCents : priceCents - estimateCents;
  const points = Number((amountCents * 10000n) / estimateCents);
  const percentLabel = points === 0 ? "<1%" : formatBasisPoints(points);
  return {
    below,
    amountCents,
    percentLabel,
    headline: below ? "Below market" : "Above market",
    detail: `${formatCents(amountCents)} · ${percentLabel}`,
  };
}

function compareListings(left: MarketListing, right: MarketListing, sort: MarketSort): number {
  if (sort === "priceAsc" || sort === "priceDesc") {
    if (left.priceCents !== right.priceCents) {
      return sort === "priceAsc"
        ? (left.priceCents < right.priceCents ? -1 : 1)
        : (left.priceCents > right.priceCents ? -1 : 1);
    }
  } else if (left.listedAt !== right.listedAt) {
    const leftTime = left.listedAt ? Date.parse(left.listedAt) : 0;
    const rightTime = right.listedAt ? Date.parse(right.listedAt) : 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
  }
  return left.name.localeCompare(right.name);
}
