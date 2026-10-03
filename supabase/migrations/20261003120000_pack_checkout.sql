-- Pack checkout is one transaction. Contents are written before commit.
-- Marketplace lines are rejected here. Mixed checkout is a later phase.

create or replace function private.draw_pack_item(p_pack_sku_id uuid)
returns table (catalog_item_id uuid, rarity text)
language plpgsql
security definer
set search_path = public
as $$
declare
  roll integer := least(floor(random() * 10000)::integer, 9999);
  cursor_points integer := 0;
  chosen text;
  odd record;
  drawn_item uuid;
  drawn_rarity text;
begin
  for odd in
    select pack_odd.rarity, pack_odd.probability_basis_points
    from public.pack_odds pack_odd
    where pack_odd.pack_sku_id = p_pack_sku_id
    order by private.rarity_rank(pack_odd.rarity)
  loop
    cursor_points := cursor_points + odd.probability_basis_points;
    if roll < cursor_points then
      chosen := odd.rarity;
      exit;
    end if;
  end loop;

  if chosen is null then
    perform private.raise_domain('PACK_ODDS_INVALID', 'This pack has no odds.');
  end if;

  select pool.catalog_item_id, item.rarity
    into drawn_item, drawn_rarity
  from public.pack_sku_items pool
  join public.catalog_items item on item.id = pool.catalog_item_id
  where pool.pack_sku_id = p_pack_sku_id
    and item.rarity = chosen
  order by random()
  limit 1;

  if not found then
    perform private.raise_domain('PACK_ODDS_INVALID', 'This pack has no item for the drawn rarity.');
  end if;

  catalog_item_id := drawn_item;
  rarity := drawn_rarity;
  return next;
end;
$$;

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
  drop_status text;
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

    if line.is_drop then
      select derived.status
        into drop_status
      from public.drops_with_status derived
      where derived.pack_sku_id = line.pack_sku_id;

      if drop_status is distinct from 'LIVE' then
        perform private.raise_domain('DROP_NOT_LIVE', 'That drop is not open.');
      end if;
    end if;

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

create or replace function public.checkout(
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
begin
  return private.apply_pack_checkout(
    auth.uid(),
    p_cart_id,
    p_expected_total_cents,
    p_idempotency_key,
    p_lines
  );
end;
$$;

revoke all on function private.draw_pack_item(uuid) from public, anon, authenticated, service_role;
revoke all on function private.apply_pack_checkout(uuid, uuid, bigint, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.checkout(uuid, bigint, text, jsonb) from public, anon;
grant execute on function public.checkout(uuid, bigint, text, jsonb) to authenticated, service_role;
