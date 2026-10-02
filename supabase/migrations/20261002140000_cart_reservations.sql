-- Pack holds are created here. Checkout still does not consume them.
-- A cart line with reservation history cannot be deleted, so a user remove
-- releases the hold and sets removed_at. Expired lines stay visible.

alter table public.cart_lines
  add column removed_at timestamptz;

alter table public.idempotency_records
  drop constraint idempotency_records_operation_check;

alter table public.idempotency_records
  add constraint idempotency_records_operation_check check (
    operation in (
      'CHECKOUT',
      'DEPOSIT',
      'RESERVE_PACK',
      'RELEASE_PACK_LINE',
      'RETRY_PACK_RESERVATION',
      'ACCEPT_PACK_PRICE'
    )
  );

create unique index cart_lines_one_open_pack_uidx
  on public.cart_lines (cart_id, pack_sku_id)
  where line_type = 'PACK' and removed_at is null;

-- Lock due holds in id order so two sweeps cannot deadlock.
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
begin
  with due as (
    select id
    from public.cart_reservations
    where status = 'ACTIVE'
      and expires_at <= now()
    order by id
    for update
  )
  update public.cart_reservations reservation
  set status = 'EXPIRED'
  from due
  where reservation.id = due.id;

  get diagnostics released_count = row_count;
  return released_count;
end;
$$;

create or replace function private.ensure_open_cart(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cart_id uuid;
begin
  select id
    into cart_id
  from public.carts
  where user_id = p_user_id
    and status = 'OPEN'
  for update;

  if found then
    return cart_id;
  end if;

  begin
    insert into public.carts (user_id)
    values (p_user_id)
    returning id into cart_id;
    return cart_id;
  exception
    when unique_violation then
      select id
        into cart_id
      from public.carts
      where user_id = p_user_id
        and status = 'OPEN';
      return cart_id;
  end;
end;
$$;

-- Null means this transaction claimed the key. A jsonb value is a completed replay.
create or replace function private.claim_idempotency(
  p_user_id uuid,
  p_operation text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_status text;
  existing_response jsonb;
begin
  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 8
     or char_length(p_idempotency_key) > 200 then
    perform private.raise_domain(
      'INVALID_IDEMPOTENCY_KEY',
      'This cart action needs an idempotency key.'
    );
  end if;

  select status, response_json
    into existing_status, existing_response
  from public.idempotency_records
  where user_id = p_user_id
    and operation = p_operation
    and idempotency_key = p_idempotency_key;

  if found then
    if existing_status = 'COMPLETED' then
      return existing_response;
    end if;
    perform private.raise_domain(
      'IDEMPOTENCY_IN_PROGRESS',
      'This cart action is already being confirmed.'
    );
  end if;

  begin
    insert into public.idempotency_records (
      user_id, operation, idempotency_key, status
    ) values (
      p_user_id, p_operation, p_idempotency_key, 'PROCESSING'
    );
  exception
    when unique_violation then
      select status, response_json
        into existing_status, existing_response
      from public.idempotency_records
      where user_id = p_user_id
        and operation = p_operation
        and idempotency_key = p_idempotency_key;

      if existing_status = 'COMPLETED' then
        return existing_response;
      end if;

      perform private.raise_domain(
        'IDEMPOTENCY_IN_PROGRESS',
        'This cart action is already being confirmed.'
      );
  end;

  return null;
end;
$$;

create or replace function private.finish_idempotency(
  p_user_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.idempotency_records
  set status = 'COMPLETED',
      response_json = p_response
  where user_id = p_user_id
    and operation = p_operation
    and idempotency_key = p_idempotency_key;

  return p_response;
end;
$$;

create or replace function private.pack_line_state(
  p_snapshot_cents bigint,
  p_current_cents bigint,
  p_quantity integer,
  p_available bigint,
  p_hold_active boolean
)
returns text
language sql
immutable
as $$
  select case
    when p_hold_active and p_snapshot_cents is distinct from p_current_cents then 'PRICE_CHANGED'
    when p_hold_active then 'VALID'
    when p_available <= 0 then 'SOLD_OUT'
    when p_available < p_quantity then 'PARTIALLY_AVAILABLE'
    when p_snapshot_cents is distinct from p_current_cents then 'PRICE_CHANGED'
    else 'EXPIRED'
  end;
$$;

create or replace function private.cart_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  open_cart_id uuid;
  server_now timestamptz := clock_timestamp();
  lines jsonb;
begin
  perform public.release_expired_reservations();

  select id
    into open_cart_id
  from public.carts
  where user_id = p_user_id
    and status = 'OPEN';

  select coalesce(jsonb_agg(line_json order by line_json ->> 'name'), '[]'::jsonb)
    into lines
  from (
    select jsonb_build_object(
      'lineId', line.id,
      'lineType', line.line_type,
      'packSkuId', line.pack_sku_id,
      'name', sku.name,
      'tier', sku.tier,
      'category', sku.category,
      'quantity', line.quantity,
      'snapshotPriceCents', line.snapshot_price_cents::text,
      'currentPriceCents', sku.price_cents::text,
      'availableQuantity', (
        (sku.stock_on_hand - sku.stock_reserved)
        + case
          when hold.id is not null and hold.expires_at > now() then hold.quantity
          else 0
        end
      )::text,
      'expiresAt', case
        when hold.id is not null and hold.expires_at > now() then hold.expires_at
        else null
      end,
      'state', private.pack_line_state(
        line.snapshot_price_cents,
        sku.price_cents,
        line.quantity,
        (sku.stock_on_hand - sku.stock_reserved)
          + case
            when hold.id is not null and hold.expires_at > now() then hold.quantity
            else 0
          end,
        hold.id is not null and hold.expires_at > now()
      )
    ) as line_json
    from public.cart_lines line
    join public.pack_skus sku on sku.id = line.pack_sku_id
    left join public.cart_reservations hold
      on hold.cart_line_id = line.id
     and hold.status = 'ACTIVE'
    where line.cart_id = open_cart_id
      and line.removed_at is null
      and line.line_type = 'PACK'
  ) built;

  return jsonb_build_object(
    'cartId', open_cart_id,
    'serverNow', server_now,
    'lines', coalesce(lines, '[]'::jsonb)
  );
end;
$$;

create or replace function private.owned_pack_line(
  p_user_id uuid,
  p_cart_line_id uuid
)
returns public.cart_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  found_line public.cart_lines;
begin
  select line.*
    into found_line
  from public.cart_lines line
  join public.carts cart on cart.id = line.cart_id
  where line.id = p_cart_line_id
    and cart.user_id = p_user_id
    and cart.status = 'OPEN'
    and line.line_type = 'PACK'
    and line.removed_at is null;

  if not found then
    perform private.raise_domain('LINE_NOT_FOUND', 'That cart line is not in your cart.');
  end if;

  return found_line;
end;
$$;

create or replace function private.apply_reserve_pack(
  p_user_id uuid,
  p_pack_sku_id uuid,
  p_quantity integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  open_cart_id uuid;
  sku_price bigint;
  sku_active boolean;
  line_id uuid;
  line_quantity integer;
  hold_id uuid;
  receipt jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before reserving a pack.');
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 10000 then
    perform private.raise_domain(
      'INVALID_QUANTITY',
      'Choose a quantity from 1 to 10000.'
    );
  end if;

  existing := private.claim_idempotency(p_user_id, 'RESERVE_PACK', p_idempotency_key);
  if existing is not null then
    if (existing ->> 'packSkuId') is distinct from p_pack_sku_id::text
       or (existing ->> 'quantity')::integer is distinct from p_quantity then
      perform private.raise_domain(
        'IDEMPOTENCY_KEY_REUSED',
        'This reservation key was already used for a different pack or quantity.'
      );
    end if;
    return existing;
  end if;

  perform public.release_expired_reservations();

  select price_cents, active
    into sku_price, sku_active
  from public.pack_skus
  where id = p_pack_sku_id
  for update;

  if not found then
    perform private.raise_domain('PACK_NOT_FOUND', 'That pack is not on the shelf.');
  end if;

  if not sku_active then
    perform private.raise_domain('PACK_UNAVAILABLE', 'That pack is not for sale.');
  end if;

  open_cart_id := private.ensure_open_cart(p_user_id);

  select id, quantity
    into line_id, line_quantity
  from public.cart_lines
  where cart_id = open_cart_id
    and pack_sku_id = p_pack_sku_id
    and line_type = 'PACK'
    and removed_at is null
  for update;

  if found then
    select id
      into hold_id
    from public.cart_reservations
    where cart_line_id = line_id
      and status = 'ACTIVE'
    for update;

    if hold_id is not null then
      update public.cart_reservations
      set status = 'RELEASED'
      where id = hold_id;
    end if;

    update public.cart_lines
    set quantity = p_quantity
    where id = line_id;
  else
    insert into public.cart_lines (
      cart_id, line_type, pack_sku_id, quantity, snapshot_price_cents
    ) values (
      open_cart_id, 'PACK', p_pack_sku_id, p_quantity, sku_price
    )
    returning id into line_id;
  end if;

  begin
    insert into public.cart_reservations (
      user_id, cart_line_id, pack_sku_id, quantity, expires_at
    ) values (
      p_user_id,
      line_id,
      p_pack_sku_id,
      p_quantity,
      now() + interval '5 minutes'
    );
  exception
    when check_violation then
      if sqlerrm like 'stock update rejected%' then
        perform private.raise_domain(
          'INSUFFICIENT_STOCK',
          'Not enough packs are available.',
          jsonb_build_object('quantity', p_quantity)
        );
      end if;
      raise;
  end;

  receipt := private.cart_snapshot(p_user_id)
    || jsonb_build_object(
      'packSkuId', p_pack_sku_id,
      'quantity', p_quantity,
      'idempotencyKey', p_idempotency_key
    );

  return private.finish_idempotency(p_user_id, 'RESERVE_PACK', p_idempotency_key, receipt);
end;
$$;

create or replace function private.apply_release_pack_line(
  p_user_id uuid,
  p_cart_line_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  found_line public.cart_lines;
  receipt jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before changing your cart.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'RELEASE_PACK_LINE', p_idempotency_key);
  if existing is not null then
    if (existing ->> 'cartLineId') is distinct from p_cart_line_id::text then
      perform private.raise_domain(
        'IDEMPOTENCY_KEY_REUSED',
        'This removal key was already used for a different cart line.'
      );
    end if;
    return existing;
  end if;

  perform public.release_expired_reservations();
  found_line := private.owned_pack_line(p_user_id, p_cart_line_id);

  update public.cart_reservations
  set status = 'RELEASED'
  where cart_line_id = found_line.id
    and status = 'ACTIVE';

  update public.cart_lines
  set removed_at = now()
  where id = found_line.id;

  receipt := private.cart_snapshot(p_user_id)
    || jsonb_build_object(
      'cartLineId', p_cart_line_id,
      'idempotencyKey', p_idempotency_key
    );

  return private.finish_idempotency(
    p_user_id, 'RELEASE_PACK_LINE', p_idempotency_key, receipt
  );
end;
$$;

create or replace function private.apply_retry_pack_reservation(
  p_user_id uuid,
  p_cart_line_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  found_line public.cart_lines;
  sku_price bigint;
  free_units bigint;
  receipt jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before reserving a pack.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'RETRY_PACK_RESERVATION', p_idempotency_key);
  if existing is not null then
    if (existing ->> 'cartLineId') is distinct from p_cart_line_id::text then
      perform private.raise_domain(
        'IDEMPOTENCY_KEY_REUSED',
        'This retry key was already used for a different cart line.'
      );
    end if;
    return existing;
  end if;

  perform public.release_expired_reservations();
  found_line := private.owned_pack_line(p_user_id, p_cart_line_id);

  select price_cents, stock_on_hand - stock_reserved
    into sku_price, free_units
  from public.pack_skus
  where id = found_line.pack_sku_id
  for update;

  if exists (
    select 1
    from public.cart_reservations
    where cart_line_id = found_line.id
      and status = 'ACTIVE'
      and expires_at > now()
  ) then
    receipt := private.cart_snapshot(p_user_id);
  elsif found_line.snapshot_price_cents is distinct from sku_price then
    perform private.raise_domain(
      'PRICE_CHANGED',
      'The pack price changed. Accept the current price before reserving again.',
      jsonb_build_object(
        'snapshotPriceCents', found_line.snapshot_price_cents::text,
        'currentPriceCents', sku_price::text
      )
    );
  elsif free_units < found_line.quantity then
    perform private.raise_domain(
      'INSUFFICIENT_STOCK',
      'Not enough packs are available.',
      jsonb_build_object('availableQuantity', greatest(free_units, 0)::text)
    );
  else
    begin
      insert into public.cart_reservations (
        user_id, cart_line_id, pack_sku_id, quantity, expires_at
      ) values (
        p_user_id,
        found_line.id,
        found_line.pack_sku_id,
        found_line.quantity,
        now() + interval '5 minutes'
      );
    exception
      when check_violation then
        if sqlerrm like 'stock update rejected%' then
          perform private.raise_domain(
            'INSUFFICIENT_STOCK',
            'Not enough packs are available.'
          );
        end if;
        raise;
    end;

    receipt := private.cart_snapshot(p_user_id);
  end if;

  receipt := receipt || jsonb_build_object(
    'cartLineId', p_cart_line_id,
    'idempotencyKey', p_idempotency_key
  );

  return private.finish_idempotency(
    p_user_id, 'RETRY_PACK_RESERVATION', p_idempotency_key, receipt
  );
end;
$$;

create or replace function private.apply_accept_pack_price(
  p_user_id uuid,
  p_cart_line_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  found_line public.cart_lines;
  sku_price bigint;
  receipt jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before changing your cart.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'ACCEPT_PACK_PRICE', p_idempotency_key);
  if existing is not null then
    if (existing ->> 'cartLineId') is distinct from p_cart_line_id::text then
      perform private.raise_domain(
        'IDEMPOTENCY_KEY_REUSED',
        'This price key was already used for a different cart line.'
      );
    end if;
    return existing;
  end if;

  perform public.release_expired_reservations();
  found_line := private.owned_pack_line(p_user_id, p_cart_line_id);

  select price_cents
    into sku_price
  from public.pack_skus
  where id = found_line.pack_sku_id
  for update;

  update public.cart_lines
  set snapshot_price_cents = sku_price
  where id = found_line.id;

  receipt := private.cart_snapshot(p_user_id)
    || jsonb_build_object(
      'cartLineId', p_cart_line_id,
      'idempotencyKey', p_idempotency_key
    );

  return private.finish_idempotency(
    p_user_id, 'ACCEPT_PACK_PRICE', p_idempotency_key, receipt
  );
end;
$$;

-- Checkout will call this. An expired or missing hold cannot proceed.
create or replace function private.apply_require_active_pack_hold(
  p_user_id uuid,
  p_cart_line_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_line public.cart_lines;
  hold_expires timestamptz;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before checkout.');
  end if;

  perform public.release_expired_reservations();
  found_line := private.owned_pack_line(p_user_id, p_cart_line_id);

  select expires_at
    into hold_expires
  from public.cart_reservations
  where cart_line_id = found_line.id
    and status = 'ACTIVE'
    and expires_at > now();

  if not found then
    perform private.raise_domain(
      'RESERVATION_EXPIRED',
      'These packs are no longer reserved.'
    );
  end if;

  return jsonb_build_object(
    'cartLineId', found_line.id,
    'quantity', found_line.quantity,
    'expiresAt', hold_expires
  );
end;
$$;

create or replace function public.cart_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in to see your cart.');
  end if;
  return private.cart_snapshot(auth.uid());
end;
$$;

create or replace function public.reserve_pack(
  p_pack_sku_id uuid,
  p_quantity integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_reserve_pack(auth.uid(), p_pack_sku_id, p_quantity, p_idempotency_key);
end;
$$;

create or replace function public.release_pack_line(
  p_cart_line_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_release_pack_line(auth.uid(), p_cart_line_id, p_idempotency_key);
end;
$$;

create or replace function public.retry_pack_reservation(
  p_cart_line_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_retry_pack_reservation(auth.uid(), p_cart_line_id, p_idempotency_key);
end;
$$;

create or replace function public.accept_pack_price(
  p_cart_line_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_accept_pack_price(auth.uid(), p_cart_line_id, p_idempotency_key);
end;
$$;

create or replace function public.require_active_pack_hold(p_cart_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_require_active_pack_hold(auth.uid(), p_cart_line_id);
end;
$$;

revoke all on function private.ensure_open_cart(uuid) from public, anon, authenticated, service_role;
revoke all on function private.claim_idempotency(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function private.finish_idempotency(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.pack_line_state(bigint, bigint, integer, bigint, boolean) from public, anon, authenticated, service_role;
revoke all on function private.cart_snapshot(uuid) from public, anon, authenticated, service_role;
revoke all on function private.owned_pack_line(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.apply_reserve_pack(uuid, uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_release_pack_line(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_retry_pack_reservation(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_accept_pack_price(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_require_active_pack_hold(uuid, uuid) from public, anon, authenticated, service_role;

revoke all on function public.cart_snapshot() from public, anon;
revoke all on function public.reserve_pack(uuid, integer, text) from public, anon;
revoke all on function public.release_pack_line(uuid, text) from public, anon;
revoke all on function public.retry_pack_reservation(uuid, text) from public, anon;
revoke all on function public.accept_pack_price(uuid, text) from public, anon;
revoke all on function public.require_active_pack_hold(uuid) from public, anon;

grant execute on function public.cart_snapshot() to authenticated, service_role;
grant execute on function public.reserve_pack(uuid, integer, text) to authenticated, service_role;
grant execute on function public.release_pack_line(uuid, text) to authenticated, service_role;
grant execute on function public.retry_pack_reservation(uuid, text) to authenticated, service_role;
grant execute on function public.accept_pack_price(uuid, text) to authenticated, service_role;
grant execute on function public.require_active_pack_hold(uuid) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pack_skus'
  ) then
    alter publication supabase_realtime add table public.pack_skus;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cart_reservations'
  ) then
    alter publication supabase_realtime add table public.cart_reservations;
  end if;
end $$;
