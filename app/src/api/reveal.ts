import * as Crypto from "expo-crypto";

import { applyPriceDrift } from "./drift";
import { centsFromWire } from "../utils/money";
import { isPackCategory } from "../features/shelf/packs";
import type { PackCategory } from "../navigation/types";
import { cardsInStoredOrder } from "../features/reveal/tear";
import { supabaseAnonKey, supabaseUrl } from "./config";
import { supabase } from "./supabase";

export type RevealMilestone = "OPEN" | "REVEALING_CARD" | "CARD_REVEALED" | "PACK_COMPLETE";

export type RevealCard = {
  catalogItemId: string;
  name: string;
  rarity: string;
  revealOrder: number;
  estimatedValueCents: bigint;
};

export type RevealPack = {
  purchasedPackId: string;
  name: string;
  tier: string;
  category: PackCategory;
  revealState: string;
  spentCents: bigint;
  cards: RevealCard[];
};

const revealPackSelect = `
  id,
  reveal_state,
  pack_skus (
    name,
    tier,
    category,
    price_cents
  ),
  owned_items (
    acquisition_price_cents
  ),
  pack_contents (
    reveal_order,
    rarity,
    catalog_item_id,
    catalog_items (
      name,
      current_value_cents
    )
  )
`;

export type SealedPack = {
  purchasedPackId: string;
  name: string;
  tier: string;
  revealState: string;
};

export class RevealRejected extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function loadSealedPacks(): Promise<SealedPack[]> {
  const { data, error } = await supabase
    .from("purchased_packs")
    .select(`
      id,
      reveal_state,
      pack_skus (
        name,
        tier,
        category
      )
    `)
    .neq("reveal_state", "PACK_COMPLETE")
    .order("created_at", { ascending: true })
    .order("sequence", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const packs: SealedPack[] = [];
  for (const entry of data ?? []) {
    const pack = parseSealed(entry);
    if (pack) {
      packs.push(pack);
    }
  }
  return packs;
}

export async function loadRevealSession(seedIds: string[]): Promise<RevealPack[]> {
  if (seedIds.length === 0) {
    return [];
  }
  await applyPriceDrift();

  const { data: seeds, error: seedError } = await supabase
    .from("purchased_packs")
    .select("purchase_id")
    .in("id", seedIds);

  if (seedError) {
    throw new Error(seedError.message);
  }

  const purchaseIds = [...new Set((seeds ?? []).map((row) => row.purchase_id))];
  if (purchaseIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("purchased_packs")
    .select(revealPackSelect)
    .in("purchase_id", purchaseIds)
    .order("created_at", { ascending: true })
    .order("sequence", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const packs: RevealPack[] = [];
  for (const entry of data ?? []) {
    const pack = parseRevealPack(entry);
    if (pack) {
      packs.push(pack);
    }
  }

  const cards = packs.filter((pack) => pack.category === "TRADING_CARD");
  return cards.length > 0 ? cards : packs;
}

export async function loadRevealPack(purchasedPackId: string): Promise<RevealPack | null> {
  await applyPriceDrift();
  const { data, error } = await supabase
    .from("purchased_packs")
    .select(revealPackSelect)
    .eq("id", purchasedPackId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }
  return parseRevealPack(data);
}

export async function submitReveal(
  purchasedPackId: string,
  revealState: RevealMilestone,
): Promise<RevealMilestone> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new RevealRejected("UNAUTHENTICATED", "Sign in to open a pack.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/reveal`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      purchasedPackId,
      revealState,
      idempotencyKey: Crypto.randomUUID(),
    }),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isDomainError(payload)) {
      throw new RevealRejected(payload.code, payload.message);
    }
    throw new RevealRejected("REVEAL_REJECTED", "The pack did not open.");
  }

  if (!isProgress(payload)) {
    throw new RevealRejected("REVEAL_REJECTED", "The pack did not open.");
  }
  return payload.revealState;
}

function parseSealed(entry: {
  id: string;
  reveal_state: string;
  pack_skus: { name: string; tier: string; category: string } | { name: string; tier: string; category: string }[] | null;
}): SealedPack | null {
  const sku = Array.isArray(entry.pack_skus) ? entry.pack_skus[0] : entry.pack_skus;
  if (!sku || !isPackCategory(sku.category) || sku.category !== "TRADING_CARD") {
    return null;
  }
  return {
    purchasedPackId: entry.id,
    name: sku.name,
    tier: sku.tier,
    revealState: entry.reveal_state,
  };
}

function parseRevealPack(entry: {
  id: string;
  reveal_state: string;
  pack_skus: { name: string; tier: string; category: string; price_cents: number | string } | { name: string; tier: string; category: string; price_cents: number | string }[] | null;
  owned_items: { acquisition_price_cents: number | string } | { acquisition_price_cents: number | string }[] | null;
  pack_contents: {
    reveal_order: number;
    rarity: string;
    catalog_item_id: string;
    catalog_items: { name: string; current_value_cents: number | string } | { name: string; current_value_cents: number | string }[] | null;
  }[] | null;
}): RevealPack | null {
  const sku = Array.isArray(entry.pack_skus) ? entry.pack_skus[0] : entry.pack_skus;
  if (!sku || !isPackCategory(sku.category)) {
    return null;
  }
  const owned = Array.isArray(entry.owned_items) ? entry.owned_items[0] : entry.owned_items;
  const spentCents = centsFromWire(owned?.acquisition_price_cents ?? sku.price_cents);

  const cards: RevealCard[] = [];
  for (const content of entry.pack_contents ?? []) {
    const item = Array.isArray(content.catalog_items) ? content.catalog_items[0] : content.catalog_items;
    if (!item) {
      continue;
    }
    cards.push({
      catalogItemId: content.catalog_item_id,
      name: item.name,
      rarity: content.rarity,
      revealOrder: content.reveal_order,
      estimatedValueCents: centsFromWire(item.current_value_cents),
    });
  }

  return {
    purchasedPackId: entry.id,
    name: sku.name,
    tier: sku.tier,
    category: sku.category,
    revealState: entry.reveal_state,
    spentCents,
    cards: cardsInStoredOrder(cards),
  };
}

function isDomainError(value: unknown): value is { code: string; message: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === "string" && typeof record.message === "string";
}

function isProgress(value: unknown): value is { revealState: RevealMilestone } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const state = (value as { revealState?: unknown }).revealState;
  return state === "OPEN" || state === "REVEALING_CARD" || state === "CARD_REVEALED" || state === "PACK_COMPLETE";
}
