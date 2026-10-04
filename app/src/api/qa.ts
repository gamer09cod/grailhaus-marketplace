import * as Crypto from "expo-crypto";

import { supabaseAnonKey, supabaseUrl } from "./config";
import { supabase } from "./supabase";

export type QaAction =
  | "buyPack"
  | "repriceListing"
  | "delistListing"
  | "sellListing"
  | "startDrop"
  | "endDrop"
  | "setBalance"
  | "expireReservation";

export class QaRejected extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function submitQa(action: QaAction, payload: Record<string, string | number>): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new QaRejected("UNAUTHENTICATED", "Sign in before using the QA menu.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/qa`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      payload,
      idempotencyKey: Crypto.randomUUID(),
    }),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isDomainError(body)) {
      throw new QaRejected(body.code, body.message);
    }
    throw new QaRejected("QA_REJECTED", "The QA action was rejected.");
  }
}

function isDomainError(value: unknown): value is { code: string; message: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === "string" && typeof record.message === "string";
}
