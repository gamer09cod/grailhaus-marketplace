import { supabase } from "../../api/supabase";
import { centsFromWire } from "../../utils/money";

export const activityTypes = [
  "DEPOSIT",
  "PACK_PURCHASE",
  "MARKETPLACE_PURCHASE",
  "MARKETPLACE_SALE",
  "REFUND",
  "QA_ADJUSTMENT",
] as const;

export type ActivityType = (typeof activityTypes)[number];

export type ActivityEntry = {
  id: string;
  type: ActivityType;
  amountCents: bigint;
  createdAt: string;
};

export async function loadActivity(): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("id, entry_type, amount_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const entries: ActivityEntry[] = [];
  for (const row of data ?? []) {
    const type = parseActivityType(row.entry_type);
    if (!type) {
      continue;
    }
    entries.push({
      id: row.id,
      type,
      amountCents: centsFromWire(row.amount_cents),
      createdAt: row.created_at,
    });
  }
  return entries;
}

export function activityLabel(type: ActivityType): string {
  if (type === "DEPOSIT") {
    return "Deposit";
  }
  if (type === "PACK_PURCHASE") {
    return "Pack purchase";
  }
  if (type === "MARKETPLACE_PURCHASE") {
    return "Marketplace purchase";
  }
  if (type === "MARKETPLACE_SALE") {
    return "Sale";
  }
  if (type === "REFUND") {
    return "Refund";
  }
  return "Balance adjustment";
}

export function emptyActivityCopy(): string {
  return "No activity yet.\n\nDeposits, purchases, and sales show up here.";
}

function parseActivityType(value: string): ActivityType | null {
  return (activityTypes as readonly string[]).includes(value) ? (value as ActivityType) : null;
}
