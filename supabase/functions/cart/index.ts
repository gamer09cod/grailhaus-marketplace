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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (request.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED", message: "Cart accepts POST.", details: {} }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({
      code: "SERVER_MISCONFIGURED",
      message: "Cart is not available right now.",
      details: {},
    }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in to see your cart.", details: {} }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ code: "INVALID_CART_ACTION", message: "Cart body must be JSON.", details: {} }, 400);
  }

  const parsed = parseAction(body);
  if (!parsed.ok) {
    return json(parsed.error, 400);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!userResponse.ok) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in to see your cart.", details: {} }, 401);
  }

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/${parsed.rpc}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsed.args),
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

function parseAction(body: unknown):
  | { ok: true; rpc: string; args: Record<string, unknown> }
  | { ok: false; error: DomainBody } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: invalid("Cart body must be an object.") };
  }

  const record = body as {
    action?: unknown;
    packSkuId?: unknown;
    cartLineId?: unknown;
    quantity?: unknown;
    idempotencyKey?: unknown;
  };

  if (record.action === "view") {
    return { ok: true, rpc: "cart_snapshot", args: {} };
  }

  const key = readKey(record.idempotencyKey);
  if (!key.ok) {
    return key;
  }

  if (record.action === "reserve") {
    if (typeof record.packSkuId !== "string" || !uuidPattern.test(record.packSkuId)) {
      return { ok: false, error: invalid("Choose a pack to reserve.") };
    }
    if (typeof record.quantity !== "number" || !Number.isInteger(record.quantity)) {
      return { ok: false, error: invalid("Choose a whole number of packs.") };
    }
    return {
      ok: true,
      rpc: "reserve_pack",
      args: {
        p_pack_sku_id: record.packSkuId,
        p_quantity: record.quantity,
        p_idempotency_key: key.value,
      },
    };
  }

  const lineId = record.cartLineId;
  if (typeof lineId !== "string" || !uuidPattern.test(lineId)) {
    return { ok: false, error: invalid("Choose a cart line.") };
  }

  const lineArgs = { p_cart_line_id: lineId, p_idempotency_key: key.value };
  if (record.action === "release") {
    return { ok: true, rpc: "release_pack_line", args: lineArgs };
  }
  if (record.action === "retry") {
    return { ok: true, rpc: "retry_pack_reservation", args: lineArgs };
  }
  if (record.action === "acceptPrice") {
    return { ok: true, rpc: "accept_pack_price", args: lineArgs };
  }

  return { ok: false, error: invalid("That cart action is not available.") };
}

function readKey(value: unknown):
  | { ok: true; value: string }
  | { ok: false; error: DomainBody } {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    return {
      ok: false,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "This cart action needs a UUID idempotency key.",
        details: {},
      },
    };
  }
  return { ok: true, value };
}

function invalid(message: string): DomainBody {
  return { code: "INVALID_CART_ACTION", message, details: {} };
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
    code: message || "CART_REJECTED",
    message: "The cart action was rejected.",
    details: {},
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}
