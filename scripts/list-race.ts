import pg from "pg";

const { Client, DatabaseError } = pg;

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const reviewer = "11111111-1111-4111-8111-111111111111";

async function main(): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  let ownedId: string | null = null;

  try {
    const catalog = await admin.query<{ id: string }>(
      "select id from public.catalog_items where name = 'Harbor Fox'",
    );
    const catalogId = catalog.rows[0]?.id;
    if (!catalogId) {
      throw new Error("Harbor Fox is missing.");
    }

    const inserted = await admin.query<{ id: string }>(
      `insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
       values ($1, $2, 'PACK', 200)
       returning id`,
      [reviewer, catalogId],
    );
    ownedId = inserted.rows[0].id;

    const attempts = await Promise.all([
      listOnce(`${ownedId}-a`, ownedId),
      listOnce(`${ownedId}-b`, ownedId),
    ]);
    const wins = attempts.filter((attempt) => attempt.ok).length;
    const losses = attempts.filter((attempt) => !attempt.ok && attempt.code === "LISTING_ALREADY_ACTIVE").length;
    const active = await admin.query<{ count: string }>(
      `select count(*)::text as count
       from public.marketplace_listings
       where owned_item_id = $1 and status = 'ACTIVE'`,
      [ownedId],
    );

    if (wins !== 1 || losses !== 1 || active.rows[0]?.count !== "1") {
      throw new Error(`race result wins ${wins} losses ${losses} active ${active.rows[0]?.count}`);
    }

    console.log("LIST_RACE_OK");
  } finally {
    if (ownedId) {
      await admin.query("delete from public.idempotency_records where user_id = $1 and operation = 'LIST_ITEM'", [
        reviewer,
      ]);
      await admin.query("delete from public.marketplace_listings where owned_item_id = $1", [ownedId]);
      await admin.query("delete from public.owned_items where id = $1", [ownedId]);
    }
    await admin.end();
  }
}

async function listOnce(key: string, ownedId: string): Promise<{ ok: boolean; code?: string }> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [reviewer]);
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: reviewer, role: "authenticated" })],
    );
    await client.query("select public.list_item($1, $2, $3)", [ownedId, 45000, key]);
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
