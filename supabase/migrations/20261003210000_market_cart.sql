-- Active listings can be browsed and added to the cart.
-- A marketplace line has quantity 1 and does not reserve the item.
-- Checkout of a mixed cart is still a later phase.

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
      'ACCEPT_PACK_PRICE',
      'LIST_ITEM',
      'REPRICE_LISTING',
      'DELIST',
      'ADD_LISTING',
      'ACCEPT_LISTING_PRICE'
    )
  );

create unique index cart_lines_one_open_listing_uidx
  on public.cart_lines (cart_id, listing_id)
  where line_type = 'MARKETPLACE_LISTING' and removed_at is null;

create or replace function private.listing_line_state(
  p_snapshot_cents bigint,
  p_current_cents bigint,
  p_status text
)
returns text
language sql
immutable
as $$
  select case
    when p_status = 'SOLD' then 'LISTING_SOLD'
    when p_status is distinct from 'ACTIVE' then 'LISTING_DELISTED'
    when p_snapshot_cents is distinct from p_current_cents then 'LISTING_PRICE_CHANGED'
    else 'VALID'
  end;
$$;

create or replace function public.marketplace_board()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'serverNow', now(),
    'listings', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'listingId', listing.id,
          'name', catalog.name,
          'category', catalog.category,
          'rarity', catalog.rarity,
          'priceCents', listing.price_cents::text,
          'sellerUsername', seller.username,
          'isOwn', listing.seller_id = auth.uid()
        )
        order by listing.created_at desc, catalog.name
      )
      from public.marketplace_listings listing
      join public.owned_items item on item.id = listing.owned_item_id
      join public.catalog_items catalog on catalog.id = item.catalog_item_id
      join public.profiles seller on seller.id = listing.seller_id
      where listing.status = 'ACTIVE'
        and item.state = 'LISTED'
        and item.owner_id = listing.seller_id
    ), '[]'::jsonb)
  );
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

    union all

    select jsonb_build_object(
      'lineId', line.id,
      'lineType', line.line_type,
      'listingId', listing.id,
      'name', catalog.name,
      'category', catalog.category,
      'quantity', line.quantity,
      'snapshotPriceCents', line.snapshot_price_cents::text,
      'currentPriceCents', listing.price_cents::text,
      'sellerUsername', seller.username,
      'availability', case
        when listing.status = 'ACTIVE' then 'AVAILABLE'
        when listing.status = 'SOLD' then 'SOLD'
        else 'DELISTED'
      end,
      'expiresAt', null,
      'state', private.listing_line_state(
        line.snapshot_price_cents,
        listing.price_cents,
        listing.status
      )
    )
    from public.cart_lines line
    join public.marketplace_listings listing on listing.id = line.listing_id
    join public.owned_items item on item.id = listing.owned_item_id
    join public.catalog_items catalog on catalog.id = item.catalog_item_id
    join public.profiles seller on seller.id = listing.seller_id
    where line.cart_id = open_cart_id
      and line.removed_at is null
      and line.line_type = 'MARKETPLACE_LISTING'
  ) built;

  return jsonb_build_object(
    'cartId', open_cart_id,
    'serverNow', server_now,
    'lines', coalesce(lines, '[]'::jsonb)
  );
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

  select line.*
    into found_line
  from public.cart_lines line
  join public.carts cart on cart.id = line.cart_id
  where line.id = p_cart_line_id
    and cart.user_id = p_user_id
    and cart.status = 'OPEN'
    and line.removed_at is null;

  if not found then
    perform private.raise_domain('LINE_NOT_FOUND', 'That cart line is not in your cart.');
  end if;

  if found_line.line_type = 'PACK' then
    update public.cart_reservations
    set status = 'RELEASED'
    where cart_line_id = found_line.id
      and status = 'ACTIVE';
  end if;

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

create or replace function private.apply_add_listing(
  p_user_id uuid,
  p_listing_id uuid,
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
  listing_status text;
  listing_seller uuid;
  listing_price bigint;
  item_id uuid;
  item_owner uuid;
  item_state text;
  receipt jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before adding a listing.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'ADD_LISTING', p_idempotency_key);
  if existing is not null then
    if (existing ->> 'listingId') is distinct from p_listing_id::text then
      perform private.raise_domain(
        'IDEMPOTENCY_KEY_REUSED',
        'This cart key was already used for a different listing.'
      );
    end if;
    return existing;
  end if;

  listing_status := null;
  listing_seller := null;
  listing_price := null;
  item_id := null;
  select status, seller_id, price_cents, owned_item_id
    into listing_status, listing_seller, listing_price, item_id
  from public.marketplace_listings
  where id = p_listing_id
  for update;

  if listing_status is null then
    perform private.raise_domain('LISTING_DELISTED', 'That listing is no longer available.');
  end if;

  if listing_seller = p_user_id then
    perform private.raise_domain('SELF_PURCHASE_FORBIDDEN', 'You cannot buy your own listing.');
  end if;

  if listing_status = 'SOLD' then
    perform private.raise_domain('LISTING_SOLD', 'That listing has been sold.');
  end if;

  if listing_status is distinct from 'ACTIVE' then
    perform private.raise_domain('LISTING_DELISTED', 'The seller removed this listing.');
  end if;

  item_owner := null;
  item_state := null;
  select owner_id, state
    into item_owner, item_state
  from public.owned_items
  where id = item_id
  for update;

  if item_owner is distinct from listing_seller or item_state is distinct from 'LISTED' then
    perform private.raise_domain('LISTING_SOLD', 'That listing has been sold.');
  end if;

  open_cart_id := private.ensure_open_cart(p_user_id);

  if exists (
    select 1
    from public.cart_lines
    where cart_id = open_cart_id
      and listing_id = p_listing_id
      and removed_at is null
  ) then
    receipt := private.cart_snapshot(p_user_id);
  else
    begin
      insert into public.cart_lines (
        cart_id, line_type, listing_id, quantity, snapshot_price_cents
      ) values (
        open_cart_id, 'MARKETPLACE_LISTING', p_listing_id, 1, listing_price
      );
    exception
      when unique_violation then
        null;
    end;
    receipt := private.cart_snapshot(p_user_id);
  end if;

  if not exists (
    select 1
    from public.cart_reservations reservation
    join public.cart_lines line on line.id = reservation.cart_line_id
    where line.cart_id = open_cart_id
      and line.listing_id = p_listing_id
      and reservation.status = 'ACTIVE'
  ) then
    null;
  else
    perform private.raise_domain('LISTING_RESERVED', 'A marketplace listing cannot be reserved.');
  end if;

  receipt := receipt || jsonb_build_object(
    'listingId', p_listing_id,
    'idempotencyKey', p_idempotency_key
  );

  return private.finish_idempotency(p_user_id, 'ADD_LISTING', p_idempotency_key, receipt);
end;
$$;

create or replace function private.apply_accept_listing_price(
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
  listing_status text;
  listing_price bigint;
  receipt jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before changing your cart.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'ACCEPT_LISTING_PRICE', p_idempotency_key);
  if existing is not null then
    if (existing ->> 'cartLineId') is distinct from p_cart_line_id::text then
      perform private.raise_domain(
        'IDEMPOTENCY_KEY_REUSED',
        'This price key was already used for a different cart line.'
      );
    end if;
    return existing;
  end if;

  select line.*
    into found_line
  from public.cart_lines line
  join public.carts cart on cart.id = line.cart_id
  where line.id = p_cart_line_id
    and cart.user_id = p_user_id
    and cart.status = 'OPEN'
    and line.line_type = 'MARKETPLACE_LISTING'
    and line.removed_at is null;

  if not found then
    perform private.raise_domain('LINE_NOT_FOUND', 'That cart line is not in your cart.');
  end if;

  listing_status := null;
  listing_price := null;
  select status, price_cents
    into listing_status, listing_price
  from public.marketplace_listings
  where id = found_line.listing_id
  for update;

  if listing_status = 'SOLD' then
    perform private.raise_domain('LISTING_SOLD', 'That listing has been sold.');
  end if;

  if listing_status is distinct from 'ACTIVE' then
    perform private.raise_domain('LISTING_DELISTED', 'The seller removed this listing.');
  end if;

  update public.cart_lines
  set snapshot_price_cents = listing_price
  where id = found_line.id;

  receipt := private.cart_snapshot(p_user_id)
    || jsonb_build_object(
      'cartLineId', p_cart_line_id,
      'idempotencyKey', p_idempotency_key
    );

  return private.finish_idempotency(
    p_user_id, 'ACCEPT_LISTING_PRICE', p_idempotency_key, receipt
  );
end;
$$;

create or replace function public.add_listing(
  p_listing_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_add_listing(auth.uid(), p_listing_id, p_idempotency_key);
end;
$$;

create or replace function public.accept_listing_price(
  p_cart_line_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_accept_listing_price(auth.uid(), p_cart_line_id, p_idempotency_key);
end;
$$;

revoke all on function private.listing_line_state(bigint, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_add_listing(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_accept_listing_price(uuid, uuid, text) from public, anon, authenticated, service_role;

revoke all on function public.marketplace_board() from public, anon;
revoke all on function public.add_listing(uuid, text) from public, anon;
revoke all on function public.accept_listing_price(uuid, text) from public, anon;

grant execute on function public.marketplace_board() to authenticated, service_role;
grant execute on function public.add_listing(uuid, text) to authenticated, service_role;
grant execute on function public.accept_listing_price(uuid, text) to authenticated, service_role;
