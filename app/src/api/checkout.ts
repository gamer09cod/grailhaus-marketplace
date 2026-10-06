import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./supabase";
import { supabaseAnonKey, supabaseUrl } from "./config";
import { centsFromWire } from "../utils/money";

const inflightKey = "grailhaus.checkout.inflight";

export type InflightCheckout = {
  cartId: string;
  idempotencyKey: string;
  expectedTotalCents: string;
  lines: { lineId: string; quantity: number; snapshotPriceCents: string }[];
};

export type CheckoutLine = {
  lineId: string;
  quantity: number;
  snapshotPriceCents: bigint;
};

export type CheckoutReceipt = {
  purchaseId: string;
  cartId: string;
  totalCents: bigint;
  balanceCents: bigint;
  idempotencyKey: string;
  packCount: number;
  listingCount: number;
  sealedPackIds: string[];
};

export class CheckoutRejected extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class CheckoutUnknown extends Error {
  constructor() {
    super("Your order may have completed. We're checking before retrying.");
    this.name = "CheckoutUnknown";
  }
}

export async function readInflightCheckout(): Promise<InflightCheckout | null> {
  const raw = await AsyncStorage.getItem(inflightKey);
  if (!raw) {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isInflightCheckout(parsed)) {
    await AsyncStorage.removeItem(inflightKey);
    return null;
  }
  return parsed;
}

export async function rememberInflightCheckout(checkout: InflightCheckout): Promise<void> {
  await AsyncStorage.setItem(inflightKey, JSON.stringify(checkout));
}

export async function clearInflightCheckout(): Promise<void> {
  await AsyncStorage.removeItem(inflightKey);
}

export function isInflightCheckout(value: unknown): value is InflightCheckout {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as {
    cartId?: unknown;
    idempotencyKey?: unknown;
    expectedTotalCents?: unknown;
    lines?: unknown;
  };
  return typeof record.cartId === "string"
    && typeof record.idempotencyKey === "string"
    && typeof record.expectedTotalCents === "string"
    && Array.isArray(record.lines)
    && record.lines.every((line) => {
      if (typeof line !== "object" || line === null) {
        return false;
      }
      const row = line as { lineId?: unknown; quantity?: unknown; snapshotPriceCents?: unknown };
      return typeof row.lineId === "string"
        && typeof row.quantity === "number"
        && typeof row.snapshotPriceCents === "string";
    });
}

export async function submitCheckout(input: {
  cartId: string;
  idempotencyKey: string;
  expectedTotalCents: bigint;
  lines: CheckoutLine[];
}): Promise<CheckoutReceipt> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new CheckoutRejected("UNAUTHENTICATED", "Sign in before paying.");
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cartId: input.cartId,
        idempotencyKey: input.idempotencyKey,
        expectedTotalCents: input.expectedTotalCents.toString(),
        lines: input.lines.map((line) => ({
          lineId: line.lineId,
          quantity: line.quantity,
          snapshotPriceCents: line.snapshotPriceCents.toString(),
        })),
      }),
    });
  } catch {
    throw new CheckoutUnknown();
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 500 || payload === null) {
      throw new CheckoutUnknown();
    }
    if (isDomainError(payload)) {
      throw new CheckoutRejected(payload.code, payload.message);
    }
    throw new CheckoutRejected("CHECKOUT_REJECTED", "The payment was rejected.");
  }

  if (!isReceipt(payload)) {
    throw new CheckoutUnknown();
  }

  return {
    purchaseId: payload.purchaseId,
    cartId: payload.cartId,
    totalCents: centsFromWire(payload.totalCents),
    balanceCents: centsFromWire(payload.balanceCents),
    idempotencyKey: payload.idempotencyKey,
    packCount: payload.packs.length,
    listingCount: Array.isArray(payload.listings) ? payload.listings.length : 0,
    sealedPackIds: sealedPackIds(payload.packs),
  };
}

function sealedPackIds(packs: unknown[]): string[] {
  const ids: string[] = [];
  for (const pack of packs) {
    if (typeof pack !== "object" || pack === null) {
      continue;
    }
    const id = (pack as { purchasedPackId?: unknown }).purchasedPackId;
    if (typeof id === "string") {
      ids.push(id);
    }
  }
  return ids;
}

function isDomainError(value: unknown): value is { code: string; message: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === "string" && typeof record.message === "string";
}

function isReceipt(value: unknown): value is {
  purchaseId: string;
  cartId: string;
  totalCents: unknown;
  balanceCents: unknown;
  idempotencyKey: string;
  packs: unknown[];
  listings?: unknown;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as {
    purchaseId?: unknown;
    cartId?: unknown;
    idempotencyKey?: unknown;
    packs?: unknown;
  };
  return typeof record.purchaseId === "string"
    && typeof record.cartId === "string"
    && typeof record.idempotencyKey === "string"
    && Array.isArray(record.packs);
}
