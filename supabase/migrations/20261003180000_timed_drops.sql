-- Drop status stays derived from now(). Paying a hold checks the window,
-- not the public SOLD_OUT badge, so the buyer of the last units can finish.

create or replace function private.assert_drop_window(p_pack_sku_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sku_is_drop boolean;
  drop_starts timestamptz;
  drop_ends timestamptz;
begin
  select is_drop
    into sku_is_drop
  from public.pack_skus
  where id = p_pack_sku_id;

  if not found or not sku_is_drop then
    return;
  end if;

  select starts_at, ends_at
    into drop_starts, drop_ends
  from public.drops
  where pack_sku_id = p_pack_sku_id
  for update;

  if not found or now() < drop_starts then
    perform private.raise_domain('DROP_NOT_LIVE', 'That drop is not open.');
  end if;

  if now() >= drop_ends then
    perform private.raise_domain('DROP_ENDED', 'That drop has ended.');
  end if;
end;
$$;

create or replace function private.assert_purchase_limit(
  p_user_id uuid,
  p_pack_sku_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  user_limit integer;
  prior_packs integer;
begin
  select max_per_user
    into user_limit
  from public.pack_skus
  where id = p_pack_sku_id;

  if user_limit is null then
    return;
  end if;

  select count(*)
    into prior_packs
  from public.purchased_packs
  where user_id = p_user_id
    and pack_sku_id = p_pack_sku_id;

  if prior_packs + p_quantity > user_limit then
    perform private.raise_domain(
      'PURCHASE_LIMIT',
      'You have reached the limit for this pack.'
    );
  end if;
end;
$$;

create or replace function private.guard_drop_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.assert_drop_window(new.pack_sku_id);
  perform private.assert_purchase_limit(new.user_id, new.pack_sku_id, new.quantity);
  return new;
end;
$$;

create trigger cart_reservations_drop_gate
before insert on public.cart_reservations
for each row execute function private.guard_drop_reservation();

create or replace function public.drop_board()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'serverNow', now(),
    'drops', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'dropId', derived.id,
          'packSkuId', sku.id,
          'name', sku.name,
          'tier', sku.tier,
          'category', sku.category,
          'priceCents', sku.price_cents::text,
          'reservableQuantity', derived.reservable_quantity::text,
          'maxPerUser', sku.max_per_user,
          'startsAt', derived.starts_at,
          'endsAt', derived.ends_at,
          'status', derived.status
        )
        order by derived.starts_at, sku.name
      )
      from public.drops_with_status derived
      join public.pack_skus sku on sku.id = derived.pack_sku_id
      where sku.active
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.assert_drop_window(uuid) from public, anon, authenticated, service_role;
revoke all on function private.assert_purchase_limit(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function private.guard_drop_reservation() from public, anon, authenticated, service_role;
revoke all on function public.drop_board() from public, anon;
grant execute on function public.drop_board() to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'drops'
  ) then
    alter publication supabase_realtime add table public.drops;
  end if;
end $$;

create or replace function private.apply_pack_checkout(
  p_user_id uuid,
  p_cart_id uuid,
  p_expected_total_cents bigint,
  p_idempotency_key text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  locked_balance bigint;
  open_cart_id uuid;
  server_count integer;
  client_count integer;
  line record;
  client_line jsonb;
  authoritative_total bigint := 0;
  prior_packs integer;
  purchase_id uuid;
  pack_sequence integer := 0;
  unit_index integer;
  purchased_pack_id uuid;
  drawn record;
  pack_rows jsonb := '[]'::jsonb;
  content_rows jsonb;
  receipt jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before paying.');
  end if;

  if p_expected_total_cents is null or p_expected_total_cents < 0 then
    perform private.raise_domain('CHECKOUT_TOTAL_CHANGED', 'Review your cart before paying.');
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' then
    perform private.raise_domain('CART_CHANGED', 'Review your cart before paying.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'CHECKOUT', p_idempotency_key);
  if existing is not null then
    if (existing ->> 'cartId') is distinct from p_cart_id::text
       or (existing ->> 'totalCents')::bigint is distinct from p_expected_total_cents then
      perform private.raise_domain(
        'IDEMPOTENCY_KEY_REUSED',
        'This payment key was already used for a different cart or total.'
      );
    end if;
    return existing;
  end if;

  select balance_cents
    into locked_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    perform private.raise_domain('UNAUTHENTICATED', 'No wallet exists for this account.');
  end if;

  perform public.release_expired_reservations();

  select id
    into open_cart_id
  from public.carts
  where id = p_cart_id
    and user_id = p_user_id
    and status = 'OPEN'
  for update;

  if not found then
    perform private.raise_domain('CART_NOT_OPEN', 'This cart is no longer open.');
  end if;

  if exists (
    select 1
    from public.cart_lines
    where cart_id = open_cart_id
      and removed_at is null
      and line_type <> 'PACK'
  ) then
    perform private.raise_domain(
      'CART_NOT_PACK_ONLY',
      'This cart has an item this payment cannot buy.'
    );
  end if;

  select count(*)
    into server_count
  from public.cart_lines
  where cart_id = open_cart_id
    and removed_at is null
    and line_type = 'PACK';

  client_count := jsonb_array_length(p_lines);
  if server_count = 0 or client_count = 0 then
    perform private.raise_domain('CART_EMPTY', 'Your cart is empty.');
  end if;

  if client_count <> server_count then
    perform private.raise_domain(
      'CART_CHANGED',
      'Some items are no longer available or their price changed.'
    );
  end if;

  perform sku.id
  from public.pack_skus sku
  where sku.id in (
    select pack_sku_id
    from public.cart_lines
    where cart_id = open_cart_id
      and removed_at is null
      and line_type = 'PACK'
  )
  order by sku.id
  for update;

  perform hold.id
  from public.cart_reservations hold
  where hold.cart_line_id in (
    select id
    from public.cart_lines
    where cart_id = open_cart_id
      and removed_at is null
      and line_type = 'PACK'
  )
    and hold.status = 'ACTIVE'
  order by hold.id
  for update;

  perform drop_row.id
  from public.drops drop_row
  where drop_row.pack_sku_id in (
    select pack_sku_id
    from public.cart_lines
    where cart_id = open_cart_id
      and removed_at is null
      and line_type = 'PACK'
  )
  order by drop_row.id
  for update;

  for line in
    select
      cart_line.id,
      cart_line.quantity,
      cart_line.snapshot_price_cents,
      cart_line.pack_sku_id,
      sku.price_cents,
      sku.active,
      sku.is_drop,
      sku.max_per_user,
      sku.stock_on_hand,
      hold.id as hold_id,
      hold.quantity as hold_quantity,
      hold.expires_at
    from public.cart_lines cart_line
    join public.pack_skus sku on sku.id = cart_line.pack_sku_id
    left join public.cart_reservations hold
      on hold.cart_line_id = cart_line.id
     and hold.status = 'ACTIVE'
     and hold.user_id = p_user_id
     and hold.expires_at > now()
    where cart_line.cart_id = open_cart_id
      and cart_line.removed_at is null
      and cart_line.line_type = 'PACK'
    order by cart_line.id
    for update of cart_line
  loop
    client_line := null;
    select element
      into client_line
    from jsonb_array_elements(p_lines) element
    where (element ->> 'lineId')::uuid = line.id;

    if client_line is null then
      perform private.raise_domain(
        'CART_CHANGED',
        'Some items are no longer available or their price changed.'
      );
    end if;

    if (client_line ->> 'quantity')::integer is distinct from line.quantity then
      perform private.raise_domain(
        'QUANTITY_CHANGED',
        'The quantity in your cart changed. Review it before paying.'
      );
    end if;

    if (client_line ->> 'snapshotPriceCents')::bigint is distinct from line.snapshot_price_cents
       or line.snapshot_price_cents is distinct from line.price_cents then
      perform private.raise_domain(
        'PRICE_CHANGED',
        'The pack price changed. Accept the current price before paying.'
      );
    end if;

    if line.hold_id is null then
      if line.stock_on_hand <= 0 then
        perform private.raise_domain('SOLD_OUT', 'That pack is sold out.');
      end if;
      perform private.raise_domain('RESERVATION_EXPIRED', 'These packs are no longer reserved.');
    end if;

    if line.hold_quantity is distinct from line.quantity then
      perform private.raise_domain(
        'QUANTITY_CHANGED',
        'The quantity in your cart changed. Review it before paying.'
      );
    end if;

    if not line.active then
      perform private.raise_domain('PACK_UNAVAILABLE', 'That pack is not for sale.');
    end if;

    perform private.assert_drop_window(line.pack_sku_id);

    if line.max_per_user is not null then
      select count(*)
        into prior_packs
      from public.purchased_packs
      where user_id = p_user_id
        and pack_sku_id = line.pack_sku_id;

      if prior_packs + line.quantity > line.max_per_user then
        perform private.raise_domain(
          'PURCHASE_LIMIT',
          'You have reached the limit for this pack.'
        );
      end if;
    end if;

    authoritative_total := authoritative_total + (line.quantity::bigint * line.price_cents);
  end loop;

  if authoritative_total <> p_expected_total_cents then
    perform private.raise_domain(
      'CHECKOUT_TOTAL_CHANGED',
      'The total changed. Review your cart before paying.',
      jsonb_build_object('totalCents', authoritative_total::text)
    );
  end if;

  if locked_balance < authoritative_total then
    perform private.raise_domain(
      'INSUFFICIENT_BALANCE',
      'You do not have enough in your wallet.',
      jsonb_build_object(
        'balanceCents', locked_balance::text,
        'totalCents', authoritative_total::text
      )
    );
  end if;

  insert into public.purchases (user_id, idempotency_key, total_cents)
  values (p_user_id, p_idempotency_key, authoritative_total)
  returning id into purchase_id;

  for line in
    select cart_line.id, cart_line.quantity, cart_line.pack_sku_id, cart_line.snapshot_price_cents
    from public.cart_lines cart_line
    where cart_line.cart_id = open_cart_id
      and cart_line.removed_at is null
      and cart_line.line_type = 'PACK'
    order by cart_line.id
  loop
    for unit_index in 1..line.quantity loop
      pack_sequence := pack_sequence + 1;

      insert into public.purchased_packs (
        purchase_id, user_id, pack_sku_id, sequence
      ) values (
        purchase_id, p_user_id, line.pack_sku_id, pack_sequence
      )
      returning id into purchased_pack_id;

      select drawn_item.catalog_item_id, drawn_item.rarity
        into drawn
      from private.draw_pack_item(line.pack_sku_id) drawn_item;

      insert into public.pack_contents (
        purchased_pack_id, catalog_item_id, rarity, reveal_order
      ) values (
        purchased_pack_id, drawn.catalog_item_id, drawn.rarity, 1
      );

      insert into public.owned_items (
        owner_id, catalog_item_id, source_type, acquisition_price_cents
      ) values (
        p_user_id, drawn.catalog_item_id, 'PACK', line.snapshot_price_cents
      );

      select jsonb_build_array(jsonb_build_object(
        'catalogItemId', drawn.catalog_item_id,
        'rarity', drawn.rarity,
        'revealOrder', 1
      ))
        into content_rows;

      pack_rows := pack_rows || jsonb_build_array(jsonb_build_object(
        'purchasedPackId', purchased_pack_id,
        'packSkuId', line.pack_sku_id,
        'sequence', pack_sequence,
        'contents', content_rows
      ));
    end loop;

    update public.cart_reservations
    set status = 'CONSUMED'
    where cart_line_id = line.id
      and status = 'ACTIVE';
  end loop;

  insert into public.ledger_entries (
    user_id, entry_type, amount_cents, reference_type, reference_id, idempotency_key
  ) values (
    p_user_id,
    'PACK_PURCHASE',
    -authoritative_total,
    'PURCHASE',
    purchase_id,
    p_idempotency_key
  );

  update public.wallets
  set balance_cents = locked_balance - authoritative_total
  where user_id = p_user_id;

  update public.carts
  set status = 'CHECKED_OUT'
  where id = open_cart_id;

  receipt := jsonb_build_object(
    'purchaseId', purchase_id,
    'cartId', open_cart_id,
    'totalCents', authoritative_total::text,
    'balanceCents', (locked_balance - authoritative_total)::text,
    'idempotencyKey', p_idempotency_key,
    'packs', pack_rows
  );

  return private.finish_idempotency(p_user_id, 'CHECKOUT', p_idempotency_key, receipt);
end;
$$;

