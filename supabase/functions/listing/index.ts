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

const maxPriceCents = 100_000_000;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (request.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED", message: "Listing accepts POST.", details: {} }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({
      code: "SERVER_MISCONFIGURED",
      message: "Listing is not available right now.",
      details: {},
    }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in to list an item.", details: {} }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ code: "INVALID_LISTING_ACTION", message: "Listing body must be JSON.", details: {} }, 400);
  }

  const parsed = parseAction(body);
  if (!parsed.ok) {
    return json(parsed.error, 400);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!userResponse.ok) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in to list an item.", details: {} }, 401);
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
    return { ok: false, error: invalid("Listing body must be an object.") };
  }

  const record = body as {
    action?: unknown;
    ownedItemId?: unknown;
    listingId?: unknown;
    priceCents?: unknown;
    idempotencyKey?: unknown;
  };

  const key = readKey(record.idempotencyKey);
  if (!key.ok) {
    return key;
  }

  if (record.action === "list") {
    if (typeof record.ownedItemId !== "string" || !uuidPattern.test(record.ownedItemId)) {
      return { ok: false, error: invalid("Choose an item to list.") };
    }
    const price = readPrice(record.priceCents);
    if (!price.ok) {
      return price;
    }
    return {
      ok: true,
      rpc: "list_item",
      args: {
        p_owned_item_id: record.ownedItemId,
        p_price_cents: price.value,
        p_idempotency_key: key.value,
      },
    };
  }

  if (typeof record.listingId !== "string" || !uuidPattern.test(record.listingId)) {
    return { ok: false, error: invalid("Choose a listing.") };
  }

  if (record.action === "delist") {
    return {
      ok: true,
      rpc: "delist",
      args: {
        p_listing_id: record.listingId,
        p_idempotency_key: key.value,
      },
    };
  }

  if (record.action === "reprice") {
    const price = readPrice(record.priceCents);
    if (!price.ok) {
      return price;
    }
    return {
      ok: true,
      rpc: "reprice_listing",
      args: {
        p_listing_id: record.listingId,
        p_price_cents: price.value,
        p_idempotency_key: key.value,
      },
    };
  }

  return { ok: false, error: invalid("That listing action is not available.") };
}

function readKey(value: unknown):
  | { ok: true; value: string }
  | { ok: false; error: DomainBody } {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    return {
      ok: false,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "This listing action needs a UUID idempotency key.",
        details: {},
      },
    };
  }
  return { ok: true, value };
}

function readPrice(value: unknown):
  | { ok: true; value: number }
  | { ok: false; error: DomainBody } {
  if (typeof value !== "string" || !/^[1-9]\d{0,8}$/.test(value)) {
    return { ok: false, error: invalid("Enter a price greater than zero.") };
  }
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > maxPriceCents) {
    return { ok: false, error: invalid("Enter a price greater than zero.") };
  }
  return { ok: true, value: cents };
}

function invalid(message: string): DomainBody {
  return { code: "INVALID_LISTING_ACTION", message, details: {} };
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
    code: message || "LISTING_REJECTED",
    message: "The listing action was rejected.",
    details: {},
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}
