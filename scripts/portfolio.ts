import { formatSignedCents, portfolioTotals, profitCents, selectHoldings } from "../app/src/features/collection/portfolio.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const finch = {
  name: "Cedar Finch",
  category: "TRADING_CARD" as const,
  estimatedValueCents: 350n,
  acquisitionPriceCents: 1000n,
  acquiredAt: "2026-10-05T10:00:00.000Z",
};
const vault = {
  name: "Night Runner",
  category: "SNEAKER" as const,
  estimatedValueCents: 9000n,
  acquisitionPriceCents: 8000n,
  acquiredAt: "2026-10-04T10:00:00.000Z",
};
const watch = {
  name: "Harbor Dial",
  category: "WATCH" as const,
  estimatedValueCents: 12000n,
  acquisitionPriceCents: 12000n,
  acquiredAt: "2026-10-03T10:00:00.000Z",
};
const items = [finch, vault, watch];

assert(profitCents(350n, 1000n) === -650n, "profit was not current value minus the price paid");
assert(profitCents(9000n, 8000n) === 1000n, "a gain was not an integer number of cents");
assert(profitCents(199n, 1n) === 198n, "profit used a float");

const totals = portfolioTotals(items);
assert(totals.valueCents === 21350n, "portfolio value did not add the server cents");
assert(totals.profitCents === 350n, "portfolio P&L did not add the integer differences");
assert(formatSignedCents(-650n) === "-$6.50", "a loss was not shown from cents");
assert(formatSignedCents(1000n) === "+$10.00", "a gain was not shown from cents");
assert(formatSignedCents(0n) === "$0.00", "a flat holding grew a sign");

const cards = selectHoldings(items, "TRADING_CARD", "recent");
assert(cards.length === 1 && cards[0]?.name === "Cedar Finch", "Cards included another category");
assert(selectHoldings(items, "SNEAKER", "value").length === 1, "Sneakers dropped the sneaker");
assert(selectHoldings(items, "WATCH", "pnl").length === 1, "Watches dropped the watch");
assert(selectHoldings(items, "ALL", "recent").map((item) => item.name).join(",") === "Cedar Finch,Night Runner,Harbor Dial", "recent order was not newest first");
assert(selectHoldings(items, "ALL", "value")[0]?.name === "Harbor Dial", "value sort did not lead with the highest catalog value");
assert(selectHoldings(items, "ALL", "pnl")[0]?.name === "Night Runner", "P&L sort did not lead with the largest gain");

const tied = [
  { ...finch, name: "Older", estimatedValueCents: 500n, acquiredAt: "2026-10-01T00:00:00.000Z" },
  { ...finch, name: "Newer", estimatedValueCents: 500n, acquiredAt: "2026-10-02T00:00:00.000Z" },
];
assert(selectHoldings(tied, "ALL", "value")[0]?.name === "Newer", "an equal value did not keep the newer holding first");

console.log("PORTFOLIO_OK");
