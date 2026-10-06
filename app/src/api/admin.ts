import { supabase } from "./supabase";
import type { PackCategory } from "../navigation/types";
import { centsFromWire } from "../utils/money";
import { isPackCategory } from "../features/shelf/packs";

export type CategoryMargin = {
  category: PackCategory;
  marginCents: bigint;
};

export type AdminSnapshot = {
  packsSold: number;
  packRevenueCents: bigint;
  contentsPayoutCents: bigint;
  grossPackMarginCents: bigint;
  marketplaceFeesCents: bigint;
  categories: CategoryMargin[];
};

export class AdminForbidden extends Error {
  constructor() {
    super("This screen is for reviewers.");
    this.name = "AdminForbidden";
  }
}

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  const { data, error } = await supabase.rpc("admin_snapshot");
  if (error) {
    if (error.message.includes("ADMIN_FORBIDDEN")) {
      throw new AdminForbidden();
    }
    throw new Error("The admin numbers did not load.");
  }
  return parseSnapshot(data);
}

function parseSnapshot(data: unknown): AdminSnapshot {
  if (typeof data !== "object" || data === null) {
    throw new Error("The admin numbers did not load.");
  }
  const row = data as {
    packsSold?: unknown;
    packRevenueCents?: unknown;
    contentsPayoutCents?: unknown;
    grossPackMarginCents?: unknown;
    marketplaceFeesCents?: unknown;
    categories?: unknown;
  };
  if (!Array.isArray(row.categories) || typeof row.packsSold !== "number" || !Number.isInteger(row.packsSold)) {
    throw new Error("The admin numbers did not load.");
  }
  const categories: CategoryMargin[] = [];
  for (const entry of row.categories) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("The admin numbers did not load.");
    }
    const category = entry as { category?: unknown; marginCents?: unknown };
    if (typeof category.category !== "string" || !isPackCategory(category.category)) {
      throw new Error("The admin numbers did not load.");
    }
    categories.push({
      category: category.category,
      marginCents: centsFromWire(category.marginCents),
    });
  }
  return {
    packsSold: row.packsSold,
    packRevenueCents: centsFromWire(row.packRevenueCents),
    contentsPayoutCents: centsFromWire(row.contentsPayoutCents),
    grossPackMarginCents: centsFromWire(row.grossPackMarginCents),
    marketplaceFeesCents: centsFromWire(row.marketplaceFeesCents),
    categories,
  };
}
