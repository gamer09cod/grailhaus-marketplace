-- Phase 11 checks. Seed data must already be loaded.
-- QA mutations roll back with this transaction.

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
  stand_in uuid := '33333333-3333-4333-8333-333333333333';
  outsider uuid := '44444444-4444-4444-8444-444444444444';
  catalog_id uuid;
  starter uuid;
  midnight uuid;
  owned_id uuid;
  offer_id uuid;
  opening_reviewer bigint;
  opening_collector bigint;
  opening_on_hand bigint;
  reviewer_balance bigint;
  collector_balance bigint;
  buyer_balance bigint;
  on_hand bigint;
  reserved_units bigint;
  receipt jsonb;
  replay jsonb;
  snap jsonb;
  line_state text;
  line_uuid uuid;
  hold_status text;
  drop_status text;
  purchase_count integer;
  fee_cents bigint;
  item_owner uuid;
  listing_status text;
  ledger_sum bigint;
begin
  select id into catalog_id from public.catalog_items where name = 'Harbor Fox';
  select id into starter from public.pack_skus where category = 'TRADING_CARD' and tier = 'Starter';
  select id into midnight from public.pack_skus where category = 'TRADING_CARD' and tier = 'Midnight';
  select balance_cents into opening_reviewer from public.wallets where user_id = reviewer;
  select balance_cents into opening_collector from public.wallets where user_id = collector;
  select stock_on_hand into opening_on_hand from public.pack_skus where id = starter;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', outsider, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.qa_act('setBalance', jsonb_build_object('balanceCents', 1), 'phase11-outsider');
    raise exception 'outsider used the QA menu';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'QA_FORBIDDEN' then
        raise exception 'expected QA_FORBIDDEN, got %', sqlerrm;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  receipt := public.qa_act(
    'buyPack',
    jsonb_build_object('packSkuId', starter, 'quantity', 1),
    'phase11-buy'
  );
  replay := public.qa_act(
    'buyPack',
    jsonb_build_object('packSkuId', starter, 'quantity', 2),
    'phase11-buy'
  );

  if receipt <> replay or (receipt ->> 'quantity')::integer <> 1 then
    raise exception 'buy replay changed the purchase %', replay;
  end if;

  select balance_cents into reviewer_balance from public.wallets where user_id = reviewer;
  select balance_cents into buyer_balance from public.wallets where user_id = stand_in;
  select stock_on_hand, stock_reserved into on_hand, reserved_units from public.pack_skus where id = starter;
  select count(*) into purchase_count
  from public.purchases
  where user_id = stand_in and idempotency_key = 'phase11-buy:pay';

  if reviewer_balance <> opening_reviewer or buyer_balance <> 0
     or on_hand <> opening_on_hand - 1 or reserved_units <> 0 or purchase_count <> 1 then
    raise exception 'buy result reviewer % buyer % on_hand % reserved % purchases %',
      reviewer_balance, buyer_balance, on_hand, reserved_units, purchase_count;
  end if;

  perform public.reserve_pack(starter, 1, 'phase11-reserve');
  perform public.qa_act('expireReservation', '{}'::jsonb, 'phase11-expire');

  select status into hold_status
  from public.cart_reservations
  where user_id = reviewer
    and pack_sku_id = starter
  order by expires_at desc
  limit 1;

  snap := public.cart_snapshot();
  select line ->> 'state'
    into line_state
  from jsonb_array_elements(snap -> 'lines') line
  where (line ->> 'packSkuId')::uuid = starter;

  select stock_reserved into reserved_units from public.pack_skus where id = starter;
  if hold_status <> 'EXPIRED' or line_state <> 'EXPIRED' or reserved_units <> 0 then
    raise exception 'expire left hold % state % reserved %', hold_status, line_state, reserved_units;
  end if;

  select (line ->> 'lineId')::uuid
    into line_uuid
  from jsonb_array_elements(snap -> 'lines') line
  where (line ->> 'packSkuId')::uuid = starter;
  perform public.release_pack_line(line_uuid, 'phase11-drop-pack');

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 45000, 'phase11-list-price');
  offer_id := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  perform public.add_listing(offer_id, 'phase11-add-price');
  perform public.qa_act(
    'repriceListing',
    jsonb_build_object('listingId', offer_id, 'priceCents', 46000),
    'phase11-reprice'
  );

  snap := public.cart_snapshot();
  select line ->> 'state'
    into line_state
  from jsonb_array_elements(snap -> 'lines') line
  where (line ->> 'listingId')::uuid = offer_id;

  if line_state <> 'LISTING_PRICE_CHANGED' then
    raise exception 'reprice left the cart in %', line_state;
  end if;

  select (line ->> 'lineId')::uuid
    into line_uuid
  from jsonb_array_elements(snap -> 'lines') line
  where (line ->> 'listingId')::uuid = offer_id;
  perform public.release_pack_line(line_uuid, 'phase11-drop-price');

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;
  receipt := public.list_item(owned_id, 45000, 'phase11-list-delist');
  offer_id := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  perform public.qa_act('delistListing', jsonb_build_object('listingId', offer_id), 'phase11-delist');
  select status into listing_status from public.marketplace_listings where id = offer_id;
  if listing_status <> 'DELISTED' then
    raise exception 'delist left status %', listing_status;
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
  receipt := public.list_item(owned_id, 45000, 'phase11-list-sell');
  offer_id := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  snap := public.add_listing(offer_id, 'phase11-add-sell');
  perform public.qa_act('sellListing', jsonb_build_object('listingId', offer_id), 'phase11-sell');

  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into receipt
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') line
  where (line ->> 'listingId')::uuid = offer_id;

  begin
    perform public.checkout((snap ->> 'cartId')::uuid, 45000, 'phase11-pay-sold', receipt);
    raise exception 'sold listing was charged to the reviewer';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_SOLD' then
        raise exception 'expected LISTING_SOLD, got %', sqlerrm;
      end if;
  end;

  select owner_id into item_owner from public.owned_items where id = owned_id;
  select status into listing_status from public.marketplace_listings where id = offer_id;
  select balance_cents into reviewer_balance from public.wallets where user_id = reviewer;
  select balance_cents into collector_balance from public.wallets where user_id = collector;
  select amount_cents into fee_cents
  from public.ledger_entries
  where entry_type = 'MARKETPLACE_FEE' and idempotency_key = 'phase11-sell:pay';

  if item_owner <> stand_in or listing_status <> 'SOLD' or reviewer_balance <> opening_reviewer
     or collector_balance <> opening_collector + 41400 or fee_cents <> 3600 then
    raise exception 'sell owner % status % reviewer % collector % fee %',
      item_owner, listing_status, reviewer_balance, collector_balance, fee_cents;
  end if;

  perform public.qa_act('endDrop', jsonb_build_object('packSkuId', midnight), 'phase11-end-drop');
  select status into drop_status from public.drops_with_status where pack_sku_id = midnight;
  if drop_status <> 'ENDED' then
    raise exception 'end drop left status %', drop_status;
  end if;

  perform public.qa_act('startDrop', jsonb_build_object('packSkuId', midnight), 'phase11-start-drop');
  select status into drop_status from public.drops_with_status where pack_sku_id = midnight;
  if drop_status <> 'LIVE' then
    raise exception 'start drop left status %', drop_status;
  end if;

  perform public.qa_act('setBalance', jsonb_build_object('balanceCents', 2500), 'phase11-balance');
  select balance_cents into reviewer_balance from public.wallets where user_id = reviewer;
  select coalesce(sum(amount_cents), 0) into ledger_sum
  from public.ledger_entries
  where user_id = reviewer;

  if reviewer_balance <> 2500 or ledger_sum <> 2500 then
    raise exception 'balance % ledger %', reviewer_balance, ledger_sum;
  end if;
end;
$$;

set local role authenticated;
set constraints all immediate;
reset role;

rollback;

\echo PHASE11_QA_OK
