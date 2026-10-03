-- Phase 10 checks. Seed data must already be loaded.
-- Checkout mutations roll back with this transaction.
-- Two buyers racing one listing are scripts/buy-race.ts. They need two sessions.

begin;

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
  second_buyer uuid := '33333333-3333-4333-8333-333333333333';
  catalog_id uuid;
  starter uuid;
  owned_id uuid;
  active_listing uuid;
  open_cart uuid;
  pay_lines jsonb;
  receipt jsonb;
  replay jsonb;
  reviewer_balance bigint;
  collector_balance bigint;
  buyer_balance bigint;
  opening_reviewer bigint;
  opening_collector bigint;
  item_owner uuid;
  item_state text;
  item_source text;
  item_price bigint;
  listing_status text;
  hold_status text;
  fee_cents bigint;
  pack_debit bigint;
  market_debit bigint;
  seller_credit bigint;
  content_count integer;
  purchase_count integer;
begin
  select id into catalog_id from public.catalog_items where name = 'Harbor Fox';
  select id into starter
  from public.pack_skus
  where category = 'TRADING_CARD' and tier = 'Starter';

  select balance_cents into opening_reviewer from public.wallets where user_id = reviewer;
  select balance_cents into opening_collector from public.wallets where user_id = collector;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;

  receipt := public.list_item(owned_id, 45000, 'phase10-list-reprice');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  receipt := public.add_listing(active_listing, 'phase10-add-reprice');
  open_cart := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  perform public.reprice_listing(active_listing, 50000, 'phase10-reprice');

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.checkout(open_cart, 45000, 'phase10-pay-reprice', pay_lines);
    raise exception 'repriced listing was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_PRICE_CHANGED' then
        raise exception 'expected LISTING_PRICE_CHANGED, got %', sqlerrm;
      end if;
  end;

  select balance_cents into reviewer_balance from public.wallets where user_id = reviewer;
  select balance_cents into collector_balance from public.wallets where user_id = collector;
  if reviewer_balance <> opening_reviewer or collector_balance <> opening_collector then
    raise exception 'reprice checkout changed wallets % %', reviewer_balance, collector_balance;
  end if;

  perform public.release_pack_line((pay_lines -> 0 ->> 'lineId')::uuid, 'phase10-drop-reprice');

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 45000, 'phase10-list-delist');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  receipt := public.add_listing(active_listing, 'phase10-add-delist');
  open_cart := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line
  where (line ->> 'listingId')::uuid = active_listing;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  perform public.delist(active_listing, 'phase10-delist');

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.checkout(open_cart, 45000, 'phase10-pay-delist', pay_lines);
    raise exception 'delisted listing was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_DELISTED' then
        raise exception 'expected LISTING_DELISTED, got %', sqlerrm;
      end if;
  end;

  select balance_cents into reviewer_balance from public.wallets where user_id = reviewer;
  select balance_cents into collector_balance from public.wallets where user_id = collector;
  if reviewer_balance <> opening_reviewer or collector_balance <> opening_collector then
    raise exception 'delist checkout changed wallets % %', reviewer_balance, collector_balance;
  end if;

  perform public.release_pack_line((pay_lines -> 0 ->> 'lineId')::uuid, 'phase10-drop-delist');

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 45000, 'phase10-list-self');
  active_listing := (receipt ->> 'listingId')::uuid;

  insert into public.carts (user_id, status)
  values (collector, 'OPEN')
  returning id into open_cart;

  insert into public.cart_lines (cart_id, line_type, listing_id, quantity, snapshot_price_cents)
  values (open_cart, 'MARKETPLACE_LISTING', active_listing, 1, 45000)
  returning id into owned_id;

  pay_lines := jsonb_build_array(jsonb_build_object(
    'lineId', owned_id,
    'quantity', 1,
    'snapshotPriceCents', 45000
  ));

  begin
    perform public.checkout(open_cart, 45000, 'phase10-pay-self', pay_lines);
    raise exception 'seller bought their own listing';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'SELF_PURCHASE_FORBIDDEN' then
        raise exception 'expected SELF_PURCHASE_FORBIDDEN, got %', sqlerrm;
      end if;
  end;

  select balance_cents into collector_balance from public.wallets where user_id = collector;
  if collector_balance <> opening_collector then
    raise exception 'self purchase changed the seller wallet to %', collector_balance;
  end if;

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 45000, 'phase10-list-mixed');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  perform public.reserve_pack(starter, 1, 'phase10-reserve-starter');
  receipt := public.add_listing(active_listing, 'phase10-add-mixed');
  open_cart := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;

  if jsonb_array_length(pay_lines) <> 2 then
    raise exception 'mixed cart has % lines', jsonb_array_length(pay_lines);
  end if;

  receipt := public.checkout(open_cart, 46000, 'phase10-pay-mixed', pay_lines);
  replay := public.checkout(open_cart, 46000, 'phase10-pay-mixed', pay_lines);
  if receipt <> replay then
    raise exception 'mixed checkout replay changed the receipt';
  end if;

  if (receipt ->> 'totalCents')::bigint <> 46000
     or (receipt ->> 'balanceCents')::bigint <> opening_reviewer - 46000
     or jsonb_array_length(receipt -> 'packs') <> 1
     or jsonb_array_length(receipt -> 'listings') <> 1
     or (receipt -> 'listings' -> 0 ->> 'feeCents')::bigint <> 3600
     or (receipt -> 'listings' -> 0 ->> 'sellerCents')::bigint <> 41400 then
    raise exception 'mixed receipt is %', receipt;
  end if;

  select balance_cents into reviewer_balance from public.wallets where user_id = reviewer;
  select balance_cents into collector_balance from public.wallets where user_id = collector;
  if reviewer_balance <> opening_reviewer - 46000 or collector_balance <> opening_collector + 41400 then
    raise exception 'mixed balances reviewer % collector %', reviewer_balance, collector_balance;
  end if;

  select owner_id, state, source_type, acquisition_price_cents
    into item_owner, item_state, item_source, item_price
  from public.owned_items
  where id = owned_id;

  select status into listing_status from public.marketplace_listings where id = active_listing;

  if item_owner <> reviewer or item_state <> 'OWNED' or item_source <> 'MARKETPLACE'
     or item_price <> 45000 or listing_status <> 'SOLD' then
    raise exception 'transfer owner % state % source % price % status %',
      item_owner, item_state, item_source, item_price, listing_status;
  end if;

  select count(*) into content_count
  from public.pack_contents content
  join public.purchased_packs pack on pack.id = content.purchased_pack_id
  join public.purchases purchase on purchase.id = pack.purchase_id
  where purchase.idempotency_key = 'phase10-pay-mixed';

  select count(*) into purchase_count
  from public.purchases
  where user_id = reviewer
    and idempotency_key = 'phase10-pay-mixed';

  select amount_cents into pack_debit
  from public.ledger_entries
  where user_id = reviewer and entry_type = 'PACK_PURCHASE' and idempotency_key = 'phase10-pay-mixed';

  select amount_cents into market_debit
  from public.ledger_entries
  where user_id = reviewer and entry_type = 'MARKETPLACE_PURCHASE' and idempotency_key = 'phase10-pay-mixed';

  select amount_cents into seller_credit
  from public.ledger_entries
  where user_id = collector and entry_type = 'MARKETPLACE_SALE' and idempotency_key = 'phase10-pay-mixed';

  select amount_cents into fee_cents
  from public.ledger_entries
  where user_id is null and entry_type = 'MARKETPLACE_FEE' and idempotency_key = 'phase10-pay-mixed';

  select status into hold_status
  from public.cart_reservations hold
  join public.cart_lines cart_line on cart_line.id = hold.cart_line_id
  where cart_line.cart_id = open_cart
    and cart_line.line_type = 'PACK';

  if content_count <> 1 or purchase_count <> 1 or pack_debit <> -1000 or market_debit <> -45000
     or seller_credit <> 41400 or fee_cents <> 3600 or hold_status <> 'CONSUMED' then
    raise exception 'mixed settlement content % purchases % pack % market % seller % fee % hold %',
      content_count, purchase_count, pack_debit, market_debit, seller_credit, fee_cents, hold_status;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new,
    email_change_token_current, recovery_token, phone_change, phone_change_token,
    raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    second_buyer,
    'authenticated',
    'authenticated',
    'buyer2@grailhaus.test',
    extensions.crypt('Reviewer-10000', extensions.gen_salt('bf')),
    now(), now(), now(),
    '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false,
    false
  );

  perform private.apply_deposit(second_buyer, 1000000, 'phase10-fund-buyer');

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 45000, 'phase10-list-race');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  receipt := public.add_listing(active_listing, 'phase10-add-first');
  open_cart := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line
  where (line ->> 'listingId')::uuid = active_listing;

  perform set_config('request.jwt.claim.sub', second_buyer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', second_buyer, 'role', 'authenticated')::text,
    true
  );
  perform public.add_listing(active_listing, 'phase10-add-second');

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  perform public.checkout(open_cart, 45000, 'phase10-pay-first', pay_lines);

  select balance_cents into buyer_balance from public.wallets where user_id = second_buyer;

  perform set_config('request.jwt.claim.sub', second_buyer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', second_buyer, 'role', 'authenticated')::text,
    true
  );

  select id into open_cart from public.carts where user_id = second_buyer and status = 'OPEN';
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line.id,
    'quantity', line.quantity,
    'snapshotPriceCents', line.snapshot_price_cents
  )), '[]'::jsonb)
    into pay_lines
  from public.cart_lines line
  where line.cart_id = open_cart
    and line.removed_at is null;

  begin
    perform public.checkout(open_cart, 45000, 'phase10-pay-second', pay_lines);
    raise exception 'second buyer purchased a sold listing';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_SOLD' then
        raise exception 'expected LISTING_SOLD, got %', sqlerrm;
      end if;
  end;

  select balance_cents into reviewer_balance from public.wallets where user_id = second_buyer;
  select count(*) into purchase_count
  from public.marketplace_listings
  where id = active_listing and status = 'SOLD';
  select owner_id into item_owner from public.owned_items where id = owned_id;

  if reviewer_balance <> buyer_balance or purchase_count <> 1 or item_owner <> reviewer then
    raise exception 'second buyer changed the sale balance % owner %', reviewer_balance, item_owner;
  end if;
end;
$$;

-- Deferred checks must pass for the signed-in role, not only the table owner.
set local role authenticated;
set constraints all immediate;
reset role;

rollback;

\echo PHASE10_CHECKOUT_OK
