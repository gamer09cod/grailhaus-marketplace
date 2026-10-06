-- Phase 18 checks. Seed data must already be loaded.
-- Pack expected value stays under the pack price. A marketplace sale
-- conserves cents. The reconciliation queries return no rows.
-- Checkout mutations roll back with this transaction.

begin;

create function pg_temp.dollars(cents bigint)
returns text
language sql
immutable
as $$
  select '$' || trim(to_char(cents / 100, 'FM999,999,999'))
    || '.' || lpad((abs(cents) % 100)::text, 2, '0');
$$;

select
  sku.tier,
  sku.name as pack,
  pg_temp.dollars(sku.price_cents) as pack_price,
  pg_temp.dollars(expected.ev_cents) as seed_ev
from public.pack_skus sku
join (
  with rarity_value as (
    select
      pool.pack_sku_id,
      item.rarity,
      (sum(item.base_value_cents) / count(*))::bigint as avg_cents
    from public.pack_sku_items pool
    join public.catalog_items item on item.id = pool.catalog_item_id
    group by pool.pack_sku_id, item.rarity
  )
  select
    odds.pack_sku_id,
    (sum(rarity_value.avg_cents * odds.probability_basis_points) / 10000)::bigint as ev_cents
  from public.pack_odds odds
  join rarity_value
    on rarity_value.pack_sku_id = odds.pack_sku_id
   and rarity_value.rarity = odds.rarity
  group by odds.pack_sku_id
) expected on expected.pack_sku_id = sku.id
order by sku.category, sku.price_cents, sku.name;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

do $$
declare
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  collector uuid := '22222222-2222-4222-8222-222222222222';
  catalog_id uuid;
  starter uuid;
  owned_id uuid;
  second_item uuid;
  active_listing uuid;
  open_cart uuid;
  pay_lines jsonb;
  receipt jsonb;
  replay jsonb;
  purchase_id uuid;
  pack_id uuid;
  stored_reveal text;
  content_count integer;
  purchase_count integer;
  fee_cents bigint;
  seller_credit bigint;
  buyer_debit bigint;
  reviewer_balance bigint;
  collector_balance bigint;
  opening_reviewer bigint;
  opening_collector bigint;
  starter_stock bigint;
  market_sum bigint;
begin
  select id into catalog_id from public.catalog_items where name = 'Harbor Fox';
  select id into starter
  from public.pack_skus
  where category = 'TRADING_CARD' and tier = 'Starter';
  select balance_cents into opening_reviewer from public.wallets where user_id = reviewer;
  select balance_cents into opening_collector from public.wallets where user_id = collector;

  if exists (
    with rarity_value as (
      select
        pool.pack_sku_id,
        item.rarity,
        (sum(item.base_value_cents) / count(*))::bigint as avg_cents
      from public.pack_sku_items pool
      join public.catalog_items item on item.id = pool.catalog_item_id
      group by pool.pack_sku_id, item.rarity
    ),
    expected as (
      select
        sku.name,
        sku.price_cents,
        (sum(rarity_value.avg_cents * odds.probability_basis_points) / 10000)::bigint as ev_cents
      from public.pack_skus sku
      join public.pack_odds odds on odds.pack_sku_id = sku.id
      join rarity_value
        on rarity_value.pack_sku_id = sku.id
       and rarity_value.rarity = odds.rarity
      group by sku.name, sku.price_cents
    ),
    want(name, price_cents, ev_cents) as (
      values
        ('Starter Pack', 1000::bigint, 489::bigint),
        ('Collector Pack', 10000::bigint, 5228::bigint),
        ('Legendary Pack', 50000::bigint, 36775::bigint),
        ('Midnight Drop', 2500::bigint, 489::bigint),
        ('Street Pack', 8000::bigint, 6136::bigint),
        ('Rare Pack', 25000::bigint, 22775::bigint),
        ('Vault Pack', 80000::bigint, 73738::bigint),
        ('Entry Vault', 50000::bigint, 18540::bigint),
        ('Luxury Box', 200000::bigint, 181700::bigint),
        ('Grail Box', 800000::bigint, 739875::bigint)
    )
    select 1
    from want
    full join expected on expected.name = want.name
    where expected.name is null
       or want.name is null
       or expected.price_cents is distinct from want.price_cents
       or expected.ev_cents is distinct from want.ev_cents
       or expected.ev_cents >= expected.price_cents
  ) then
    raise exception 'seeded expected value is missing or not under the pack price';
  end if;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.reserve_pack(starter, 501, 'phase18-too-many');
    raise exception 'reserved more packs than stock';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'INSUFFICIENT_STOCK' then
        raise exception 'expected INSUFFICIENT_STOCK, got %', sqlerrm;
      end if;
  end;

  select stock_on_hand into starter_stock from public.pack_skus where id = starter;
  if starter_stock <> 500 then
    raise exception 'a rejected reserve changed starter stock to %', starter_stock;
  end if;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 45000, 'phase18-list-self');
  active_listing := (receipt ->> 'listingId')::uuid;

  begin
    perform public.list_item(owned_id, 45000, 'phase18-list-again');
    raise exception 'the same item was listed twice';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_ALREADY_ACTIVE' then
        raise exception 'expected LISTING_ALREADY_ACTIVE, got %', sqlerrm;
      end if;
  end;

  begin
    perform public.add_listing(active_listing, 'phase18-add-self');
    raise exception 'the seller added their own listing';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'SELF_PURCHASE_FORBIDDEN' then
        raise exception 'expected SELF_PURCHASE_FORBIDDEN, got %', sqlerrm;
      end if;
  end;

  insert into public.carts (user_id, status)
  values (collector, 'OPEN')
  returning id into open_cart;
  insert into public.cart_lines (cart_id, line_type, listing_id, quantity, snapshot_price_cents)
  values (open_cart, 'MARKETPLACE_LISTING', active_listing, 1, 45000)
  returning id into second_item;
  pay_lines := jsonb_build_array(jsonb_build_object(
    'lineId', second_item,
    'quantity', 1,
    'snapshotPriceCents', 45000
  ));

  begin
    perform public.checkout(open_cart, 45000, 'phase18-pay-self', pay_lines);
    raise exception 'the seller bought their own listing';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'SELF_PURCHASE_FORBIDDEN' then
        raise exception 'expected SELF_PURCHASE_FORBIDDEN, got %', sqlerrm;
      end if;
  end;

  perform public.release_pack_line(second_item, 'phase18-drop-self');
  perform public.delist(active_listing, 'phase18-delist-self');

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 45000, 'phase18-list-delist');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  receipt := public.add_listing(active_listing, 'phase18-add-delist');
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;
  open_cart := (receipt ->> 'cartId')::uuid;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  perform public.delist(active_listing, 'phase18-delist-during');

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.checkout(open_cart, 45000, 'phase18-pay-delist', pay_lines);
    raise exception 'a delisted listing was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_DELISTED' then
        raise exception 'expected LISTING_DELISTED, got %', sqlerrm;
      end if;
  end;

  perform public.release_pack_line((pay_lines -> 0 ->> 'lineId')::uuid, 'phase18-drop-delist');

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 45000, 'phase18-list-reprice');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  receipt := public.add_listing(active_listing, 'phase18-add-reprice');
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;
  open_cart := (receipt ->> 'cartId')::uuid;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  perform public.reprice_listing(active_listing, 46000, 'phase18-reprice');

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.checkout(open_cart, 45000, 'phase18-pay-reprice', pay_lines);
    raise exception 'a changed price was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_PRICE_CHANGED' then
        raise exception 'expected LISTING_PRICE_CHANGED, got %', sqlerrm;
      end if;
  end;

  perform public.release_pack_line((pay_lines -> 0 ->> 'lineId')::uuid, 'phase18-drop-reprice');
  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  perform public.delist(active_listing, 'phase18-delist-reprice');

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 2000000, 'phase18-list-over');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  receipt := public.add_listing(active_listing, 'phase18-add-over');
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;
  open_cart := (receipt ->> 'cartId')::uuid;

  begin
    perform public.checkout(open_cart, 2000000, 'phase18-pay-over', pay_lines);
    raise exception 'the wallet paid more than its balance';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'INSUFFICIENT_BALANCE' then
        raise exception 'expected INSUFFICIENT_BALANCE, got %', sqlerrm;
      end if;
  end;

  perform public.release_pack_line((pay_lines -> 0 ->> 'lineId')::uuid, 'phase18-drop-over');
  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  perform public.delist(active_listing, 'phase18-delist-over');

  select balance_cents into reviewer_balance from public.wallets where user_id = reviewer;
  select balance_cents into collector_balance from public.wallets where user_id = collector;
  if reviewer_balance <> opening_reviewer or collector_balance <> opening_collector then
    raise exception 'a rejected trade changed wallets % %', reviewer_balance, collector_balance;
  end if;

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 1, 'phase18-list-cent');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  receipt := public.add_listing(active_listing, 'phase18-add-cent');
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;
  open_cart := (receipt ->> 'cartId')::uuid;
  receipt := public.checkout(open_cart, 1, 'phase18-pay-cent', pay_lines);
  purchase_id := (receipt ->> 'purchaseId')::uuid;

  select amount_cents into buyer_debit
  from public.ledger_entries
  where reference_id = purchase_id and entry_type = 'MARKETPLACE_PURCHASE';
  select amount_cents into seller_credit
  from public.ledger_entries
  where reference_id = purchase_id and entry_type = 'MARKETPLACE_SALE';
  select count(*) into purchase_count
  from public.ledger_entries
  where reference_id = purchase_id and entry_type = 'MARKETPLACE_FEE';
  if buyer_debit <> -1 or seller_credit <> 1 or purchase_count <> 0
     or public.marketplace_fee_cents(1) <> 0 then
    raise exception 'a 1 cent sale did not floor the fee to zero';
  end if;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into second_item;
  receipt := public.list_item(second_item, 45000, 'phase18-list-sale');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  receipt := public.add_listing(active_listing, 'phase18-add-sale');
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;
  open_cart := (receipt ->> 'cartId')::uuid;
  receipt := public.checkout(open_cart, 45000, 'phase18-pay-sale', pay_lines);
  replay := public.checkout(open_cart, 45000, 'phase18-pay-sale', pay_lines);
  if receipt <> replay then
    raise exception 'the same checkout key changed the receipt';
  end if;
  purchase_id := (receipt ->> 'purchaseId')::uuid;

  select count(*) into purchase_count
  from public.purchases
  where user_id = reviewer and idempotency_key = 'phase18-pay-sale';
  select amount_cents into buyer_debit
  from public.ledger_entries
  where reference_id = purchase_id and entry_type = 'MARKETPLACE_PURCHASE';
  select amount_cents into seller_credit
  from public.ledger_entries
  where reference_id = purchase_id and entry_type = 'MARKETPLACE_SALE';
  select amount_cents into fee_cents
  from public.ledger_entries
  where reference_id = purchase_id and entry_type = 'MARKETPLACE_FEE';
  if purchase_count <> 1 or buyer_debit <> -45000 or seller_credit <> 41400 or fee_cents <> 3600
     or buyer_debit + seller_credit + fee_cents <> 0
     or public.marketplace_fee_cents(45000) <> 3600
     or public.seller_proceeds_cents(45000) <> 41400 then
    raise exception 'the $450 sale did not conserve cents';
  end if;

  perform public.list_item(second_item, 45000, 'phase18-list-back');
  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  select id into active_listing
  from public.marketplace_listings
  where owned_item_id = second_item and status = 'ACTIVE';
  receipt := public.add_listing(active_listing, 'phase18-add-back');
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;
  open_cart := (receipt ->> 'cartId')::uuid;
  perform public.checkout(open_cart, 45000, 'phase18-pay-back', pay_lines);

  select coalesce(sum(amount_cents), 0) into market_sum
  from public.ledger_entries
  where entry_type in ('MARKETPLACE_PURCHASE', 'MARKETPLACE_SALE', 'MARKETPLACE_FEE')
    and idempotency_key like 'phase18-pay-%';
  if market_sum <> 0 then
    raise exception 'buy and sell entries created % cents', market_sum;
  end if;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  receipt := public.reserve_pack(starter, 1, 'phase18-reserve');
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;
  open_cart := (receipt ->> 'cartId')::uuid;
  receipt := public.checkout(open_cart, 1000, 'phase18-pay-pack', pay_lines);
  replay := public.checkout(open_cart, 1000, 'phase18-pay-pack', pay_lines);
  if receipt <> replay or jsonb_array_length(receipt -> 'packs') <> 1 then
    raise exception 'the pack checkout was not idempotent';
  end if;
  pack_id := (receipt -> 'packs' -> 0 ->> 'purchasedPackId')::uuid;
  purchase_id := (receipt ->> 'purchaseId')::uuid;

  select count(*) into content_count from public.pack_contents where purchased_pack_id = pack_id;
  receipt := public.reveal_progress(pack_id, 'OPEN', 'phase18-reveal');
  replay := public.reveal_progress(pack_id, 'OPEN', 'phase18-reveal');
  if receipt <> replay or (receipt ->> 'revealState') <> 'OPEN' then
    raise exception 'the same reveal key changed the open';
  end if;

  begin
    perform public.reveal_progress(pack_id, 'CARD_REVEALED', 'phase18-reveal-skip');
    raise exception 'the reveal skipped ahead';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'REVEAL_STEP' then
        raise exception 'expected REVEAL_STEP, got %', sqlerrm;
      end if;
  end;

  select pack.reveal_state into stored_reveal from public.purchased_packs pack where pack.id = pack_id;
  select count(*) into purchase_count from public.pack_contents where purchased_pack_id = pack_id;
  if stored_reveal <> 'OPEN' or purchase_count <> content_count or content_count <> 1 then
    raise exception 'a second reveal changed the stored card';
  end if;

  select amount_cents into buyer_debit
  from public.ledger_entries
  where reference_id = purchase_id and entry_type = 'PACK_PURCHASE';
  if buyer_debit <> -1000 then
    raise exception 'the pack debit was %', buyer_debit;
  end if;

  begin
    insert into public.ledger_entries (
      user_id, entry_type, amount_cents, reference_type, reference_id, idempotency_key
    ) values
      (reviewer, 'REFUND', 100, 'PURCHASE', purchase_id, 'phase18-refund-a'),
      (reviewer, 'REFUND', 100, 'PURCHASE', purchase_id, 'phase18-refund-b');
    raise exception 'two refunds were inserted for one purchase';
  exception
    when unique_violation then
      null;
  end;

  begin
    set local role authenticated;
    insert into public.ledger_entries (user_id, entry_type, amount_cents)
    values (reviewer, 'REFUND', 100);
    raise exception 'a signed-in client inserted a refund';
  exception
    when insufficient_privilege then
      reset role;
    when others then
      reset role;
      raise;
  end;

  set constraints all immediate;
  set constraints all deferred;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  receipt := public.list_item(second_item, 45000, 'phase18-list-trap');
  active_listing := (receipt ->> 'listingId')::uuid;

  begin
    update public.marketplace_listings
    set status = 'SOLD',
        sold_at = now()
    where id = active_listing;
    raise exception 'a listing sold without changing owner';
  exception
    when sqlstate '23514' then
      null;
  end;

  perform public.delist(active_listing, 'phase18-delist-trap');

  select balance_cents into reviewer_balance from public.wallets where user_id = reviewer;
  select balance_cents into collector_balance from public.wallets where user_id = collector;
  if reviewer_balance <> 995399 or collector_balance <> 996401 then
    raise exception 'balances reviewer % collector %', reviewer_balance, collector_balance;
  end if;

  if exists (select 1 from public.wallets where balance_cents < 0) then
    raise exception 'a wallet is negative';
  end if;

  if exists (
    select 1
    from public.wallets wallet
    left join (
      select user_id, sum(amount_cents) as total
      from public.ledger_entries
      where user_id is not null
      group by user_id
    ) ledger on ledger.user_id = wallet.user_id
    where wallet.balance_cents is distinct from coalesce(ledger.total, 0)
  ) then
    raise exception 'a wallet does not match its ledger';
  end if;

  if exists (
    select 1
    from public.marketplace_listings
    where status = 'ACTIVE'
    group by owned_item_id
    having count(*) > 1
  ) then
    raise exception 'one item has two active listings';
  end if;

  if exists (
    select 1
    from public.marketplace_listings listing
    join public.owned_items item on item.id = listing.owned_item_id
    where listing.status = 'ACTIVE'
      and (
        listing.seller_id is distinct from item.owner_id
        or item.state is distinct from 'LISTED'
      )
  ) then
    raise exception 'an active listing does not match its owner';
  end if;

  if exists (
    select 1
    from public.marketplace_listings listing
    join public.owned_items item on item.id = listing.owned_item_id
    where listing.status = 'SOLD'
      and listing.seller_id = item.owner_id
      and not exists (
        select 1
        from public.marketplace_listings later
        where later.owned_item_id = listing.owned_item_id
          and later.id <> listing.id
          and later.status = 'SOLD'
          and later.sold_at > listing.sold_at
      )
  ) then
    raise exception 'a sold listing still names the current owner';
  end if;

  if exists (
    select 1
    from public.purchases purchase
    left join (
      select reference_id, sum(-amount_cents) as debited
      from public.ledger_entries
      where reference_type = 'PURCHASE'
        and entry_type in ('PACK_PURCHASE', 'MARKETPLACE_PURCHASE')
      group by reference_id
    ) debit on debit.reference_id = purchase.id
    where purchase.status = 'COMPLETED'
      and coalesce(debit.debited, 0) is distinct from purchase.total_cents
  ) then
    raise exception 'a completed purchase has no matching debit';
  end if;

  if exists (
    select 1
    from public.purchases purchase
    join (
      select
        reference_id,
        sum(case when entry_type = 'MARKETPLACE_PURCHASE' then -amount_cents else 0 end) as paid,
        sum(case when entry_type = 'MARKETPLACE_SALE' then amount_cents else 0 end) as credited,
        sum(case when entry_type = 'MARKETPLACE_FEE' then amount_cents else 0 end) as fee
      from public.ledger_entries
      where reference_type = 'PURCHASE'
      group by reference_id
    ) parts on parts.reference_id = purchase.id
    where parts.paid > 0
      and parts.credited + parts.fee is distinct from parts.paid
  ) then
    raise exception 'a marketplace sale does not match its fee';
  end if;
end;
$$;

rollback;

\echo PHASE18_INTEGRITY_OK
