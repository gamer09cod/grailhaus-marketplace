# Edge cases

Status values are `Handled`, `Partially Handled`, or `Cut`. The wallet, shelf, drops, market, cart, checkout, listing, hidden QA, trading-card reveal, 10-pack pacing, reveal recovery, reveal accessibility, portfolio, collectible price drift, the economic reconciliation, the thin admin screen, the screen-state copy, the concurrency and failure proofs, and the list and gesture polish are in place.

| Scenario | System behaviour | What the user sees | Status |
| --- | --- | --- | --- |
| Wallet balance set below zero, including when a matching debit exists | `wallets_balance_nonnegative` rejects the write | The update does not commit | Handled |
| Wallet balance changed with no ledger row | Balance trigger requires the new balance to equal the ledger sum | The update does not commit | Handled |
| Ledger row inserted without updating the wallet | Deferred check rejects the commit | The insert does not commit | Handled |
| Ledger row updated or deleted | Append-only trigger rejects the change | History stays as written | Handled |
| Deposit amount is negative, or a fee is booked to a user | Sign check rejects the row. Fees have a null user and a positive amount | The entry does not commit | Handled |
| Same deposit or purchase reference is applied twice | Unique index on entry type, reference, and account | The second entry does not commit | Handled |
| Two active listings for one owned item | Partial unique index on `owned_item_id` where status is `ACTIVE` | The second listing does not commit | Handled |
| Active listing while the item is still `OWNED` | Deferred check requires `LISTED` and `seller_id = owner_id` | The transaction does not commit | Handled |
| Owned item left `TRANSFERRING` at commit | Deferred check rejects `TRANSFERRING` | The transaction does not commit | Handled |
| Pack odds do not sum to 10000 basis points | Deferred check rejects the SKU's odds | The odds do not commit | Handled |
| Direct edit of `stock_on_hand` or `stock_reserved` | Stock guard rejects writes that did not come from a reservation transition | The counters stay put | Handled |
| Reservation asks for more units than are reservable | Conditional stock update matches no row and the reservation insert fails | The hold is not created | Handled |
| Reservation expiry is more than 5 minutes out, or already past | Insert checks `now()` inside Postgres | The hold is not created | Handled |
| Reservation expires and the sweep runs | `release_expired_reservations` marks it `EXPIRED` and returns reserved stock | The line shows `Reservation expired` and `Reserve Again`. Stock is available again | Handled |
| Sweep runs while a hold is still in the future | Only rows with `expires_at <= now()` change | The cart countdown continues | Handled |
| Reservation is consumed | `stock_on_hand` and `stock_reserved` both decrease by the reserved quantity | The cart payment consumes the hold. The receipt says the packs are sealed | Handled |
| Second open cart for the same user | Partial unique index | The second cart does not commit | Handled |
| Marketplace cart line quantity is not 1 | Cart line shape check | The line does not commit | Handled |
| Purchased pack commits with no contents | Deferred check requires at least one content row | The pack does not commit | Handled |
| Pack contents are not common-first | Reveal order must be contiguous and rarity rank must not fall | The pack does not commit | Handled |
| Pack contents are updated or deleted after insert | Append-only trigger | The stored pull cannot be edited | Handled |
| Signed-in client updates a wallet or inserts a ledger row | Write grants are revoked and there is no write policy | The API returns a permission error | Handled |
| Anonymous client reads wallets | `anon` has no select grant | The read is denied | Handled |
| User reads another user's wallet or ledger | Select policies allow only `auth.uid()` | Those rows are not in the result | Handled |
| User reads another seller's active listing | Active listings are selectable by signed-in users | The market shows the active listing. A delisted listing does not appear | Handled |
| Same purchase idempotency key is inserted twice | Unique `(user_id, idempotency_key)` on purchases | The second purchase row does not commit | Handled |
| Same idempotency record is inserted twice | Primary key on user, operation, and key | The second record does not commit | Handled |
| `COMPLETED` idempotency row has no stored response | Check requires `response_json` when status is `COMPLETED` | The row does not commit | Handled |
| Drop opening supply does not match the SKU | Deferred check requires `initial_stock = stock_total` | The drop does not commit | Handled |
| Drop status asked from a wrong device clock | Status is derived from Postgres `now()`, not a client timestamp | The drop does not open or close early | Handled |
| 8% fee on $450 and on 1 cent | `marketplace_fee_cents` floors. $450 -> $36 fee. 1 cent -> 0 fee | The listing screen shows the server fee. A $450 price previews $36. A 1 cent price previews no fee | Handled |
| Reviewer signs in | Email and password against Supabase Auth. Confirmations are off locally | Wallet shows `$10,000.00` | Handled |
| New account is created | Signup trigger inserts a profile and a zero wallet. No opening deposit | Create-account copy says the account starts at `$0.00`. The wallet shows `$0.00` | Handled |
| Wallet screen loads the catalog | Signed-in select of `catalog_items` and `pack_skus` | `37 collectibles across 16 packs` | Handled |
| Mock deposit of $100 | Edge function calls `deposit`. One ledger row and the cached balance commit together. Presets only fill the amount; the sheet footer confirms | Balance increases by `$100.00` and the screen says `Deposited $100.00.` | Handled |
| Deposit sheet is dismissed while confirming | Scrim, Close, and drag dismiss stay blocked while the request is in flight | Sheet stays open with `Confirming deposit…` | Handled |
| Same deposit key is sent again | Completed idempotency row returns the stored receipt. No second ledger row | Balance does not increase a second time | Handled |
| Same deposit key is sent with a different amount | `IDEMPOTENCY_KEY_REUSED` | The deposit is rejected. The balance stays on the original amount | Handled |
| Deposit amount is `$0` or above `$1,000,000` | Edge function rejects the body. The database cap rejects a bypass | `Enter an amount from $0.01 to $1,000,000.` | Handled |
| Deposit response is lost or the server returns 500 | The client keeps the idempotency key | `Confirming deposit… This deposit may have completed. We're checking before retrying.` Check again reuses the key | Handled |
| Device is offline when depositing | The wallet disables the deposit controls | `You're offline. Deposits stay disabled until the connection returns.` | Handled |
| Evergreen shelf loads | Signed-in read of active `pack_skus` with `is_drop` false | Home shows featured packs and Trading Cards, Sneakers, and Watches | Handled |
| Shelf request fails | The query error is surfaced | `The shelf didn't load. Check the connection and try again.` Try again refetches | Handled |
| A category has no evergreen packs | The category list is empty | `Nothing in [category] is on the shelf.` | Handled |
| Pack detail shows odds and stock | Odds are read from `pack_odds`. Availability is `stock_on_hand - stock_reserved` | Price, tier, category, odds, and `500 available` or `Sold out` | Handled |
| Reserve a pack | One transaction locks the SKU, inserts the cart line, and creates a 5-minute hold | Cart shows `Reserved for 04:32` | Handled |
| Same reserve key is sent again | The completed idempotency row is returned. Stock is unchanged | The cart does not gain a second hold | Handled |
| Two buyers reserve the last units together | The SKU row lock lets one update succeed. The other gets `INSUFFICIENT_STOCK` | The loser sees `Not enough packs are available.` Stock stays non-negative | Handled |
| Reservation reaches `expires_at` | The next cart read releases due holds and returns the units | The line stays. `Reservation expired` and `Reserve Again` | Handled |
| Expired hold is offered to checkout | Checkout releases due holds, then raises `RESERVATION_EXPIRED` and rolls the payment back | The payment is rejected. The line can be reserved again | Handled |
| Pack price changes while the line is in the cart | The line stays. State is `PRICE_CHANGED` until the user accepts | `Price changed`, `$X → $Y`, `The pack price changed.`, `Accept`, and `Remove` | Handled |
| User removes a cart line | The hold is released and `removed_at` is set. The row is not deleted | The line leaves the cart | Handled |
| Only some of the requested packs remain | The line quantity is not reduced | `Only N are available. This line is unchanged. Remove it, then reserve N from the shelf.` | Handled |
| Device is offline in the cart | Reserve, remove, retry, accept, and pay stay disabled. The last cart may remain | `You're offline. This cart may be out of date. Reservations stay disabled until the connection returns.` | Handled |
| Cart has no lines | The open cart has nothing to pay | `Your cart is empty. Browse the shelf or the market.` | Handled |
| Reservation response is lost | The client keeps the idempotency key | `Confirming reservation… This hold may have completed. We're checking before retrying.` | Handled |
| Device is offline on the shelf | Last snapshot may remain. The screen says it may be stale | `You're offline. This shelf may be out of date.` | Handled |
| Timed drop on the evergreen shelf | Drop SKUs stay out of the shelf query. The Drops screen reads `drop_board` | Packs has a Drops chip. Evergreen packs do not include Midnight Drop | Handled |
| Drop has not started | Reserve locks the drop and raises `DROP_NOT_LIVE` | `That drop is not open.` The screen shows `Starts in 00:03:42` from `serverNow` | Handled |
| Drop starts while the screen is open | Status is derived again after the countdown reaches the server boundary | `LIVE`, remaining, and `Ends in` replace the start countdown | Handled |
| Drop ends while checkout is open | Checkout raises `DROP_ENDED` and rolls the charge back | `That drop has ended.` The wallet is unchanged | Handled |
| Last units are already in the cart | Public status is `SOLD_OUT` because nothing else is reservable. The holder's checkout still checks only the window | `SOLD OUT` for everyone else. The holder can pay | Handled |
| Two buyers want the last drop unit | The SKU lock lets one reservation succeed | The other sees `Not enough packs are available.` | Handled |
| Quantity passes the per-user limit | The reservation insert raises `PURCHASE_LIMIT` before a hold is written | `You have reached the limit for this pack.` The screen says `Maximum 10 packs per user` | Handled |
| Device clock is wrong | `drop_board` returns `serverNow`. The client ticks from that offset and does not send its clock | The drop does not open or close early | Handled |
| Pack odds omit a rarity that has no pool item | Deferred coverage check rejects the commit | The odds do not commit | Handled |
| Seeded pack expected value reaches the pack price | Seed raises before it finishes | The catalog is not published in that state | Handled |
| Cart line quantity changes while a hold is active | Update of the line's identity columns is rejected | The line stays as reserved | Handled |
| Two buyers take the last units at once | The reservation update locks the SKU and re-checks reservable quantity. A buyer without a hold cannot check those units out | The loser sees `Not enough packs are available.` | Handled |
| 100 buyers try to buy the last 10 units | `npm run hammer` reserves and checks out concurrently. Sold units equal the opening stock | No screen. The report says `Oversell: NO` and `Final stock: 0` | Handled |
| Five buyers each ask for 4 packs when 10 remain | The same hammer sells 8, a multiple of the quantity, and leaves 2. It does not sell a partial line | No screen. `Oversell: NO` and `Final stock: 2` | Handled |
| One wallet spends from two devices at once | The second checkout waits on the wallet lock and does not debit twice | No screen. The hammer leaves the balance at zero, not negative | Handled |
| The same checkout key is sent twice at once | The second call waits, then returns the stored receipt | No screen. One purchase, two receipts, no second debit | Handled |
| Checkout response is lost and the client retries | The same idempotency key returns the stored receipt. No second charge. A timeout after the server commits is the same path | `Confirming purchase… Your order may have completed. We're checking before retrying.` Check again reuses the key | Handled |
| Pay is tapped twice | A synchronous lock ignores the second tap, so it cannot mint a second key | One confirming purchase. One charge | Handled |
| App is killed during checkout | The payment key is stored until a receipt or a definite rejection. The next launch sends that same key. While offline, that retry waits | `Confirming purchase… Your order may have completed. We're checking before retrying.` | Handled |
| App is backgrounded during checkout | The cart refreshes when the app is active again. The in-memory key stays, and the stored key covers a later kill | The purchase keeps confirming, or the receipt is already on screen | Handled |
| Device is in airplane mode during checkout | Pay stays disabled while offline. A stored payment is not sent until the connection returns | `You're offline. This cart may be out of date. Reservations stay disabled until the connection returns.` | Handled |
| Expired hold races a new reserve of the last unit | The sweep releases the hold before either checkout or the new reserve proceeds. The expired checkout charges nothing. The new reserve holds the unit | The holder sees `These packs are no longer reserved.` The other buyer can reserve | Handled |
| App is backgrounded while a reservation expires | The cart refreshes on foreground and the sweep releases due holds | The line shows `Reservation expired` and `Reserve Again` | Handled |
| Seller lists an owned item | One transaction locks the item, inserts one active listing, and marks it `LISTED`. Price and fee preview live in a confirmation sheet; list starts only from that footer | Collection shows `List for sale`. The sheet shows the server fee and `You receive` | Handled |
| Seller confirms delist | Delist opens a confirmation sheet. Remove listing starts the request; Keep listing closes the sheet | `Remove this listing? The item stays in your portfolio.` | Handled |
| Bottom sheet minor choice | Quantity, filters, sort, deposit, listing price, delist, and activity details use `AppBottomSheet` | Scrim, Close, Escape, and drag dismiss. Financial sheets fade only | Handled |
| Seller lists the same item twice | The second call raises `LISTING_ALREADY_ACTIVE`. Two concurrent calls leave one active listing | `That item is already listed.` | Handled |
| Seller changes the listing price | `reprice_listing` locks the active listing and writes the new price. A replay of the same key does not apply a later price | `Save price` | Handled |
| Seller delists | The listing becomes `DELISTED` and the item returns to `OWNED` | `Delist` | Handled |
| Seller lists an item they do not own | `ITEM_NOT_OWNED`. A transferred item stays with the new owner | `You do not own that item.` | Handled |
| Seller edits or delists a sold listing | The row stays `SOLD`. The price and `sold_at` do not change | `That listing has already sold.` | Handled |
| Listing price is not positive | `INVALID_PRICE`. No listing row is written | `Enter a price greater than zero.` | Handled |
| Device is offline on a listing | List, reprice, and delist stay disabled. The last item may remain | `You're offline. This item may be out of date. Listing, price changes, and delist stay disabled until the connection returns.` | Handled |
| Device is offline on the market | Add to cart stays disabled. The last listings may remain | `You're offline. These listings may be out of date. Adding a listing stays disabled until the connection returns.` | Handled |
| Buyer browses active listings | `marketplace_board` returns the item, price, seller, listed time, and catalog estimate. The buyer's own listing is marked and cannot be added | Market shows the price, FMV when the estimate is present, and opens listing detail | Handled |
| Buyer opens a listing | The market card opens listing detail. Add to cart stays on that screen. Buy Now adds the listing and opens Cart; Pay on Cart charges | Listing price, seller, fee preview, `Add to Cart`, `Buy Now` | Handled |
| Seller reprices while a buyer is on listing detail | The reviewed price stays on screen. Confirm actions stay disabled until the buyer reviews the new price | `Seller updated the price`, `$X → $Y`, `Review New Price` | Handled |
| Listing sells or leaves the board while a buyer is on listing detail | The listing is gone from `marketplace_board`. Sold and delisted are not distinguishable for another buyer | `This item has sold` / `Another collector purchased this listing.` / `Browse Similar` | Partially Handled |
| Buyer adds a listing to the cart | Quantity is 1. No reservation is created | Cart shows the shown price, current price, seller, and `Available` | Handled |
| Seller reprices while the listing is in a cart | The line stays. State is `LISTING_PRICE_CHANGED` until the buyer accepts | `Price changed`, `$X → $Y`, `Seller changed the price.`, `Accept`, and `Remove` | Handled |
| Seller delists while the listing is in a cart | The line stays. State is `LISTING_DELISTED`. Accepting the price is rejected | `The seller removed this listing. Remove it from your cart, or browse what is still for sale.` `Browse Marketplace` and `Remove` | Handled |
| Someone else buys the listing while it is in a cart | The line stays. State is `LISTING_SOLD`. A pack line in the same cart is unchanged. Checkout of that cart raises `LISTING_SOLD` and charges nothing | `This listing has already sold. Browse similar listings or remove it from your cart.` `Browse Marketplace` and `Remove` | Handled |
| Buyer adds their own listing | `SELF_PURCHASE_FORBIDDEN` | `You cannot buy your own listing.` | Handled |
| Seller reprices while a buyer checks out | The listing lock lets one of them commit. A sale keeps the snapshot price, credits the seller the remainder after the floored fee, and rejects the new price. A reprice that commits first leaves the listing active at the new price and charges nothing | One side sees the receipt. The other sees `The seller changed the price.` or `That listing has been sold.` | Handled |
| Seller delists while a buyer checks out | The listing lock lets one of them commit. A sale transfers the item. A delist that commits first returns the item to the seller and charges nothing | One side sees the receipt. The other sees `The seller removed this listing.` or `That listing has been sold.` | Handled |
| Two buyers pay for one listing | The listing row lock lets one checkout transfer it. The other raises `LISTING_SOLD` | One buyer sees the receipt. The other sees `That listing has been sold.` | Handled |
| Buyer pays for their own listing | `SELF_PURCHASE_FORBIDDEN`. The listing stays active | `You cannot buy your own listing.` | Handled |
| Pack and listing are paid together | One transaction debits the buyer for both, credits the seller the remainder, records the fee, consumes the pack hold, and transfers the item | Cart shows `Pay · $X`. The receipt names the sealed packs and the listings | Handled |
| Same account spends from two devices | Checkout locks the wallet first. The second payment waits, then fails once the cart is checked out | One receipt. The wallet is not charged twice | Handled |
| Pack checkout total does not match the cart | `CHECKOUT_TOTAL_CHANGED`. Nothing is charged | `The total changed. Review your cart before paying.` | Handled |
| Pack checkout quantity does not match the hold | `QUANTITY_CHANGED`. Nothing is charged | `The quantity in your cart changed. Review it before paying.` | Handled |
| Wallet cannot cover the pack total | `INSUFFICIENT_BALANCE`. The hold stays | `You do not have enough in your wallet.` | Handled |
| Sold-out pack is offered after the hold is gone | `SOLD_OUT` when nothing remains on hand. The cart line stays until the buyer removes it | `That pack is sold out. Remove it from your cart.` | Handled |
| Checkout omits a cart line | `CART_CHANGED`. A pack hold in that cart stays active | `Your cart changed. One or more items changed. Check the cart and pay again.` | Handled |
| Portfolio has no holdings | No opened items and no sealed packs | `Start your collection` / `Open your first pack or purchase a collectible from the market.` Explore Packs and Browse Market | Handled |
| Device is offline on the portfolio | Delist stays disabled. The last holdings may remain | `You're offline. This portfolio may be out of date. Listing and delist stay disabled until the connection returns.` | Handled |
| Sign-in email or password is wrong | Auth rejects the credentials. No session is stored | `That email or password is wrong. Try again.` | Handled |
| Wallet activity has no rows | Own ledger is empty | `No activity yet. Deposits, purchases, and sales show up here.` | Handled |
| Purchases list is empty | Own purchases is empty | `You haven't purchased yet. Packs and market listings you buy show up here.` | Handled |
| Activity or purchases fail to load | The select errors. Nothing is invented | `Your activity didn't load. Check the connection and try again.` / `Your purchases didn't load. Check the connection and try again.` | Handled |
| Sign out fails | Auth does not clear the session | `Sign out did not finish. Check the connection and try again.` | Handled |
| QA: another user buys N packs | The stand-in buyer reserves and checks out through the pack purchase path. The reviewer's wallet is unchanged | Shelf available count drops. Pull to refresh or a stock change reloads it | Handled |
| QA: seller reprices, delists, or sells elsewhere | The seller's listing function or the stand-in checkout runs. A buyer who still holds the line sees the new state, and checkout rejects it | Cart shows the price change, `The seller removed this listing.`, or `This listing has already sold.` | Handled |
| QA: start or end a drop | `starts_at` and `ends_at` move. Status is still derived from `now()` | Drops shows `LIVE` or `ENDED` after the board reloads | Handled |
| QA: set my balance | A deposit or a negative `QA_ADJUSTMENT` posts first. The wallet is then set to the ledger sum | Wallet shows the new balance on focus or when the wallet row changes | Handled |
| QA: expire my reservation | Expiry moves under the admin flag, then the normal sweep marks the hold `EXPIRED` and returns stock | Cart shows `Reservation expired` and `Reserve Again` | Handled |
| Someone other than a reviewer opens QA actions | `QA_FORBIDDEN`. No stock, listing, or wallet row changes | `This menu is for the reviewer accounts.` | Handled |
| Tap a sealed trading-card pack | The gesture treats a tiny movement as not a tear. No reveal request is sent | `Sealed. Drag down to tear it open.` | Handled |
| Slow drag released before the tear | The sleeve springs shut. The pack stays `SEALED` | `It springs shut.` then the sealed line | Handled |
| Fast flick, or a long pull | Distance and speed decide the tear. The server stores `OPEN` and then the later reveal steps. `pack_contents` is unchanged | The stored card name appears after the tear | Handled |
| Slow drag to the same short position as a flick | Speed is too low, so the sleeve springs shut | The pack stays sealed | Handled |
| A timer opens a sealed pack | No timer starts the tear. Packs 1 and 2 wait for the gesture. Later packs open only after Fast Open is pressed | The pack stays sealed until that gesture or press | Handled |
| First two packs in a multi-pack open | Fast Open is not offered. The tear is the same gesture as one pack | `Pack 1 of 10` and `Sealed. Drag down to tear it open.` | Handled |
| Packs after the second | Fast Open plays a short tear, then the stored card, then a fan of cards already opened in this purchase. Contents are not redrawn | `Speed up remaining packs?`, `Fast Open`, then the stored name and `Best` on the top card | Handled |
| Epic or legendary during Fast Open | `openMode` returns `premium`. The short tear still runs, then the longer hold and rarity glow. Fast Open is offered again on the next sealed pack | `Premium pull. Hold on.` then the stored card | Handled |
| Epic or legendary card after pack 2 | Fast pacing stops for that card. The longer hold and brighter frame play the stored card | `Hold on.` then that card | Handled |
| Summary after the last pack of a multi-pack open | Counts the packs. Sums acquisition prices and catalog values as integer cents. Names the best stored card by rarity, then value | `10 Packs Opened`, `Total spent`, `Collection value`, `Best pull` with rarity and cents, `View Portfolio` | Handled |
| One purchased pack | No summary. Done still completes that pack | `This pack is open.` | Handled |
| Reveal skips ahead or another user opens the pack | `REVEAL_STEP` or `PACK_NOT_FOUND`. Contents stay as drawn | `Open this pack in order. A tap does not finish it.` or `That pack is not in your collection.` | Handled |
| Same reveal key is sent again | The stored response is returned. The row does not move backward and contents do not change | The open pack stays open | Handled |
| Sneaker or watch pack uses the card gesture | `REVEAL_CATEGORY`. The item remains in the collection | `This pack is in your collection.` | Handled |
| Haptics turned off | The reveal screen skips haptic calls. The card name, rarity, and value still render. The spoken line uses that same stored card | `Haptics off`, then the stored card | Handled |
| Reduce motion | The sleeve does not travel. A fade and a scale from 0.96 to 1 play the stored card through the same reveal steps | `Sealed. Reveal next card.` then that card | Handled |
| Skip animation | The hold ends. The next forward reveal step is still written. Contents are not redrawn | `Skip animation`, then the stored card | Handled |
| Screen reader reads a revealed card | The announcement uses the stored rarity, name, and integer cents. Another pack's action is `Reveal next card` | `Rare card revealed. Eclipse Sovereign. Estimated value 120 dollars.` | Handled |
| High-rarity card | The stored card is unchanged. The pause is longer, the frame brightens, and the haptic is stronger when haptics are on | `Hold on.` then that same card | Handled |
| Sealed trading card listed by name before it is opened | The owned item is hidden until `PACK_COMPLETE`. The collection shows the pack name as sealed | `Sealed` on the pack. The card name appears after Done | Handled |
| App is killed before the tear is stored | `reveal_state` stays `SEALED`. A later open starts the gesture again. Contents are still the checkout draw | The pack is sealed again | Handled |
| App is killed after an earlier pack in the purchase is complete | Completed packs stay complete. Reopening continues at the first pack that is not complete. That position still chooses the full tear or Fast Open | `Pack 4 of 10` and `Fast Open` when packs 1–3 are already complete | Handled |
| App backgrounds during an uncommitted tear | A drag that has not stored `OPEN` is dropped. The sleeve returns to sealed and no reveal request is sent. A tear that already called the server keeps that step | The pack is sealed again. The stored card is unchanged | Handled |
| Finger moves the sealed sleeve | The sleeve position is an animated value. The reveal screen does not render again on each move. Dragging and the spring shut still use the same distance and velocity rules | The sleeve follows the finger. A short drag says `It springs shut.` | Handled |
| Market or portfolio has many rows | The list mounts a window of rows. Holdings use two-column cards | Off-screen holdings are not mounted. An empty portfolio shows Start your collection, not a ledger | Handled |
| A countdown is ticking | The hold label and an upcoming drop label update once a second. The surrounding screen renders again when the hold expires or the drop boundary is reached | `Reserved for 04:32` and `Starts in` keep counting | Handled |
| Several stock rows change at once | The screen's channel is removed when it leaves. Changes inside the same moment refresh that screen once | The shelf, cart, market, or portfolio reloads one time | Handled |
| App is killed during the card reveal | `OPEN`, `REVEALING_CARD`, or `CARD_REVEALED` shows the stored card. Missing steps are written forward. The sealed tear is not replayed and contents are not redrawn | The stored card name, without tearing the sleeve again | Handled |
| App is killed at pack 6 of 10 | Packs 1–5 stay complete. Pack 6 shows its stored card. Packs 7–10 stay sealed and their card names stay hidden | `Pack 6 of 10` and the stored card. Later packs stay sealed | Handled |
| Purchase is reopened before the first reveal | Every pack is still `SEALED`. The session starts at pack 1 on the full gesture | `Pack 1 of 10` and `Sealed. Drag down to tear it open.` | Handled |
| Portfolio value and P&L | Sums `current_value_cents`. Subtracts `acquisition_price_cents`. Both stay integer cents | `Total portfolio value` and `P&L` | Handled |
| Sealed trading card in the portfolio | The holding stays hidden until `PACK_COMPLETE`. It is not added to the totals | `Sealed` on the pack. The card name appears after Done | Handled |
| Portfolio filter | Cards, Sneakers, and Watches each keep their own holdings. Listed keeps items that are for sale. All shows every opened holding | `Nothing in Sneakers is in your portfolio.` / `None of your items are listed.` when that filter is empty | Handled |
| Portfolio sort | Value and P&L use the integer cents. Recently Acquired uses `acquired_at`. An equal amount keeps the newer holding first | `Value`, `P&L`, `Recently Acquired` | Handled |
| Portfolio listing actions | Tapping a holding opens the listing screen for details. List, change price, and delist confirm in sheets | `LISTED` on the card. `List for sale` / `Change price` / `Delist` open sheets | Handled |
| Collectible value drifts | `apply_price_drift` writes `current_value_cents` from the item id, the seeded value, and the current hour. The step is 30 basis points. The result stays inside 70% to 130% | Portfolio, reveal, and the market show that stored estimate | Handled |
| Same hour is read again | The clock row already has this hour. The function does not take another step | The estimate stays on the cents from the first read of the hour | Handled |
| Pack price drifts | `apply_price_drift` does not update `pack_skus`. The starter pack stays `1000` cents | The shelf still shows `$10.00` | Handled |
| Signed-in client writes a collectible value | Update grant is revoked. Only `apply_price_drift` writes `current_value_cents` | The portfolio keeps the server estimate | Handled |
| Seeded expected value | Integer average of `base_value_cents`, weighted by basis points, stays under `price_cents` for every tier | The audit table shows the pack price and the seed EV | Handled |
| Marketplace sale fee | Buyer debit, seller credit, and the floored 8% fee sum to zero. A 1 cent sale writes no fee row | A $450 sale credits the seller $414 and records a $36 fee | Handled |
| Buy and sell the same item | Each trade pays the fee again. The ledger entries for those sales still sum to zero | Both wallets fall by the fees. No new cents | Handled |
| Same reveal key, or a skip ahead | The stored response is returned. `REVEAL_STEP` rejects a jump. Contents stay one row | The open pack stays open | Handled |
| Two refunds for one purchase | There is no refund function. The ledger unique index rejects a second `REFUND` for that account and purchase. A signed-in client cannot insert one | No refund screen. The purchase stays completed | Handled |
| Reconciliation | Negative wallets, wallet/ledger drift, two active listings, a listing with the wrong owner, the latest sold listing still naming the owner, a purchase without its debit, and a sale whose fee does not add up | The queries return no rows | Handled |
| Admin numbers | Completed packs add SKU price as revenue and the current estimate as payout. Marketplace fee rows are summed. A refunded purchase leaves those fee rows | Reviewers see packs sold, revenue, payout, gross margin, fees, and margin by category. An empty book is all zeros | Handled |
| Admin screen opened by anyone else | `admin_snapshot` rejects the caller with `ADMIN_FORBIDDEN` | This screen is for reviewers. | Handled |
| Stored drop status column | Cut. A stored status would drift from `now()` and reservable stock. `drops_with_status` derives it | No status column to display | Cut |
| Redis or an external lock for stock | Cut. The SKU row lock is the concurrency control | No external lock | Cut |

### Reveal presentation transition review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Duplicate tear callback during committed tear | Presentation machine and operation guard reject another tear entry; no new contents are generated. | One opening flow. | Handled |
| Late reset callback after confirmed OPEN | Machine refuses RESET_TEAR from OPEN and later presentation states. | Opened pack stays open. | Handled |
| Reveal screen closes during suspense wait | Pending hold timer is cancelled and its promise settles without advancing that wait. Server milestones remain recoverable. Network continuations and delayed haptics still need broader lifecycle cancellation. | Stored reveal resumes when reopened. | Partially Handled |
| Fast-open glide animation is stopped | Animation promise settles with a cancelled result; that continuation does not submit OPEN. Physical-device interruption testing remains outstanding. | Pack remains recoverable from its server milestone. | Partially Handled |

### Reveal scene motion review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| User starts dragging during entrance/idle | Outer presentation motion stops and resets; inner sleeve keeps the existing gesture distance. Physical-device tracking still needs verification. | Pack responds to the drag without continuing its idle float. | Partially Handled |
| Reveal scene loses focus or app backgrounds while sealed | Entrance and repeating idle animation are cancelled; foreground/focus can resume idle without changing server progress. Hardware lifecycle verification remains pending. | Pack stays sealed. | Partially Handled |
| Reduce Motion enabled in reveal scene | PackStage uses a short fade and disables entrance travel, scale change, idle float and rotation. TalkBack/device visual review remains pending. | A stationary pack with the existing explicit reveal action. | Partially Handled |

### Horizontal seal interaction review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Tap or swipe on pack body away from top seal | Body has no gesture recognizer; only the top 48px seal zone accepts opening gestures. Physical touch-target verification remains pending. | Pack remains sealed. | Partially Handled |
| Slow partial seam drag versus fast flick at the same distance | Shared release rule requires full traversal for slow motion, or >=35% distance with >=1100px/s forward velocity. Pure release-rule tests pass. | Slow release springs back; qualifying flick opens. | Handled |
| Reverse flick or short high-speed twitch | Release rule rejects negative velocity at partial distance and distance below the minimum flick threshold. | Pack stays sealed. | Handled |
| Early release or recognizer cancellation | UI-thread spring resets seal progress; generation guards suppress cancelled spring completion. Native cancellation testing remains pending. | Highlight and strip return to sealed position. | Partially Handled |
| Queued gesture completion after background/reset or pack change | Screen checks reset token, pack identity, focus, app state and operation guard before submitting OPEN. Device race verification remains pending. | Uncommitted interaction stays sealed. | Partially Handled |

### Tear payoff review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| OPEN response arrives before tear payoff finishes | Controller awaits both confirmed OPEN and the explicit animation-completion gate; gate tests pass. | Full short tear payoff before card presentation. | Handled |
| OPEN response is slower than payoff | Cosmetic effect settles while controller awaits server confirmation. No success is inferred from animation. Device latency testing remains pending. | Opening status with the settled pack. | Partially Handled |
| Scene unmounts or becomes inactive during payoff | Cosmetic wait settles and animation cancels; audio pauses and stale seek completion is invalidated. Server milestones remain the recovery source. Device race tests remain pending. | Stored reveal resumes when reopened. | Partially Handled |
| Sound off or unavailable during tear | Saved sound toggle silences the single player; audio failure does not determine reveal progress. Physical audio failure/mute checks remain pending. | Visual payoff remains understandable with optional haptics. | Partially Handled |

### Card emergence review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Server confirms OPEN before card entrance completes | CARD_ENTER is client-only; controller waits for animation completion before suspense and final result. Transition/gate tests pass. | Back-facing card rises before contents appear. | Handled |
| Old entrance callback arrives after a new entrance begins | Completion token rejects the stale callback. Pure gate tests pass. | Current entrance keeps its intended pacing. | Handled |
| Scene becomes inactive or unmounts during card rise | Cosmetic animation cancels/settles; meaningful progress remains the existing server milestone and purchased contents. Hardware lifecycle checks remain pending. | Already purchased card resumes through the recovery path. | Partially Handled |
| Server returns one card in the pack | Presentation uses actual card count and draws no extra supporting cards. Physical layout review remains pending. | One card rises from the opened pack. | Partially Handled |
| Reduce Motion is enabled during emergence | Large card/pack transforms are disabled in favor of a short card fade; completion wait settles. Device accessibility checks remain pending. | Card back fades into focus without the upward travel. | Partially Handled |

### Card-back suspense review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| High-rarity pack starts suspense | All tiers share neutral first 45%; immediate tier glow/dots and premium-status text were removed. Mapping tests pass; native visual timing remains pending. | Neutral back before staged blue/purple/gold anticipation. | Partially Handled |
| Unknown rarity string reaches presentation | Suspense mapping falls back to restrained Common colors/intensity without changing the stored outcome. | Neutral card back. | Handled |
| REVEALING_CARD acknowledgement is slow | Visible suspense begins only after server acknowledgement; preceding card back remains neutral. Network/device integration checks remain pending. | Back-facing card while progress is confirmed. | Partially Handled |
| Reduced motion during rarity suspense | Glow scaling is disabled and intensity stays subdued; existing shorter reveal path is preserved. Physical accessibility checks remain pending. | Restrained color transition without pulsing travel or rotation. | Partially Handled |

### Card-back rotation review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Back tier changes during normal suspense | Artwork tint changes only at 90/270/450 degree thresholds; surrounding light continues smoothly. Curve/threshold tests pass; native rendering review remains pending. | Color changes while the back is edge-on. | Partially Handled |
| Rotation exposes the reverse side | Two back surfaces hide their reversed faces; the second surface has its own 180-degree transform. Device face-culling verification remains pending. | Readable back artwork rather than mirrored lettering. | Partially Handled |
| Fast-open/Common path is too short for paced turns | Durations below 600ms use the existing non-rotating back transition; pure eligibility tests pass. | Brief card-back suspense without rushed spins. | Handled |
| Reduce Motion or scene inactivity during rotation | Reduce Motion disables rotation/scale; inactivity settles cosmetic progress, and unmount cancels the animation. Native lifecycle/accessibility checks remain pending. | Stationary, recoverable purchased-card presentation. | Partially Handled |
### Tap acceleration review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Tap during suspense rotation | Remaining duration becomes 35% once; shared progress continues from its current position. Native visual continuity remains pending. | Faster suspense followed by the closing beat. | Partially Handled |
| Repeated speed-up taps | Controller and UI-thread guards prevent compounded acceleration. | Speeding up… and a disabled acceleration button. | Handled |
| Tap during protected closing beat | FINAL_REVEAL accepts no acceleration input; normal closing duration is 650ms. | Revealing your card. | Handled |
| Old animation callback arrives after cancellation | Tokenized completion ignores stale callbacks; cancellation resolves false. | No premature advancement of the next suspense. | Handled |
| Reduce Motion is enabled during suspense | Short 180ms presentation remains available without tap acceleration. Native accessibility checks remain pending. | Restrained reveal without rotation. | Partially Handled |


### Final card flip review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Final face swap | Back/front visibility changes at 90 degrees; turn finishes before scale settles and a 150ms pause. Mathematical checks pass; native face rendering remains pending. | Collectible artwork first, then metadata. | Partially Handled |
| Reveal acknowledgement is delayed or response lost | Face animation starts only after confirmed CARD_REVEALED; existing error/reconciliation path handles unknown responses. Network/device verification remains pending. | Card back while confirmation is pending; recoverable purchased result. | Partially Handled |
| App is interrupted after durable reveal acknowledgement | Server retains revealed milestone; recovery shows the same stored collectible. Native kill/resume checks remain pending. | Same collectible without rerolling. | Partially Handled |
| Tap during final flip | FINAL_REVEAL accepts no acceleration input; completion waits for the animation callback. | Full protected flip and short face-only pause. | Handled |
| Reduced Motion during final reveal | Rotation/punch are replaced by a 180ms fade. Device accessibility validation remains pending. | Collectible artwork fades into view. | Partially Handled |


### Rarity reveal effects review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Common pull reaches final impact | Common profile has lowest glow, zero particles and no radial light. Profile tests pass; visual review pending. | Restrained white light and light haptic. | Partially Handled |
| High-rarity final reveal | Stored rarity controls effect intensity; Epic pauses longer, Legendary adds anticipation and bounded gold burst. Device review pending. | Distinct premium impact without changing the collectible. | Partially Handled |
| Unknown rarity reaches effects | Falls back to Common presentation, preserving stored outcome. | Restrained neutral reveal. | Handled |
| Reduce Motion during final FX | Particles, radial motion and darkening are omitted; subdued halo and short fade remain. Accessibility validation pending. | Calm fade into the collectible. | Partially Handled |
| Repeated or stale impact callback | Presentation token and last-impact guard reject duplicate or obsolete cues. | One impact cue per final reveal. | Handled |
| App backgrounds or haptics disabled during Legendary sequence | Lifecycle, current token and preference are checked before delayed follow-up motor calls. Native timing verification pending. | Remaining vibration cues stop. | Partially Handled |


### Result presentation review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Final flip finishes | Artwork stays fixed; wait 700ms, fade metadata 260ms, then expose continuation and opened-card fan. Native visual review pending. | Card first, then name, rarity, estimated value, and Tap to continue. | Partially Handled |
| User taps result before metadata settles | Continuation is gated by current pack readiness; suspense taps have no effect in result state. | Card remains visible through the presentation. | Handled |
| Old metadata completion reaches another pack | Callback verifies current purchased pack ID and readiness comparison rejects obsolete IDs. | Next pack cannot be skipped by the previous animation. | Handled |
| App backgrounds during metadata fade | Pending animation cancels; unfinished presentation restarts when active. Native lifecycle validation pending. | Same purchased collectible on return. | Partially Handled |
| Reduced Motion enabled for result | Short pause and opacity fade replace normal pacing; no metadata travel. Device accessibility review pending. | Calm result presentation with the same information and continuation. | Partially Handled |
| Screen reader reaches invisible metadata | Metadata descendants are hidden until readiness; card announcement follows completion. TalkBack/VoiceOver validation pending. | Result announcement after the visual fade. | Partially Handled |


### Haptic track review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Suspense accelerates after a tap | Progress crossings drive discrete transition/anticipation cues; no separate suspense haptic timers. Native synchronization pending. | Faster card motion with corresponding tactile cues. | Partially Handled |
| Duplicate or stale suspense cue | Current token, phase and highest emitted stage guard reject duplicate/obsolete callbacks. | No repeated transition ticks from duplicate delivery. | Handled |
| Haptics disabled | Persisted preference gates feedback and delayed follow-ups; visuals remain independent. Native setting verification pending. | Full visual reveal without vibration. | Partially Handled |
| Legendary sequence interrupted | Executor rechecks lifecycle/preference/token before each delayed motor call. Cancellation test passes; hardware timing pending. | Remaining tactile sequence stops. | Partially Handled |
| Native haptic call fails | Executor catches rejection and stops feedback without blocking reveal. Injected failure test passes. | Reveal continues normally. | Handled |
| Short or Reduced Motion suspense | Intermediate transition/anticipation cues are suppressed; configured final impact remains available. Device verification pending. | Restrained tactile pacing without clustered suspense ticks. | Partially Handled |


### Reveal audio controller review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Identical audio callback arrives twice | Event key deduplication rejects another playback request. | Reveal continues without doubled identical SFX. | Handled |
| Old seek completes after newer cue | Playback token rejects stale start; one player owns the channel. | Latest reveal event remains authoritative. | Handled |
| Sound muted or app backgrounds during pending playback | Pause plus gate invalidation prevents stale starts; native interruption validation pending. | Reveal remains usable with sound stopped. | Partially Handled |
| Saved Sound off loads slowly | Initial playback is muted; preference revision guards protect newer user toggles. Native storage timing validation pending. | Sound follows the stored/current preference. | Partially Handled |
| Seal drag is cancelled | Pending/current friction is stopped before resetting the seal. Device gesture/audio verification pending. | Pack springs back without trailing friction. | Partially Handled |
| Audio fails to load or native playback rejects | Errors are contained by the audio boundary; no purchase/reveal state depends on sound. Native failure injection pending. | Reveal continues visually. | Partially Handled |
| Reveal audio would overlap | New event replaces the prior cue on the single player; bounded volumes and assets pass checks. Listening review pending. | Restrained, sequential SFX track. | Partially Handled |


### Multi-card presentation review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Pack contains multiple stored cards | Cursor follows reveal_order; client does not rank rarity or create extra contents. Logic tests pass; native multi-card fixture pending. | Card N of M in server order. | Partially Handled |
| Continue after a non-final card | NEXT_CARD enters CARD_ENTER directly; no OPEN or backwards server milestone mutation. State transition tests pass. | Next card rises; pack is not torn again. | Handled |
| Continue after final card | Existing PACK_COMPLETE mutation runs only when no next stored card exists. Native/API multi-card integration pending. | Next pack or session completion. | Partially Handled |
| Previous cards accumulate | Render at most two actual earlier card artworks with reduced scale/opacity and small offsets. Device visual review pending. | Current card stays dominant over a subtle previous stack. | Partially Handled |
| Duplicate taps/swipe/button | All share synchronous working guard and current-card readiness key; native gesture routing pending. | One card advance per continuation. | Partially Handled |
| Old metadata callback arrives after next card | Pack-and-index presentation key rejects obsolete readiness. Key tests pass. | New card cannot be continued before its metadata settles. | Handled |
| App killed partway through multi-card pack | Server persists pack milestone and immutable contents; per-card cursor is currently local. Exact checkpoint recovery is deferred to the recovery step. | May revisit earlier cards after cold recovery, with the same outcomes and no new tear. | Partially Handled |
| Empty stored contents | Existing controller reports missing stored card and does not synthesize a result. API/native empty fixture pending. | This pack has no stored card. | Partially Handled |
| Single-card pack fan looks multi-card | `decorBackCount` launches anonymous backs only; faces/values never invented. Real multi-card ownership needs a separate backend decision. | Decorative backs behind the one stored card. | Handled |


### Bulk opening pacing review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| First two packs in a bulk purchase | Explicit fast flag cannot override first-two full mode. Logic tests pass. | Full opening experience. | Handled |
| Pack three reached without opt-in | Screen passes false to pacing policy; full reveal remains available. | Speed up remaining packs? with Fast Open. | Handled |
| Fast Open selected | Session keeps the choice; ordinary cards use shorter tear, entrance, suspense, flip and metadata. Native pacing review pending. | Fast Open is on with compressed reveals and continued card visibility. | Partially Handled |
| Epic or Legendary encountered in fast mode | Current card uses premium pacing while fast choice persists for later ordinary pulls. Policy tests pass; native integration pending. | Exceptional pull receives a full premium moment. | Partially Handled |
| User returns to full reveals | Use full reveals clears explicit fast flag for subsequent opening actions. Device interaction review pending. | Full paced reveals resume. | Partially Handled |
| Fast multi-card fan would include unopened cards | Current pack fan is sliced to revealed card count; future cards are excluded. Native multi-card fixture pending. | Only cards already revealed. | Partially Handled |
| Ten-pack session completes | Existing summary uses bigint sums, pack count and best stored pull. Monetary/label tests pass; native full-session run pending. | 10 Packs Opened, Total Spent, Estimated Collection Value, Best Pull and View Portfolio. | Partially Handled |
| App restarts after Fast Open selection | Choice is local to mounted session; server contents/progress remain authoritative. Exact restoration is deferred to interruption recovery. | Fast preference may need selecting again. | Partially Handled |


### Interruption safety review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Kill during multi-card reveal | Awaited local checkpoint identifies current card; recovery validates it against fresh server milestone/content identity. Hardware process-kill testing pending. | Same stored current card summarized; earlier cards stay behind, no tear replay. | Partially Handled |
| Checkpoint is malformed, stale or for another pack | Parser rejects incompatible hint and uses index zero; server owns contents. Validation tests pass. | Safe stored-card presentation, potentially revisiting earlier cards. | Handled |
| Checkpoint suggests progress on a sealed/completed server pack | Server milestone wins; local hint cannot unseal or undo completion. Tests pass. | Sealed pack or completed result/session summary. | Handled |
| Background or blur during animation/network request | Generation invalidation suppresses obsolete presentation continuation; cosmetic gates/audio cancel. Active return refetches server. Native race validation pending. | Same purchase resumes or summarizes without rerolling. | Partially Handled |
| Server completes pack but response disappears | On failure, single deferred reconciliation refetches pack/session; completion advances to next unfinished pack or summary. Network failure injection pending. | Completed purchase result, never a new purchase or reroll. | Partially Handled |
| Recovery mutation response was lost | Explicit retry first fetches current server milestone, avoiding backwards steps from a stale UI phase. API integration pending. | Stored revealed result or actionable recovery retry. | Partially Handled |
| Device cannot write next-card checkpoint | Advancement waits for storage; failure leaves prior current-card cursor and shows retry copy. Native storage failure testing pending. | Couldn't save opening progress on this device. Try again to continue. | Partially Handled |
| Reveal resumes on another device | Pack milestones/contents recover from server; absent local cursor falls back to first stored card. Exact cross-device cosmetic cursor is outside this implementation. | Same immutable cards, possibly revisiting earlier presentation. | Partially Handled |
| All ten packs completed before app restarts | Server states select final summary; local hints cannot reopen completed packs. Cursor tests pass; native session run pending. | 10 Packs Opened with the existing totals and best pull. | Partially Handled |
| Fast Open choice survives current-pack restart | Valid checkpoint restores its saved fast choice alongside current card. Device restart verification pending. | Selected pacing resumes for later ordinary cards. | Partially Handled |


### Reveal accessibility review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Screen reader enabled on sealed pack | Gesture is disabled; explicit opening button and matching instructions are shown. Native TalkBack/VoiceOver testing pending. | Reveal next card. | Partially Handled |
| Skip animation during suspense | Short fade path retains server acknowledgement and stored outcome; next card resets skip choice. Native action testing pending. | Same collectible with reduced animation. | Partially Handled |
| Duplicate result announcement | One key-guarded explicit announcement replaces competing live-region output. Native speech verification pending. | Name, rarity and integer-money value announced once. | Partially Handled |


### Reveal performance review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Result fades while JS is occupied | Removed duplicate JS-driver animation; result opacity remains owned by UI-thread Reanimated. Real-device profiling pending. | One coordinated result transition. | Partially Handled |
| Legendary FX or long session | Impact particles capped at ten, previous stack at two; audio uses one channel and stable decorative children are memoized. Release-device stress test pending. | Controlled reveal effects with bounded decoration. | Partially Handled |


### Final reveal polish review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Long collectible name or larger font | Metadata has a bounded nested scroll area rather than clipping silently. Physical large-text/TalkBack checks pending. | Full result text can be scrolled while artwork stays fixed. | Partially Handled |
| Saved Haptics off loads slowly | Feedback begins muted; revision guard rejects stale preference hydration after a newer toggle. Native storage timing checks pending. | No early unwanted vibration while preference loads. | Partially Handled |
| Haptics preference cannot be saved | Current-session choice remains effective; explicit save-failure notice is shown. Native failure injection pending. | Haptics changed for this session. Device preference could not be saved. | Partially Handled |
| Opening response is uncertain | Copy describes unconfirmed progress; existing reconciliation fetches durable milestones. Network integration pending. | Opening progress could not be confirmed. Try again. | Partially Handled |


### Catalog artwork and tier expansion review

| Scenario | System Behaviour | What User Sees | Status |
| --- | --- | --- | --- |
| Existing database receives new tiers | Add missing evergreen SKUs with copied validated odds/pools; existing rows, balances, reservations and owned items are untouched. Live database execution pending. | Five evergreen choices per category after migration. | Partially Handled |
| Clean seed creates catalog | Five evergreen rows/category plus separate timed drop; static pool/odds/EV and count checks pass. Database seed execution pending. | Fifteen evergreen choices plus Midnight Drop. | Partially Handled |
| Image URL is unavailable/offline | Known item falls back to bundled original art; unknown names retain monogram fallback. Native network failure test pending. | Collectible remains identifiable without a broken-image placeholder. | Partially Handled |
| App opens card through suspense/flip/result | Identity artwork is used only on the front; the same asset is reused in result, previous stack, holdings and market. Native continuity review pending. | Original matching card art after reveal. | Partially Handled |
| APK contains artwork | Thirty distinct mobile JPEG files fit below the 20 MiB asset test budget. APK rebuild/device test pending. | Offline-capable original pack/card artwork. | Partially Handled |
