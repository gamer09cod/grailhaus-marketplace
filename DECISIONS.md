# GrailHaus Decisions

These decisions govern the product. When a decision changes, update this file and say why.

## Schema refinements

These details were fixed while the schema was written. They do not change the product rules above.

- Drop status is not a column. `drops_with_status` derives it from Postgres `now()` and reservable stock. A stored status cannot be a generated column because `now()` is not immutable, and a saved value would go stale.
- Ledger amounts are signed. User credits are positive. User debits are negative. `MARKETPLACE_FEE` has a null `user_id` and a positive amount, which is platform revenue.
- `wallets.balance_cents` must equal that user's ledger sum before commit. Ledger rows are append-only.
- `stock_on_hand` and `stock_reserved` change only when a reservation is created, released, expired, or consumed. The reservation update locks the SKU row.
- A new hold must expire within five minutes of server time. `release_expired_reservations()` returns stock for holds that are already due.
- At commit, a `LISTED` item has exactly one active listing by its owner. `TRANSFERRING` cannot be committed.
- Pack contents are required, ordered common-first, and not editable.
- Local API exposure is explicit grants (`auto_expose_new_tables = false`). The client role can select. It cannot write.

## Deposits and seed

- Mock deposits are `POST /functions/v1/deposit`. The function checks the user JWT and calls `public.deposit`. That function calls `private.apply_deposit` in one transaction: claim the idempotency key, lock the wallet, insert the ledger row, then update the cached balance. The client does not insert ledger rows.
- One mock deposit accepts `1` to `100000000` cents (`$0.01` to `$1,000,000`). The cap limits minted trial funds. It is not a catalog price.
- A completed idempotency key with the same amount returns the stored receipt. The same key with a different amount raises `IDEMPOTENCY_KEY_REUSED`. If the response is lost, the client keeps the key and says the deposit may have completed. It does not call that a failure.
- Each pack tier has its own `pack_sku_items` pool. Odds cannot commit unless every listed rarity has an item in that pool. Seed expected value, using integer averages of `base_value_cents`, stays below the pack price. The grail watch box is `$8,000` (`800000` cents) so those secondary-market values still fit under the price.
- `reviewer@grailhaus.test` and `collector@grailhaus.test` share the local password `Reviewer-10000` and start at `$10,000` through `apply_deposit`. A new signup starts at `$0.00`.

## Current repository

| Item | State |
| --- | --- |
| Git | `main` |
| Remote | `https://github.com/gamer09cod/grailhaus-marketplace.git` |
| Expo | `app/`, React Navigation, TanStack Query |
| Supabase | Local stack for development. Hosted `zboczfalxtuspnodveer` for `npm run apk` |
| Tests | `supabase/tests` and `scripts/` |

The table above is the repository now. `npm run apk` builds the release APK against the hosted project. The requirement audit is still ahead.

## Product decisions

### Money

All money is `BIGINT` cents. `$10.00` is `1000`. `$499.99` is `49999`.

Column and field names end in `_cents`.

Do not use `float`, `double`, `real`, `money`, or JavaScript floating-point arithmetic for amounts that move money or that are compared at checkout.

JavaScript `number` is unsafe for arbitrary integers. Postgres `BIGINT` arrives from Supabase as a string. Parse cents into `bigint` in the domain layer. Format for display at the UI boundary with integer division and remainder (`dollars = cents / 100n`, `remainder = cents % 100n`).

Percentages use integer basis points. `10000` basis points = 100%.

### Marketplace fee

The platform fee is **8%** (`800` basis points).

One Postgres function owns the rule:

```text
fee_cents   = (price_cents * 800) / 10000    -- integer division, floor
seller_cents = price_cents - fee_cents
buyer_cents  = price_cents
```

Flooring the fee means the seller receives the remainder. Buyer debit equals seller credit plus platform fee. The split does not create or destroy cents.

The client displays a fee preview returned by the backend. It does not define the formula.

Worked example: listing price `45000` cents (`$450`). Fee `3600` (`$36`). Seller receives `41400` (`$414`).

### Starting trial balance

Seeded test accounts start at **$10,000** = `1000000` cents.

That balance is a `DEPOSIT` ledger row plus the cached wallet balance, written together. It is not a wallet update without a ledger entry.

Users may also make mock deposits (`$100`, `$500`, `$1,000`, and a custom amount from `$0.01` to `$1,000,000`). Deposit is atomic: ledger insert and cached balance update commit together, or neither does. Deposit accepts an idempotency key. A retry of the same key does not credit the wallet twice.

### Pack reservations

The cart primary action is **Review Purchase**. It does not charge. The review step charges with **Confirm Purchase · $X** and shows `Confirming purchase…` while the request is in flight. If a line changes after review, the reviewed total stays on screen and Confirm Purchase stays disabled until the user returns to the cart.

Adding a pack to the cart reserves inventory for **5 minutes**.

`expires_at` is `now()` plus 5 minutes inside Postgres. The client renders remaining time from server timestamps. Device clock is not a source of truth.

Countdown display shape: `Reserved for 04:32`.

When a reservation expires:

- reserved quantity is released
- the cart line stays visible
- the line is marked expired
- the user may try to reserve again

Copy:

```text
Reservation expired

These packs are no longer reserved.

[Reserve Again]
```

Expiration is enforced when a cart or checkout path runs, by releasing due reservations inside the same transaction as the operation that needs a correct count. A scheduled job may also sweep expired rows. Correctness does not depend on the job having run.

### Stock counters

`stock_available` alone is ambiguous once reservations exist. Pack SKUs keep two counters:

| Column | Meaning |
| --- | --- |
| `stock_on_hand` | Units not yet sold |
| `stock_reserved` | Units held by active reservations |

Reservable quantity is `stock_on_hand - stock_reserved`.

Constraints:

```text
stock_on_hand >= 0
stock_reserved >= 0
stock_reserved <= stock_on_hand
```

Reserve, expire, and purchase adjust these counters with a row lock or a single conditional `UPDATE`. Code must not read stock in one statement and update it later in a different statement without holding the row lock.

| Event | Effect |
| --- | --- |
| Reserve | `stock_reserved += quantity` only if reservable quantity is sufficient |
| Expire or release | `stock_reserved -= quantity` |
| Successful pack purchase | `stock_on_hand -= quantity` and `stock_reserved -= quantity` |

Exactly the reservable quantity may be reserved. Exactly `stock_on_hand` units may be sold. Concurrent reserve or checkout attempts cannot oversell.

### Marketplace cart lines

Adding a marketplace listing to the cart does **not** reserve it. A cart must not let one buyer block a seller.

Marketplace quantity is always `1`.

Availability, seller, and price are revalidated inside the checkout transaction.

### Marketplace browse

`marketplace_board` returns active listings with name, category, rarity, price, seller, `isOwn`, `listedAt`, `imageUrl`, and `currentValueCents`. The catalog estimate is FMV. The market calls `apply_price_drift` before that read, same as portfolio and reveal. A listing priced below that estimate can show `{n}% below market`. The client does not invent a discount.

Search and filters run on the loaded board. There is no server catalog search. Advanced filters use chips. Bottom sheets wait for the sheet component.

Favorites are omitted. There is no favorite store.

Adding a listing from listing detail uses **Add to Cart** (stays on the listing) or **Buy Now** (opens Review Purchase). Buy Now still does not charge. Confirm Purchase on the review step charges.

### No partial checkout

If any cart line is invalid or its authoritative price or quantity differs from what the user confirmed, the whole checkout stops and rolls back.

The client refreshes the affected lines, shows what changed, and requires confirmation again.

```text
Your cart changed

One or more items changed since you reviewed your order.
```

There is one checkout path for mixed carts. Pack lines and marketplace lines commit in the same transaction or not at all.

### Marketplace price changes

The client sends the price it showed the user. The server compares that snapshot to the locked listing price.

A higher or lower price is rejected. The client shows:

```text
Price changed

Previous price → Current price

Seller changed the price.

[Accept]
[Remove]
```

Accepting writes a new snapshot only after the user confirms. Checkout then uses that snapshot. The server still compares it to the locked row.

Invalid lines stay in the cart until the user removes them or accepts the new price. The client does not silently delete them.

### Pack prices

`pack_skus.price_cents` does not drift. Pack price changes are a catalog edit, not a market walk.

### Price drift

Only `catalog_items.current_value_cents` drifts. This is an estimate for portfolio display. It is not a charge.

Rules:

- Step size is 0.3% (`30` basis points) of `base_value_cents`, using integer division.
- The value stays inside 70% to 130% of `base_value_cents`. Those bounds are integer cents. A result below 1 cent is stored as 1 cent.
- The hour bucket is `floor(extract(epoch from now()) / 3600)`. One step happens per hour. The walk is a 400-hour triangle, so it reaches both edges and turns around. An item's place on that triangle comes from the first four bytes of `catalog_item_id`, so the catalog does not move as one price.
- `drifted_value_cents` is that function. `apply_price_drift` writes `current_value_cents` for the current hour. Portfolio, reveal, and the market call it before they read. A second call in the same hour does not take another step.
- This is polling on read, not a realtime channel. The estimate changes when the hour changes. A channel would not publish new cents any earlier, and there is no worker to wake up for the hour. `base_value_cents` stays the seed. `pack_skus.price_cents` is not updated.

### Reveal

Pack contents are chosen in the checkout transaction and inserted into `pack_contents` before commit.

The reveal animation plays that stored order. It does not roll, reroll, or reorder by rarity.

Server-provided order is common cards first and the rarest card last. The client does not recompute rarity.

`pack_contents` has no client update or delete path. Authenticated and anonymous roles cannot update or delete those rows.

Reveal progress is stored on `purchased_packs` (`reveal_state` and how far the open got). If the app is backgrounded or killed, the client reloads that state:

- completed packs stay complete
- the interrupted pack resumes or is summarized
- later packs stay sealed

Closing the app, replaying the animation, or calling an API again must not change contents.

A drag that has not stored `OPEN` is dropped when the app backgrounds. The sleeve returns to sealed and that gesture does not call the server. A tear that already called the server keeps its stored step. Reopening an `OPEN`, `REVEALING_CARD`, or `CARD_REVEALED` pack shows the stored card and writes only the missing forward steps. A finished multi-pack purchase opens on the summary. Packs after the interrupted one stay sealed.

A multi-pack purchase opens in checkout order. The first two trading-card packs use the full tear. From the third pack, Fast Open is a press, not a timer. It plays a short tear and the stored card, then a fan of cards already opened. Epic and legendary cards interrupt that pace. The summary after the last pack adds acquisition prices and catalog values as integer cents. One pack does not show the summary.

Reduce motion follows the system setting. It replaces the sleeve travel and the long hold with a fade and a scale from 0.96 to 1. The same reveal steps still store the same card. `Reveal next card` opens a sealed pack in that mode. `Skip animation` ends the hold early and still writes the next forward step. Haptics off skips the motor cues. The rarity, name, and estimated value stay on screen. A revealed card is announced as `{Rarity} card revealed. {Name}. Estimated value {spoken cents}.` Whole dollars are spoken as dollars. A remainder is spoken from the integer cents. The action after a card, when another pack remains, is `Reveal next card`.

### Portfolio

Opened holdings are the portfolio. A sealed trading card stays out of the totals until the pack is complete, so its name and value are not shown early.

Total portfolio value is the sum of `catalog_items.current_value_cents`. P&L is that value minus `owned_items.acquisition_price_cents`, both integer cents from the server. The client does not price a holding with a float. Percent next to P&L is all-time versus acquisition cost, not a 7D/1M period. There is no trend chart until a history exists.

Filters are Cards, Sneakers, Watches, Listed, plus All. Sort is Value, P&L, or Recently Acquired. Ties keep the newer holding first. The grid shows generated art or a stored image, the name, rarity, current value, all-time P&L, and a LISTED badge with the listing price when the item is for sale.

Tapping a holding opens the existing listing screen for details, list, edit, and delist. Sealed packs stay above the grid and open Reveal.

### Drops

Drop status is derived in Postgres from `now()`, `starts_at`, `ends_at`, and remaining stock:

| Status | Condition |
| --- | --- |
| `UPCOMING` | `now() < starts_at` |
| `LIVE` | window open and reservable stock remains |
| `SOLD_OUT` | window open and no reservable stock |
| `ENDED` | `now() >= ends_at` |

The client does not decide whether a drop is live.

Countdown uses a server timestamp returned with the payload. The client keeps an offset (`serverNow - deviceNow` at fetch) and a monotonic clock for the ticks. A wrong device clock must not start or end a drop.

Checkout locks the drop row and rechecks the window. A public `SOLD_OUT` badge does not block a buyer who already holds the last units inside that window. A realtime "LIVE" badge is not permission to purchase.

Per-user limits (for example 10 packs of a drop SKU) are enforced when a hold is created and again inside the checkout transaction.

### Realtime versus authority

Realtime and cached reads tell the UI what probably exists.

Postgres row locks and conditional updates decide what exists when money, stock, or ownership moves.

On every return to the foreground (`AppState` → `active`), refresh:

- wallet
- cart and reservations
- active drops
- marketplace listing states used on screen
- pending checkout status
- pack reveal progress

Also refresh when the cart screen opens, the user pulls to refresh, a visible reservation hits `expires_at`, or checkout opens.

Cached inventory is never the checkout authority.

### Offline

Connectivity states: `ONLINE`, `RECONNECTING`, `OFFLINE`.

Offline UI may show the last snapshot and must say it may be stale.

These actions stay disabled offline:

- checkout
- deposit
- list, edit listing, delist
- marketplace buy
- reservation create, release, or retry

The client does not optimistically apply financial actions.

### Unknown checkout result

If the client sends checkout and does not receive a response, it must not show "Purchase failed".

Copy:

```text
Confirming purchase…

Your order may have completed.
We're checking before retrying.
```

The retry uses the same idempotency key.

The client stores that key in persistent local storage until a receipt is acknowledged. If the process is killed after send, the next launch retries the same key instead of starting a second purchase.

## Idempotency

Checkout, and deposit where a retry can double-credit, require an idempotency key generated by the client once per user attempt. A double tap or a timeout retry reuses that key. A new attempt after a confirmed failure may use a new key.

Storage:

```text
idempotency_records (user_id, operation, idempotency_key) UNIQUE
```

`purchases` also has a unique `(user_id, idempotency_key)`.

The idempotency row is inserted at the start of the same database transaction as the money movement.

Postgres unique-index locking gives this behavior:

| Situation | Result |
| --- | --- |
| First request commits | Row is `COMPLETED` and stores `response_json` |
| Retry after commit | Insert conflicts, function returns the stored response, no second purchase |
| First request rolls back | Insert rolls back with it. The same key may be tried again |
| Second request arrives while the first transaction is open | It waits on the unique index. It does not start parallel work |
| Wait exceeds the request budget | Return `IDEMPOTENCY_IN_PROGRESS`. Do not start a second purchase |

Do not commit a `PROCESSING` row in a separate transaction and then leave it forever if the worker dies.

Do not persist `FAILED` for conditions that can change, such as insufficient balance or an expired reservation. Replaying a stored failure after the user deposits or reserves again would be wrong. Those failures roll back, including the idempotency insert.

A stored `COMPLETED` response is immutable.

## Checkout transaction ownership

The Edge Function is the HTTP boundary. It:

1. verifies the user JWT
2. validates the body shape (`cartId`, `idempotencyKey`, `expectedTotalCents`, and line snapshots)
3. calls one Postgres function
4. maps raised domain errors to the error model

The Postgres function owns the transaction. Supabase RPC runs it as a single transaction. The Edge Function must not perform stock, wallet, ledger, ownership, or pack-content writes of its own.

Inside that function, in order:

1. claim the idempotency key, or return the stored receipt
2. lock the buyer wallet row
3. release expired reservations that this checkout depends on
4. lock pack SKU rows and listing rows
5. validate reservation ownership, quantity, drop window, purchase limits, listing status, seller, and price snapshots
6. compute the authoritative total in cents
7. reject when `expectedTotalCents` does not match (`CHECKOUT_TOTAL_CHANGED` or a more specific line code)
8. reject when the locked balance is insufficient (`INSUFFICIENT_BALANCE`)
9. insert `purchases` and `purchased_packs`
10. generate and insert `pack_contents`
11. debit the buyer, credit the seller net, insert the fee, append ledger rows, update the cached wallet balances
12. consume reservations and stock
13. transfer marketplace ownership and mark listings sold
14. store the receipt on the idempotency row
15. commit

Any error rolls the entire function back.

Wallet balance updates and ledger inserts happen in this same transaction. A balance change without a ledger row is a defect.

The cached `wallets.balance_cents` must match the sum of that user's ledger. `CHECK (balance_cents >= 0)` is necessary and not sufficient. The function also checks the locked balance before debiting.

## Security

Row Level Security is enabled on every application table.

Authenticated users may read their own profile, wallet, ledger, carts, purchases, purchased packs, and owned items. They may browse active pack SKUs, active drops, and active listings.

The client cannot directly:

- change stock counters
- change wallet balances
- insert ledger rows
- transfer ownership
- mark listings sold
- insert or edit pack contents

Those writes are granted only to security-definer functions that check `auth.uid()` and row ownership. Direct table grants for those mutations are revoked from `anon` and `authenticated`.

A malicious body cannot set the price, the fee, or the pack contents. The function recomputes them from locked rows.

## API errors

Predictable failures use a typed code, a human message, and details. They are not generic 500s.

Initial codes:

```text
PACK_SOLD_OUT
PACK_QUANTITY_CHANGED
RESERVATION_EXPIRED
DROP_NOT_STARTED
DROP_ENDED
PURCHASE_LIMIT_REACHED
LISTING_SOLD
LISTING_DELISTED
LISTING_PRICE_CHANGED
SELF_PURCHASE_FORBIDDEN
INSUFFICIENT_BALANCE
CHECKOUT_TOTAL_CHANGED
IDEMPOTENCY_IN_PROGRESS
```

Example:

```json
{
  "code": "LISTING_PRICE_CHANGED",
  "message": "The seller changed the price.",
  "details": {
    "previousPriceCents": 42000,
    "currentPriceCents": 45000
  }
}
```

## Schema conventions

Use `TEXT` plus `CHECK` constraints for statuses and categories. Avoid Postgres enums so a later migration can add a status.

Primary keys are `UUID`.

Timestamps are `timestamptz`, default `now()`, written by the database.

Foreign keys are declared. Lookup and uniqueness indexes are declared with the table, not added later as a fix.

Notable uniqueness:

- one open cart per user
- one active reservation per cart line
- one active marketplace listing per owned item
- unique `(user_id, idempotency_key)` on purchases
- unique `(user_id, operation, idempotency_key)` on idempotency records
- pack odds for a SKU sum to `10000` basis points

Categories: `TRADING_CARD`, `WATCH`, `SNEAKER`.

## Client architecture

| Topic | Decision |
| --- | --- |
| Workflow | Expo managed, Continuous Native Generation, TypeScript strict |
| Native projects | Do not commit `ios/` or `android/`. Config plugins only |
| Trial platform | Android |
| Navigation | React Navigation under `app/src/navigation/`. This repo's `app/` directory is the mobile package, not Expo Router routes |
| Server cache | TanStack Query. Cached data is a snapshot and is invalidated on focus, foreground, and pull to refresh |
| Local UI state | React state for screens. A small store only for connectivity and in-progress checkout identity |
| Money | `bigint` cents until the display formatter |

Do not introduce Express, Fastify, NestJS, Firebase, MongoDB, Redis, or a second backend.

### Hosted Supabase

Day-to-day development stays on the local stack (`npx supabase start`). A shared APK cannot use `127.0.0.1` or `10.0.2.2`.

The hosted project is `zboczfalxtuspnodveer` (`https://zboczfalxtuspnodveer.supabase.co`). It has the same migrations, seed, and Edge Functions as the local stack. `npm run apk` embeds that project's URL and anon key. The service-role key stays off the client. Local Docker remains the database for development and SQL tests.

## Scope cuts

Cut first if the schedule slips. Do not cut transaction correctness to finish these.

| Cut | Reason |
| --- | --- |
| Reveal animations for sneakers and watches | The card reveal is for trading-card packs. Other categories can open with a simpler presentation |
| Admin visual polish | The admin screen is a thin numbers screen |
| Advanced search | Not required to prove inventory, checkout, or marketplace integrity |
| Visual effects outside the reveal | They do not protect money or inventory |
| Extra services (Redis, workers, a separate API) | Postgres transactions and Edge Functions are the boundary |

The shareable Android build is the release APK from `npm run apk`, pointed at the hosted project.

## Documentation timing

`EDGE_CASES.md` records cases the schema and the app handle. Status values are only `Handled`, `Partially Handled`, or `Cut`.

`ARCHITECTURE.md` is the two-page summary. `README.md` is the setup, the test commands, and the scope cuts.

## Implementation checklist

`Done` means that work is in this repo.

| # | Scope | Status |
| --- | --- | --- |
| 0 | Audit and this decision record | Done |
| 1 | Migrations, constraints, RLS, seed structure, foundation docs | Done |
| 2 | Email/password auth, wallet, mock deposit, catalog and pack seed | Done |
| 3 | Evergreen shelf and pack detail | Done |
| 4 | Pack reservations and cart | Done |
| 5 | Atomic pack checkout | Done |
| 6 | `scripts/hammer.ts` concurrency proof | Done |
| 7 | Timed drops and server-based countdown | Done |
| 8 | Marketplace listing create, reprice, delist | Done |
| 9 | Marketplace browse and mixed cart | Done |
| 10 | One checkout transaction for packs and listings | Done |
| 11 | QA menu backed by real server mutations | Done |
| 12 | Gesture card reveal and haptics | Done |
| 13 | 10-pack pacing and summary | Done |
| 14 | Reveal recovery after background or kill | Done |
| 15 | Reduce motion, haptics off, screen reader | Done |
| 16 | Portfolio value and P&L | Done |
| 17 | Integer price drift for collectibles only | Done |
| 18 | Expected value, fee integrity, reconciliation queries | Done |
| 19 | Thin admin numbers screen | Done |
| 20 | UX states and specific domain copy | Done |
| 21 | Full concurrency and failure pass | Done |
| 22 | Performance and gesture polish | Done |
| 23 | Final README, decisions, edge cases, architecture | Done |
| 24 | Hosted Supabase for the shared APK: link the project, apply migrations, seed, and Edge Functions | Done |
| 25 | Installable Android APK pointed at the hosted project | Done |
| 26 | Requirement audit | Not started |

`npm run apk` builds the release APK. The bundle embeds the hosted project and does not read `app/.env`. The requirement audit has not been done.
