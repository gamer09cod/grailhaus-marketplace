-- Phase 9 checks. Seed data must already be loaded.
-- Cart mutations roll back with this transaction.
-- Marketplace checkout is not this phase.

begin;

do $$
declare
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  collector uuid := '22222222-2222-4222-8222-222222222222';
  catalog_id uuid;
  owned_id uuid;
  second_owned uuid;
  starter uuid;
  active_listing uuid;
  sold_listing uuid;
  board jsonb;
  receipt jsonb;
  line jsonb;
  pack_line jsonb;
  open_lines integer;
  hold_count integer;
  pack_state text;
  listing_state text;
begin
  select id into catalog_id from public.catalog_items where name = 'Harbor Fox';
  select id into starter from public.pack_skus where category = 'TRADING_CARD' and name = 'Starter Pack';

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into owned_id;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
    true
  );

  receipt := public.list_item(owned_id, 45000, 'phase9-list');
  active_listing := (receipt ->> 'listingId')::uuid;

  begin
    perform public.add_listing(active_listing, 'phase9-own');
    raise exception 'seller added their own listing';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'SELF_PURCHASE_FORBIDDEN' then
        raise exception 'expected SELF_PURCHASE_FORBIDDEN, got %', sqlerrm;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
    true
  );

  board := public.marketplace_board();
  if not exists (
    select 1
    from jsonb_array_elements(board -> 'listings') entry
    where entry ->> 'listingId' = active_listing::text
      and (entry ->> 'isOwn')::boolean = false
      and (entry ->> 'priceCents')::bigint = 45000
  ) then
    raise exception 'board did not show the collector listing %', board;
  end if;

  receipt := public.add_listing(active_listing, 'phase9-add');
  perform public.add_listing(active_listing, 'phase9-add-again');

  select count(*)
    into open_lines
  from public.cart_lines line
  join public.carts cart on cart.id = line.cart_id
  where cart.user_id = reviewer
    and line.listing_id = active_listing
    and line.removed_at is null;

  select count(*)
    into hold_count
  from public.cart_reservations reservation
  join public.cart_lines line on line.id = reservation.cart_line_id
  where line.listing_id = active_listing
    and reservation.status = 'ACTIVE';

  select entry
    into line
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') entry
  where entry ->> 'listingId' = active_listing::text;

  if open_lines <> 1 or hold_count <> 0
     or (line ->> 'quantity')::integer <> 1
     or line ->> 'state' <> 'VALID'
     or (line ->> 'snapshotPriceCents')::bigint <> 45000
     or line ->> 'availability' <> 'AVAILABLE' then
    raise exception 'add left lines % holds % row %', open_lines, hold_count, line;
  end if;

  perform public.reserve_pack(starter, 1, 'phase9-pack');

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
    true
  );
  perform public.reprice_listing(active_listing, 50000, 'phase9-reprice');

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
    true
  );

  select entry
    into line
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') entry
  where entry ->> 'listingId' = active_listing::text;

  select entry ->> 'state'
    into pack_state
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') entry
  where entry ->> 'lineType' = 'PACK';

  if line ->> 'state' <> 'LISTING_PRICE_CHANGED'
     or (line ->> 'snapshotPriceCents')::bigint <> 45000
     or (line ->> 'currentPriceCents')::bigint <> 50000
     or pack_state <> 'VALID' then
    raise exception 'repriced cart listing % pack %', line, pack_state;
  end if;

  perform public.accept_listing_price((line ->> 'lineId')::uuid, 'phase9-accept');

  select entry ->> 'state', (entry ->> 'snapshotPriceCents')::bigint
    into listing_state, hold_count
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') entry
  where entry ->> 'listingId' = active_listing::text;

  if listing_state <> 'VALID' or hold_count <> 50000 then
    raise exception 'accepted price is % %', listing_state, hold_count;
  end if;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
    true
  );
  perform public.delist(active_listing, 'phase9-delist');

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
    true
  );

  select entry
    into line
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') entry
  where entry ->> 'listingId' = active_listing::text;

  select entry
    into pack_line
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') entry
  where entry ->> 'lineType' = 'PACK';

  if line ->> 'state' <> 'LISTING_DELISTED' or pack_line ->> 'state' <> 'VALID' then
    raise exception 'delist removed or broke a line % %', line, pack_line;
  end if;

  begin
    perform public.accept_listing_price((line ->> 'lineId')::uuid, 'phase9-accept-delisted');
    raise exception 'delisted price was accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_DELISTED' then
        raise exception 'expected LISTING_DELISTED, got %', sqlerrm;
      end if;
  end;

  select count(*)
    into open_lines
  from public.cart_lines
  where id = (line ->> 'lineId')::uuid
    and removed_at is null;

  if open_lines <> 1 then
    raise exception 'delisted line was removed';
  end if;

  perform public.release_pack_line((pack_line ->> 'lineId')::uuid, 'phase9-release-pack');

  select entry ->> 'state'
    into listing_state
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') entry
  where entry ->> 'listingId' = active_listing::text;

  if listing_state is distinct from 'LISTING_DELISTED' then
    raise exception 'releasing the pack changed the listing line to %', listing_state;
  end if;

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into second_owned;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
    true
  );
  receipt := public.list_item(second_owned, 45000, 'phase9-list-two');
  sold_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
    true
  );
  perform public.reserve_pack(starter, 1, 'phase9-pack-again');
  perform public.add_listing(sold_listing, 'phase9-add-two');

  update public.owned_items
  set owner_id = reviewer,
      state = 'OWNED'
  where id = second_owned;

  update public.marketplace_listings
  set status = 'SOLD',
      sold_at = now()
  where id = sold_listing;

  select entry ->> 'state'
    into listing_state
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') entry
  where entry ->> 'listingId' = sold_listing::text;

  select entry
    into pack_line
  from jsonb_array_elements(public.cart_snapshot() -> 'lines') entry
  where entry ->> 'lineType' = 'PACK';

  if listing_state <> 'LISTING_SOLD' or pack_line ->> 'state' <> 'VALID' then
    raise exception 'sold listing cart is % pack %', listing_state, pack_line;
  end if;

  select count(*)
    into open_lines
  from public.cart_lines
  where listing_id = sold_listing
    and removed_at is null;

  if open_lines <> 1 then
    raise exception 'sold listing left the cart';
  end if;

  begin
    perform public.checkout(
      (public.cart_snapshot() ->> 'cartId')::uuid,
      (pack_line ->> 'snapshotPriceCents')::bigint,
      'phase9-mixed-pay',
      jsonb_build_array(jsonb_build_object(
        'lineId', pack_line ->> 'lineId',
        'quantity', 1,
        'snapshotPriceCents', (pack_line ->> 'snapshotPriceCents')::bigint
      ))
    );
    raise exception 'partial cart was paid';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'CART_CHANGED' then
        raise exception 'expected CART_CHANGED, got %', sqlerrm;
      end if;
  end;

  select count(*)
    into hold_count
  from public.cart_reservations reservation
  where reservation.cart_line_id = (pack_line ->> 'lineId')::uuid
    and reservation.status = 'ACTIVE';

  if hold_count <> 1 then
    raise exception 'rejected mixed checkout released the pack hold';
  end if;

  raise notice 'PHASE9_MARKET_CART_OK';
end;
$$;

rollback;
