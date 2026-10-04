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

const states = ["OPEN", "REVEALING_CARD", "CARD_REVEALED", "PACK_COMPLETE"] as const;

type RevealState = (typeof states)[number];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (request.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED", message: "Reveal accepts POST.", details: {} }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({
      code: "SERVER_MISCONFIGURED",
      message: "Reveal is not available right now.",
      details: {},
    }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in to open a pack.", details: {} }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ code: "INVALID_REVEAL", message: "Reveal body must be JSON.", details: {} }, 400);
  }

  const parsed = parseReveal(body);
  if (!parsed.ok) {
    return json(parsed.error, 400);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!userResponse.ok) {
    return json({ code: "UNAUTHENTICATED", message: "Sign in to open a pack.", details: {} }, 401);
  }

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/reveal_progress`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_purchased_pack_id: parsed.purchasedPackId,
      p_reveal_state: parsed.revealState,
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

function parseReveal(body: unknown):
  | { ok: true; purchasedPackId: string; revealState: RevealState; idempotencyKey: string }
  | { ok: false; error: DomainBody } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: invalid("Reveal body must be an object.") };
  }

  const record = body as {
    purchasedPackId?: unknown;
    revealState?: unknown;
    idempotencyKey?: unknown;
  };

  if (typeof record.purchasedPackId !== "string" || !uuidPattern.test(record.purchasedPackId)) {
    return { ok: false, error: invalid("Reveal needs the purchased pack.") };
  }

  if (typeof record.revealState !== "string" || !states.some((state) => state === record.revealState)) {
    return {
      ok: false,
      error: {
        code: "REVEAL_STEP",
        message: "Open this pack in order. A tap does not finish it.",
        details: {},
      },
    };
  }

  if (typeof record.idempotencyKey !== "string" || !uuidPattern.test(record.idempotencyKey)) {
    return {
      ok: false,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "This reveal needs a UUID idempotency key.",
        details: {},
      },
    };
  }

  return {
    ok: true,
    purchasedPackId: record.purchasedPackId,
    revealState: record.revealState,
    idempotencyKey: record.idempotencyKey,
  };
}

function invalid(message: string): DomainBody {
  return { code: "INVALID_REVEAL", message, details: {} };
}

function isRpcError(value: unknown): value is { message?: string; details?: string } {
  return typeof value === "object" && value !== null;
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
    code: message || "REVEAL_REJECTED",
    message: "The pack did not open.",
    details: {},
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}
