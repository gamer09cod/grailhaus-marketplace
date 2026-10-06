import pg from "pg";

const { Client, DatabaseError } = pg;

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function main(): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    await expireVersusReserve(admin);
    await delistVersusPurchase(admin);
    await repriceVersusPurchase(admin);
    console.log("FAILURE_RACE_OK");
  } finally {
    await admin.end();
  }
}

async function expireVersusReserve(admin: pg.Client): Promise<void> {
  const skuId = await createPack(admin, "expire");
  const holder = await createUser(admin, "expire-holder");
  const rival = await createUser(admin, "expire-rival");
  const reserved = await withUser(holder, async (client) => {
    const result = await client.query<{ reserve_pack: { cartId: string; lines: Line[] } }>(
      "select public.reserve_pack($1, 1, $2) as reserve_pack",
      [skuId, "phase21-expire-reserve"],
    );
    return result.rows[0].reserve_pack;
  });

  await admin.query("begin");
  await admin.query("select set_config('grailhaus.reservation_admin', 'on', true)");
  await admin.query(
    `update public.cart_reservations
     set expires_at = now() - interval '1 second'
     where user_id = $1 and status = 'ACTIVE'`,
    [holder],
  );
  await admin.query("commit");

  const [paid, claimed] = await Promise.all([
    checkout(holder, reserved, 1000, "phase21-expire-pay"),
    withUser(rival, async (client) => {
      try {
        await client.query("select public.reserve_pack($1, 1, $2)", [skuId, "phase21-expire-rival"]);
        return true;
      } catch (error) {
        if (error instanceof DatabaseError && error.code === "P0001") {
          return false;
        }
        throw error;
      }
    }),
  ]);

  const stock = await admin.query<{ on_hand: string; reserved: string }>(
    "select stock_on_hand::text as on_hand, stock_reserved::text as reserved from public.pack_skus where id = $1",
    [skuId],
  );
  const purchases = await admin.query<{ count: string }>(
    "select count(*)::text as count from public.purchases where user_id = $1",
    [holder],
  );
  const active = await admin.query<{ count: string }>(
    `select count(*)::text as count
     from public.cart_reservations
     where pack_sku_id = $1 and status = 'ACTIVE' and user_id = $2`,
    [skuId, rival],
  );
  const holderBalance = await balance(admin, holder);
  const row = stock.rows[0];
  if (
    paid.ok
    || !claimed
    || purchases.rows[0]?.count !== "0"
    || active.rows[0]?.count !== "1"
    || row?.on_hand !== "1"
    || row?.reserved !== "1"
    || holderBalance !== 1_000_000
  ) {
    throw new Error(
      `expire race paid ${paid.ok} claimed ${claimed} purchases ${purchases.rows[0]?.count} active ${active.rows[0]?.count} on_hand ${row?.on_hand} reserved ${row?.reserved} balance ${holderBalance} code ${paid.code}`,
    );
  }
}

async function delistVersusPurchase(admin: pg.Client): Promise<void> {
  const { listingId, cart, seller, buyer } = await listedCart(admin, "delist");
  const [removed, paid] = await Promise.all([
    callUser(seller, "select public.delist($1, $2)", [listingId, "phase21-delist"]),
    checkout(buyer, cart, 45000, "phase21-delist-pay"),
  ]);
  await expectOneWinner(admin, {
    listingId,
    seller,
    buyer,
    sellerWon: removed.ok,
    buyerWon: paid.ok,
    buyerCode: paid.code,
    sellerCode: removed.code,
    soldPrice: 45000,
    activePrice: null,
  });
}

async function repriceVersusPurchase(admin: pg.Client): Promise<void> {
  const { listingId, cart, seller, buyer } = await listedCart(admin, "reprice");
  const [priced, paid] = await Promise.all([
    callUser(seller, "select public.reprice_listing($1, $2, $3)", [listingId, 46000, "phase21-reprice"]),
    checkout(buyer, cart, 45000, "phase21-reprice-pay"),
  ]);
  await expectOneWinner(admin, {
    listingId,
    seller,
    buyer,
    sellerWon: priced.ok,
    buyerWon: paid.ok,
    buyerCode: paid.code,
    sellerCode: priced.code,
    soldPrice: 45000,
    activePrice: 46000,
  });
}

async function expectOneWinner(
  admin: pg.Client,
  outcome: {
    listingId: string;
    seller: string;
    buyer: string;
    sellerWon: boolean;
    buyerWon: boolean;
    buyerCode?: string;
    sellerCode?: string;
    soldPrice: number;
    activePrice: number | null;
  },
): Promise<void> {
  const listing = await admin.query<{ status: string; price_cents: string; owner_id: string }>(
    `select listing.status, listing.price_cents::text, item.owner_id::text
     from public.marketplace_listings listing
     join public.owned_items item on item.id = listing.owned_item_id
     where listing.id = $1`,
    [outcome.listingId],
  );
  const row = listing.rows[0];
  const purchases = await admin.query<{ count: string }>(
    "select count(*)::text as count from public.purchases where user_id = $1 and idempotency_key like 'phase21-%'",
    [outcome.buyer],
  );
  const buyerBalance = await balance(admin, outcome.buyer);
  const sellerBalance = await balance(admin, outcome.seller);
  const fees = await admin.query<{ fee: string }>(
    `select coalesce(sum(amount_cents), 0)::text as fee
     from public.ledger_entries
     where entry_type = 'MARKETPLACE_FEE'
       and reference_id in (select id from public.purchases where user_id = $1)`,
    [outcome.buyer],
  );
  const wins = Number(outcome.sellerWon) + Number(outcome.buyerWon);
  const sold = row?.status === "SOLD" && row.owner_id === outcome.buyer && row.price_cents === String(outcome.soldPrice);
  const kept = outcome.activePrice !== null
    && row?.status === "ACTIVE"
    && row.owner_id === outcome.seller
    && row.price_cents === String(outcome.activePrice);
  const delisted = outcome.activePrice === null
    && row?.status === "DELISTED"
    && row.owner_id === outcome.seller;
  const buyerUnchanged = buyerBalance === 1_000_000
    && sellerBalance === 1_000_000
    && purchases.rows[0]?.count === "0"
    && fees.rows[0]?.fee === "0";
  const buyerCharged = buyerBalance === 1_000_000 - outcome.soldPrice
    && sellerBalance === 1_000_000 + 41400
    && purchases.rows[0]?.count === "1"
    && fees.rows[0]?.fee === "3600";
  if (wins !== 1 || (sold && !buyerCharged) || ((kept || delisted) && !buyerUnchanged) || (!sold && !kept && !delisted)) {
    throw new Error(
      `listing race seller ${outcome.sellerWon} buyer ${outcome.buyerWon} status ${row?.status} price ${row?.price_cents} owner ${row?.owner_id} purchases ${purchases.rows[0]?.count} buyer ${buyerBalance} seller ${sellerBalance} fee ${fees.rows[0]?.fee} codes ${outcome.buyerCode}/${outcome.sellerCode}`,
    );
  }
}

async function listedCart(admin: pg.Client, label: string): Promise<{
  listingId: string;
  cart: { cartId: string; lines: Line[] };
  seller: string;
  buyer: string;
}> {
  const catalog = await admin.query<{ id: string }>(
    "select id from public.catalog_items where name = 'Harbor Fox'",
  );
  const catalogId = catalog.rows[0]?.id;
  if (!catalogId) {
    throw new Error("Harbor Fox is missing.");
  }
  const seller = await createUser(admin, `${label}-seller`);
  const buyer = await createUser(admin, `${label}-buyer`);
  const owned = await admin.query<{ id: string }>(
    `insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
     values ($1, $2, 'PACK', 200)
     returning id`,
    [seller, catalogId],
  );
  const listed = await withUser(seller, async (client) => {
    const result = await client.query<{ list_item: { listingId: string } }>(
      "select public.list_item($1, 45000, $2) as list_item",
      [owned.rows[0].id, `phase21-list-${label}`],
    );
    return result.rows[0].list_item.listingId;
  });
  const cart = await withUser(buyer, async (client) => {
    const result = await client.query<{ add_listing: { cartId: string; lines: Line[] } }>(
      "select public.add_listing($1, $2) as add_listing",
      [listed, `phase21-add-${label}`],
    );
    return result.rows[0].add_listing;
  });
  return { listingId: listed, cart, seller, buyer };
}

async function createPack(admin: pg.Client, label: string): Promise<string> {
  const name = `Phase21 ${label} ${Date.now().toString(36)}`;
  const created = await admin.query<{ id: string }>(
    `insert into public.pack_skus (
       category, name, tier, price_cents, stock_total, stock_on_hand, is_drop, active
     ) values ('TRADING_CARD', $1, $1, 1000, 1, 1, false, true)
     returning id::text`,
    [name],
  );
  const skuId = created.rows[0].id;
  const item = await admin.query<{ id: string }>(
    `insert into public.catalog_items (category, name, rarity, base_value_cents, current_value_cents)
     values ('TRADING_CARD', $1, 'COMMON', 100, 100)
     returning id::text`,
    [`${name} Common`],
  );
  await admin.query(
    "insert into public.pack_sku_items (pack_sku_id, catalog_item_id) values ($1, $2)",
    [skuId, item.rows[0].id],
  );
  await admin.query(
    `insert into public.pack_odds (pack_sku_id, rarity, probability_basis_points)
     values ($1, 'COMMON', 10000)`,
    [skuId],
  );
  return skuId;
}

async function createUser(admin: pg.Client, label: string): Promise<string> {
  const inserted = await admin.query<{ id: string }>(
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
       $1,
       extensions.crypt('Phase21-pass', extensions.gen_salt('bf')),
       now(), now(), now(),
       '', '', '', '', '', '', '',
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{}'::jsonb,
       false,
       false
     )
     returning id::text`,
    [`phase21-${label}-${Date.now().toString(36)}@grailhaus.test`],
  );
  const userId = inserted.rows[0].id;
  await admin.query("select private.apply_deposit($1, 1000000, $2)", [userId, `phase21-fund-${label}-${userId}`]);
  return userId;
}

async function balance(admin: pg.Client, userId: string): Promise<number> {
  const result = await admin.query<{ balance_cents: string }>(
    "select balance_cents::text from public.wallets where user_id = $1",
    [userId],
  );
  return Number(result.rows[0]?.balance_cents ?? "0");
}

type Line = { lineId: string; quantity: number; snapshotPriceCents: string };

async function checkout(
  userId: string,
  cart: { cartId: string; lines: Line[] },
  expected: number,
  key: string,
): Promise<{ ok: boolean; code?: string }> {
  const lines = cart.lines.map((line) => ({
    lineId: line.lineId,
    quantity: line.quantity,
    snapshotPriceCents: Number(line.snapshotPriceCents),
  }));
  return callUser(userId, "select public.checkout($1, $2, $3, $4::jsonb)", [
    cart.cartId,
    expected,
    key,
    JSON.stringify(lines),
  ]);
}

async function callUser(
  userId: string,
  sql: string,
  params: unknown[],
): Promise<{ ok: boolean; code?: string }> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query(sql, params);
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
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
