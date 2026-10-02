import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./supabase";
import { supabaseAnonKey, supabaseUrl } from "./config";
import { centsFromWire } from "../utils/money";

const inflightKey = "grailhaus.deposit.inflight";

export type DepositReceipt = {
  amountCents: bigint;
  balanceCents: bigint;
  idempotencyKey: string;
};

export type InflightDeposit = {
  amountCents: string;
  idempotencyKey: string;
};

export class DepositRejected extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class DepositUnknown extends Error {
  constructor() {
    super("This deposit may have completed. We're checking before retrying.");
    this.name = "DepositUnknown";
  }
}

export async function readInflightDeposit(): Promise<InflightDeposit | null> {
  const raw = await AsyncStorage.getItem(inflightKey);
  if (!raw) {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isInflight(parsed)) {
    await AsyncStorage.removeItem(inflightKey);
    return null;
  }
  return parsed;
}

export async function rememberInflightDeposit(deposit: InflightDeposit): Promise<void> {
  await AsyncStorage.setItem(inflightKey, JSON.stringify(deposit));
}

export async function clearInflightDeposit(): Promise<void> {
  await AsyncStorage.removeItem(inflightKey);
}

export async function submitDeposit(deposit: InflightDeposit): Promise<DepositReceipt> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new DepositRejected("UNAUTHENTICATED", "Sign in before depositing.");
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/deposit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deposit),
    });
  } catch {
    throw new DepositUnknown();
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 500 || payload === null) {
      throw new DepositUnknown();
    }
    if (isDomainError(payload)) {
      throw new DepositRejected(payload.code, payload.message);
    }
    throw new DepositRejected("DEPOSIT_REJECTED", "The deposit was rejected.");
  }

  if (!isReceipt(payload)) {
    throw new DepositUnknown();
  }

  return {
    amountCents: centsFromWire(payload.amountCents),
    balanceCents: centsFromWire(payload.balanceCents),
    idempotencyKey: payload.idempotencyKey,
  };
}

function isInflight(value: unknown): value is InflightDeposit {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { amountCents?: unknown; idempotencyKey?: unknown };
  return typeof record.amountCents === "string" && typeof record.idempotencyKey === "string";
}

function isDomainError(value: unknown): value is { code: string; message: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === "string" && typeof record.message === "string";
}

function isReceipt(value: unknown): value is {
  amountCents: unknown;
  balanceCents: unknown;
  idempotencyKey: string;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { amountCents?: unknown; balanceCents?: unknown; idempotencyKey?: unknown };
  return (
    record.amountCents !== undefined &&
    record.balanceCents !== undefined &&
    typeof record.idempotencyKey === "string"
  );
}
