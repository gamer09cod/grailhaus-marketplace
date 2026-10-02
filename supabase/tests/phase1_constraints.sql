-- Phase 1 constraint tests.
-- Run after `supabase db reset`, inside the database superuser role.
-- The script rolls back. It leaves the migrated seed data in place.

begin;

create temp table test_ids (
  label text primary key,
  id uuid not null
);

create function pg_temp.create_user(p_email text)
returns uuid
language plpgsql
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    recovery_token,
    phone_change,
    phone_change_token,
    raw_app_meta_data,
    raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id,
    'authenticated',
    'authenticated',
    p_email,
    extensions.crypt('test-password', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

  return new_id;
end;
$$;

insert into test_ids (label, id)
values
  ('buyer', pg_temp.create_user('buyer@grailhaus.test')),
  ('seller', pg_temp.create_user('seller@grailhaus.test'));

do $$
declare
  buyer_id uuid;
  seller_id uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';
  select id into seller_id from test_ids where label = 'seller';

  if not exists (select 1 from public.profiles where id = buyer_id) then
    raise exception 'signup did not create a buyer profile';
  end if;

  if not exists (select 1 from public.profiles where id = seller_id) then
    raise exception 'signup did not create a seller profile';
  end if;

  if (select balance_cents from public.wallets where user_id = buyer_id) <> 0 then
    raise exception 'new wallet must start at 0 cents';
  end if;
end $$;

-- Money: a positive cache write without a ledger row is rejected.
do $$
declare
  buyer_id uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';
  update public.wallets
  set balance_cents = 1000
  where user_id = buyer_id;
  raise exception 'wallet update without a ledger row succeeded';
exception
  when check_violation then
    null;
end $$;

-- Money: ledger and wallet can agree on a negative number, and the balance
-- check still rejects it. This is the overdraft constraint.
do $$
declare
  buyer_id uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';

  insert into public.ledger_entries (user_id, entry_type, amount_cents)
  values (buyer_id, 'PACK_PURCHASE', -100);

  update public.wallets
  set balance_cents = -100
  where user_id = buyer_id;

  raise exception 'negative wallet succeeded';
exception
  when check_violation then
    null;
end $$;

-- Money: a ledger row that never updates the wallet cannot commit.
do $$
declare
  buyer_id uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';

  insert into public.ledger_entries (
    user_id,
    entry_type,
    amount_cents,
    reference_type,
    reference_id,
    idempotency_key
  ) values (
    buyer_id,
    'DEPOSIT',
    500,
    'DEPOSIT',
    gen_random_uuid(),
    'deposit-key-1'
  );

  set constraints all immediate;
  set constraints all deferred;
  raise exception 'ledger insert without a wallet update succeeded';
exception
  when check_violation then
    null;
end $$;

do $$
declare
  buyer_id uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';

  begin
    insert into public.ledger_entries (user_id, entry_type, amount_cents)
    values (buyer_id, 'DEPOSIT', -500);
    raise exception 'negative deposit succeeded';
  exception
    when check_violation then
      null;
  end;

  begin
    insert into public.ledger_entries (user_id, entry_type, amount_cents)
    values (buyer_id, 'MARKETPLACE_FEE', 100);
    raise exception 'user-owned marketplace fee succeeded';
  exception
    when check_violation then
      null;
  end;
end $$;

-- A matched deposit is the only way the cached balance moves.
do $$
declare
  buyer_id uuid;
  deposit_id uuid := gen_random_uuid();
begin
  select id into buyer_id from test_ids where label = 'buyer';

  insert into public.ledger_entries (
    user_id,
    entry_type,
    amount_cents,
    reference_type,
    reference_id,
    idempotency_key
  ) values (
    buyer_id,
    'DEPOSIT',
    1000000,
    'DEPOSIT',
    deposit_id,
    'opening-balance'
  );

  update public.wallets
  set balance_cents = 1000000
  where user_id = buyer_id;

  set constraints all immediate;
  set constraints all deferred;

  if (select balance_cents from public.wallets where user_id = buyer_id) <> 1000000 then
    raise exception 'opening deposit did not land in the wallet';
  end if;

  if (
    select coalesce(sum(amount_cents), 0)
    from public.ledger_entries
    where user_id = buyer_id
  ) <> 1000000 then
    raise exception 'ledger sum does not match the opening deposit';
  end if;
end $$;

do $$
declare
  buyer_id uuid;
  existing_reference uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';
  select reference_id
    into existing_reference
  from public.ledger_entries
  where user_id = buyer_id
    and entry_type = 'DEPOSIT';

  begin
    insert into public.ledger_entries (
      user_id,
      entry_type,
      amount_cents,
      reference_type,
      reference_id
    ) values (
      buyer_id,
      'DEPOSIT',
      1000000,
      'DEPOSIT',
      existing_reference
    );
    raise exception 'duplicate ledger reference succeeded';
  exception
    when unique_violation then
      null;
  end;

  begin
    update public.ledger_entries
    set amount_cents = 1
    where user_id = buyer_id;
    raise exception 'ledger update succeeded';
  exception
    when check_violation then
      null;
  end;

  begin
    delete from public.ledger_entries where user_id = buyer_id;
    raise exception 'ledger delete succeeded';
  exception
    when check_violation then
      null;
  end;
end $$;

do $$
begin
  if public.marketplace_fee_cents(45000) <> 3600 then
    raise exception 'fee for 45000 cents must be 3600';
  end if;
  if public.seller_proceeds_cents(45000) <> 41400 then
    raise exception 'seller proceeds for 45000 cents must be 41400';
  end if;
  if public.marketplace_fee_cents(1) <> 0 or public.seller_proceeds_cents(1) <> 1 then
    raise exception '1 cent fee must floor to 0 and leave the cent with the seller';
  end if;

  begin
    perform public.marketplace_fee_cents(0);
    raise exception 'non-positive price was accepted';
  exception
    when check_violation then
      null;
  end;

  if public.derive_drop_status(now() + interval '1 day', now() + interval '2 days', 5, 0) <> 'UPCOMING' then
    raise exception 'expected UPCOMING';
  end if;
  if public.derive_drop_status(now() - interval '1 hour', now() + interval '1 hour', 5, 1) <> 'LIVE' then
    raise exception 'expected LIVE';
  end if;
  if public.derive_drop_status(now() - interval '1 hour', now() + interval '1 hour', 5, 5) <> 'SOLD_OUT' then
    raise exception 'expected SOLD_OUT';
  end if;
  if public.derive_drop_status(now() - interval '2 hours', now() - interval '1 hour', 5, 0) <> 'ENDED' then
    raise exception 'expected ENDED';
  end if;
end $$;

with created as (
  insert into public.pack_skus (
    category, name, tier, price_cents, stock_total, stock_on_hand, stock_reserved
  ) values (
    'TRADING_CARD', 'Phase 1 Test Pack', 'Phase1', 1000, 5, 5, 0
  )
  returning id
)
insert into test_ids (label, id)
select 'sku', id from created;

with created as (
  insert into public.catalog_items (
    category, name, rarity, base_value_cents, current_value_cents
  ) values
    ('TRADING_CARD', 'Phase 1 Common', 'COMMON', 100, 100),
    ('TRADING_CARD', 'Phase 1 Legendary', 'LEGENDARY', 5000, 5000),
    ('TRADING_CARD', 'Phase 1 Rare', 'RARE', 1000, 1000)
  returning id, rarity
)
insert into public.pack_sku_items (pack_sku_id, catalog_item_id)
select sku.id, created.id
from created
join test_ids sku on sku.label = 'sku';

insert into public.pack_odds (pack_sku_id, rarity, probability_basis_points)
select id, 'COMMON', 7000 from test_ids where label = 'sku'
union all
select id, 'LEGENDARY', 3000 from test_ids where label = 'sku';

set constraints all immediate;
  set constraints all deferred;

do $$
declare
  sku_id uuid;
begin
  select id into sku_id from test_ids where label = 'sku';

  begin
    insert into public.pack_odds (pack_sku_id, rarity, probability_basis_points)
    values (sku_id, 'RARE', 1000);
    set constraints all immediate;
  set constraints all deferred;
    raise exception 'odds above 10000 succeeded';
  exception
    when check_violation then
      null;
  end;

  begin
    update public.pack_skus
    set stock_on_hand = stock_on_hand - 1
    where id = sku_id;
    raise exception 'direct stock write succeeded';
  exception
    when check_violation then
      null;
  end;
end $$;

do $$
declare
  sku_id uuid := gen_random_uuid();
begin
  insert into public.pack_skus (
    id, category, name, tier, price_cents, stock_total, stock_on_hand
  ) values (
    sku_id, 'WATCH', 'Mismatch', 'Entry', 2000, 5, 5
  );

  insert into public.drops (pack_sku_id, starts_at, ends_at, initial_stock)
  values (sku_id, now() + interval '1 hour', now() + interval '2 hours', 4);

  set constraints all immediate;
  set constraints all deferred;
  raise exception 'drop supply mismatch succeeded';
exception
  when check_violation then
    null;
end $$;

with created as (
  insert into public.carts (user_id)
  select id from test_ids where label = 'buyer'
  returning id
)
insert into test_ids (label, id)
select 'cart', id from created;

with created as (
  insert into public.cart_lines (
    cart_id, line_type, pack_sku_id, quantity, snapshot_price_cents
  )
  select
    (select id from test_ids where label = 'cart'),
    'PACK',
    (select id from test_ids where label = 'sku'),
    3,
    1000
  returning id
)
insert into test_ids (label, id)
select 'line', id from created;

with created as (
  insert into public.cart_reservations (
    user_id, cart_line_id, pack_sku_id, quantity, expires_at
  )
  select
    (select id from test_ids where label = 'buyer'),
    (select id from test_ids where label = 'line'),
    (select id from test_ids where label = 'sku'),
    3,
    now() + interval '4 minutes'
  returning id
)
insert into test_ids (label, id)
select 'reservation', id from created;

set constraints all immediate;
  set constraints all deferred;

do $$
declare
  sku_id uuid;
  reserved_units bigint;
begin
  select id into sku_id from test_ids where label = 'sku';
  select stock_reserved into reserved_units from public.pack_skus where id = sku_id;

  if reserved_units <> 3 then
    raise exception 'reservation did not hold 3 units, reserved %', reserved_units;
  end if;
end $$;

do $$
declare
  line_id uuid;
begin
  select id into line_id from test_ids where label = 'line';

  update public.cart_lines
  set quantity = 2
  where id = line_id;

  raise exception 'changed a cart line that still has an active reservation';
exception
  when check_violation then
    null;
end $$;

do $$
declare
  buyer_id uuid;
  sku_id uuid;
  cart_id uuid;
  line_id uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';
  select id into sku_id from test_ids where label = 'sku';
  select id into cart_id from test_ids where label = 'cart';

  insert into public.cart_lines (
    id, cart_id, line_type, pack_sku_id, quantity, snapshot_price_cents
  ) values (
    gen_random_uuid(), cart_id, 'PACK', sku_id, 3, 1000
  )
  returning id into line_id;

  begin
    insert into public.cart_reservations (
      user_id, cart_line_id, pack_sku_id, quantity, expires_at
    ) values (
      buyer_id, line_id, sku_id, 3, now() + interval '4 minutes'
    );
    raise exception 'oversell reservation succeeded';
  exception
    when check_violation then
      null;
  end;

  begin
    insert into public.cart_lines (
      cart_id, line_type, listing_id, quantity, snapshot_price_cents
    ) values (
      cart_id, 'MARKETPLACE_LISTING', gen_random_uuid(), 2, 1000
    );
    raise exception 'marketplace quantity other than 1 succeeded';
  exception
    when check_violation or foreign_key_violation then
      -- Shape check should win. A missing listing may raise a foreign key
      -- error first if the row is evaluated that way; either rejection is safe.
      -- The explicit quantity check is asserted below with a real listing.
      null;
  end;
end $$;

do $$
declare
  buyer_id uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';

  begin
    insert into public.carts (user_id) values (buyer_id);
    raise exception 'second open cart succeeded';
  exception
    when unique_violation then
      null;
  end;
end $$;

-- Expire the hold through the server sweep and prove the stock comes back.
do $$
declare
  sku_id uuid;
  released integer;
  reserved_units bigint;
  on_hand bigint;
begin
  select id into sku_id from test_ids where label = 'sku';
  perform set_config('grailhaus.reservation_admin', 'on', true);

  update public.cart_reservations
  set expires_at = now() - interval '1 second'
  where id = (select id from test_ids where label = 'reservation');

  perform set_config('grailhaus.reservation_admin', 'off', true);
  released := public.release_expired_reservations();

  if released <> 1 then
    raise exception 'expected to expire 1 reservation, expired %', released;
  end if;

  select stock_reserved, stock_on_hand
    into reserved_units, on_hand
  from public.pack_skus
  where id = sku_id;

  if reserved_units <> 0 or on_hand <> 5 then
    raise exception 'expiry did not restore stock (reserved %, on hand %)',
      reserved_units, on_hand;
  end if;

  set constraints all immediate;
  set constraints all deferred;
end $$;

-- A future hold is not swept, and consuming it sells exactly the reserved units.
do $$
declare
  buyer_id uuid;
  sku_id uuid;
  cart_id uuid;
  line_id uuid := gen_random_uuid();
  reservation_id uuid := gen_random_uuid();
  on_hand bigint;
  reserved_units bigint;
  swept integer;
begin
  select id into buyer_id from test_ids where label = 'buyer';
  select id into sku_id from test_ids where label = 'sku';
  select id into cart_id from test_ids where label = 'cart';

  insert into public.cart_lines (
    id, cart_id, line_type, pack_sku_id, quantity, snapshot_price_cents
  ) values (
    line_id, cart_id, 'PACK', sku_id, 2, 1000
  );

  insert into public.cart_reservations (
    id, user_id, cart_line_id, pack_sku_id, quantity, expires_at
  ) values (
    reservation_id, buyer_id, line_id, sku_id, 2, now() + interval '4 minutes'
  );

  swept := public.release_expired_reservations();
  if swept <> 0 then
    raise exception 'sweep expired a live reservation';
  end if;

  update public.cart_reservations
  set status = 'CONSUMED'
  where id = reservation_id;

  select stock_on_hand, stock_reserved
    into on_hand, reserved_units
  from public.pack_skus
  where id = sku_id;

  if on_hand <> 3 or reserved_units <> 0 then
    raise exception 'consume left on hand % reserved %', on_hand, reserved_units;
  end if;

  set constraints all immediate;
  set constraints all deferred;
end $$;

with created as (
  insert into public.catalog_items (
    category, name, rarity, base_value_cents, current_value_cents
  ) values (
    'TRADING_CARD', 'Common Test Card', 'COMMON', 100, 100
  )
  returning id
)
insert into test_ids (label, id)
select 'card', id from created;

with created as (
  insert into public.catalog_items (
    category, name, rarity, base_value_cents, current_value_cents
  ) values (
    'TRADING_CARD', 'Legendary Test Card', 'LEGENDARY', 5000, 5000
  )
  returning id
)
insert into test_ids (label, id)
select 'grail', id from created;

with created as (
  insert into public.purchases (user_id, idempotency_key, total_cents)
  select id, 'purchase-key-1', 1000
  from test_ids
  where label = 'buyer'
  returning id
)
insert into test_ids (label, id)
select 'purchase', id from created;

with created as (
  insert into public.purchased_packs (purchase_id, user_id, pack_sku_id, sequence)
  select
    (select id from test_ids where label = 'purchase'),
    (select id from test_ids where label = 'buyer'),
    (select id from test_ids where label = 'sku'),
    1
  returning id
)
insert into test_ids (label, id)
select 'pack', id from created;

insert into public.pack_contents (
  purchased_pack_id, catalog_item_id, rarity, reveal_order
)
select
  (select id from test_ids where label = 'pack'),
  (select id from test_ids where label = 'card'),
  'COMMON',
  1
union all
select
  (select id from test_ids where label = 'pack'),
  (select id from test_ids where label = 'grail'),
  'LEGENDARY',
  2;

set constraints all immediate;
  set constraints all deferred;

do $$
declare
  pack_id uuid;
begin
  select id into pack_id from test_ids where label = 'pack';

  begin
    update public.pack_contents
    set rarity = 'LEGENDARY'
    where purchased_pack_id = pack_id
      and reveal_order = 1;
    raise exception 'pack contents update succeeded';
  exception
    when check_violation then
      null;
  end;

  begin
    delete from public.pack_contents where purchased_pack_id = pack_id;
    raise exception 'pack contents delete succeeded';
  exception
    when check_violation then
      null;
  end;
end $$;

do $$
declare
  buyer_id uuid;
  sku_id uuid;
  purchase_id uuid := gen_random_uuid();
  pack_id uuid := gen_random_uuid();
begin
  select id into buyer_id from test_ids where label = 'buyer';
  select id into sku_id from test_ids where label = 'sku';

  insert into public.purchases (id, user_id, idempotency_key, total_cents)
  values (purchase_id, buyer_id, 'purchase-key-2', 1000);

  begin
    insert into public.purchased_packs (
      id, purchase_id, user_id, pack_sku_id, sequence
    ) values (
      pack_id, purchase_id, buyer_id, sku_id, 1
    );
    set constraints all immediate;
  set constraints all deferred;
    raise exception 'pack without contents succeeded';
  exception
    when check_violation then
      null;
  end;
end $$;

do $$
declare
  buyer_id uuid;
  sku_id uuid;
  common_id uuid;
  grail_id uuid;
  purchase_id uuid := gen_random_uuid();
  pack_id uuid := gen_random_uuid();
begin
  select id into buyer_id from test_ids where label = 'buyer';
  select id into sku_id from test_ids where label = 'sku';
  select id into common_id from test_ids where label = 'card';
  select id into grail_id from test_ids where label = 'grail';

  insert into public.purchases (id, user_id, idempotency_key, total_cents)
  values (purchase_id, buyer_id, 'purchase-key-3', 1000);

  insert into public.purchased_packs (
    id, purchase_id, user_id, pack_sku_id, sequence
  ) values (
    pack_id, purchase_id, buyer_id, sku_id, 1
  );

  insert into public.pack_contents (
    purchased_pack_id, catalog_item_id, rarity, reveal_order
  ) values
    (pack_id, grail_id, 'LEGENDARY', 1),
    (pack_id, common_id, 'COMMON', 2);

  set constraints all immediate;
  set constraints all deferred;
  raise exception 'rarest-first pack contents succeeded';
exception
  when check_violation then
    null;
end $$;

with created as (
  insert into public.owned_items (
    owner_id, catalog_item_id, source_type, acquisition_price_cents, state
  )
  select
    (select id from test_ids where label = 'seller'),
    (select id from test_ids where label = 'grail'),
    'PACK',
    5000,
    'LISTED'
  returning id
)
insert into test_ids (label, id)
select 'item', id from created;

with created as (
  insert into public.marketplace_listings (owned_item_id, seller_id, price_cents, status)
  select
    (select id from test_ids where label = 'item'),
    (select id from test_ids where label = 'seller'),
    45000,
    'ACTIVE'
  returning id
)
insert into test_ids (label, id)
select 'listing', id from created;

set constraints all immediate;
  set constraints all deferred;

do $$
declare
  cart_id uuid;
  listing_id uuid;
begin
  select id into cart_id from test_ids where label = 'cart';
  select id into listing_id from test_ids where label = 'listing';

  insert into public.cart_lines (
    cart_id, line_type, listing_id, quantity, snapshot_price_cents
  ) values (
    cart_id, 'MARKETPLACE_LISTING', listing_id, 2, 45000
  );

  raise exception 'marketplace quantity other than 1 succeeded';
exception
  when check_violation then
    null;
end $$;

do $$
declare
  item_id uuid;
  seller_id uuid;
begin
  select id into item_id from test_ids where label = 'item';
  select id into seller_id from test_ids where label = 'seller';

  begin
    insert into public.marketplace_listings (owned_item_id, seller_id, price_cents, status)
    values (item_id, seller_id, 46000, 'ACTIVE');
    raise exception 'duplicate active listing succeeded';
  exception
    when unique_violation then
      null;
  end;
end $$;

do $$
declare
  seller_id uuid;
  item_id uuid := gen_random_uuid();
begin
  select id into seller_id from test_ids where label = 'seller';

  insert into public.owned_items (
    id, owner_id, catalog_item_id, source_type, acquisition_price_cents, state
  )
  select
    item_id,
    seller_id,
    (select id from test_ids where label = 'card'),
    'PACK',
    100,
    'OWNED';

  insert into public.marketplace_listings (owned_item_id, seller_id, price_cents, status)
  values (item_id, seller_id, 2000, 'ACTIVE');

  set constraints all immediate;
  set constraints all deferred;
  raise exception 'active listing on an unlisted item succeeded';
exception
  when check_violation then
    null;
end $$;

do $$
declare
  buyer_id uuid;
  seller_id uuid;
  active_listing uuid;
  visible_wallets integer;
  visible_listings integer;
  visible_profiles integer;
begin
  select id into buyer_id from test_ids where label = 'buyer';
  select id into seller_id from test_ids where label = 'seller';
  select id into active_listing from test_ids where label = 'listing';

  perform set_config('request.jwt.claim.sub', buyer_id::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', buyer_id, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  select count(*) into visible_wallets from public.wallets;
  if visible_wallets <> 1 then
    raise exception 'buyer saw % wallets', visible_wallets;
  end if;

  if (select user_id from public.wallets) <> buyer_id then
    raise exception 'buyer saw someone else''s wallet';
  end if;

  select count(*) into visible_listings
  from public.marketplace_listings
  where id = active_listing;

  if visible_listings <> 1 then
    raise exception 'buyer could not see the active listing';
  end if;

  select count(*) into visible_profiles from public.profiles where id = seller_id;
  if visible_profiles <> 1 then
    raise exception 'buyer could not see the active seller profile';
  end if;

  if (select count(*) from public.ledger_entries) <> 1 then
    raise exception 'buyer saw ledger rows they do not own';
  end if;

  execute 'reset role';
end $$;

do $$
declare
  buyer_id uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';
  perform set_config('request.jwt.claim.sub', buyer_id::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', buyer_id, 'role', 'authenticated')::text,
    true
  );

  begin
    execute 'set local role authenticated';
    update public.wallets set balance_cents = 0 where user_id = buyer_id;
    raise exception 'authenticated wallet update succeeded';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    execute 'set local role authenticated';
    insert into public.ledger_entries (user_id, entry_type, amount_cents)
    values (buyer_id, 'DEPOSIT', 100);
    raise exception 'authenticated ledger insert succeeded';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    execute 'set local role anon';
    perform count(*) from public.wallets;
    raise exception 'anon wallet read succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;

do $$
declare
  buyer_id uuid;
begin
  select id into buyer_id from test_ids where label = 'buyer';

  begin
    insert into public.purchases (user_id, idempotency_key, total_cents)
    values (buyer_id, 'purchase-key-1', 1000);
    raise exception 'duplicate purchase idempotency key succeeded';
  exception
    when unique_violation then
      null;
  end;

  insert into public.idempotency_records (
    user_id, operation, idempotency_key, status, response_json
  ) values (
    buyer_id, 'DEPOSIT', 'opening-balance', 'COMPLETED', '{"ok":true}'::jsonb
  );

  begin
    insert into public.idempotency_records (
      user_id, operation, idempotency_key, status, response_json
    ) values (
      buyer_id, 'DEPOSIT', 'opening-balance', 'COMPLETED', '{"ok":true}'::jsonb
    );
    raise exception 'duplicate idempotency record succeeded';
  exception
    when unique_violation then
      null;
  end;

  begin
    insert into public.idempotency_records (
      user_id, operation, idempotency_key, status
    ) values (
      buyer_id, 'CHECKOUT', 'checkout-key-1', 'COMPLETED'
    );
    raise exception 'completed idempotency row without a response succeeded';
  exception
    when check_violation then
      null;
  end;
end $$;

do $$
begin
  raise notice 'PHASE1_CONSTRAINTS_OK';
end $$;

rollback;
