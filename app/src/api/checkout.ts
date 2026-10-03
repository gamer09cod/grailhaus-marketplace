import { supabase } from "./supabase";
import { supabaseAnonKey, supabaseUrl } from "./config";
import { centsFromWire } from "../utils/money";

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
