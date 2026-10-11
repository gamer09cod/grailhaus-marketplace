import type { CartLine } from "../../api/cart";
import type { CheckoutReceipt } from "../../api/checkout";
import { cartBreakdown } from "./cartTotals";

export type OrderSummaryLine = {
  lineId: string;
  name: string;
  quantity: number;
  priceCents: string;
  lineType: "PACK" | "MARKETPLACE_LISTING";
};

/** Route params — bigint values travel as decimal strings. */
export type OrderSummaryParams = {
  purchaseId: string;
  totalCents: string;
  balanceCents: string;
  packCents: string;
  marketCents: string;
  lines: OrderSummaryLine[];
  sealedPackIds: string[];
  deliveredPackCount: number;
  listingCount: number;
};

export function captureOrderLines(lines: readonly CartLine[]): OrderSummaryLine[] {
  return lines.map((line) => ({
    lineId: line.lineId,
    name: line.name,
    quantity: line.quantity,
    priceCents: line.snapshotPriceCents.toString(),
    lineType: line.lineType,
  }));
}

export function buildOrderSummary(
  receipt: CheckoutReceipt,
  lines: readonly OrderSummaryLine[],
  cartLines?: readonly CartLine[],
): OrderSummaryParams {
  const breakdown = cartLines ? cartBreakdown(cartLines) : null;
  let packCents = breakdown?.packCents ?? 0n;
  let marketCents = breakdown?.marketCents ?? 0n;
  if (!breakdown) {
    for (const line of lines) {
      const amount = BigInt(line.priceCents) * BigInt(line.quantity);
      if (line.lineType === "MARKETPLACE_LISTING") {
        marketCents += amount;
      } else {
        packCents += amount;
      }
    }
  }
  return {
    purchaseId: receipt.purchaseId,
    totalCents: receipt.totalCents.toString(),
    balanceCents: receipt.balanceCents.toString(),
    packCents: packCents.toString(),
    marketCents: marketCents.toString(),
    lines: [...lines],
    sealedPackIds: [...receipt.sealedPackIds],
    deliveredPackCount: receipt.deliveredPackCount,
    listingCount: receipt.listingCount,
  };
}
