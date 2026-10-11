import type { CartLine } from "../../api/cart";
import { cartBreakdown } from "./cartTotals";

/** Payable cart lines + total captured at Pay tap for checkout expectedTotal. */
export type PaymentSnapshot = {
  totalCents: bigint;
  lines: {
    lineId: string;
    quantity: number;
    priceCents: bigint;
  }[];
};

/** Returns null when the cart is not fully payable. */
export function capturePayment(lines: readonly CartLine[]): PaymentSnapshot | null {
  const breakdown = cartBreakdown(lines);
  if (!breakdown.payable) {
    return null;
  }
  return {
    totalCents: breakdown.totalCents,
    lines: lines.map((line) => ({
      lineId: line.lineId,
      quantity: line.quantity,
      priceCents: line.snapshotPriceCents,
    })),
  };
}
