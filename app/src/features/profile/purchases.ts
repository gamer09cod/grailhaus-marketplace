import { supabase } from "../../api/supabase";
import { centsFromWire, formatCents } from "../../utils/money";

export type PurchaseRecord = {
  id: string;
  totalCents: bigint;
  status: "COMPLETED" | "REFUNDED";
  createdAt: string;
  packNames: string[];
};

export async function loadPurchases(): Promise<PurchaseRecord[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select(`
      id,
      total_cents,
      status,
      created_at,
      purchased_packs (
        pack_skus (
          name
        )
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const purchases: PurchaseRecord[] = [];
  for (const row of data ?? []) {
    const status = row.status === "REFUNDED" ? "REFUNDED" : row.status === "COMPLETED" ? "COMPLETED" : null;
    if (!status) {
      continue;
    }
    purchases.push({
      id: row.id,
      totalCents: centsFromWire(row.total_cents),
      status,
      createdAt: row.created_at,
      packNames: packNamesFrom(row.purchased_packs),
    });
  }
  return purchases;
}

export function purchaseTitle(purchase: PurchaseRecord): string {
  if (purchase.status === "REFUNDED") {
    return "Refunded purchase";
  }
  if (purchase.packNames.length === 1) {
    return purchase.packNames[0] ?? "Purchase";
  }
  if (purchase.packNames.length > 1) {
    return `${purchase.packNames.length} packs`;
  }
  return "Marketplace purchase";
}

export function purchaseDetail(purchase: PurchaseRecord): string {
  const total = formatCents(purchase.totalCents);
  if (purchase.status === "REFUNDED") {
    return `Refunded · ${total}`;
  }
  return total;
}

export function emptyPurchasesCopy(): string {
  return "You haven't purchased yet.\n\nPacks and market listings you buy show up here.";
}

function packNamesFrom(packs: unknown): string[] {
  if (!Array.isArray(packs)) {
    return [];
  }
  const names: string[] = [];
  for (const pack of packs) {
    if (!pack || typeof pack !== "object") {
      continue;
    }
    const skus = (pack as { pack_skus?: unknown }).pack_skus;
    const sku = Array.isArray(skus) ? skus[0] : skus;
    if (sku && typeof sku === "object" && "name" in sku && typeof sku.name === "string" && sku.name.length > 0) {
      names.push(sku.name);
    }
  }
  return names;
}
