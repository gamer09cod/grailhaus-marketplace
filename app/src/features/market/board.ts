import { applyPriceDrift } from "../../api/drift";
import { supabase } from "../../api/supabase";
import type { PackCategory } from "../../navigation/types";
import { centsFromWire } from "../../utils/money";
import { isPackCategory } from "../shelf/packs";

export type MarketListing = {
  listingId: string;
  ownedItemId: string | null;
  name: string;
  category: PackCategory;
  rarity: string;
  priceCents: bigint;
  sellerUsername: string;
  isOwn: boolean;
  listedAt: string | null;
  imageUrl: string | null;
  currentValueCents: bigint | null;
};

export async function loadMarket(): Promise<MarketListing[]> {
  await applyPriceDrift();
  const { data, error } = await supabase.rpc("marketplace_board");
  if (error) {
    throw new Error(error.message);
  }
  if (typeof data !== "object" || data === null || !Array.isArray((data as { listings?: unknown }).listings)) {
    throw new Error("The market did not load.");
  }
  const meta = await loadListingMeta();
  const listings: MarketListing[] = [];
  for (const entry of (data as { listings: unknown[] }).listings) {
    const listing = parseListing(entry, meta);
    if (listing) {
      listings.push(listing);
    }
  }
  return listings;
}

async function loadListingMeta(): Promise<{ listedAtById: Map<string, string>; ownedItemById: Map<string, string> }> {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("id, created_at, owned_item_id")
    .eq("status", "ACTIVE");
  const listedAtById = new Map<string, string>();
  const ownedItemById = new Map<string, string>();
  if (error || !data) {
    return { listedAtById, ownedItemById };
  }
  for (const row of data) {
    if (typeof row.id !== "string") {
      continue;
    }
    if (typeof row.created_at === "string") {
      listedAtById.set(row.id, row.created_at);
    }
    if (typeof row.owned_item_id === "string") {
      ownedItemById.set(row.id, row.owned_item_id);
    }
  }
  return { listedAtById, ownedItemById };
}

function parseListing(
  entry: unknown,
  meta: { listedAtById: Map<string, string>; ownedItemById: Map<string, string> },
): MarketListing | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const row = entry as {
    listingId?: unknown;
    ownedItemId?: unknown;
    name?: unknown;
    category?: unknown;
    rarity?: unknown;
    priceCents?: unknown;
    sellerUsername?: unknown;
    isOwn?: unknown;
    listedAt?: unknown;
    imageUrl?: unknown;
    currentValueCents?: unknown;
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
  const listedAt = isoTimestamp(row.listedAt) ?? meta.listedAtById.get(row.listingId) ?? null;
  const ownedItemId = typeof row.ownedItemId === "string"
    ? row.ownedItemId
    : meta.ownedItemById.get(row.listingId) ?? null;
  return {
    listingId: row.listingId,
    ownedItemId,
    name: row.name,
    category: row.category,
    rarity: row.rarity,
    priceCents: centsFromWire(row.priceCents),
    sellerUsername: row.sellerUsername,
    isOwn: row.isOwn,
    listedAt,
    imageUrl: typeof row.imageUrl === "string" && row.imageUrl.length > 0 ? row.imageUrl : null,
    currentValueCents: optionalCents(row.currentValueCents),
  };
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

function optionalCents(value: unknown): bigint | null {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return centsFromWire(value);
  } catch {
    return null;
  }
}
