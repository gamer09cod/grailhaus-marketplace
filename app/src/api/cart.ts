import { supabase } from "./supabase";
import { supabaseAnonKey, supabaseUrl } from "./config";
import { centsFromWire } from "../utils/money";
import { isPackCategory } from "../features/shelf/packs";
import type { PackCategory } from "../navigation/types";

export type PackLineState =
  | "VALID"
  | "EXPIRED"
  | "PARTIALLY_AVAILABLE"
  | "SOLD_OUT"
  | "PRICE_CHANGED";

export type ListingLineState =
  | "VALID"
  | "LISTING_PRICE_CHANGED"
  | "LISTING_SOLD"
  | "LISTING_DELISTED";

export type PackCartLine = {
  lineId: string;
  lineType: "PACK";
  packSkuId: string;
  name: string;
  tier: string;
  category: PackCategory;
  quantity: number;
  snapshotPriceCents: bigint;
  currentPriceCents: bigint;
  availableQuantity: bigint;
  expiresAt: string | null;
  state: PackLineState;
};

export type ListingCartLine = {
  lineId: string;
  lineType: "MARKETPLACE_LISTING";
  listingId: string;
  name: string;
  category: PackCategory;
  quantity: number;
  snapshotPriceCents: bigint;
  currentPriceCents: bigint;
  sellerUsername: string;
  availability: "AVAILABLE" | "SOLD" | "DELISTED";
  expiresAt: null;
  state: ListingLineState;
};

export type CartLine = PackCartLine | ListingCartLine;

export type CartSnapshot = {
  cartId: string | null;
  serverNow: string;
  fetchedAtMs: number;
  lines: CartLine[];
};

export class CartRejected extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class CartUnknown extends Error {
  constructor() {
    super("This cart change may have completed. We're checking before retrying.");
    this.name = "CartUnknown";
  }
}

type CartAction =
  | { action: "view" }
  | { action: "reserve"; packSkuId: string; quantity: number; idempotencyKey: string }
  | { action: "addListing"; listingId: string; idempotencyKey: string }
  | { action: "release" | "retry" | "acceptPrice" | "acceptListingPrice"; cartLineId: string; idempotencyKey: string };

export async function loadCart(): Promise<CartSnapshot> {
  return submitCart({ action: "view" });
}

export async function submitCart(action: CartAction): Promise<CartSnapshot> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new CartRejected("UNAUTHENTICATED", "Sign in to see your cart.");
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/cart`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(action),
    });
  } catch {
    throw new CartUnknown();
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 500 || payload === null) {
      throw new CartUnknown();
    }
    if (isDomainError(payload)) {
      throw new CartRejected(payload.code, payload.message);
    }
    throw new CartRejected("CART_REJECTED", "The cart action was rejected.");
  }

  if (!isSnapshot(payload)) {
    throw new CartUnknown();
  }

  return parseSnapshot(payload);
}

function parseSnapshot(payload: {
  cartId: unknown;
  serverNow: unknown;
  lines: unknown;
}): CartSnapshot {
  if (!Array.isArray(payload.lines) || typeof payload.serverNow !== "string") {
    throw new CartUnknown();
  }

  const lines: CartLine[] = [];
  for (const entry of payload.lines) {
    const line = parseLine(entry);
    if (!line) {
      throw new CartUnknown();
    }
    lines.push(line);
  }

  return {
    cartId: typeof payload.cartId === "string" ? payload.cartId : null,
    serverNow: payload.serverNow,
    fetchedAtMs: Date.now(),
    lines,
  };
}

function isSnapshot(value: unknown): value is { cartId: unknown; serverNow: unknown; lines: unknown } {
  return typeof value === "object" && value !== null && "lines" in value && "serverNow" in value;
}

function parseLine(value: unknown): CartLine | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as {
    lineId?: unknown;
    lineType?: unknown;
    packSkuId?: unknown;
    listingId?: unknown;
    name?: unknown;
    tier?: unknown;
    category?: unknown;
    state?: unknown;
    quantity?: unknown;
    expiresAt?: unknown;
    snapshotPriceCents?: unknown;
    currentPriceCents?: unknown;
    availableQuantity?: unknown;
    sellerUsername?: unknown;
    availability?: unknown;
  };
  if (typeof record.lineId !== "string" || typeof record.name !== "string" || typeof record.category !== "string" || !isPackCategory(record.category) || typeof record.quantity !== "number") {
    return null;
  }
  if (record.lineType === "MARKETPLACE_LISTING") {
    if (typeof record.listingId !== "string" || typeof record.sellerUsername !== "string" || !isListingState(record.state) || !isAvailability(record.availability)) {
      return null;
    }
    return {
      lineId: record.lineId,
      lineType: "MARKETPLACE_LISTING",
      listingId: record.listingId,
      name: record.name,
      category: record.category,
      quantity: record.quantity,
      snapshotPriceCents: centsFromWire(record.snapshotPriceCents),
      currentPriceCents: centsFromWire(record.currentPriceCents),
      sellerUsername: record.sellerUsername,
      availability: record.availability,
      expiresAt: null,
      state: record.state,
    };
  }
  if (typeof record.packSkuId !== "string" || typeof record.tier !== "string" || !isPackState(record.state) || (record.expiresAt !== null && typeof record.expiresAt !== "string")) {
    return null;
  }
  return {
    lineId: record.lineId,
    lineType: "PACK",
    packSkuId: record.packSkuId,
    name: record.name,
    tier: record.tier,
    category: record.category,
    quantity: record.quantity,
    snapshotPriceCents: centsFromWire(record.snapshotPriceCents),
    currentPriceCents: centsFromWire(record.currentPriceCents),
    availableQuantity: centsFromWire(record.availableQuantity),
    expiresAt: record.expiresAt,
    state: record.state,
  };
}

function isAvailability(value: unknown): value is ListingCartLine["availability"] {
  return value === "AVAILABLE" || value === "SOLD" || value === "DELISTED";
}

function isListingState(value: unknown): value is ListingLineState {
  return value === "VALID"
    || value === "LISTING_PRICE_CHANGED"
    || value === "LISTING_SOLD"
    || value === "LISTING_DELISTED";
}

function isPackState(value: unknown): value is PackLineState {
  return value === "VALID"
    || value === "EXPIRED"
    || value === "PARTIALLY_AVAILABLE"
    || value === "SOLD_OUT"
    || value === "PRICE_CHANGED";
}

function isDomainError(value: unknown): value is { code: string; message: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === "string" && typeof record.message === "string";
}
