-- GrailHaus foundation schema.
--
-- Money is bigint cents. Stock moves only when a reservation is created,
-- released, expired, or consumed. Wallet balances must match the ledger
-- before a transaction can commit. The mobile client has no grants to write
-- these tables.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.reject_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only', tg_table_name
    using errcode = '23514';
end;
$$;

-- 8% = 800 basis points. Integer division floors the fee.
-- Seller proceeds are price - fee, so the split conserves cents.
create or replace function public.marketplace_fee_cents(price_cents bigint)
returns bigint
language plpgsql
immutable
set search_path = public
as $$
begin
  if price_cents is null or price_cents <= 0 then
    raise exception 'price_cents must be positive'
      using errcode = '23514';
  end if;

  return (price_cents * 800) / 10000;
end;
$$;

create or replace function public.seller_proceeds_cents(price_cents bigint)
returns bigint
language sql
immutable
set search_path = public
as $$
  select price_cents - public.marketplace_fee_cents(price_cents);
$$;

-- Drop status is derived from server time and reservable stock.
-- now() is not immutable, so this cannot be a stored generated column.
-- A stored status would become a second source of truth.
create or replace function public.derive_drop_status(
  starts_at timestamptz,
  ends_at timestamptz,
  stock_on_hand bigint,
  stock_reserved bigint
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when now() < starts_at then 'UPCOMING'
    when now() >= ends_at then 'ENDED'
    when (stock_on_hand - stock_reserved) <= 0 then 'SOLD_OUT'
    else 'LIVE'
  end;
$$;

create or replace function private.rarity_rank(rarity text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case rarity
    when 'COMMON' then 1
    when 'UNCOMMON' then 2
    when 'RARE' then 3
    when 'EPIC' then 4
    when 'LEGENDARY' then 5
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Identity and wallet
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 40),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]+$')
);

create unique index profiles_username_lower_uidx
  on public.profiles (lower(username));

create table public.wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance_cents bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint wallets_balance_nonnegative check (balance_cents >= 0)
);

create trigger wallets_touch_updated_at
before update on public.wallets
for each row execute function private.touch_updated_at();

-- Signed from the account holder's point of view.
-- Positive amounts increase a user's wallet. MARKETPLACE_FEE has a null
-- user_id and a positive amount: that is platform revenue, not a user credit.
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete restrict,
  entry_type text not null,
  amount_cents bigint not null,
  reference_type text,
  reference_id uuid,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ledger_entries_type_check check (
    entry_type in (
      'DEPOSIT',
      'PACK_PURCHASE',
      'MARKETPLACE_PURCHASE',
      'MARKETPLACE_SALE',
      'MARKETPLACE_FEE',
      'REFUND'
    )
  ),
  constraint ledger_entries_sign_check check (
    case entry_type
      when 'DEPOSIT' then user_id is not null and amount_cents > 0
      when 'REFUND' then user_id is not null and amount_cents > 0
      when 'MARKETPLACE_SALE' then user_id is not null and amount_cents > 0
      when 'PACK_PURCHASE' then user_id is not null and amount_cents < 0
      when 'MARKETPLACE_PURCHASE' then user_id is not null and amount_cents < 0
      when 'MARKETPLACE_FEE' then user_id is null and amount_cents > 0
      else false
    end
  ),
  constraint ledger_entries_reference_pair_check check (
    (reference_id is null and reference_type is null)
    or (
      reference_id is not null
      and reference_type in ('PURCHASE', 'LISTING', 'DEPOSIT', 'OWNED_ITEM', 'PACK_SKU')
    )
  ),
  constraint ledger_entries_idempotency_key_check check (
    idempotency_key is null or char_length(idempotency_key) between 8 and 200
  )
);

create index ledger_entries_user_created_idx
  on public.ledger_entries (user_id, created_at desc);

-- One financial effect per business reference, per account, per entry type.
-- Null user_id (platform fee) is included so a fee cannot be inserted twice.
create unique index ledger_entries_reference_uidx
  on public.ledger_entries (entry_type, reference_type, reference_id, user_id) nulls not distinct
  where reference_id is not null;

create unique index ledger_entries_idempotency_uidx
  on public.ledger_entries (entry_type, user_id, idempotency_key) nulls not distinct
  where idempotency_key is not null;

create trigger ledger_entries_append_only
before update or delete on public.ledger_entries
for each row execute function private.reject_change();

-- Cached balance is a projection of the ledger. Both directions are checked:
-- a balance write must already match the ledger, and a ledger insert must
-- match the balance before commit. Writers insert the ledger row first, then
-- update the locked wallet.
create or replace function private.assert_wallet_write_matches_ledger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ledger_sum bigint;
begin
  select coalesce(sum(amount_cents), 0)
    into ledger_sum
  from public.ledger_entries
  where user_id = new.user_id;

  if new.balance_cents <> ledger_sum then
    raise exception 'wallet balance % does not match ledger sum % for user %',
      new.balance_cents, ledger_sum, new.user_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.assert_ledger_insert_matches_wallet()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ledger_sum bigint;
  cached_balance bigint;
begin
  if new.user_id is null then
    return null;
  end if;

  select coalesce(sum(amount_cents), 0)
    into ledger_sum
  from public.ledger_entries
  where user_id = new.user_id;

  select balance_cents
    into cached_balance
  from public.wallets
  where user_id = new.user_id;

  if cached_balance is null or cached_balance <> ledger_sum then
    raise exception 'wallet balance % does not match ledger sum % for user %',
      cached_balance, ledger_sum, new.user_id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create trigger wallets_balance_matches_ledger
before insert or update of balance_cents on public.wallets
for each row execute function private.assert_wallet_write_matches_ledger();

create constraint trigger ledger_entries_wallet_matches
after insert on public.ledger_entries
deferrable initially deferred
for each row execute function private.assert_ledger_insert_matches_wallet();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_username text;
begin
  -- 32 hex chars from the user id, prefixed. Always unique and within 40 chars.
  generated_username := 'u' || replace(new.id::text, '-', '');

  insert into public.profiles (id, username)
  values (new.id, generated_username);

  insert into public.wallets (user_id, balance_cents)
  values (new.id, 0);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Catalog and packs
-- ---------------------------------------------------------------------------

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  rarity text not null,
  image_url text,
  base_value_cents bigint not null,
  current_value_cents bigint not null,
  created_at timestamptz not null default now(),
  constraint catalog_items_category_check check (
    category in ('TRADING_CARD', 'WATCH', 'SNEAKER')
  ),
  constraint catalog_items_rarity_check check (
    rarity in ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY')
  ),
  constraint catalog_items_name_check check (char_length(btrim(name)) > 0),
  constraint catalog_items_base_value_check check (base_value_cents > 0),
  constraint catalog_items_current_value_check check (current_value_cents > 0)
);

create index catalog_items_category_idx
  on public.catalog_items (category);

-- stock_on_hand: units not yet sold.
-- stock_reserved: units held by ACTIVE reservations.
-- Reservable quantity is stock_on_hand - stock_reserved.
-- stock_total is the immutable original supply.
create table public.pack_skus (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  tier text not null,
  price_cents bigint not null,
  stock_total bigint not null,
  stock_on_hand bigint not null,
  stock_reserved bigint not null default 0,
  is_drop boolean not null default false,
  max_per_user integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pack_skus_category_check check (
    category in ('TRADING_CARD', 'WATCH', 'SNEAKER')
  ),
  constraint pack_skus_name_check check (char_length(btrim(name)) > 0),
  constraint pack_skus_tier_check check (char_length(btrim(tier)) > 0),
  constraint pack_skus_price_check check (price_cents > 0),
  constraint pack_skus_stock_nonnegative check (
    stock_total >= 0
    and stock_on_hand >= 0
    and stock_reserved >= 0
  ),
  constraint pack_skus_stock_reserved_within_on_hand check (
    stock_reserved <= stock_on_hand
  ),
  constraint pack_skus_on_hand_within_total check (
    stock_on_hand <= stock_total
  ),
  constraint pack_skus_max_per_user_check check (
    max_per_user is null or max_per_user > 0
  )
);

create index pack_skus_category_active_idx
  on public.pack_skus (category)
  where active = true;

create trigger pack_skus_touch_updated_at
before update on public.pack_skus
for each row execute function private.touch_updated_at();

-- Direct stock writes are rejected. Reservation transitions set a
-- transaction-local flag before they update these counters.
create or replace function private.guard_pack_stock_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stock_total is distinct from old.stock_total then
    raise exception 'stock_total is immutable'
      using errcode = '23514';
  end if;

  if new.stock_on_hand is distinct from old.stock_on_hand
     or new.stock_reserved is distinct from old.stock_reserved then
    if current_setting('grailhaus.stock_write', true) is distinct from 'on' then
      raise exception 'stock counters change only through reservation transitions'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger pack_skus_guard_stock
before update on public.pack_skus
for each row execute function private.guard_pack_stock_write();

create table public.pack_odds (
  id uuid primary key default gen_random_uuid(),
  pack_sku_id uuid not null references public.pack_skus (id) on delete restrict,
  rarity text not null,
  probability_basis_points integer not null,
  constraint pack_odds_rarity_check check (
    rarity in ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY')
  ),
  constraint pack_odds_probability_check check (
    probability_basis_points > 0 and probability_basis_points <= 10000
  ),
  constraint pack_odds_sku_rarity_uidx unique (pack_sku_id, rarity)
);

create index pack_odds_pack_sku_id_idx
  on public.pack_odds (pack_sku_id);

create or replace function private.enforce_pack_odds_total()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sku_id uuid;
  total integer;
begin
  sku_id := coalesce(new.pack_sku_id, old.pack_sku_id);

  select coalesce(sum(probability_basis_points), 0)
    into total
  from public.pack_odds
  where pack_sku_id = sku_id;

  -- No rows is allowed until a later phase sells the SKU.
  -- Any rows that exist must sum to exactly 10000 basis points.
  if total <> 0 and total <> 10000 then
    raise exception 'pack odds for % sum to % basis points, expected 10000',
      sku_id, total
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger pack_odds_sum_10000
after insert or update or delete on public.pack_odds
deferrable initially deferred
for each row execute function private.enforce_pack_odds_total();

-- Schedule only. Status is public.drops_with_status, computed from now().
create table public.drops (
  id uuid primary key default gen_random_uuid(),
  pack_sku_id uuid not null unique references public.pack_skus (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  initial_stock bigint not null,
  created_at timestamptz not null default now(),
  constraint drops_window_check check (ends_at > starts_at),
  constraint drops_initial_stock_check check (initial_stock >= 0)
);

create index drops_starts_at_idx
  on public.drops (starts_at);

create or replace function private.enforce_drop_supply()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sku_total bigint;
begin
  select stock_total
    into sku_total
  from public.pack_skus
  where id = new.pack_sku_id;

  if sku_total is null or sku_total <> new.initial_stock then
    raise exception 'drop initial_stock must equal pack stock_total'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger drops_supply_matches_sku
after insert or update on public.drops
deferrable initially deferred
for each row execute function private.enforce_drop_supply();

create view public.drops_with_status
with (security_invoker = true) as
select
  d.id,
  d.pack_sku_id,
  d.starts_at,
  d.ends_at,
  d.initial_stock,
  d.created_at,
  public.derive_drop_status(
    d.starts_at,
    d.ends_at,
    s.stock_on_hand,
    s.stock_reserved
  ) as status,
  (s.stock_on_hand - s.stock_reserved) as reservable_quantity
from public.drops d
join public.pack_skus s on s.id = d.pack_sku_id;

-- ---------------------------------------------------------------------------
-- Carts, reservations, purchases
-- ---------------------------------------------------------------------------

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_status_check check (status in ('OPEN', 'CHECKED_OUT', 'ABANDONED'))
);

create unique index carts_one_open_per_user_uidx
  on public.carts (user_id)
  where status = 'OPEN';

create index carts_user_id_idx
  on public.carts (user_id);

create trigger carts_touch_updated_at
before update on public.carts
for each row execute function private.touch_updated_at();

create table public.owned_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  catalog_item_id uuid not null references public.catalog_items (id) on delete restrict,
  source_type text not null,
  acquisition_price_cents bigint not null,
  acquired_at timestamptz not null default now(),
  state text not null default 'OWNED',
  constraint owned_items_source_check check (source_type in ('PACK', 'MARKETPLACE')),
  constraint owned_items_price_check check (acquisition_price_cents >= 0),
  constraint owned_items_state_check check (state in ('OWNED', 'LISTED', 'TRANSFERRING'))
);

create index owned_items_owner_idx
  on public.owned_items (owner_id, state);

create index owned_items_catalog_item_idx
  on public.owned_items (catalog_item_id);

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  owned_item_id uuid not null references public.owned_items (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  price_cents bigint not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sold_at timestamptz,
  constraint marketplace_listings_price_check check (price_cents > 0),
  constraint marketplace_listings_status_check check (
    status in ('ACTIVE', 'SOLD', 'DELISTED')
  ),
  constraint marketplace_listings_sold_at_check check (
    (status = 'SOLD' and sold_at is not null)
    or (status <> 'SOLD' and sold_at is null)
  )
);

create unique index marketplace_listings_one_active_uidx
  on public.marketplace_listings (owned_item_id)
  where status = 'ACTIVE';

create index marketplace_listings_owned_item_idx
  on public.marketplace_listings (owned_item_id);

create index marketplace_listings_seller_idx
  on public.marketplace_listings (seller_id);

create index marketplace_listings_active_created_idx
  on public.marketplace_listings (created_at desc)
  where status = 'ACTIVE';

create trigger marketplace_listings_touch_updated_at
before update on public.marketplace_listings
for each row execute function private.touch_updated_at();

-- At commit: LISTED means exactly one active listing by the current owner.
-- OWNED means no active listing. A sold listing must belong to the previous
-- owner, not the current one. TRANSFERRING may exist only inside a transaction.
create or replace function private.assert_owned_item_listing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item_id uuid;
  item_state text;
  item_owner uuid;
  active_count bigint;
  active_seller uuid;
begin
  if tg_table_name = 'owned_items' then
    item_id := new.id;
  else
    item_id := new.owned_item_id;
  end if;

  select state, owner_id
    into item_state, item_owner
  from public.owned_items
  where id = item_id;

  if not found then
    return null;
  end if;

  if item_state = 'TRANSFERRING' then
    raise exception 'owned item % cannot commit while TRANSFERRING', item_id
      using errcode = '23514';
  end if;

  select count(*)
    into active_count
  from public.marketplace_listings
  where owned_item_id = item_id
    and status = 'ACTIVE';

  select seller_id
    into active_seller
  from public.marketplace_listings
  where owned_item_id = item_id
    and status = 'ACTIVE'
  limit 1;

  if item_state = 'LISTED' then
    if active_count <> 1 or active_seller <> item_owner then
      raise exception 'listed item % needs one active listing by its owner', item_id
        using errcode = '23514';
    end if;
  elsif active_count <> 0 then
    raise exception 'owned item % has an active listing but is not LISTED', item_id
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.marketplace_listings
    where owned_item_id = item_id
      and status in ('ACTIVE', 'DELISTED')
      and seller_id <> item_owner
  ) then
    raise exception 'listing seller does not match owner for item %', item_id
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.marketplace_listings
    where owned_item_id = item_id
      and status = 'SOLD'
      and seller_id = item_owner
  ) then
    raise exception 'sold listing for item % still names the current owner', item_id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger owned_items_listing_consistent
after insert or update on public.owned_items
deferrable initially deferred
for each row execute function private.assert_owned_item_listing();

create constraint trigger marketplace_listings_owner_consistent
after insert or update on public.marketplace_listings
deferrable initially deferred
for each row execute function private.assert_owned_item_listing();

create table public.cart_lines (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete restrict,
  line_type text not null,
  pack_sku_id uuid references public.pack_skus (id) on delete restrict,
  listing_id uuid references public.marketplace_listings (id) on delete restrict,
  quantity integer not null,
  snapshot_price_cents bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_lines_type_check check (line_type in ('PACK', 'MARKETPLACE_LISTING')),
  constraint cart_lines_shape_check check (
    (
      line_type = 'PACK'
      and pack_sku_id is not null
      and listing_id is null
      and quantity > 0
    )
    or (
      line_type = 'MARKETPLACE_LISTING'
      and listing_id is not null
      and pack_sku_id is null
      and quantity = 1
    )
  ),
  constraint cart_lines_price_check check (snapshot_price_cents > 0)
);

create index cart_lines_cart_id_idx
  on public.cart_lines (cart_id);

create index cart_lines_pack_sku_id_idx
  on public.cart_lines (pack_sku_id);

create index cart_lines_listing_id_idx
  on public.cart_lines (listing_id);

create trigger cart_lines_touch_updated_at
before update on public.cart_lines
for each row execute function private.touch_updated_at();

create or replace function private.guard_reserved_cart_line()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quantity is distinct from old.quantity
     or new.pack_sku_id is distinct from old.pack_sku_id
     or new.line_type is distinct from old.line_type
     or new.listing_id is distinct from old.listing_id then
    if exists (
      select 1
      from public.cart_reservations reservation
      where reservation.cart_line_id = old.id
        and reservation.status = 'ACTIVE'
    ) then
      raise exception 'cannot change a cart line that has an active reservation'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger cart_lines_guard_active_reservation
before update on public.cart_lines
for each row execute function private.guard_reserved_cart_line();

create table public.cart_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  cart_line_id uuid not null references public.cart_lines (id) on delete restrict,
  pack_sku_id uuid not null references public.pack_skus (id) on delete restrict,
  quantity integer not null,
  expires_at timestamptz not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  constraint cart_reservations_quantity_check check (quantity > 0),
  constraint cart_reservations_status_check check (
    status in ('ACTIVE', 'CONSUMED', 'EXPIRED', 'RELEASED')
  )
);

create unique index cart_reservations_one_active_line_uidx
  on public.cart_reservations (cart_line_id)
  where status = 'ACTIVE';

create index cart_reservations_user_idx
  on public.cart_reservations (user_id);

create index cart_reservations_pack_sku_idx
  on public.cart_reservations (pack_sku_id);

create index cart_reservations_active_expiry_idx
  on public.cart_reservations (expires_at)
  where status = 'ACTIVE';

create or replace function private.with_stock_write(sku_id uuid, on_hand_delta bigint, reserved_delta bigint)
returns void
language plpgsql
set search_path = public
as $$
declare
  updated_rows integer;
begin
  -- The flag is transaction-local. The stock guard rejects writes without it,
  -- including writes from the table owner and the service role.
  perform set_config('grailhaus.stock_write', 'on', true);

  update public.pack_skus
  set
    stock_on_hand = stock_on_hand + on_hand_delta,
    stock_reserved = stock_reserved + reserved_delta
  where id = sku_id
    and stock_on_hand + on_hand_delta >= 0
    and stock_reserved + reserved_delta >= 0
    and stock_reserved + reserved_delta <= stock_on_hand + on_hand_delta
    and (
      reserved_delta <= 0
      or (stock_on_hand - stock_reserved) >= reserved_delta
    );

  get diagnostics updated_rows = row_count;

  perform set_config('grailhaus.stock_write', 'off', true);

  if updated_rows <> 1 then
    raise exception 'stock update rejected for sku %', sku_id
      using errcode = '23514';
  end if;
end;
$$;

create or replace function private.prepare_reservation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  line_user uuid;
  line_type text;
  line_sku uuid;
  line_quantity integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'reservations cannot be deleted'
      using errcode = '23514';
  end if;

  select c.user_id, cl.line_type, cl.pack_sku_id, cl.quantity
    into line_user, line_type, line_sku, line_quantity
  from public.cart_lines cl
  join public.carts c on c.id = cl.cart_id
  where cl.id = new.cart_line_id;

  if line_type is distinct from 'PACK'
     or line_sku is distinct from new.pack_sku_id
     or line_quantity is distinct from new.quantity
     or line_user is distinct from new.user_id then
    raise exception 'reservation does not match its cart line'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'ACTIVE' then
      raise exception 'reservations are created ACTIVE'
        using errcode = '23514';
    end if;

    -- Server clock only. A longer hold cannot be requested by any role
    -- unless the test/admin flag is set inside this transaction.
    if current_setting('grailhaus.reservation_admin', true) is distinct from 'on' then
      if new.expires_at <= now() or new.expires_at > now() + interval '5 minutes' then
        raise exception 'reservation expiry must be within 5 minutes of server time'
          using errcode = '23514';
      end if;
    end if;

    return new;
  end if;

  if old.quantity <> new.quantity
     or old.pack_sku_id <> new.pack_sku_id
     or old.user_id <> new.user_id
     or old.cart_line_id <> new.cart_line_id then
    raise exception 'reservation identity columns are immutable'
      using errcode = '23514';
  end if;

  if old.expires_at is distinct from new.expires_at
     and current_setting('grailhaus.reservation_admin', true) is distinct from 'on' then
    raise exception 'reservation expiry changes only through the admin flag'
      using errcode = '23514';
  end if;

  if old.status = new.status then
    return new;
  end if;

  if old.status <> 'ACTIVE' then
    raise exception 'reservation % is already %', old.id, old.status
      using errcode = '23514';
  end if;

  if new.status not in ('CONSUMED', 'EXPIRED', 'RELEASED') then
    raise exception 'invalid reservation transition to %', new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.apply_reservation_stock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Locks the SKU row via UPDATE. Concurrent reservations queue and re-check
    -- reservable quantity, so two buyers cannot hold the same last units.
    perform private.with_stock_write(new.pack_sku_id, 0, new.quantity);
    return new;
  end if;

  if old.status = new.status then
    return new;
  end if;

  if new.status in ('EXPIRED', 'RELEASED') then
    perform private.with_stock_write(old.pack_sku_id, 0, -old.quantity);
  elsif new.status = 'CONSUMED' then
    perform private.with_stock_write(old.pack_sku_id, -old.quantity, -old.quantity);
  end if;

  return new;
end;
$$;

create trigger cart_reservations_prepare
before insert or update or delete on public.cart_reservations
for each row execute function private.prepare_reservation();

create trigger cart_reservations_apply_stock
after insert or update on public.cart_reservations
for each row execute function private.apply_reservation_stock();

create or replace function private.assert_sku_reservation_balance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sku_id uuid;
  reserved_counter bigint;
  active_quantity bigint;
begin
  if tg_table_name = 'pack_skus' then
    sku_id := new.id;
  else
    sku_id := new.pack_sku_id;
  end if;

  select stock_reserved
    into reserved_counter
  from public.pack_skus
  where id = sku_id;

  if not found then
    return null;
  end if;

  select coalesce(sum(quantity), 0)
    into active_quantity
  from public.cart_reservations
  where pack_sku_id = sku_id
    and status = 'ACTIVE';

  if reserved_counter <> active_quantity then
    raise exception 'sku % reserved counter % does not match active reservations %',
      sku_id, reserved_counter, active_quantity
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger pack_skus_reservation_balance
after insert or update on public.pack_skus
deferrable initially deferred
for each row execute function private.assert_sku_reservation_balance();

create constraint trigger cart_reservations_balance
after insert or update on public.cart_reservations
deferrable initially deferred
for each row execute function private.assert_sku_reservation_balance();

-- Releases every hold whose server expiry has passed.
-- Safe for a signed-in user to call: it does not touch unexpired holds.
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released_count integer;
begin
  update public.cart_reservations
  set status = 'EXPIRED'
  where status = 'ACTIVE'
    and expires_at <= now();

  get diagnostics released_count = row_count;
  return released_count;
end;
$$;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  idempotency_key text not null,
  total_cents bigint not null,
  status text not null default 'COMPLETED',
  created_at timestamptz not null default now(),
  constraint purchases_idempotency_key_check check (
    char_length(idempotency_key) between 8 and 200
  ),
  constraint purchases_total_check check (total_cents >= 0),
  constraint purchases_status_check check (status in ('COMPLETED', 'REFUNDED')),
  constraint purchases_user_idempotency_uidx unique (user_id, idempotency_key)
);

create index purchases_user_created_idx
  on public.purchases (user_id, created_at desc);

create table public.purchased_packs (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  pack_sku_id uuid not null references public.pack_skus (id) on delete restrict,
  sequence integer not null,
  reveal_state text not null default 'SEALED',
  created_at timestamptz not null default now(),
  constraint purchased_packs_sequence_check check (sequence > 0),
  constraint purchased_packs_reveal_state_check check (
    reveal_state in (
      'SEALED',
      'DRAGGING',
      'TEARING',
      'OPEN',
      'REVEALING_CARD',
      'CARD_REVEALED',
      'PACK_COMPLETE'
    )
  ),
  constraint purchased_packs_sequence_uidx unique (purchase_id, sequence)
);

create index purchased_packs_user_idx
  on public.purchased_packs (user_id);

create index purchased_packs_sku_idx
  on public.purchased_packs (pack_sku_id);

create table public.pack_contents (
  id uuid primary key default gen_random_uuid(),
  purchased_pack_id uuid not null references public.purchased_packs (id) on delete restrict,
  catalog_item_id uuid not null references public.catalog_items (id) on delete restrict,
  rarity text not null,
  reveal_order integer not null,
  created_at timestamptz not null default now(),
  constraint pack_contents_rarity_check check (
    rarity in ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY')
  ),
  constraint pack_contents_reveal_order_check check (reveal_order > 0),
  constraint pack_contents_order_uidx unique (purchased_pack_id, reveal_order)
);

create index pack_contents_pack_idx
  on public.pack_contents (purchased_pack_id);

create index pack_contents_catalog_item_idx
  on public.pack_contents (catalog_item_id);

create trigger pack_contents_immutable
before update or delete on public.pack_contents
for each row execute function private.reject_change();

create or replace function private.assert_pack_contents()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pack_id uuid;
  content_count integer;
begin
  if tg_table_name = 'purchased_packs' then
    pack_id := new.id;
  else
    pack_id := new.purchased_pack_id;
  end if;

  select count(*)
    into content_count
  from public.pack_contents
  where purchased_pack_id = pack_id;

  if content_count = 0 then
    raise exception 'purchased pack % has no contents', pack_id
      using errcode = '23514';
  end if;

  -- reveal_order is 1..n and rarity rank never decreases.
  -- Commons come first. The rarest card is last. The client does not reorder.
  if exists (
    select 1
    from (
      select
        reveal_order,
        row_number() over (order by reveal_order) as expected_order,
        private.rarity_rank(rarity) as rank,
        lag(private.rarity_rank(rarity)) over (order by reveal_order) as previous_rank
      from public.pack_contents
      where purchased_pack_id = pack_id
    ) ordered
    where ordered.reveal_order <> ordered.expected_order
      or ordered.rank is null
      or (ordered.previous_rank is not null and ordered.rank < ordered.previous_rank)
  ) then
    raise exception 'pack % contents must run common-first with contiguous reveal order', pack_id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger purchased_packs_require_contents
after insert or update on public.purchased_packs
deferrable initially deferred
for each row execute function private.assert_pack_contents();

create constraint trigger pack_contents_order_ok
after insert or update on public.pack_contents
deferrable initially deferred
for each row execute function private.assert_pack_contents();

-- Checkout and deposit results. A COMPLETED row is what a retry returns.
-- Do not commit FAILED for a condition the user can fix and retry, such as
-- insufficient balance. Those failures roll this row back with the transaction.
create table public.idempotency_records (
  user_id uuid not null references public.profiles (id) on delete restrict,
  operation text not null,
  idempotency_key text not null,
  status text not null,
  response_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint idempotency_records_pk primary key (user_id, operation, idempotency_key),
  constraint idempotency_records_operation_check check (
    operation in ('CHECKOUT', 'DEPOSIT')
  ),
  constraint idempotency_records_key_check check (
    char_length(idempotency_key) between 8 and 200
  ),
  constraint idempotency_records_status_check check (
    status in ('PROCESSING', 'COMPLETED', 'FAILED')
  ),
  constraint idempotency_records_response_check check (
    (status = 'PROCESSING' and response_json is null)
    or (status in ('COMPLETED', 'FAILED') and response_json is not null)
  )
);

create trigger idempotency_records_touch_updated_at
before update on public.idempotency_records
for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Grants and row level security
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'wallets',
    'ledger_entries',
    'catalog_items',
    'pack_skus',
    'pack_odds',
    'drops',
    'carts',
    'owned_items',
    'marketplace_listings',
    'cart_lines',
    'cart_reservations',
    'purchases',
    'purchased_packs',
    'pack_contents',
    'idempotency_records'
  ]
  loop
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      table_name
    );
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      table_name
    );
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );
  end loop;
end $$;

revoke all on table public.drops_with_status from public, anon, authenticated;
grant select on table public.drops_with_status to authenticated, service_role;

grant select on public.profiles to authenticated;
grant select on public.wallets to authenticated;
grant select on public.ledger_entries to authenticated;
grant select on public.catalog_items to authenticated;
grant select on public.pack_skus to authenticated;
grant select on public.pack_odds to authenticated;
grant select on public.drops to authenticated;
grant select on public.carts to authenticated;
grant select on public.cart_lines to authenticated;
grant select on public.cart_reservations to authenticated;
grant select on public.purchases to authenticated;
grant select on public.purchased_packs to authenticated;
grant select on public.pack_contents to authenticated;
grant select on public.owned_items to authenticated;
grant select on public.marketplace_listings to authenticated;
grant select on public.idempotency_records to authenticated;

-- No insert, update, or delete policies. Authenticated writes are denied by
-- RLS even if a grant is added later by mistake, and the grants are revoked.

create policy profiles_select_own_or_public_seller
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.marketplace_listings listing
    where listing.seller_id = profiles.id
      and listing.status = 'ACTIVE'
  )
);

create policy wallets_select_own
on public.wallets
for select
to authenticated
using (user_id = auth.uid());

create policy ledger_entries_select_own
on public.ledger_entries
for select
to authenticated
using (user_id = auth.uid());

create policy catalog_items_select_authenticated
on public.catalog_items
for select
to authenticated
using (true);

create policy pack_skus_select_visible
on public.pack_skus
for select
to authenticated
using (
  active = true
  or exists (
    select 1
    from public.purchased_packs pack
    where pack.pack_sku_id = pack_skus.id
      and pack.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.cart_lines line
    join public.carts cart on cart.id = line.cart_id
    where line.pack_sku_id = pack_skus.id
      and cart.user_id = auth.uid()
  )
);

create policy pack_odds_select_authenticated
on public.pack_odds
for select
to authenticated
using (true);

create policy drops_select_authenticated
on public.drops
for select
to authenticated
using (true);

create policy carts_select_own
on public.carts
for select
to authenticated
using (user_id = auth.uid());

create policy cart_lines_select_own
on public.cart_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.carts cart
    where cart.id = cart_lines.cart_id
      and cart.user_id = auth.uid()
  )
);

create policy cart_reservations_select_own
on public.cart_reservations
for select
to authenticated
using (user_id = auth.uid());

create policy purchases_select_own
on public.purchases
for select
to authenticated
using (user_id = auth.uid());

create policy purchased_packs_select_own
on public.purchased_packs
for select
to authenticated
using (user_id = auth.uid());

-- Owner read is intentional. Hiding contents from the owner is not a
-- financial control; the reveal must not reroll what is stored here.
create policy pack_contents_select_own
on public.pack_contents
for select
to authenticated
using (
  exists (
    select 1
    from public.purchased_packs pack
    where pack.id = pack_contents.purchased_pack_id
      and pack.user_id = auth.uid()
  )
);

create policy owned_items_select_own
on public.owned_items
for select
to authenticated
using (owner_id = auth.uid());

create policy marketplace_listings_select_active_or_own
on public.marketplace_listings
for select
to authenticated
using (status = 'ACTIVE' or seller_id = auth.uid());

create policy idempotency_records_select_own
on public.idempotency_records
for select
to authenticated
using (user_id = auth.uid());

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
revoke all on function public.marketplace_fee_cents(bigint) from public, anon;
revoke all on function public.seller_proceeds_cents(bigint) from public, anon;
revoke all on function public.derive_drop_status(timestamptz, timestamptz, bigint, bigint) from public, anon;
revoke all on function public.release_expired_reservations() from public, anon;

grant execute on function public.marketplace_fee_cents(bigint) to authenticated, service_role;
grant execute on function public.seller_proceeds_cents(bigint) to authenticated, service_role;
grant execute on function public.derive_drop_status(timestamptz, timestamptz, bigint, bigint) to authenticated, service_role;
grant execute on function public.release_expired_reservations() to authenticated, service_role;
