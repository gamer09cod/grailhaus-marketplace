import pg from "pg";

const { Client, DatabaseError } = pg;

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const seller = "22222222-2222-4222-8222-222222222222";
const firstBuyer = "11111111-1111-4111-8111-111111111111";

async function main(): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();

  const catalog = await admin.query<{ id: string }>(
    "select id from public.catalog_items where name = 'Harbor Fox'",
  );
  const catalogId = catalog.rows[0]?.id;
  if (!catalogId) {
    throw new Error("Harbor Fox is missing.");
  }

  const second = await admin.query<{ id: string }>(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       created_at, updated_at, confirmation_token, email_change, email_change_token_new,
       email_change_token_current, recovery_token, phone_change, phone_change_token,
       raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
     ) values (
       '00000000-0000-0000-0000-000000000000',
       gen_random_uuid(),
       'authenticated',
       'authenticated',
       'buy-race-' || gen_random_uuid() || '@grailhaus.test',
       extensions.crypt('Reviewer-10000', extensions.gen_salt('bf')),
       now(), now(), now(),
       '', '', '', '', '', '', '',
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{}'::jsonb,
       false,
       false
     )
     returning id::text`,
  );
  const secondBuyer = second.rows[0].id;
  await admin.query(`select private.apply_deposit($1, 1000000, $2)`, [
    secondBuyer,
    `buy-race-fund-${secondBuyer}`,
  ]);

  const owned = await admin.query<{ id: string }>(
    `insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
     values ($1, $2, 'PACK', 200)
     returning id`,
    [seller, catalogId],
  );
  const ownedId = owned.rows[0].id;

  const listed = await withUser(seller, async (client) => {
    const result = await client.query<{ list_item: { listingId: string } }>(
      `select public.list_item($1, 45000, $2) as list_item`,
      [ownedId, `buy-race-list-${ownedId}`],
    );
    return result.rows[0].list_item.listingId;
  });

  const firstCart = await withUser(firstBuyer, async (client) => {
    const result = await client.query<{ add_listing: { cartId: string; lines: Line[] } }>(
      `select public.add_listing($1, $2) as add_listing`,
      [listed, `buy-race-add-${ownedId}-a`],
    );
    return result.rows[0].add_listing;
  });
  const secondCart = await withUser(secondBuyer, async (client) => {
    const result = await client.query<{ add_listing: { cartId: string; lines: Line[] } }>(
      `select public.add_listing($1, $2) as add_listing`,
      [listed, `buy-race-add-${ownedId}-b`],
    );
    return result.rows[0].add_listing;
  });

  const attempts = await Promise.all([
    payOnce(firstBuyer, firstCart, `buy-race-pay-${ownedId}-a`),
    payOnce(secondBuyer, secondCart, `buy-race-pay-${ownedId}-b`),
  ]);

  const wins = attempts.filter((attempt) => attempt.ok).length;
  const losses = attempts.filter((attempt) => !attempt.ok && attempt.code === "LISTING_SOLD").length;
  const sold = await admin.query<{ count: string; owner_id: string }>(
    `select count(*) filter (where listing.status = 'SOLD')::text as count,
            item.owner_id::text
     from public.marketplace_listings listing
     join public.owned_items item on item.id = listing.owned_item_id
     where listing.id = $1
     group by item.owner_id`,
    [listed],
  );
  const fees = await admin.query<{ count: string; fee: string }>(
    `select count(*)::text as count, coalesce(sum(amount_cents), 0)::text as fee
     from public.ledger_entries
     where entry_type = 'MARKETPLACE_FEE'
       and reference_id in (
         select id from public.purchases
         where idempotency_key in ($1, $2)
       )`,
    [`buy-race-pay-${ownedId}-a`, `buy-race-pay-${ownedId}-b`],
  );
  const sales = await admin.query<{ count: string; credit: string }>(
    `select count(*)::text as count, coalesce(sum(amount_cents), 0)::text as credit
     from public.ledger_entries
     where user_id = $1
       and entry_type = 'MARKETPLACE_SALE'
       and idempotency_key in ($2, $3)`,
    [seller, `buy-race-pay-${ownedId}-a`, `buy-race-pay-${ownedId}-b`],
  );
  const sellerBalance = await admin.query<{ balance_cents: string }>(
    `select balance_cents::text from public.wallets where user_id = $1`,
    [seller],
  );

  const row = sold.rows[0];
  if (
    wins !== 1 ||
    losses !== 1 ||
    row?.count !== "1" ||
    (row.owner_id !== firstBuyer && row.owner_id !== secondBuyer) ||
    fees.rows[0]?.count !== "1" ||
    fees.rows[0]?.fee !== "3600" ||
    sales.rows[0]?.count !== "1" ||
    sales.rows[0]?.credit !== "41400" ||
    sellerBalance.rows[0]?.balance_cents !== "1041400"
  ) {
    throw new Error(
      `race result wins ${wins} losses ${losses} sold ${row?.count} owner ${row?.owner_id} fees ${fees.rows[0]?.count} sales ${sales.rows[0]?.count} seller ${sellerBalance.rows[0]?.balance_cents} codes ${attempts.map((attempt) => attempt.code).join(",")}`,
    );
  }

  console.log("BUY_RACE_OK");
  await admin.end();
}

type Line = { lineId: string; quantity: number; snapshotPriceCents: string; listingId?: string };

async function payOnce(
  userId: string,
  cart: { cartId: string; lines: Line[] },
  key: string,
): Promise<{ ok: boolean; code?: string }> {
  const listingLines = cart.lines.filter((line) => line.listingId);
  const payload = (listingLines.length > 0 ? listingLines : cart.lines).map((line) => ({
    lineId: line.lineId,
    quantity: line.quantity,
    snapshotPriceCents: Number(line.snapshotPriceCents),
  }));
  const total = payload.reduce((sum, line) => sum + line.snapshotPriceCents * line.quantity, 0);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query(`select public.checkout($1, $2, $3, $4::jsonb)`, [
      cart.cartId,
      total,
      key,
      JSON.stringify(payload),
    ]);
    await client.query("commit");
    return { ok: true };
  } catch (error) {
    await client.query("rollback");
    if (error instanceof DatabaseError && error.code === "P0001") {
      return { ok: false, code: error.message };
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function withUser<T>(userId: string, run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
