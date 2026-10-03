-- Phase 5 checks. Seed data must already be loaded.
-- Checkout mutations roll back with this transaction.

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
  starter uuid;
  grail uuid;
  opening_balance bigint;
  balance bigint;
  on_hand bigint;
  opening_on_hand bigint;
  reserved_units bigint;
  receipt jsonb;
  replay jsonb;
  cart_id uuid;
  lines jsonb;
  purchase_count integer;
  ledger_count integer;
  content_count integer;
  owned_count integer;
  fee_count integer;
  cart_status text;
  hold_status text;
  pack_reveal text;
  ledger_sum bigint;
begin
  select id
    into starter
  from public.pack_skus
  where category = 'TRADING_CARD'
    and name = 'Starter Pack';

  select id
    into grail
  from public.pack_skus
  where category = 'WATCH'
    and name = 'Grail Box';

  select balance_cents
    into opening_balance
  from public.wallets
  where user_id = reviewer;

  select stock_on_hand
    into opening_on_hand
  from public.pack_skus
  where id = starter;

  receipt := public.reserve_pack(starter, 1, 'phase5-reserve-starter');
  cart_id := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;

  receipt := public.checkout(cart_id, 1000, 'phase5-pay-starter', lines);
  replay := public.checkout(cart_id, 1000, 'phase5-pay-starter', lines);

  if receipt <> replay then
    raise exception 'checkout replay changed the receipt';
  end if;

  if (receipt ->> 'totalCents')::bigint <> 1000 then
    raise exception 'receipt total is %', receipt ->> 'totalCents';
  end if;

  if (receipt ->> 'balanceCents')::bigint <> opening_balance - 1000 then
    raise exception 'receipt balance is %', receipt ->> 'balanceCents';
  end if;

  if jsonb_array_length(receipt -> 'packs') <> 1 then
    raise exception 'receipt pack count is %', jsonb_array_length(receipt -> 'packs');
  end if;

  if (receipt -> 'packs' -> 0 -> 'contents' -> 0 ->> 'revealOrder')::integer <> 1 then
    raise exception 'content was not written before the receipt';
  end if;

  select balance_cents
    into balance
  from public.wallets
  where user_id = reviewer;

  if balance <> opening_balance - 1000 or balance < 0 then
    raise exception 'wallet is % after checkout', balance;
  end if;

  select coalesce(sum(amount_cents), 0)
    into ledger_sum
  from public.ledger_entries
  where user_id = reviewer;

  if ledger_sum <> balance then
    raise exception 'ledger sum % does not match wallet %', ledger_sum, balance;
  end if;

  select count(*)
    into ledger_count
  from public.ledger_entries
  where user_id = reviewer
    and entry_type = 'PACK_PURCHASE'
    and amount_cents = -1000
    and reference_type = 'PURCHASE'
    and idempotency_key = 'phase5-pay-starter';

  if ledger_count <> 1 then
    raise exception 'pack purchase ledger count is %', ledger_count;
  end if;

  select count(*)
    into fee_count
  from public.ledger_entries
  where reference_id = (receipt ->> 'purchaseId')::uuid
    and entry_type = 'MARKETPLACE_FEE';

  if fee_count <> 0 then
    raise exception 'pack checkout created a marketplace fee';
  end if;

  select stock_on_hand, stock_reserved
    into on_hand, reserved_units
  from public.pack_skus
  where id = starter;

  if on_hand <> opening_on_hand - 1 or reserved_units <> 0 or on_hand < 0 then
    raise exception 'starter stock is on_hand % reserved %', on_hand, reserved_units;
  end if;

  select status
    into hold_status
  from public.cart_reservations
  where cart_line_id = (lines -> 0 ->> 'lineId')::uuid;

  if hold_status <> 'CONSUMED' then
    raise exception 'hold status is %', hold_status;
  end if;

  select count(*), count(contents.id)
    into purchase_count, content_count
  from public.purchased_packs pack
  left join public.pack_contents contents on contents.purchased_pack_id = pack.id
  where pack.purchase_id = (receipt ->> 'purchaseId')::uuid;

  if purchase_count <> 1 or content_count <> 1 then
    raise exception 'purchased packs % contents %', purchase_count, content_count;
  end if;

  select purchased.reveal_state
    into pack_reveal
  from public.purchased_packs purchased
  where purchased.purchase_id = (receipt ->> 'purchaseId')::uuid;

  if pack_reveal <> 'SEALED' then
    raise exception 'reveal state is %', pack_reveal;
  end if;

  select count(*)
    into owned_count
  from public.owned_items
  where owner_id = reviewer
    and source_type = 'PACK'
    and state = 'OWNED'
    and acquisition_price_cents = 1000;

  if owned_count <> 1 then
    raise exception 'owned item count is %', owned_count;
  end if;

  select status
    into cart_status
  from public.carts
  where id = cart_id;

  if cart_status <> 'CHECKED_OUT' then
    raise exception 'cart status is %', cart_status;
  end if;

  begin
    perform public.checkout(cart_id, 999, 'phase5-pay-starter', lines);
    raise exception 'same key accepted a different total';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'IDEMPOTENCY_KEY_REUSED' then
        raise exception 'expected IDEMPOTENCY_KEY_REUSED, got %', sqlerrm;
      end if;
  end;

  begin
    perform public.checkout(cart_id, 1000, 'phase5-pay-starter-again', lines);
    raise exception 'second device checked out the same cart';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'CART_NOT_OPEN' then
        raise exception 'expected CART_NOT_OPEN, got %', sqlerrm;
      end if;
  end;

  select count(*)
    into purchase_count
  from public.purchases
  where user_id = reviewer
    and idempotency_key = 'phase5-pay-starter';

  if purchase_count <> 1 or balance < 0 then
    raise exception 'retry created another purchase or a negative balance';
  end if;

  receipt := public.reserve_pack(grail, 2, 'phase5-reserve-grail');
  cart_id := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;

  begin
    perform public.checkout(cart_id, 1600000, 'phase5-pay-grail', lines);
    raise exception 'checkout spent more than the wallet';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'INSUFFICIENT_BALANCE' then
        raise exception 'expected INSUFFICIENT_BALANCE, got %', sqlerrm;
      end if;
  end;

  select balance_cents
    into balance
  from public.wallets
  where user_id = reviewer;

  if balance <> opening_balance - 1000 or balance < 0 then
    raise exception 'insufficient checkout changed the wallet to %', balance;
  end if;

  select status
    into hold_status
  from public.cart_reservations
  where cart_line_id = (lines -> 0 ->> 'lineId')::uuid;

  if hold_status <> 'ACTIVE' then
    raise exception 'rejected checkout consumed the hold (%).', hold_status;
  end if;

  perform public.release_pack_line((lines -> 0 ->> 'lineId')::uuid, 'phase5-release-grail');

  receipt := public.reserve_pack(starter, 1, 'phase5-reserve-expired');
  cart_id := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;

  perform set_config('grailhaus.reservation_admin', 'on', true);
  update public.cart_reservations
  set expires_at = now() - interval '1 second'
  where cart_line_id = (lines -> 0 ->> 'lineId')::uuid
    and status = 'ACTIVE';
  perform set_config('grailhaus.reservation_admin', 'off', true);

  begin
    perform public.checkout(cart_id, 1000, 'phase5-pay-expired', lines);
    raise exception 'expired hold was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'RESERVATION_EXPIRED' then
        raise exception 'expected RESERVATION_EXPIRED, got %', sqlerrm;
      end if;
  end;

  -- The rejected checkout rolls its sweep back. Release the due hold, then
  -- remove the remaining units so the next payment is a sold-out pack.
  perform public.release_expired_reservations();

  perform private.with_stock_write(starter, -(
    select sku.stock_on_hand from public.pack_skus sku where sku.id = starter
  ), 0);

  begin
    perform public.checkout(cart_id, 1000, 'phase5-pay-sold-out', lines);
    raise exception 'sold-out pack was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'SOLD_OUT' then
        raise exception 'expected SOLD_OUT, got %', sqlerrm;
      end if;
  end;

  perform private.with_stock_write(starter, opening_on_hand - 1, 0);

  select stock_on_hand
    into on_hand
  from public.pack_skus
  where id = starter;

  if on_hand <> opening_on_hand - 1 or on_hand < 0 then
    raise exception 'sold-out restore left on_hand %', on_hand;
  end if;

  receipt := public.reserve_pack(starter, 1, 'phase5-reserve-quantity');
  cart_id := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;
  lines := jsonb_set(lines, '{0,quantity}', '2'::jsonb);

  begin
    perform public.checkout(cart_id, 2000, 'phase5-pay-quantity', lines);
    raise exception 'changed quantity was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'QUANTITY_CHANGED' then
        raise exception 'expected QUANTITY_CHANGED, got %', sqlerrm;
      end if;
  end;

  receipt := public.cart_snapshot();
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;

  begin
    perform public.checkout(cart_id, 1001, 'phase5-pay-total', lines);
    raise exception 'changed total was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'CHECKOUT_TOTAL_CHANGED' then
        raise exception 'expected CHECKOUT_TOTAL_CHANGED, got %', sqlerrm;
      end if;
  end;

  update public.pack_skus
  set price_cents = price_cents + 50
  where id = starter;

  begin
    perform public.checkout(cart_id, 1000, 'phase5-pay-price', lines);
    raise exception 'changed price was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'PRICE_CHANGED' then
        raise exception 'expected PRICE_CHANGED, got %', sqlerrm;
      end if;
  end;

  update public.pack_skus
  set price_cents = price_cents - 50
  where id = starter;

  update public.pack_skus
  set max_per_user = 1
  where id = starter;

  begin
    perform public.checkout(cart_id, 1000, 'phase5-pay-limit', lines);
    raise exception 'purchase limit was ignored';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'PURCHASE_LIMIT' then
        raise exception 'expected PURCHASE_LIMIT, got %', sqlerrm;
      end if;
  end;

  update public.pack_skus
  set max_per_user = null
  where id = starter;

  update public.pack_skus
  set is_drop = true
  where id = starter;

  insert into public.drops (pack_sku_id, starts_at, ends_at, initial_stock)
  select id, now() + interval '1 day', now() + interval '2 days', stock_total
  from public.pack_skus
  where id = starter;

  begin
    perform public.checkout(cart_id, 1000, 'phase5-pay-drop', lines);
    raise exception 'upcoming drop was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'DROP_NOT_LIVE' then
        raise exception 'expected DROP_NOT_LIVE, got %', sqlerrm;
      end if;
  end;

  select balance_cents
    into balance
  from public.wallets
  where user_id = reviewer;

  select stock_on_hand, stock_reserved
    into on_hand, reserved_units
  from public.pack_skus
  where id = starter;

  if balance <> opening_balance - 1000 or balance < 0 then
    raise exception 'later rejections changed the wallet to %', balance;
  end if;

  if on_hand <> opening_on_hand - 1 or reserved_units <> 1 or on_hand < 0 then
    raise exception 'later rejections changed starter stock to on_hand % reserved %',
      on_hand, reserved_units;
  end if;

  select count(*)
    into purchase_count
  from public.purchases
  where user_id = reviewer;

  if purchase_count <> 1 then
    raise exception 'rejected checkouts created % purchases', purchase_count;
  end if;

  if not exists (
    select 1
    from public.pack_contents content
    join public.purchased_packs pack on pack.id = content.purchased_pack_id
    join public.catalog_items item on item.id = content.catalog_item_id
    join public.pack_sku_items pool
      on pool.catalog_item_id = item.id
     and pool.pack_sku_id = starter
    where pack.purchase_id = (
      select id from public.purchases where idempotency_key = 'phase5-pay-starter'
    )
      and content.rarity = item.rarity
  ) then
    raise exception 'pack content is not an item from the starter pool';
  end if;

  raise notice 'PHASE5_CHECKOUT_OK';
end;
$$;

rollback;
