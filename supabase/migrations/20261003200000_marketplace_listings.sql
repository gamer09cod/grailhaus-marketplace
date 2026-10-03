-- Sellers list an owned item, change its price, or delist it.
-- A sold listing cannot be changed. The fee quote uses the settlement functions.

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
      'DELIST'
    )
  );

create or replace function public.listing_quote(p_price_cents bigint)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'priceCents', p_price_cents::text,
    'feeCents', public.marketplace_fee_cents(p_price_cents)::text,
    'sellerCents', public.seller_proceeds_cents(p_price_cents)::text
  );
$$;

create or replace function private.listing_receipt(
  p_owned_item_id uuid,
  p_listing_id uuid,
  p_status text,
  p_price_cents bigint,
  p_item_state text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ownedItemId', p_owned_item_id,
    'listingId', p_listing_id,
    'status', p_status,
    'priceCents', p_price_cents::text,
    'feeCents', public.marketplace_fee_cents(p_price_cents)::text,
    'sellerCents', public.seller_proceeds_cents(p_price_cents)::text,
    'itemState', p_item_state
  );
$$;

create or replace function private.apply_list_item(
  p_user_id uuid,
  p_owned_item_id uuid,
  p_price_cents bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  item_owner uuid;
  item_state text;
  active_listing_id uuid;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in to list an item.');
  end if;

  if p_price_cents is null or p_price_cents <= 0 or p_price_cents > 100000000 then
    perform private.raise_domain('INVALID_PRICE', 'Enter a price greater than zero.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'LIST_ITEM', p_idempotency_key);
  if existing is not null then
    return existing;
  end if;

  item_owner := null;
  item_state := null;
  select owner_id, state
    into item_owner, item_state
  from public.owned_items
  where id = p_owned_item_id
  for update;

  if item_owner is null or item_owner is distinct from p_user_id then
    perform private.raise_domain('ITEM_NOT_OWNED', 'You do not own that item.');
  end if;

  if item_state = 'LISTED' then
    perform private.raise_domain('LISTING_ALREADY_ACTIVE', 'That item is already listed.');
  end if;

  if item_state is distinct from 'OWNED' then
    perform private.raise_domain('ITEM_NOT_LISTABLE', 'That item cannot be listed.');
  end if;

  begin
    insert into public.marketplace_listings (owned_item_id, seller_id, price_cents)
    values (p_owned_item_id, p_user_id, p_price_cents)
    returning id into active_listing_id;
  exception
    when unique_violation then
      perform private.raise_domain('LISTING_ALREADY_ACTIVE', 'That item is already listed.');
  end;

  update public.owned_items
  set state = 'LISTED'
  where id = p_owned_item_id;

  return private.finish_idempotency(
    p_user_id,
    'LIST_ITEM',
    p_idempotency_key,
    private.listing_receipt(p_owned_item_id, active_listing_id, 'ACTIVE', p_price_cents, 'LISTED')
  );
end;
$$;

create or replace function private.apply_reprice_listing(
  p_user_id uuid,
  p_listing_id uuid,
  p_price_cents bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  listing_status text;
  listing_seller uuid;
  item_id uuid;
  item_owner uuid;
  item_state text;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in to edit a listing.');
  end if;

  if p_price_cents is null or p_price_cents <= 0 or p_price_cents > 100000000 then
    perform private.raise_domain('INVALID_PRICE', 'Enter a price greater than zero.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'REPRICE_LISTING', p_idempotency_key);
  if existing is not null then
    return existing;
  end if;

  listing_status := null;
  listing_seller := null;
  item_id := null;
  select status, seller_id, owned_item_id
    into listing_status, listing_seller, item_id
  from public.marketplace_listings
  where id = p_listing_id
  for update;

  if listing_seller is null or listing_seller is distinct from p_user_id then
    perform private.raise_domain('LISTING_NOT_OWNED', 'You do not own that listing.');
  end if;

  if listing_status = 'SOLD' then
    perform private.raise_domain('LISTING_SOLD', 'That listing has already sold.');
  end if;

  if listing_status is distinct from 'ACTIVE' then
    perform private.raise_domain('LISTING_NOT_ACTIVE', 'That listing is no longer active.');
  end if;

  item_owner := null;
  item_state := null;
  select owner_id, state
    into item_owner, item_state
  from public.owned_items
  where id = item_id
  for update;

  if item_owner is distinct from p_user_id or item_state is distinct from 'LISTED' then
    perform private.raise_domain('ITEM_NOT_OWNED', 'That item has been transferred.');
  end if;

  update public.marketplace_listings
  set price_cents = p_price_cents
  where id = p_listing_id;

  return private.finish_idempotency(
    p_user_id,
    'REPRICE_LISTING',
    p_idempotency_key,
    private.listing_receipt(item_id, p_listing_id, 'ACTIVE', p_price_cents, 'LISTED')
  );
end;
$$;

create or replace function private.apply_delist(
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
  listing_status text;
  listing_seller uuid;
  listing_price bigint;
  item_id uuid;
  item_owner uuid;
  item_state text;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in to delist an item.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'DELIST', p_idempotency_key);
  if existing is not null then
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

  if listing_seller is null or listing_seller is distinct from p_user_id then
    perform private.raise_domain('LISTING_NOT_OWNED', 'You do not own that listing.');
  end if;

  if listing_status = 'SOLD' then
    perform private.raise_domain('LISTING_SOLD', 'That listing has already sold.');
  end if;

  if listing_status is distinct from 'ACTIVE' then
    perform private.raise_domain('LISTING_NOT_ACTIVE', 'That listing is no longer active.');
  end if;

  item_owner := null;
  item_state := null;
  select owner_id, state
    into item_owner, item_state
  from public.owned_items
  where id = item_id
  for update;

  if item_owner is distinct from p_user_id or item_state is distinct from 'LISTED' then
    perform private.raise_domain('ITEM_NOT_OWNED', 'That item has been transferred.');
  end if;

  update public.marketplace_listings
  set status = 'DELISTED'
  where id = p_listing_id;

  update public.owned_items
  set state = 'OWNED'
  where id = item_id;

  return private.finish_idempotency(
    p_user_id,
    'DELIST',
    p_idempotency_key,
    private.listing_receipt(item_id, p_listing_id, 'DELISTED', listing_price, 'OWNED')
  );
end;
$$;

create or replace function public.list_item(
  p_owned_item_id uuid,
  p_price_cents bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_list_item(auth.uid(), p_owned_item_id, p_price_cents, p_idempotency_key);
end;
$$;

create or replace function public.reprice_listing(
  p_listing_id uuid,
  p_price_cents bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_reprice_listing(auth.uid(), p_listing_id, p_price_cents, p_idempotency_key);
end;
$$;

create or replace function public.delist(
  p_listing_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_delist(auth.uid(), p_listing_id, p_idempotency_key);
end;
$$;

revoke all on function private.listing_receipt(uuid, uuid, text, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_list_item(uuid, uuid, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_reprice_listing(uuid, uuid, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_delist(uuid, uuid, text) from public, anon, authenticated, service_role;

revoke all on function public.listing_quote(bigint) from public, anon;
revoke all on function public.list_item(uuid, bigint, text) from public, anon;
revoke all on function public.reprice_listing(uuid, bigint, text) from public, anon;
revoke all on function public.delist(uuid, text) from public, anon;

grant execute on function public.listing_quote(bigint) to authenticated, service_role;
grant execute on function public.list_item(uuid, bigint, text) to authenticated, service_role;
grant execute on function public.reprice_listing(uuid, bigint, text) to authenticated, service_role;
grant execute on function public.delist(uuid, text) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'owned_items'
  ) then
    alter publication supabase_realtime add table public.owned_items;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'marketplace_listings'
  ) then
    alter publication supabase_realtime add table public.marketplace_listings;
  end if;
end $$;
