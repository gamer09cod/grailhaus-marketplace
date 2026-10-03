import { supabase } from "../../api/supabase";
import type { PackCategory } from "../../navigation/types";
import { centsFromWire } from "../../utils/money";
import { isPackCategory } from "../shelf/packs";

export type DropStatus = "UPCOMING" | "LIVE" | "SOLD_OUT" | "ENDED";

export type TimedDrop = {
  dropId: string;
  packSkuId: string;
  name: string;
  tier: string;
  category: PackCategory;
  priceCents: bigint;
  reservable: bigint;
  maxPerUser: number | null;
  startsAt: string;
  endsAt: string;
  status: DropStatus;
};

export type DropBoard = {
  serverNow: string;
  fetchedAtMs: number;
  drops: TimedDrop[];
};

const statuses: DropStatus[] = ["UPCOMING", "LIVE", "SOLD_OUT", "ENDED"];

function isDropStatus(value: unknown): value is DropStatus {
  return typeof value === "string" && statuses.some((status) => status === value);
}

export async function loadDropBoard(): Promise<DropBoard> {
  const fetchedAtMs = Date.now();
  const { data, error } = await supabase.rpc("drop_board");
  if (error) {
    throw new Error(error.message);
  }
  return parseBoard(data, fetchedAtMs);
}

function parseBoard(data: unknown, fetchedAtMs: number): DropBoard {
  if (typeof data !== "object" || data === null) {
    throw new Error("The drop board did not load.");
  }
  const record = data as { serverNow?: unknown; drops?: unknown };
  if (typeof record.serverNow !== "string" || !Array.isArray(record.drops)) {
    throw new Error("The drop board did not load.");
  }

  const drops: TimedDrop[] = [];
  for (const entry of record.drops) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const row = entry as {
      dropId?: unknown;
      packSkuId?: unknown;
      name?: unknown;
      tier?: unknown;
      category?: unknown;
      priceCents?: unknown;
      reservableQuantity?: unknown;
      maxPerUser?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
      status?: unknown;
    };
    if (
      typeof row.dropId !== "string"
      || typeof row.packSkuId !== "string"
      || typeof row.name !== "string"
      || typeof row.tier !== "string"
      || typeof row.category !== "string"
      || !isPackCategory(row.category)
      || typeof row.startsAt !== "string"
      || typeof row.endsAt !== "string"
      || !isDropStatus(row.status)
    ) {
      continue;
    }
    drops.push({
      dropId: row.dropId,
      packSkuId: row.packSkuId,
      name: row.name,
      tier: row.tier,
      category: row.category,
      priceCents: centsFromWire(row.priceCents),
      reservable: centsFromWire(row.reservableQuantity),
      maxPerUser: typeof row.maxPerUser === "number" ? row.maxPerUser : null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
    });
  }

  return { serverNow: record.serverNow, fetchedAtMs, drops };
}
