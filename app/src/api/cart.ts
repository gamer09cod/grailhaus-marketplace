import { supabase } from "./supabase";
import { supabaseAnonKey, supabaseUrl } from "./config";
import { centsFromWire } from "../utils/money";
import { isPackCategory } from "../features/shelf/packs";
import type { PackCategory } from "../navigation/types";

export type CartLineState =
  | "VALID"
  | "EXPIRED"
  | "PARTIALLY_AVAILABLE"
  | "SOLD_OUT"
  | "PRICE_CHANGED";

export type CartLine = {
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
  state: CartLineState;
};

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
  | { action: "release" | "retry" | "acceptPrice"; cartLineId: string; idempotencyKey: string };

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
    if (!isLine(entry)) {
      throw new CartUnknown();
    }
    lines.push({
      lineId: entry.lineId,
      lineType: "PACK",
      packSkuId: entry.packSkuId,
      name: entry.name,
      tier: entry.tier,
      category: entry.category,
      quantity: entry.quantity,
      snapshotPriceCents: centsFromWire(entry.snapshotPriceCents),
      currentPriceCents: centsFromWire(entry.currentPriceCents),
      availableQuantity: centsFromWire(entry.availableQuantity),
      expiresAt: entry.expiresAt,
      state: entry.state,
    });
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

function isLine(value: unknown): value is {
  lineId: string;
  packSkuId: string;
  name: string;
  tier: string;
  category: PackCategory;
  quantity: number;
  snapshotPriceCents: unknown;
  currentPriceCents: unknown;
  availableQuantity: unknown;
  expiresAt: string | null;
  state: CartLineState;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as {
    lineId?: unknown;
    packSkuId?: unknown;
    name?: unknown;
    tier?: unknown;
    category?: unknown;
    state?: unknown;
    quantity?: unknown;
    expiresAt?: unknown;
    snapshotPriceCents?: unknown;
    currentPriceCents?: unknown;
    availableQuantity?: unknown;
  };
  return typeof record.lineId === "string"
    && typeof record.packSkuId === "string"
    && typeof record.name === "string"
    && typeof record.tier === "string"
    && typeof record.category === "string"
    && isPackCategory(record.category)
    && isCartState(record.state)
    && typeof record.quantity === "number"
    && (record.expiresAt === null || typeof record.expiresAt === "string")
    && record.snapshotPriceCents !== undefined
    && record.currentPriceCents !== undefined
    && record.availableQuantity !== undefined;
}

function isCartState(value: unknown): value is CartLineState {
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
