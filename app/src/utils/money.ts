const maxDepositCents = 100_000_000n;

export function dollarsToCents(input: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(input.trim());
  if (!match) {
    return null;
  }

  const dollars = BigInt(match[1] ?? "0");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const cents = dollars * 100n + BigInt(fraction || "0");
  if (cents <= 0n || cents > maxDepositCents) {
    return null;
  }
  return cents;
}

export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const dollars = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const remainder = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${remainder}`;
}

export function centsFromWire(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  throw new Error("Money value is not an integer number of cents.");
}
