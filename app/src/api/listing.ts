import { supabaseAnonKey, supabaseUrl } from "./config";
import { supabase } from "./supabase";
import { centsFromWire } from "../utils/money";

export type ListingQuote = {
  priceCents: bigint;
  feeCents: bigint;
  sellerCents: bigint;
};

export type ListingReceipt = {
  ownedItemId: string;
  listingId: string;
  status: "ACTIVE" | "DELISTED";
  priceCents: bigint;
  feeCents: bigint;
  sellerCents: bigint;
  itemState: "LISTED" | "OWNED";
};

export class ListingRejected extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class ListingUnknown extends Error {
  constructor() {
    super("This listing change may have completed. We're checking before retrying.");
    this.name = "ListingUnknown";
  }
}

type ListingAction =
  | { action: "list"; ownedItemId: string; priceCents: bigint; idempotencyKey: string }
  | { action: "reprice"; listingId: string; priceCents: bigint; idempotencyKey: string }
  | { action: "delist"; listingId: string; idempotencyKey: string };

export async function loadListingQuote(priceCents: bigint): Promise<ListingQuote> {
  const { data, error } = await supabase.rpc("listing_quote", { p_price_cents: Number(priceCents) });
  if (error) {
    throw new Error(error.message);
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("The fee preview did not load.");
  }
  const record = data as { priceCents?: unknown; feeCents?: unknown; sellerCents?: unknown };
  return {
    priceCents: centsFromWire(record.priceCents),
    feeCents: centsFromWire(record.feeCents),
    sellerCents: centsFromWire(record.sellerCents),
  };
}

export async function submitListing(action: ListingAction): Promise<ListingReceipt> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new ListingRejected("UNAUTHENTICATED", "Sign in to list an item.");
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/listing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(wireAction(action)),
    });
  } catch {
    throw new ListingUnknown();
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 500 || payload === null) {
      throw new ListingUnknown();
    }
    if (isDomainError(payload)) {
      throw new ListingRejected(payload.code, payload.message);
    }
    throw new ListingRejected("LISTING_REJECTED", "The listing action was rejected.");
  }

  if (!isReceipt(payload)) {
    throw new ListingUnknown();
  }

  return {
    ownedItemId: payload.ownedItemId,
    listingId: payload.listingId,
    status: payload.status,
    priceCents: centsFromWire(payload.priceCents),
    feeCents: centsFromWire(payload.feeCents),
    sellerCents: centsFromWire(payload.sellerCents),
    itemState: payload.itemState,
  };
}

function wireAction(action: ListingAction): Record<string, unknown> {
  if (action.action === "delist") {
    return {
      action: "delist",
      listingId: action.listingId,
      idempotencyKey: action.idempotencyKey,
    };
  }
  if (action.action === "reprice") {
    return {
      action: "reprice",
      listingId: action.listingId,
      priceCents: action.priceCents.toString(),
      idempotencyKey: action.idempotencyKey,
    };
  }
  return {
    action: "list",
    ownedItemId: action.ownedItemId,
    priceCents: action.priceCents.toString(),
    idempotencyKey: action.idempotencyKey,
  };
}

function isDomainError(value: unknown): value is { code: string; message: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === "string" && typeof record.message === "string";
}

function isReceipt(value: unknown): value is {
  ownedItemId: string;
  listingId: string;
  status: "ACTIVE" | "DELISTED";
  priceCents: unknown;
  feeCents: unknown;
  sellerCents: unknown;
  itemState: "LISTED" | "OWNED";
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as {
    ownedItemId?: unknown;
    listingId?: unknown;
    status?: unknown;
    itemState?: unknown;
  };
  return typeof record.ownedItemId === "string"
    && typeof record.listingId === "string"
    && (record.status === "ACTIVE" || record.status === "DELISTED")
    && (record.itemState === "LISTED" || record.itemState === "OWNED");
}
