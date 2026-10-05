import { supabase } from "../../api/supabase";
import type { PackCategory } from "../../navigation/types";
import { centsFromWire } from "../../utils/money";
import { isPackCategory } from "../shelf/packs";

export type OwnedHolding = {
  ownedItemId: string;
  name: string;
  category: PackCategory;
  rarity: string;
  imageUrl: string | null;
  estimatedValueCents: bigint;
  acquisitionPriceCents: bigint;
  acquiredAt: string;
  state: "OWNED" | "LISTED";
  listingId: string | null;
  listingPriceCents: bigint | null;
};

export async function loadHoldings(): Promise<OwnedHolding[]> {
  const { data, error } = await supabase
    .from("owned_items")
    .select(`
      id,
      state,
      acquisition_price_cents,
      acquired_at,
      catalog_items (
        name,
        category,
        rarity,
        image_url,
        current_value_cents
      ),
      marketplace_listings (
        id,
        price_cents,
        status
      ),
      purchased_packs (
        reveal_state,
        pack_skus (
          category
        )
      )
    `)
    .order("acquired_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const holdings: OwnedHolding[] = [];
  for (const entry of data ?? []) {
    const holding = parseHolding(entry);
    if (holding) {
      holdings.push(holding);
    }
  }
  return holdings;
}

function parseHolding(entry: {
  id: string;
  state: string;
  acquisition_price_cents: number | string;
  acquired_at: string;
  catalog_items: {
    name: string;
    category: string;
    rarity: string;
    image_url: string | null;
    current_value_cents: number | string;
  } | {
    name: string;
    category: string;
    rarity: string;
    image_url: string | null;
    current_value_cents: number | string;
  }[] | null;
  marketplace_listings: { id: string; price_cents: number | string; status: string }[] | null;
  purchased_packs: {
    reveal_state: string;
    pack_skus: { category: string } | { category: string }[] | null;
  } | {
    reveal_state: string;
    pack_skus: { category: string } | { category: string }[] | null;
  }[] | null;
}): OwnedHolding | null {
  const item = Array.isArray(entry.catalog_items) ? entry.catalog_items[0] : entry.catalog_items;
  if (!item || !isPackCategory(item.category) || (entry.state !== "OWNED" && entry.state !== "LISTED")) {
    return null;
  }
  if (isSealedCard(entry.purchased_packs)) {
    return null;
  }
  const active = (entry.marketplace_listings ?? []).find((listing) => listing.status === "ACTIVE");
  return {
    ownedItemId: entry.id,
    name: item.name,
    category: item.category,
    rarity: item.rarity,
    imageUrl: item.image_url && item.image_url.length > 0 ? item.image_url : null,
    estimatedValueCents: centsFromWire(item.current_value_cents),
    acquisitionPriceCents: centsFromWire(entry.acquisition_price_cents),
    acquiredAt: entry.acquired_at,
    state: entry.state,
    listingId: active?.id ?? null,
    listingPriceCents: active ? centsFromWire(active.price_cents) : null,
  };
}

function isSealedCard(pack: {
  reveal_state: string;
  pack_skus: { category: string } | { category: string }[] | null;
} | {
  reveal_state: string;
  pack_skus: { category: string } | { category: string }[] | null;
}[] | null): boolean {
  const origin = Array.isArray(pack) ? pack[0] : pack;
  if (!origin || origin.reveal_state === "PACK_COMPLETE") {
    return false;
  }
  const sku = Array.isArray(origin.pack_skus) ? origin.pack_skus[0] : origin.pack_skus;
  return sku?.category === "TRADING_CARD";
}
