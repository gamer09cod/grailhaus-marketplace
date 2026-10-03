import { supabase } from "../../api/supabase";
import type { PackCategory } from "../../navigation/types";
import { centsFromWire } from "../../utils/money";
import { isPackCategory } from "../shelf/packs";

export type MarketListing = {
  listingId: string;
  name: string;
  category: PackCategory;
  rarity: string;
  priceCents: bigint;
  sellerUsername: string;
  isOwn: boolean;
};

export async function loadMarket(): Promise<MarketListing[]> {
  const { data, error } = await supabase.rpc("marketplace_board");
  if (error) {
    throw new Error(error.message);
  }
  if (typeof data !== "object" || data === null || !Array.isArray((data as { listings?: unknown }).listings)) {
    throw new Error("The market did not load.");
  }
  const listings: MarketListing[] = [];
  for (const entry of (data as { listings: unknown[] }).listings) {
    const listing = parseListing(entry);
    if (listing) {
      listings.push(listing);
    }
  }
  return listings;
}

function parseListing(entry: unknown): MarketListing | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const row = entry as {
    listingId?: unknown;
    name?: unknown;
    category?: unknown;
    rarity?: unknown;
    priceCents?: unknown;
    sellerUsername?: unknown;
    isOwn?: unknown;
  };
  if (
    typeof row.listingId !== "string"
    || typeof row.name !== "string"
    || typeof row.category !== "string"
    || !isPackCategory(row.category)
    || typeof row.rarity !== "string"
    || typeof row.sellerUsername !== "string"
    || typeof row.isOwn !== "boolean"
  ) {
    return null;
  }
  return {
    listingId: row.listingId,
    name: row.name,
    category: row.category,
    rarity: row.rarity,
    priceCents: centsFromWire(row.priceCents),
    sellerUsername: row.sellerUsername,
    isOwn: row.isOwn,
  };
}
