# GrailHaus

Premium mystery-pack and collectibles marketplace. Signed-in users browse a shelf of card, sneaker, and watch packs, hold stock for five minutes, and pay from a wallet of integer cents. The same checkout can buy a marketplace listing. Trading-card packs reveal a card that was drawn on the server. Sellers list, reprice, and delist from the portfolio.

The client cannot change stock, balances, listings, or pack contents directly. Postgres commits a mutation in one transaction or not at all.

Decisions are in [DECISIONS.md](DECISIONS.md). The short architecture is in [ARCHITECTURE.md](ARCHITECTURE.md). Known cases are in [EDGE_CASES.md](EDGE_CASES.md).

## Requirements

- Docker Desktop
- Node.js 20 or newer
- Supabase CLI (`npx supabase` is enough)
- For a device build: Android Studio, or a browser for Expo web

Do not commit `ios/` or `android/`. Native projects are generated on the machine that builds them.

## Setup

From the repository root, with Docker running:

```text
npm install
npx supabase start
npx supabase db reset
```

On this machine, npm needs the system certificate store:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
```

## Supabase

`npx supabase start` runs Auth, Postgres, PostgREST, and the Edge Functions on the local Docker stack. `npx supabase stop` shuts that stack down and keeps the database volume.

`npx supabase db reset` is the migration and seed command. It drops the local database, applies every file in `supabase/migrations`, then runs `supabase/seed.sql`. The seed loads 27 collectibles in each of trading cards, sneakers, and watches, three evergreen pack tiers per category, one live Midnight Drop, and two reviewer wallets at `$10,000`.

`npx supabase start` serves `POST /functions/v1/deposit`, `POST /functions/v1/cart`, `POST /functions/v1/checkout`, `POST /functions/v1/listing`, `POST /functions/v1/qa`, and `POST /functions/v1/reveal`. A function added after the stack is already running needs `npx supabase stop` and `npx supabase start` before it is routed. Those functions call Auth and PostgREST with `fetch`. They do not import an `npm:` package, because the local edge runtime cannot download one through this machine's certificate setup.

Generate TypeScript types after a reset:

```text
npx supabase gen types --local --lang typescript --schema public > supabase/database.types.ts
```

## Environment variables

Copy `app/.env.example` to `app/.env`.

| Variable | Local value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the local anon key in `app/.env.example` |

The Android emulator cannot use `127.0.0.1`. Set `EXPO_PUBLIC_SUPABASE_URL` to `http://10.0.2.2:54321` for the emulator when the app is talking to the local stack. Do not put the service-role key in the app. Race scripts use `DATABASE_URL` when it is set, and otherwise `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

Day-to-day development stays on the local stack. The shared project is `zboczfalxtuspnodveer` in `ap-southeast-1`:

| Variable | Hosted value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://zboczfalxtuspnodveer.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpib2N6ZmFseHR1c3Bub2R2ZWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NDIxNTQsImV4cCI6MjEwNjQxODE1NH0.34S7VlR7qFBqiq-uRqcNSo4Jwn8vZpjcv4imk7HEEzk` |

That project has the same migrations, seed, and Edge Functions as the local stack. New signups are autoconfirmed, matching local auth. The CLI on this machine needs `SSL_CERT_FILE` pointed at a PEM bundle of the Windows root certificates before `npx supabase` can reach the hosted API. `SUPABASE_ACCESS_TOKEN` is a user environment variable, not an app setting.

## Run the app

```powershell
cd app
Copy-Item .env.example .env
npm install
npm run typecheck
npx expo start
```

`npm run typecheck` is the static check. `npm run lint` runs ESLint with `eslint-config-expo`. Code written before the design system has a recorded baseline of findings in `UI_UX_AUDIT.md`. New files must lint clean. Press `w` for web, or open `http://localhost:8081` after `npx expo start --web`.

Design tokens are in `app/src/theme/` and the buttons in `app/src/components/buttons/`. The QA menu has a `Show design system` gallery that renders both.

## Development build

A development build compiles the native app on this machine. From `app/`, with the local stack running and `EXPO_PUBLIC_SUPABASE_URL` set to `http://10.0.2.2:54321`:

```text
npx expo run:android
```

That generates `android/` locally. Do not commit it. A development build still uses the local stack.

## Installable APK

From the repository root, with the Android SDK and JDK installed:

```text
npm run apk
```

`scripts/build-apk.mjs` generates `app/android/`, which stays uncommitted. It does not read `app/.env`. The release bundle embeds `https://zboczfalxtuspnodveer.supabase.co` and the hosted anon key from the table above. The APK is:

```text
app/android/app/build/outputs/apk/release/app-release.apk
```

It is signed with the debug keystore so a device can install it. It is not a Play Store upload. On this machine the script trusts the Windows certificate store and keeps the Gradle cache at `C:\g`, because the default cache path is too long for the native build.

## Tests

The Supabase query command cannot run a multi-statement file, so use `psql` inside the database container. From the repository root, after `npx supabase db reset`:

```powershell
Get-ChildItem supabase/tests/*.sql | ForEach-Object {
  Get-Content $_.FullName -Raw | docker exec -i supabase_db_grailhaus-marketplace psql -U postgres -d postgres -v ON_ERROR_STOP=1
}
npx tsx scripts/checkout-resume.ts
npx tsx scripts/reveal-gesture.ts
npx tsx scripts/portfolio.ts
npx tsx scripts/failure-race.ts
npx tsx scripts/list-race.ts
npx tsx scripts/buy-race.ts
```

`checkout-resume.ts` needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `app/.env.example`. It does not call the database.

A passing SQL file prints its OK line and rolls the fixtures back. `scripts/checkout-resume.ts` prints `CHECKOUT_RESUME_OK`. `scripts/reveal-gesture.ts` prints `REVEAL_GESTURE_OK`. `scripts/portfolio.ts` prints `PORTFOLIO_OK`. `failure-race.ts` prints `FAILURE_RACE_OK` and commits its fixtures. `list-race.ts` prints `LIST_RACE_OK` and deletes its fixture. `buy-race.ts` prints `BUY_RACE_OK` and commits one sale. Reset the local database after the scripts that commit.

## Hammer

From the repository root, after `npm install` and `npx supabase start`:

```text
npm run hammer -- --stock 10 --clients 100
```

`--sku` selects an existing pack. Without it, the hammer creates a throwaway pack. A passing run reports `Oversell: NO` for the last units, one wallet, a duplicate key, and multi-quantity checkout. The run commits purchases, so reset the local database before the constraint tests.

## Demo credentials

A new signup starts at `$0.00`. These two accounts are in the local seed and on the hosted project the release APK uses. Mock deposit buttons are `$100`, `$500`, `$1,000`, and a custom amount from `$0.01` to `$1,000,000`.

| Email | Password | Opening balance |
| --- | --- | --- |
| `reviewer@grailhaus.test` | `Reviewer-10000` | `$10,000.00` |
| `collector@grailhaus.test` | `Reviewer-10000` | `$10,000.00` |

The app has five bottom tabs: Home, Packs, Market, Portfolio, and Profile. Profile holds the wallet, listings, the haptics setting, and sign out. For these two accounts it also lists QA tools and the admin numbers. Holding the wallet version for three seconds still opens the QA menu. The server rejects QA and admin calls from any other account.

## Architecture

Postgres holds the ledger, the stock counters, the five-minute pack holds, and the pack contents. The client sends an idempotency key and the price it showed. One database transaction checks the locked rows and commits the purchase, or it commits nothing. Listings in the cart are not reserved. Collectible estimates move once an hour. Pack prices do not. The fee on a sale is integer division, and the buyer debit, seller credit, and fee sum to zero. The full account is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Scope cuts

- Sneaker and watch packs do not use the trading-card tear.
- The admin screen is numbers only.
- There is no catalog search.
- There are no visual effects outside the reveal.
- There is no Redis, no background worker, and no separate API.

## Layout

```text
scripts/build-apk.mjs      release APK pointed at the hosted project
scripts/hammer.ts          concurrent reserve and checkout proof
scripts/failure-race.ts    expired hold against a new reserve, and delist or reprice against a purchase
scripts/checkout-resume.ts stored checkout key accepted or rejected
scripts/list-race.ts       two concurrent list attempts for one owned item
scripts/buy-race.ts        two buyers checking out one listing
scripts/reveal-gesture.ts  tear, pacing, recovery, and accessibility copy
scripts/portfolio.ts       portfolio value, P&L, filters, and sort in integer cents
app/                       Expo client
supabase/functions/        deposit, cart, checkout, listing, QA, and reveal
supabase/migrations/       schema and later corrections
supabase/seed.sql          catalog, pack tiers, the Midnight Drop, reviewer wallets
supabase/tests/            SQL tests, each rolled back
supabase/config.toml       local Supabase config
```
