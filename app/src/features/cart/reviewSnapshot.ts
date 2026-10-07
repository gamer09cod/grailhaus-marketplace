import type { CartLine } from "../../api/cart";
import { cartBreakdown, lineAmount } from "./cartTotals";

export type ReviewedLine = {
  lineId: string;
  name: string;
  quantity: number;
  priceCents: bigint;
};

export type ReviewSnapshot = {
  totalCents: bigint;
  packCents: bigint;
  marketCents: bigint;
  lines: ReviewedLine[];
};

export type ReviewChange = {
  lineId: string;
  name: string;
  fromCents: bigint;
  toCents: bigint | null;
};

export function captureReview(lines: readonly CartLine[]): ReviewSnapshot | null {
  const breakdown = cartBreakdown(lines);
  if (!breakdown.payable) {
    return null;
  }
  return {
    totalCents: breakdown.totalCents,
    packCents: breakdown.packCents,
    marketCents: breakdown.marketCents,
    lines: lines.map((line) => ({
      lineId: line.lineId,
      name: line.name,
      quantity: line.quantity,
      priceCents: line.snapshotPriceCents,
    })),
  };
}

export function reviewChanges(reviewed: ReviewSnapshot, lines: readonly CartLine[]): ReviewChange[] {
  const currentById = new Map(lines.map((line) => [line.lineId, line]));
  const changes: ReviewChange[] = [];
  const seen = new Set<string>();

  for (const item of reviewed.lines) {
    const current = currentById.get(item.lineId);
    if (!current) {
      changes.push({
        lineId: item.lineId,
        name: item.name,
        fromCents: item.priceCents * BigInt(item.quantity),
        toCents: null,
      });
      continue;
    }
    seen.add(item.lineId);
    if (lineStillMatches(item, current)) {
      continue;
    }
    changes.push({
      lineId: item.lineId,
      name: item.name,
      fromCents: item.priceCents * BigInt(item.quantity),
      toCents: lineAmount(current),
    });
  }

  for (const line of lines) {
    if (seen.has(line.lineId) || reviewed.lines.some((item) => item.lineId === line.lineId)) {
      continue;
    }
    changes.push({
      lineId: line.lineId,
      name: line.name,
      fromCents: 0n,
      toCents: lineAmount(line),
    });
  }

  return changes;
}

export function reviewFromPayment(
  request: { expectedTotalCents: bigint; lines: { lineId: string; quantity: number; snapshotPriceCents: bigint }[] },
  cartLines: readonly CartLine[],
): ReviewSnapshot {
  const currentById = new Map(cartLines.map((line) => [line.lineId, line]));
  const lines: ReviewedLine[] = request.lines.map((item) => {
    const live = currentById.get(item.lineId);
    return {
      lineId: item.lineId,
      name: live?.name ?? "Item",
      quantity: item.quantity,
      priceCents: item.snapshotPriceCents,
    };
  });
  let packCents = 0n;
  let marketCents = 0n;
  for (const item of lines) {
    const live = currentById.get(item.lineId);
    const amount = item.priceCents * BigInt(item.quantity);
    if (live?.lineType === "MARKETPLACE_LISTING") {
      marketCents += amount;
    } else {
      packCents += amount;
    }
  }
  return {
    totalCents: request.expectedTotalCents,
    packCents,
    marketCents,
    lines,
  };
}

function lineStillMatches(item: ReviewedLine, current: CartLine): boolean {
  return current.state === "VALID"
    && current.quantity === item.quantity
    && current.snapshotPriceCents === item.priceCents
    && current.currentPriceCents === item.priceCents;
}
