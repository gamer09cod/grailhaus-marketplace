import pg from "pg";

const { Pool, DatabaseError } = pg;

const priceCents = 1000;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type ScenarioReport = {
  title: string;
  lines: string[];
  failed: string[];
};

const runId = Date.now().toString(36);

async function main(): Promise<void> {
  const stock = readInt("--stock", 10);
  const clients = readInt("--clients", 100);
  const skuArg = readOptional("--sku");
  if (stock < 1 || clients < 1) {
    throw new Error("--stock and --clients must be at least 1.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const admin = await pool.connect();
  const reports: ScenarioReport[] = [];

  try {
    const skuId = skuArg ?? (await createFixtureSku(admin));
    const price = await readPrice(admin, skuId);
    if (price !== priceCents && skuArg === undefined) {
      throw new Error(`Fixture price was ${price}, expected ${priceCents}.`);
    }
    const flight = await flightLimit(admin, clients);
    console.log(`SKU ${skuId}`);
    console.log(`In flight: ${flight}`);

    reports.push(await lastUnits(pool, admin, skuId, price, stock, clients, flight));
    reports.push(await sameUserSpend(pool, admin, skuId, price, flight));
    reports.push(await duplicateKey(pool, admin, skuId, price, flight));
    reports.push(await multiQuantity(pool, admin, skuId, price, flight));
  } finally {
    admin.release();
    await pool.end();
  }

  let failed = false;
  for (const report of reports) {
    console.log("");
    console.log(report.title);
    for (const line of report.lines) {
      console.log(line);
    }
    for (const problem of report.failed) {
      failed = true;
      console.log(`FAIL ${problem}`);
    }
  }

  console.log("");
  console.log(
    "Hammer purchases stay in the local database. Run npx supabase db reset before the constraint tests.",
  );

  if (failed) {
    process.exitCode = 1;
  }
}

async function lastUnits(
  pool: pg.Pool,
  admin: pg.PoolClient,
  skuId: string,
  price: number,
  stock: number,
  clients: number,
  flight: number,
): Promise<ScenarioReport> {
  await setOnHand(admin, skuId, stock);
  const users = await createUsers(admin, clients, price, "units");
  let reserved = 0;
  let rejected = 0;
  const winners: string[] = [];

  await runAll(users, flight, async (userId, index) => {
    const receipt = await reserve(pool, userId, skuId, 1, `hammer-${runId}-units-reserve-${index}`);
    if (receipt === null) {
      rejected += 1;
      return;
    }
    reserved += 1;
    winners.push(userId);
    await checkout(pool, userId, receipt, price, 1, `hammer-${runId}-units-pay-${index}`);
  });

  const inspected = await inspect(admin, skuId, users, price);
  const failed: string[] = [];
  if (inspected.units !== stock) {
    failed.push(`successful units ${inspected.units}, expected ${stock}`);
  }
  if (inspected.onHand !== 0 || inspected.reserved !== 0) {
    failed.push(`final stock on hand ${inspected.onHand}, reserved ${inspected.reserved}`);
  }
  if (rejected !== clients - stock) {
    failed.push(`rejected reserves ${rejected}, expected ${clients - stock}`);
  }
  pushMoneyFailures(failed, inspected, stock);

  return {
    title: "Last units",
    lines: [
      `Concurrent attempts: ${clients}`,
      `Initial stock: ${stock}`,
      `Successful units: ${inspected.units}`,
      `Rejected units: ${clients - inspected.units}`,
      `Final stock: ${inspected.onHand}`,
      "",
      `Oversell: ${inspected.units > stock || inspected.onHand < 0 ? "YES" : "NO"}`,
      `Ledger mismatch: ${inspected.ledgerMismatches === 0 ? "NO" : "YES"}`,
      `Ownership mismatch: ${inspected.ownedItems === inspected.units ? "NO" : "YES"}`,
    ],
    failed,
  };
}

async function sameUserSpend(
  pool: pg.Pool,
  admin: pg.PoolClient,
  skuId: string,
  price: number,
  flight: number,
): Promise<ScenarioReport> {
  await setOnHand(admin, skuId, 2);
  const [userId] = await createUsers(admin, 1, price, "spend");
  let succeeded = 0;
  let rejected = 0;

  await runAll([0, 1], flight, async (_unused, index) => {
    const reserved = await reserve(pool, userId, skuId, 1, `hammer-${runId}-spend-reserve-${index}`);
    if (reserved === null) {
      rejected += 1;
      return;
    }
    const paid = await checkout(pool, userId, reserved, price, 1, `hammer-${runId}-spend-pay-${index}`);
    if (paid === null) {
      rejected += 1;
      return;
    }
    succeeded += 1;
  });

  const inspected = await inspect(admin, skuId, [userId], price);
  const balance = await readBalance(admin, userId);
  const failed: string[] = [];
  if (inspected.units !== 1 || succeeded !== 1) {
    failed.push(`checkouts ${succeeded}, units ${inspected.units}, expected 1`);
  }
  if (balance !== 0 || balance < 0) {
    failed.push(`balance ${balance}, expected 0`);
  }
  if (inspected.negativeWallets !== 0 || inspected.ledgerMismatches !== 0) {
    failed.push("wallet and ledger diverged");
  }
  if (inspected.reserved !== 0) {
    failed.push(`reserved ${inspected.reserved} after spending`);
  }

  return {
    title: "Same user concurrent spending",
    lines: [
      "Concurrent attempts: 2",
      `Initial balance cents: ${price}`,
      `Successful checkouts: ${succeeded}`,
      `Rejected attempts: ${rejected}`,
      `Final balance cents: ${balance}`,
      "",
      `Oversell: ${inspected.units > 1 ? "YES" : "NO"}`,
      `Ledger mismatch: ${inspected.ledgerMismatches === 0 ? "NO" : "YES"}`,
      `Negative wallet: ${balance < 0 ? "YES" : "NO"}`,
    ],
    failed,
  };
}

async function duplicateKey(
  pool: pg.Pool,
  admin: pg.PoolClient,
  skuId: string,
  price: number,
  flight: number,
): Promise<ScenarioReport> {
  await setOnHand(admin, skuId, 1);
  const [userId] = await createUsers(admin, 1, price * 2, "duplicate");
  const reserved = await reserve(pool, userId, skuId, 1, `hammer-${runId}-duplicate-reserve`);
  if (reserved === null) {
    return {
      title: "Duplicate idempotency key",
      lines: ["The hold was rejected before checkout."],
      failed: ["reserve failed"],
    };
  }

  const key = `hammer-${runId}-duplicate-pay`;
  const purchaseIds: string[] = [];
  let rejected = 0;
  await runAll([0, 1], flight, async () => {
    const purchaseId = await checkout(pool, userId, reserved, price, 1, key);
    if (purchaseId === null) {
      rejected += 1;
      return;
    }
    purchaseIds.push(purchaseId);
  });

  const inspected = await inspect(admin, skuId, [userId], price);
  const distinct = new Set(purchaseIds);
  const failed: string[] = [];
  if (inspected.purchases !== 1 || inspected.units !== 1) {
    failed.push(`purchases ${inspected.purchases}, units ${inspected.units}, expected 1`);
  }
  if (distinct.size > 1) {
    failed.push("duplicate key returned two purchase ids");
  }
  if (inspected.ledgerMismatches !== 0 || inspected.negativeWallets !== 0) {
    failed.push("wallet and ledger diverged");
  }

  return {
    title: "Duplicate idempotency key",
    lines: [
      "Concurrent attempts: 2",
      `Receipts returned: ${purchaseIds.length}`,
      `Rejected attempts: ${rejected}`,
      `Purchases: ${inspected.purchases}`,
      `Successful units: ${inspected.units}`,
      "",
      `Oversell: ${inspected.units > 1 ? "YES" : "NO"}`,
      `Ledger mismatch: ${inspected.ledgerMismatches === 0 ? "NO" : "YES"}`,
    ],
    failed,
  };
}

async function multiQuantity(
  pool: pg.Pool,
  admin: pg.PoolClient,
  skuId: string,
  price: number,
  flight: number,
): Promise<ScenarioReport> {
  const opening = 10;
  const quantity = 4;
  const buyers = 5;
  await setOnHand(admin, skuId, opening);
  const users = await createUsers(admin, buyers, price * quantity, "multi");
  let rejected = 0;

  await runAll(users, flight, async (userId, index) => {
    const receipt = await reserve(
      pool,
      userId,
      skuId,
      quantity,
      `hammer-${runId}-multi-reserve-${index}`,
    );
    if (receipt === null) {
      rejected += 1;
      return;
    }
    const paid = await checkout(
      pool,
      userId,
      receipt,
      price,
      quantity,
      `hammer-${runId}-multi-pay-${index}`,
    );
    if (paid === null) {
      rejected += 1;
    }
  });

  const inspected = await inspect(admin, skuId, users, price);
  const failed: string[] = [];
  if (inspected.units > opening || inspected.units % quantity !== 0) {
    failed.push(`sold ${inspected.units}, which is not a whole multiple of ${quantity} within stock`);
  }
  if (inspected.onHand !== opening - inspected.units || inspected.reserved !== 0) {
    failed.push(`on hand ${inspected.onHand}, reserved ${inspected.reserved}`);
  }
  pushMoneyFailures(failed, inspected, opening);

  return {
    title: "Multi-quantity checkout",
    lines: [
      `Concurrent attempts: ${buyers}`,
      `Quantity each: ${quantity}`,
      `Initial stock: ${opening}`,
      `Successful units: ${inspected.units}`,
      `Rejected units: ${buyers * quantity - inspected.units}`,
      `Final stock: ${inspected.onHand}`,
      "",
      `Oversell: ${inspected.units > opening || inspected.onHand < 0 ? "YES" : "NO"}`,
      `Ledger mismatch: ${inspected.ledgerMismatches === 0 ? "NO" : "YES"}`,
      `Ownership mismatch: ${inspected.ownedItems === inspected.units ? "NO" : "YES"}`,
    ],
    failed,
  };
}

type Inspection = {
  onHand: number;
  reserved: number;
  units: number;
  purchases: number;
  ownedItems: number;
  packDebit: number;
  negativeWallets: number;
  ledgerMismatches: number;
};

async function inspect(
  admin: pg.PoolClient,
  skuId: string,
  users: string[],
  price: number,
): Promise<Inspection> {
  const result = await admin.query<{
    on_hand: string;
    reserved: string;
    units: string;
    purchases: string;
    owned_items: string;
    pack_debit: string;
    negative_wallets: string;
    ledger_mismatches: string;
  }>(
    `select
       sku.stock_on_hand::text as on_hand,
       sku.stock_reserved::text as reserved,
       (
         select count(*)::text
         from public.purchased_packs pack
         where pack.pack_sku_id = sku.id
           and pack.user_id = any($2::uuid[])
       ) as units,
       (
         select count(distinct pack.purchase_id)::text
         from public.purchased_packs pack
         where pack.pack_sku_id = sku.id
           and pack.user_id = any($2::uuid[])
       ) as purchases,
       (
         select count(*)::text
         from public.owned_items item
         where item.owner_id = any($2::uuid[])
           and item.source_type = 'PACK'
       ) as owned_items,
       (
         select coalesce(sum(entry.amount_cents), 0)::text
         from public.ledger_entries entry
         where entry.user_id = any($2::uuid[])
           and entry.entry_type = 'PACK_PURCHASE'
       ) as pack_debit,
       (
         select count(*)::text
         from public.wallets wallet
         where wallet.user_id = any($2::uuid[])
           and wallet.balance_cents < 0
       ) as negative_wallets,
       (
         select count(*)::text
         from public.wallets wallet
         where wallet.user_id = any($2::uuid[])
           and wallet.balance_cents <> (
             select coalesce(sum(entry.amount_cents), 0)
             from public.ledger_entries entry
             where entry.user_id = wallet.user_id
           )
       ) as ledger_mismatches
     from public.pack_skus sku
     where sku.id = $1`,
    [skuId, users],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`SKU ${skuId} disappeared during the hammer.`);
  }
  return {
    onHand: Number(row.on_hand),
    reserved: Number(row.reserved),
    units: Number(row.units),
    purchases: Number(row.purchases),
    ownedItems: Number(row.owned_items),
    packDebit: Number(row.pack_debit),
    negativeWallets: Number(row.negative_wallets),
    ledgerMismatches: Number(row.ledger_mismatches),
  };
}

function pushMoneyFailures(failed: string[], inspected: Inspection, opening: number): void {
  if (inspected.units > opening || inspected.onHand < 0 || inspected.reserved < 0) {
    failed.push("stock went negative or past the opening supply");
  }
  if (inspected.packDebit !== -inspected.units * priceCents) {
    failed.push(`pack debits ${inspected.packDebit}, expected ${-inspected.units * priceCents}`);
  }
  if (inspected.ownedItems !== inspected.units) {
    failed.push(`owned items ${inspected.ownedItems}, packs ${inspected.units}`);
  }
  if (inspected.negativeWallets !== 0) {
    failed.push(`${inspected.negativeWallets} negative wallets`);
  }
  if (inspected.ledgerMismatches !== 0) {
    failed.push(`${inspected.ledgerMismatches} wallets do not match the ledger`);
  }
}

async function createFixtureSku(admin: pg.PoolClient): Promise<string> {
  const name = `Hammer ${runId}`;
  const created = await admin.query<{ id: string }>(
    `insert into public.pack_skus (
       category, name, tier, price_cents, stock_total, stock_on_hand, is_drop, active
     ) values (
       'TRADING_CARD', $1, $1, $2, 500, 500, false, true
     )
     returning id::text`,
    [name, priceCents],
  );
  const skuId = created.rows[0]?.id;
  if (!skuId) {
    throw new Error("Fixture SKU was not created.");
  }
  const item = await admin.query<{ id: string }>(
    `insert into public.catalog_items (
       category, name, rarity, base_value_cents, current_value_cents
     ) values ('TRADING_CARD', $1, 'COMMON', 100, 100)
     returning id::text`,
    [`${name} Common`],
  );
  const itemId = item.rows[0]?.id;
  if (!itemId) {
    throw new Error("Fixture catalog item was not created.");
  }
  await admin.query(
    `insert into public.pack_sku_items (pack_sku_id, catalog_item_id) values ($1, $2)`,
    [skuId, itemId],
  );
  await admin.query(
    `insert into public.pack_odds (pack_sku_id, rarity, probability_basis_points)
     values ($1, 'COMMON', 10000)`,
    [skuId],
  );
  return skuId;
}

async function readPrice(admin: pg.PoolClient, skuId: string): Promise<number> {
  const result = await admin.query<{ price_cents: string }>(
    `select price_cents::text from public.pack_skus where id = $1`,
    [skuId],
  );
  const price = result.rows[0]?.price_cents;
  if (!price) {
    throw new Error(`No pack SKU ${skuId}.`);
  }
  return Number(price);
}

async function setOnHand(admin: pg.PoolClient, skuId: string, target: number): Promise<void> {
  const current = await admin.query<{ on_hand: string; reserved: string; total: string }>(
    `select stock_on_hand::text as on_hand, stock_reserved::text as reserved, stock_total::text as total
     from public.pack_skus where id = $1`,
    [skuId],
  );
  const row = current.rows[0];
  if (!row) {
    throw new Error(`No pack SKU ${skuId}.`);
  }
  if (Number(row.reserved) !== 0) {
    throw new Error(`SKU ${skuId} still has ${row.reserved} reserved units.`);
  }
  const delta = target - Number(row.on_hand);
  if (target < 0 || target > Number(row.total)) {
    throw new Error(`Cannot set on-hand to ${target} when stock_total is ${row.total}.`);
  }
  if (delta !== 0) {
    await admin.query(`select private.with_stock_write($1, $2, 0)`, [skuId, delta]);
  }
}

async function createUsers(
  admin: pg.PoolClient,
  count: number,
  balanceCents: number,
  label: string,
): Promise<string[]> {
  const inserted = await admin.query<{ id: string }>(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       created_at, updated_at, confirmation_token, email_change, email_change_token_new,
       email_change_token_current, recovery_token, phone_change, phone_change_token,
       raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
     )
     select
       '00000000-0000-0000-0000-000000000000',
       gen_random_uuid(),
       'authenticated',
       'authenticated',
       'hammer-' || $1 || '-' || n || '@grailhaus.test',
       extensions.crypt('Hammer-pass', extensions.gen_salt('bf')),
       now(), now(), now(),
       '', '', '', '', '', '', '',
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{}'::jsonb,
       false,
       false
     from generate_series(1, $2) as n
     returning id::text`,
    [`${runId}-${label}`, count],
  );
  const ids = inserted.rows.map((row) => row.id);
  await admin.query(
    `select private.apply_deposit(user_id, $2::bigint, 'hammer-dep-' || $1 || '-' || user_id::text)
     from unnest($3::uuid[]) as user_id`,
    [`${runId}-${label}`, balanceCents, ids],
  );
  return ids;
}

async function readBalance(admin: pg.PoolClient, userId: string): Promise<number> {
  const result = await admin.query<{ balance_cents: string }>(
    `select balance_cents::text from public.wallets where user_id = $1`,
    [userId],
  );
  return Number(result.rows[0]?.balance_cents ?? "0");
}

type ReserveReceipt = {
  cartId: string;
  lines: Array<{ lineId: string; quantity: number; snapshotPriceCents: string }>;
};

async function reserve(
  pool: pg.Pool,
  userId: string,
  skuId: string,
  quantity: number,
  key: string,
): Promise<ReserveReceipt | null> {
  try {
    return await withUser(pool, userId, async (client) => {
      const result = await client.query<{ reserve_pack: ReserveReceipt }>(
        `select public.reserve_pack($1, $2, $3) as reserve_pack`,
        [skuId, quantity, key],
      );
      const receipt = result.rows[0]?.reserve_pack;
      if (!receipt?.cartId || !Array.isArray(receipt.lines)) {
        throw new Error("Reserve returned no cart.");
      }
      return receipt;
    });
  } catch (error) {
    const code = domainCode(error);
    if (code === "INSUFFICIENT_STOCK") {
      return null;
    }
    throw error;
  }
}

async function checkout(
  pool: pg.Pool,
  userId: string,
  receipt: ReserveReceipt,
  price: number,
  quantity: number,
  key: string,
): Promise<string | null> {
  const lines = receipt.lines.map((line) => ({
    lineId: line.lineId,
    quantity: line.quantity,
    snapshotPriceCents: Number(line.snapshotPriceCents),
  }));
  try {
    return await withUser(pool, userId, async (client) => {
      const result = await client.query<{ checkout: { purchaseId: string } }>(
        `select public.checkout($1, $2, $3, $4::jsonb) as checkout`,
        [receipt.cartId, price * quantity, key, JSON.stringify(lines)],
      );
      const purchaseId = result.rows[0]?.checkout.purchaseId;
      if (!purchaseId) {
        throw new Error("Checkout returned no purchase.");
      }
      return purchaseId;
    });
  } catch (error) {
    const code = domainCode(error);
    if (
      code === "INSUFFICIENT_BALANCE" ||
      code === "CART_NOT_OPEN" ||
      code === "INSUFFICIENT_STOCK" ||
      code === "IDEMPOTENCY_IN_PROGRESS"
    ) {
      return null;
    }
    throw error;
  }
}

async function withUser<T>(
  pool: pg.Pool,
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const value = await fn(client);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function runAll<T>(
  items: T[],
  flight: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const queue = items.map((item, index) => ({ item, index }));
  const runners = Array.from({ length: Math.min(flight, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        return;
      }
      await worker(next.item, next.index);
    }
  });
  await Promise.all(runners);
}

async function flightLimit(admin: pg.PoolClient, clients: number): Promise<number> {
  const max = await admin.query<{ max_connections: string }>("show max_connections");
  const used = await admin.query<{ used: string }>(
    "select count(*)::text as used from pg_stat_activity",
  );
  const room = Number(max.rows[0]?.max_connections ?? "100") - Number(used.rows[0]?.used ?? "0") - 5;
  return Math.max(4, Math.min(clients, room));
}

function domainCode(error: unknown): string | null {
  if (error instanceof DatabaseError && error.code === "P0001") {
    return error.message.split("\n")[0] ?? null;
  }
  return null;
}

function readInt(flag: string, fallback: number): number {
  const raw = readOptional(flag);
  if (raw === undefined) {
    return fallback;
  }
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return Number(raw);
}

function readOptional(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} needs a value.`);
  }
  return value;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Hammer failed.";
  console.error(message);
  process.exitCode = 1;
});
