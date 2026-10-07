import type { CartLine } from "../../api/cart";

export type CartBreakdown = {
  packCents: bigint;
  marketCents: bigint;
  totalCents: bigint;
  payable: boolean;
};

export function lineAmount(line: CartLine): bigint {
  return line.snapshotPriceCents * BigInt(line.quantity);
}

export function cartBreakdown(lines: readonly CartLine[]): CartBreakdown {
  let packCents = 0n;
  let marketCents = 0n;
  let payable = lines.length > 0;
  for (const line of lines) {
    if (line.state !== "VALID" || line.snapshotPriceCents !== line.currentPriceCents) {
      payable = false;
    }
    const amount = lineAmount(line);
    if (line.lineType === "PACK") {
      packCents += amount;
    } else {
      marketCents += amount;
    }
  }
  return { packCents, marketCents, totalCents: packCents + marketCents, payable };
}

export function payableTotal(lines: readonly CartLine[]): bigint | null {
  const breakdown = cartBreakdown(lines);
  return breakdown.payable ? breakdown.totalCents : null;
}
