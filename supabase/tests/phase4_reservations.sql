-- Phase 4 checks. Seed data must already be loaded.
-- Cart mutations roll back with this transaction.

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
  receipt jsonb;
  replay jsonb;
  line_id uuid;
  reserved_units bigint;
  on_hand bigint;
  expires_at timestamptz;
  line_state text;
begin
  select id
    into starter
  from public.pack_skus
  where category = 'TRADING_CARD'
    and name = 'Starter Pack';

  select stock_on_hand
    into on_hand
  from public.pack_skus
  where id = starter;

  receipt := public.reserve_pack(starter, 2, 'phase4-reserve-starter');
  replay := public.reserve_pack(starter, 2, 'phase4-reserve-starter');

  if receipt <> replay then
    raise exception 'reserve replay changed the receipt';
  end if;

  select stock_reserved
    into reserved_units
  from public.pack_skus
  where id = starter;

  if reserved_units <> 2 then
    raise exception 'first reserve held %, expected 2', reserved_units;
  end if;

  if (
    select count(*)
    from public.cart_reservations
    where user_id = reviewer
      and pack_sku_id = starter
      and status = 'ACTIVE'
  ) <> 1 then
    raise exception 'retry created a second active hold';
  end if;

  select (line ->> 'expiresAt')::timestamptz, line ->> 'state', (line ->> 'lineId')::uuid
    into expires_at, line_state, line_id
  from jsonb_array_elements(receipt -> 'lines') line
  where (line ->> 'packSkuId')::uuid = starter;

  if line_state <> 'VALID' then
    raise exception 'new hold state is %', line_state;
  end if;

  if expires_at <= now() or expires_at > now() + interval '5 minutes' then
    raise exception 'hold expiry % is outside the 5 minute window', expires_at;
  end if;

  if (receipt -> 'lines' -> 0 ->> 'snapshotPriceCents')::bigint
     <> (receipt -> 'lines' -> 0 ->> 'currentPriceCents')::bigint then
    raise exception 'new hold snapshot does not match the pack price';
  end if;

  perform public.reserve_pack(starter, 2, 'phase4-reserve-mismatch');
  begin
    perform public.reserve_pack(starter, 9, 'phase4-reserve-mismatch');
    raise exception 'same key accepted a different quantity';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'IDEMPOTENCY_KEY_REUSED' then
        raise exception 'expected IDEMPOTENCY_KEY_REUSED, got %', sqlerrm;
      end if;
  end;

  begin
    perform public.reserve_pack(starter, 100000, 'phase4-too-many');
    raise exception 'oversized quantity was reserved';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'INVALID_QUANTITY' then
        raise exception 'expected INVALID_QUANTITY, got %', sqlerrm;
      end if;
  end;

  begin
    perform public.reserve_pack(starter, on_hand::integer + 1, 'phase4-oversell');
    raise exception 'reservation exceeded stock on hand';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'INSUFFICIENT_STOCK' then
        raise exception 'expected INSUFFICIENT_STOCK, got %', sqlerrm;
      end if;
  end;

  select stock_on_hand, stock_reserved
    into on_hand, reserved_units
  from public.pack_skus
  where id = starter;

  if on_hand < 0 or reserved_units < 0 or reserved_units > on_hand then
    raise exception 'stock counters are on_hand % reserved %', on_hand, reserved_units;
  end if;

  if reserved_units <> 2 then
    raise exception 'failed reserves changed the hold to %', reserved_units;
  end if;

  perform set_config('grailhaus.reservation_admin', 'on', true);
  update public.cart_reservations
  set expires_at = now() - interval '1 second'
  where cart_line_id = line_id
    and status = 'ACTIVE';
  perform set_config('grailhaus.reservation_admin', 'off', true);

  receipt := public.cart_snapshot();
  select line ->> 'state'
    into line_state
  from jsonb_array_elements(receipt -> 'lines') line
  where (line ->> 'lineId')::uuid = line_id;

  if line_state <> 'EXPIRED' then
    raise exception 'expired hold is visible as %', line_state;
  end if;

  select stock_reserved
    into reserved_units
  from public.pack_skus
  where id = starter;

  if reserved_units <> 0 then
    raise exception 'expiry left % units reserved', reserved_units;
  end if;

  begin
    perform public.require_active_pack_hold(line_id);
    raise exception 'expired hold was accepted for checkout';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'RESERVATION_EXPIRED' then
        raise exception 'expected RESERVATION_EXPIRED, got %', sqlerrm;
      end if;
  end;

  receipt := public.retry_pack_reservation(line_id, 'phase4-retry');
  select line ->> 'state'
    into line_state
  from jsonb_array_elements(receipt -> 'lines') line
  where (line ->> 'lineId')::uuid = line_id;

  if line_state <> 'VALID' then
    raise exception 'retry state is %', line_state;
  end if;

  update public.pack_skus
  set price_cents = price_cents + 50
  where id = starter;

  receipt := public.cart_snapshot();
  select line ->> 'state'
    into line_state
  from jsonb_array_elements(receipt -> 'lines') line
  where (line ->> 'lineId')::uuid = line_id;

  if line_state <> 'PRICE_CHANGED' then
    raise exception 'price change state is %', line_state;
  end if;

  perform set_config('grailhaus.reservation_admin', 'on', true);
  update public.cart_reservations
  set expires_at = now() - interval '1 second'
  where cart_line_id = line_id
    and status = 'ACTIVE';
  perform set_config('grailhaus.reservation_admin', 'off', true);
  perform public.cart_snapshot();

  begin
    perform public.retry_pack_reservation(line_id, 'phase4-retry-before-accept');
    raise exception 'retry ignored the new price';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'PRICE_CHANGED' then
        raise exception 'expected PRICE_CHANGED, got %', sqlerrm;
      end if;
  end;

  receipt := public.accept_pack_price(line_id, 'phase4-accept');
  select line ->> 'state', (line ->> 'snapshotPriceCents')::bigint, (line ->> 'currentPriceCents')::bigint
    into line_state, on_hand, reserved_units
  from jsonb_array_elements(receipt -> 'lines') line
  where (line ->> 'lineId')::uuid = line_id;

  if line_state <> 'EXPIRED' or on_hand <> reserved_units then
    raise exception 'accepted price left state %', line_state;
  end if;

  receipt := public.retry_pack_reservation(line_id, 'phase4-retry-after-accept');
  select line ->> 'state'
    into line_state
  from jsonb_array_elements(receipt -> 'lines') line
  where (line ->> 'lineId')::uuid = line_id;

  if line_state <> 'VALID' then
    raise exception 'retry after accept is %', line_state;
  end if;

  perform public.release_pack_line(line_id, 'phase4-release');

  if exists (
    select 1
    from jsonb_array_elements(public.cart_snapshot() -> 'lines') line
    where (line ->> 'lineId')::uuid = line_id
  ) then
    raise exception 'removed line is still in the cart';
  end if;

  if exists (
    select 1
    from public.cart_lines
    where id = line_id
      and removed_at is null
  ) then
    raise exception 'remove deleted the line instead of keeping it';
  end if;

  select stock_reserved
    into reserved_units
  from public.pack_skus
  where id = starter;

  if reserved_units <> 0 then
    raise exception 'remove left % units reserved', reserved_units;
  end if;

  raise notice 'PHASE4_RESERVATIONS_OK';
end $$;

rollback;
