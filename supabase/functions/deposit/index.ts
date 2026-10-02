const maxDepositCents = 100_000_000n;

type DomainBody = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (request.method !== "POST") {
    return json({
      code: "METHOD_NOT_ALLOWED",
      message: "Deposit accepts POST.",
      details: {},
    }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({
      code: "SERVER_MISCONFIGURED",
      message: "Deposit is not available right now.",
      details: {},
    }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({
      code: "UNAUTHENTICATED",
      message: "Sign in before depositing.",
      details: {},
    }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({
      code: "INVALID_AMOUNT",
      message: "Deposit body must be JSON.",
      details: {},
    }, 400);
  }

  const parsed = parseDeposit(body);
  if (!parsed.ok) {
    return json(parsed.error, 400);
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: anonKey,
    },
  });
  if (!userResponse.ok) {
    return json({
      code: "UNAUTHENTICATED",
      message: "Sign in before depositing.",
      details: {},
    }, 401);
  }

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/deposit`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_amount_cents: Number(parsed.amountCents),
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

function parseDeposit(body: unknown):
  | { ok: true; amountCents: bigint; idempotencyKey: string }
  | { ok: false; error: DomainBody } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: invalidAmount("Deposit body must be an object.") };
  }

  const record = body as { amountCents?: unknown; idempotencyKey?: unknown };
  if (typeof record.amountCents !== "string" || !/^[1-9]\d*$/.test(record.amountCents)) {
    return {
      ok: false,
      error: invalidAmount("Send the amount as whole cents, without decimals or symbols."),
    };
  }

  const amountCents = BigInt(record.amountCents);
  if (amountCents <= 0n || amountCents > maxDepositCents) {
    return {
      ok: false,
      error: invalidAmount("Enter an amount from $0.01 to $1,000,000."),
    };
  }

  if (
    typeof record.idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      record.idempotencyKey,
    )
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "Deposit needs a UUID idempotency key.",
        details: {},
      },
    };
  }

  return { ok: true, amountCents, idempotencyKey: record.idempotencyKey };
}

function invalidAmount(message: string): DomainBody {
  return {
    code: "INVALID_AMOUNT",
    message,
    details: { minCents: "1", maxCents: maxDepositCents.toString() },
  };
}

function isRpcError(value: unknown): value is { message: string; details?: unknown } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { message?: unknown };
  return typeof record.message === "string";
}

function domainFromRpc(message: string, details: string | null): DomainBody {
  if (details) {
    try {
      const parsed: unknown = JSON.parse(details);
      if (isDomainBody(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to the exception message.
    }
  }

  return {
    code: message || "DEPOSIT_REJECTED",
    message: "The deposit was rejected.",
    details: {},
  };
}

function isDomainBody(value: unknown): value is DomainBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { code?: unknown; message?: unknown; details?: unknown };
  return typeof record.code === "string" && typeof record.message === "string";
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}
