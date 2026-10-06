# Architecture

GrailHaus is an Expo client on Supabase. Postgres is the authority for money, stock, pack contents, and ownership. The client reads with the user JWT. Every mutation goes through an Edge Function that calls one Postgres function. There is no second backend and no Redis. Money is `bigint` cents.

```text
Expo app
  -> Supabase Auth
  -> PostgREST reads
  -> Edge Functions
       -> one Postgres function per mutation
  -> constraints and triggers reject illegal states
```

Signed-in users can read their own wallet, cart, and holdings, and they can browse active packs and listings. They cannot insert ledger rows, edit stock, or change pack contents. Anonymous clients have no table access. The service-role key stays on the server.

## Cart and reservations

A pack hold lasts five minutes of server time. Reserving locks the SKU and moves units into `stock_reserved`. Available stock is `stock_on_hand - stock_reserved`. Expiry or removal returns those units. Checkout consumes the hold and decreases both counters. A second buyer waits on the SKU lock, so the last units cannot be held twice.

Marketplace listings are not reserved. A listing line has quantity 1. The seller can still reprice, delist, or sell it. The buyer's cart keeps the line and says what changed.

## Atomic checkout

One transaction pays every open cart line, packs and listings together, or it pays nothing. It claims the client's idempotency key, locks the wallet, the pack SKUs, and the listings, then checks holds, drop windows, prices, and ownership on those locked rows. Pack contents are drawn before commit and cannot be edited afterward. A listing sale debits the buyer the price, credits the seller the price minus the floored 8% fee, and writes the fee to the platform. A lost response or a killed app retries the same key and gets the stored receipt. A definite rejection may use a new key.

## Freshness

The server clock decides drop windows, reservation expiry, and the hourly estimate. The client stores the server time from the fetch and ticks from that offset, so a wrong device clock does not open a drop early. Screens refresh on focus, on return to the foreground, on pull to refresh, and when a realtime change arrives. A burst of row changes refreshes once. Offline screens keep the last snapshot, say it may be stale, and leave the action disabled. Collectible estimates step once per hour when the portfolio or the reveal reads them. Pack prices do not step.

## 10-pack reveal pacing

Checkout draws the card. The reveal plays that stored card, in the stored order. Packs 1 and 2 use the full tear: a tap or a short slow drag springs shut, and a flick or a long pull opens the pack. From pack 3, Fast Open plays a short tear, a fan of cards already opened, and the best card. An epic or legendary card uses the longer reveal. The summary adds spent and catalog value as integer cents. Backgrounding before the tear is stored leaves the pack sealed. A kill during the card reloads the stored step and does not redraw it. Reduce motion fades the card in. Haptics can be off. The name, rarity, and value stay on screen.

## Why GrailHaus can't lose money

Seeded expected value uses the seeded collectible value, not the hourly estimate, so the estimate cannot push a tier over its price. Every seeded tier stays under its price. The Rare Pack is `$250` against `$227.75`. The grail box is `$8,000` against `$7,398.75`.

| Tier | Pack | Price | Seed expected value |
| --- | --- | --- | --- |
| Starter | Starter Pack | $10.00 | $4.89 |
| Midnight | Midnight Drop | $25.00 | $4.89 |
| Street | Street Pack | $80.00 | $61.36 |
| Collector | Collector Pack | $100.00 | $52.28 |
| Rare | Rare Pack | $250.00 | $227.75 |
| Entry Vault | Entry Vault | $500.00 | $185.40 |
| Legendary | Legendary Pack | $500.00 | $367.75 |
| Vault | Vault Pack | $800.00 | $737.38 |
| Luxury | Luxury Box | $2,000.00 | $1,817.00 |
| Grail | Grail Box | $8,000.00 | $7,398.75 |

A marketplace sale does not mint cents. The buyer pays the price. The seller receives the price minus the fee. The fee is `(price_cents * 800) / 10000`, integer division. Those three amounts sum to zero. A `$450` sale is a `$36` fee and a `$414` credit. A 1 cent sale has no fee.

Deposits are the only way trial funds enter, and each deposit is a ledger row. A pack purchase only debits the buyer. There is no refund function. The client cannot write the ledger. The same payment key cannot debit twice. A listing cannot be marked sold unless the item moves. Buying an item back pays the fee again, so the round trip does not create cents.

A wallet cannot go negative, and a wallet that does not match its ledger cannot commit. The economic test checks negative balances, ledger drift, two active listings, a sold listing that still names the current owner, a purchase without its debit, and a fee that does not add up. Those queries return no rows when the books match.

## Scope cuts

Sneaker and watch packs do not use the card tear. The admin screen is numbers only. There is no catalog search and no visual effects outside the reveal. Redis, background workers, and a separate API are out. The release APK from `npm run apk` uses the hosted project.
