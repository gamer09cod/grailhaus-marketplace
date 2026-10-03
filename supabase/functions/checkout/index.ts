const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type DomainBody = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const centsPattern = /^(0|[1-9][0-9]*)$/;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (request.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED", message: "Checkout accepts POST.", details: {} }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({
      code: "SERVER_MISCONFIGURED",
      message: "Checkout is not available right now.",
      details: {},
    }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in before paying.", details: {} }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ code: "INVALID_CHECKOUT", message: "Checkout body must be JSON.", details: {} }, 400);
  }

  const parsed = parseCheckout(body);
  if (!parsed.ok) {
    return json(parsed.error, 400);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!userResponse.ok) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in before paying.", details: {} }, 401);
  }

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/checkout`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_cart_id: parsed.cartId,
      p_expected_total_cents: parsed.expectedTotalCents,
      p_idempotency_key: parsed.idempotencyKey,
      p_lines: parsed.lines,
    }),
  });

  const payload: unknown = await rpcResponse.json().catch(() => null);
  if (!rpcResponse.ok) {
    const rpcError = isRpcError(payload) ? payload : null;
    const domain = domainFromRpc(
      rpcError?.message ?? "",
      typeof rpcError?.details === "string" ? rpcError.details : null,
    );
    const status = domain.code === "IDEMPOTENCY_IN_PROGRESS" ? 409 : 400;
    return json(domain, status);
  }

  return json(payload, 200);
});

function parseCheckout(body: unknown):
  | {
    ok: true;
    cartId: string;
    idempotencyKey: string;
    expectedTotalCents: number;
    lines: { lineId: string; quantity: number; snapshotPriceCents: number }[];
  }
  | { ok: false; error: DomainBody } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: invalid("Checkout body must be an object.") };
  }

  const record = body as {
    cartId?: unknown;
    idempotencyKey?: unknown;
    expectedTotalCents?: unknown;
    lines?: unknown;
  };

  if (typeof record.cartId !== "string" || !uuidPattern.test(record.cartId)) {
    return { ok: false, error: invalid("Choose a cart to pay.") };
  }
  if (typeof record.idempotencyKey !== "string" || !uuidPattern.test(record.idempotencyKey)) {
    return {
      ok: false,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "This payment needs a UUID idempotency key.",
        details: {},
      },
    };
  }

  const total = readCents(record.expectedTotalCents);
  if (total === null) {
    return { ok: false, error: invalid("The payment total must be whole cents.") };
  }
  if (!Array.isArray(record.lines) || record.lines.length === 0 || record.lines.length > 100) {
    return { ok: false, error: invalid("Review the packs in your cart before paying.") };
  }

  const lines = [];
  for (const entry of record.lines) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: invalid("Review the packs in your cart before paying.") };
    }
    const line = entry as { lineId?: unknown; quantity?: unknown; snapshotPriceCents?: unknown };
    if (typeof line.lineId !== "string" || !uuidPattern.test(line.lineId)) {
      return { ok: false, error: invalid("Review the packs in your cart before paying.") };
    }
    if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000) {
      return { ok: false, error: invalid("Choose a whole number of packs.") };
    }
    const snapshot = readCents(line.snapshotPriceCents);
    if (snapshot === null) {
      return { ok: false, error: invalid("The pack price must be whole cents.") };
    }
    lines.push({
      lineId: line.lineId,
      quantity: line.quantity,
      snapshotPriceCents: snapshot,
    });
  }

  return {
    ok: true,
    cartId: record.cartId,
    idempotencyKey: record.idempotencyKey,
    expectedTotalCents: total,
    lines,
  };
}

function readCents(value: unknown): number | null {
  if (typeof value !== "string" || !centsPattern.test(value)) {
    return null;
  }
  const cents = BigInt(value);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(cents);
}

function invalid(message: string): DomainBody {
  return { code: "INVALID_CHECKOUT", message, details: {} };
}

function isRpcError(value: unknown): value is { message: string; details?: unknown } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return typeof (value as { message?: unknown }).message === "string";
}

function domainFromRpc(message: string, details: string | null): DomainBody {
  if (details) {
    try {
      const parsed: unknown = JSON.parse(details);
      if (typeof parsed === "object" && parsed !== null) {
        const record = parsed as { code?: unknown; message?: unknown; details?: unknown };
        if (typeof record.code === "string" && typeof record.message === "string") {
          return {
            code: record.code,
            message: record.message,
            details: typeof record.details === "object" && record.details !== null
              ? record.details as Record<string, unknown>
              : {},
          };
        }
      }
    } catch {
      // Fall through to the exception message.
    }
  }

  return {
    code: message || "CHECKOUT_REJECTED",
    message: "The payment was rejected.",
    details: {},
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}
