-- Phase 7 checks. Seed data must already be loaded.
-- Drop mutations roll back with this transaction.

begin;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

do $$
declare
  midnight uuid;
  board jsonb;
  status text;
  reservable bigint;
begin
  select id
    into midnight
  from public.pack_skus
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  if midnight is null then
    raise exception 'midnight drop sku is missing';
  end if;

  if (
    select max_per_user
    from public.pack_skus
    where id = midnight
  ) is distinct from 10 then
    raise exception 'midnight drop limit is not 10';
  end if;

  board := public.drop_board();
  if (board ->> 'serverNow')::timestamptz is distinct from now() then
    raise exception 'drop board clock % is not the database clock', board ->> 'serverNow';
  end if;

  if pg_get_function_identity_arguments('public.drop_board()'::regprocedure) <> '' then
    raise exception 'drop board accepts a client clock';
  end if;

  select derived.status, derived.reservable_quantity
    into status, reservable
  from public.drops_with_status derived
  where derived.pack_sku_id = midnight;

  if status is distinct from 'LIVE' or reservable is distinct from 40 then
    raise exception 'seeded drop is % with % remaining', status, reservable;
  end if;
end;
$$;

savepoint not_started;

do $$
declare
  midnight uuid;
  status text;
begin
  select id
    into midnight
  from public.pack_skus
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  update public.drops
  set starts_at = now() + interval '1 day'
  where pack_sku_id = midnight;

  begin
    perform public.reserve_pack(midnight, 1, 'phase7-upcoming');
    raise exception 'upcoming drop was reserved';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'DROP_NOT_LIVE' then
        raise exception 'expected DROP_NOT_LIVE, got %', sqlerrm;
      end if;
  end;

  select derived.status
    into status
  from public.drops_with_status derived
  where derived.pack_sku_id = midnight;

  if status is distinct from 'UPCOMING' then
    raise exception 'future drop status is %', status;
  end if;
end;
$$;

rollback to savepoint not_started;

savepoint starts_open;

do $$
declare
  midnight uuid;
  receipt jsonb;
  line_id uuid;
  status text;
begin
  select id
    into midnight
  from public.pack_skus
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  update public.drops
  set starts_at = now() + interval '1 day'
  where pack_sku_id = midnight;

  update public.drops
  set starts_at = now() - interval '1 minute'
  where pack_sku_id = midnight;

  select derived.status
    into status
  from public.drops_with_status derived
  where derived.pack_sku_id = midnight;

  if status is distinct from 'LIVE' then
    raise exception 'drop that has started is %', status;
  end if;

  receipt := public.reserve_pack(midnight, 1, 'phase7-started');
  line_id := (receipt -> 'lines' -> 0 ->> 'lineId')::uuid;
  perform public.release_pack_line(line_id, 'phase7-release-started');
end;
$$;

rollback to savepoint starts_open;

do $$
declare
  midnight uuid;
begin
  select id
    into midnight
  from public.pack_skus
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  begin
    perform public.reserve_pack(midnight, 11, 'phase7-limit');
    raise exception 'quantity 11 was reserved';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'PURCHASE_LIMIT' then
        raise exception 'expected PURCHASE_LIMIT, got %', sqlerrm;
      end if;
  end;
end;
$$;

savepoint last_units;

do $$
declare
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  midnight uuid;
  receipt jsonb;
  lines jsonb;
  cart_id uuid;
  opening_balance bigint;
  balance bigint;
  status text;
  reservable bigint;
  on_hand bigint;
  reserved_units bigint;
begin
  select id
    into midnight
  from public.pack_skus
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  select balance_cents
    into opening_balance
  from public.wallets
  where user_id = reviewer;

  perform private.with_stock_write(midnight, -39, 0);
  receipt := public.reserve_pack(midnight, 1, 'phase7-last');

  select derived.status, derived.reservable_quantity
    into status, reservable
  from public.drops_with_status derived
  where derived.pack_sku_id = midnight;

  if status is distinct from 'SOLD_OUT' or reservable is distinct from 0 then
    raise exception 'held last unit shows % with % remaining', status, reservable;
  end if;

  cart_id := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;

  perform public.checkout(cart_id, 2500, 'phase7-pay-last', lines);

  select balance_cents
    into balance
  from public.wallets
  where user_id = reviewer;

  select stock_on_hand, stock_reserved
    into on_hand, reserved_units
  from public.pack_skus
  where id = midnight;

  if balance <> opening_balance - 2500 or on_hand <> 0 or reserved_units <> 0 then
    raise exception 'last-unit checkout left balance % stock % reserved %', balance, on_hand, reserved_units;
  end if;
end;
$$;

rollback to savepoint last_units;

savepoint window_ends;

do $$
declare
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  midnight uuid;
  receipt jsonb;
  lines jsonb;
  cart_id uuid;
  opening_balance bigint;
  balance bigint;
  purchase_count integer;
begin
  select id
    into midnight
  from public.pack_skus
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  select balance_cents
    into opening_balance
  from public.wallets
  where user_id = reviewer;

  receipt := public.reserve_pack(midnight, 1, 'phase7-ending');
  cart_id := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;

  update public.drops
  set ends_at = now() - interval '1 second'
  where pack_sku_id = midnight;

  begin
    perform public.checkout(cart_id, 2500, 'phase7-pay-ended', lines);
    raise exception 'ended drop was charged';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'DROP_ENDED' then
        raise exception 'expected DROP_ENDED, got %', sqlerrm;
      end if;
  end;

  select balance_cents
    into balance
  from public.wallets
  where user_id = reviewer;

  select count(*)
    into purchase_count
  from public.purchases
  where user_id = reviewer
    and idempotency_key = 'phase7-pay-ended';

  if balance <> opening_balance or purchase_count <> 0 then
    raise exception 'ended checkout changed the wallet or wrote a purchase';
  end if;
end;
$$;

rollback to savepoint window_ends;

savepoint two_buyers;

do $$
declare
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  collector uuid := '22222222-2222-4222-8222-222222222222';
  midnight uuid;
  on_hand bigint;
  reserved_units bigint;
begin
  select id
    into midnight
  from public.pack_skus
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  perform private.with_stock_write(midnight, -39, 0);
  perform public.reserve_pack(midnight, 1, 'phase7-reviewer-last');

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
    true
  );

  begin
    perform public.reserve_pack(midnight, 1, 'phase7-collector-last');
    raise exception 'second buyer reserved the last unit';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'INSUFFICIENT_STOCK' then
        raise exception 'expected INSUFFICIENT_STOCK, got %', sqlerrm;
      end if;
  end;

  select stock_on_hand, stock_reserved
    into on_hand, reserved_units
  from public.pack_skus
  where id = midnight;

  if on_hand <> 1 or reserved_units <> 1 then
    raise exception 'last unit stock is % reserved %', on_hand, reserved_units;
  end if;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
    true
  );
end;
$$;

rollback to savepoint two_buyers;

do $$
declare
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  midnight uuid;
  balance bigint;
  on_hand bigint;
  reserved_units bigint;
begin
  select id
    into midnight
  from public.pack_skus
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  select balance_cents
    into balance
  from public.wallets
  where user_id = reviewer;

  select stock_on_hand, stock_reserved
    into on_hand, reserved_units
  from public.pack_skus
  where id = midnight;

  if balance <> 1000000 or on_hand <> 40 or reserved_units <> 0 then
    raise exception 'drop tests left balance % stock % reserved %', balance, on_hand, reserved_units;
  end if;

  raise notice 'PHASE7_DROPS_OK';
end;
$$;

rollback;
