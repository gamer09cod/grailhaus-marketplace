# GrailHaus

Premium mystery-pack and collectibles marketplace. This repository is being built in phases. Phase 1 is the Postgres foundation only. There is no mobile app yet.

## Phase 1 status

Signed-in users can read their own wallet, ledger, cart, and collection records, and they can browse the active catalog. They cannot change stock, balances, listings, or pack contents directly.

Money is stored as `bigint` cents. Pack holds move stock only through reservation rows. A wallet balance that disagrees with its ledger cannot commit.

Later phases add the Expo app, deposits, checkout, drops, and the marketplace flow. Those decisions are in [DECISIONS.md](DECISIONS.md). The schema invariants are in [ARCHITECTURE.md](ARCHITECTURE.md). Known cases are in [EDGE_CASES.md](EDGE_CASES.md).

## Requirements

- Docker Desktop
- Node.js 20 or newer
- Supabase CLI (`npx supabase` is enough)

Do not commit `ios/` or `android/`. Native projects are not part of this phase.

## Local database

From the repository root:

```text
npx supabase start
npx supabase db reset
```

`db reset` drops the local database, applies `supabase/migrations`, then runs `supabase/seed.sql`.

The Phase 1 seed does not load collectibles or reviewer accounts. It checks that the 8% fee function still floors correctly. Catalog seed arrives in Phase 2.

Constraint tests, against the reset database. The Supabase query command cannot run a multi-statement file, so use `psql` inside the database container:

```text
docker exec -i supabase_db_grailhaus-marketplace psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/phase1_constraints.sql
```

On PowerShell:

```powershell
Get-Content supabase/tests/phase1_constraints.sql -Raw | docker exec -i supabase_db_grailhaus-marketplace psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

A passing run prints `PHASE1_CONSTRAINTS_OK` and rolls the fixtures back. Migration and seed data remain.

Generate TypeScript types after a reset:

```text
npx supabase gen types --local --lang typescript --schema public > supabase/database.types.ts
```

`npx supabase stop` shuts the local stack down.

## Environment

No application `.env` is required in this phase. `npx supabase start` prints the local API URL and keys. Those local keys are for this machine only. Do not put the service-role key in the mobile app.

## Layout

```text
supabase/migrations/   schema, constraints, row level security
supabase/seed.sql      seed structure
supabase/tests/        constraint tests
supabase/database.types.ts
supabase/config.toml   local Supabase config
```

## Scope of this phase

In place:

- tables for profiles, wallets, ledger, catalog, packs, odds, drops, carts, reservations, purchases, pack contents, owned items, listings, and idempotency
- checks that reject a negative wallet, a duplicate active listing, and a second financial effect for the same reference
- row level security and revoked client write grants

Not in place yet:

- Expo app
- auth screens and mock deposits
- catalog of cards, sneakers, and watches
- checkout, reveal, portfolio, and the concurrency hammer
