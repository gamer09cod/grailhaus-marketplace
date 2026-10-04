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

const actions = [
  "buyPack",
  "repriceListing",
  "delistListing",
  "sellListing",
  "startDrop",
  "endDrop",
  "setBalance",
  "expireReservation",
] as const;

type QaAction = (typeof actions)[number];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (request.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED", message: "QA accepts POST.", details: {} }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({
      code: "SERVER_MISCONFIGURED",
      message: "QA is not available right now.",
      details: {},
    }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in before using the QA menu.", details: {} }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ code: "INVALID_QA", message: "QA body must be JSON.", details: {} }, 400);
  }

  const parsed = parseAction(body);
  if (!parsed.ok) {
    return json(parsed.error, 400);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!userResponse.ok) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in before using the QA menu.", details: {} }, 401);
  }

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/qa_act`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_action: parsed.action,
      p_payload: parsed.payload,
      p_idempotency_key: parsed.idempotencyKey,
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

function parseAction(body: unknown):
  | { ok: true; action: QaAction; payload: Record<string, unknown>; idempotencyKey: string }
  | { ok: false; error: DomainBody } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: invalid("QA body must be an object.") };
  }

  const record = body as {
    action?: unknown;
    payload?: unknown;
    idempotencyKey?: unknown;
  };

  if (typeof record.action !== "string" || !actions.some((action) => action === record.action)) {
    return { ok: false, error: invalid("That QA action is not available.") };
  }

  if (typeof record.idempotencyKey !== "string" || !uuidPattern.test(record.idempotencyKey)) {
    return {
      ok: false,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "This QA action needs a UUID idempotency key.",
        details: {},
      },
    };
  }

  if (typeof record.payload !== "object" || record.payload === null || Array.isArray(record.payload)) {
    return { ok: false, error: invalid("This QA action needs a payload.") };
  }

  const payload = record.payload as Record<string, unknown>;
  const action = record.action as QaAction;
  const shape = validatePayload(action, payload);
  if (!shape.ok) {
    return shape;
  }

  return { ok: true, action, payload, idempotencyKey: record.idempotencyKey };
}

function validatePayload(action: QaAction, payload: Record<string, unknown>): { ok: true } | { ok: false; error: DomainBody } {
  if (action === "buyPack") {
    if (!isUuid(payload.packSkuId)) {
      return { ok: false, error: invalid("Choose a pack.") };
    }
    if (!isQuantity(payload.quantity)) {
      return { ok: false, error: invalid("Choose a quantity from 1 to 100.") };
    }
  }

  if (action === "repriceListing") {
    if (!isUuid(payload.listingId) || !isCents(payload.priceCents)) {
      return { ok: false, error: invalid("Choose a listing and a price.") };
    }
  }

  if (action === "delistListing" || action === "sellListing") {
    if (!isUuid(payload.listingId)) {
      return { ok: false, error: invalid("Choose a listing.") };
    }
  }

  if (action === "startDrop" || action === "endDrop") {
    if (!isUuid(payload.packSkuId)) {
      return { ok: false, error: invalid("Choose a drop.") };
    }
  }

  if (action === "setBalance" && !isCents(payload.balanceCents, true)) {
    return { ok: false, error: invalid("Enter a balance from $0.00 to $1,000,000.") };
  }

  if (action === "expireReservation" && payload.lineId !== undefined && !isUuid(payload.lineId)) {
    return { ok: false, error: invalid("Choose a reservation.") };
  }

  return { ok: true };
}

function isUuid(value: unknown): boolean {
  return typeof value === "string" && uuidPattern.test(value);
}

function isQuantity(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
}

function isCents(value: unknown, allowZero = false): boolean {
  if (typeof value !== "string" || !centsPattern.test(value)) {
    return false;
  }
  if (!allowZero && value === "0") {
    return false;
  }
  const cents = BigInt(value);
  return cents <= 100_000_000n;
}

function invalid(message: string): DomainBody {
  return { code: "INVALID_QA", message, details: {} };
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
    code: message || "QA_REJECTED",
    message: "The QA action was rejected.",
    details: {},
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}
