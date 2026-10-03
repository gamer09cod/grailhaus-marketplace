-- Catalog, pack tiers, and reviewer wallets.
-- Pack prices are static. Item values are whole cents.
-- Each tier has its own item pool so a $10 card pack and a grail watch box
-- do not draw from the same prices. Expected value uses integer averages
-- and must stay below the pack price.

do $$
begin
  if public.marketplace_fee_cents(45000) <> 3600 then
    raise exception 'seed check failed: 45000 cent listing fee must be 3600';
  end if;

  if public.seller_proceeds_cents(45000) <> 41400 then
    raise exception 'seed check failed: seller proceeds for 45000 cents must be 41400';
  end if;

  if public.marketplace_fee_cents(1) <> 0 or public.seller_proceeds_cents(1) <> 1 then
    raise exception 'seed check failed: 1 cent fee must floor to 0';
  end if;
end $$;

insert into public.catalog_items (
  category, name, rarity, base_value_cents, current_value_cents
) values
  ('TRADING_CARD', 'Harbor Fox', 'COMMON', 200, 200),
  ('TRADING_CARD', 'Glass Minnow', 'COMMON', 250, 250),
  ('TRADING_CARD', 'Paper Lantern', 'COMMON', 300, 300),
  ('TRADING_CARD', 'Cedar Finch', 'COMMON', 350, 350),
  ('TRADING_CARD', 'Copper Relay', 'UNCOMMON', 600, 600),
  ('TRADING_CARD', 'Night Market', 'UNCOMMON', 800, 800),
  ('TRADING_CARD', 'Velvet Rook', 'RARE', 1500, 1500),
  ('TRADING_CARD', 'Silver Orchard', 'EPIC', 2500, 2500),
  ('TRADING_CARD', 'Eclipse Wyrm', 'LEGENDARY', 8000, 8000),
  ('TRADING_CARD', 'Marble Saint', 'COMMON', 1500, 1500),
  ('TRADING_CARD', 'Red Circuit', 'COMMON', 1800, 1800),
  ('TRADING_CARD', 'Hollow Choir', 'COMMON', 2000, 2000),
  ('TRADING_CARD', 'Brass Compass', 'COMMON', 2200, 2200),
  ('TRADING_CARD', 'Ivory Duelist', 'UNCOMMON', 4000, 4000),
  ('TRADING_CARD', 'Storm Archive', 'UNCOMMON', 5000, 5000),
  ('TRADING_CARD', 'Gilded Kraken', 'RARE', 9000, 9000),
  ('TRADING_CARD', 'Obsidian Saint', 'EPIC', 18000, 18000),
  ('TRADING_CARD', 'Crown of Cinders', 'LEGENDARY', 60000, 60000),
  ('TRADING_CARD', 'Royal Courier', 'COMMON', 8000, 8000),
  ('TRADING_CARD', 'Pale Astronomer', 'COMMON', 9000, 9000),
  ('TRADING_CARD', 'Thorn Regent', 'COMMON', 10000, 10000),
  ('TRADING_CARD', 'Mirror Bishop', 'COMMON', 11000, 11000),
  ('TRADING_CARD', 'Sapphire Duel', 'UNCOMMON', 18000, 18000),
  ('TRADING_CARD', 'Gold Reliquary', 'UNCOMMON', 22000, 22000),
  ('TRADING_CARD', 'Eclipse Dragon', 'RARE', 40000, 40000),
  ('TRADING_CARD', 'Void Empress', 'EPIC', 80000, 80000),
  ('TRADING_CARD', 'First Sovereign', 'LEGENDARY', 200000, 200000),
  ('SNEAKER', 'Nike Dunk Low Panda', 'COMMON', 3500, 3500),
  ('SNEAKER', 'Adidas Samba OG', 'COMMON', 4000, 4000),
  ('SNEAKER', 'New Balance 550 White', 'COMMON', 4500, 4500),
  ('SNEAKER', 'Nike Air Force 1', 'COMMON', 5000, 5000),
  ('SNEAKER', 'Jordan 1 Mid Chicago', 'UNCOMMON', 8000, 8000),
  ('SNEAKER', 'Nike Dunk Low Jackie Robinson', 'UNCOMMON', 9000, 9000),
  ('SNEAKER', 'Jordan 4 Military Black', 'RARE', 15000, 15000),
  ('SNEAKER', 'Nike Dunk Low Travis Scott', 'EPIC', 22000, 22000),
  ('SNEAKER', 'Jordan 1 High Lost and Found', 'LEGENDARY', 40000, 40000),
  ('SNEAKER', 'Nike Dunk Low Polar Blue', 'COMMON', 8000, 8000),
  ('SNEAKER', 'New Balance 2002R Protection Pack', 'COMMON', 9000, 9000),
  ('SNEAKER', 'Adidas Forum Low', 'COMMON', 10000, 10000),
  ('SNEAKER', 'Jordan 3 White Cement', 'COMMON', 12000, 12000),
  ('SNEAKER', 'Nike SB Dunk Low StrangeLove', 'UNCOMMON', 18000, 18000),
  ('SNEAKER', 'Jordan 4 Bred Reimagined', 'UNCOMMON', 22000, 22000),
  ('SNEAKER', 'Nike Dunk Low Ben and Jerrys', 'RARE', 40000, 40000),
  ('SNEAKER', 'Jordan 1 High Travis Scott', 'EPIC', 80000, 80000),
  ('SNEAKER', 'Nike SB Dunk Low Staple Pigeon', 'LEGENDARY', 150000, 150000),
  ('SNEAKER', 'Jordan 4 Union Guava', 'COMMON', 20000, 20000),
  ('SNEAKER', 'Nike Dunk Low Off-White Lot 1', 'COMMON', 25000, 25000),
  ('SNEAKER', 'Adidas Yeezy Boost 350 Beluga', 'COMMON', 28000, 28000),
  ('SNEAKER', 'Jordan 1 High Fragment', 'COMMON', 30000, 30000),
  ('SNEAKER', 'Nike Dunk Low Off-White University Red', 'UNCOMMON', 45000, 45000),
  ('SNEAKER', 'Jordan 4 Off-White Sail', 'UNCOMMON', 55000, 55000),
  ('SNEAKER', 'Jordan 11 Concord', 'RARE', 90000, 90000),
  ('SNEAKER', 'Nike Dunk Low Off-White Michigan', 'EPIC', 140000, 140000),
  ('SNEAKER', 'Jordan 1 High Off-White Chicago', 'LEGENDARY', 250000, 250000),
  ('WATCH', 'Casio G-Shock GA2100', 'COMMON', 8000, 8000),
  ('WATCH', 'Seiko 5 Sports SRPD', 'COMMON', 10000, 10000),
  ('WATCH', 'Citizen Tsuyosa', 'COMMON', 12000, 12000),
  ('WATCH', 'Orient Bambino', 'COMMON', 15000, 15000),
  ('WATCH', 'Seiko Alpinist SPB121', 'UNCOMMON', 25000, 25000),
  ('WATCH', 'Tissot PRX Quartz', 'UNCOMMON', 35000, 35000),
  ('WATCH', 'Hamilton Khaki Field', 'RARE', 45000, 45000),
  ('WATCH', 'Tissot PRX Powermatic 80', 'EPIC', 80000, 80000),
  ('WATCH', 'Longines HydroConquest', 'LEGENDARY', 150000, 150000),
  ('WATCH', 'Tissot Gentleman', 'COMMON', 40000, 40000),
  ('WATCH', 'Hamilton Jazzmaster', 'COMMON', 60000, 60000),
  ('WATCH', 'Mido Commander', 'COMMON', 80000, 80000),
  ('WATCH', 'Longines Conquest', 'COMMON', 100000, 100000),
  ('WATCH', 'Longines Spirit', 'UNCOMMON', 150000, 150000),
  ('WATCH', 'Tudor Black Bay 36', 'UNCOMMON', 180000, 180000),
  ('WATCH', 'Tudor Black Bay 58', 'RARE', 350000, 350000),
  ('WATCH', 'Omega Speedmaster Moonwatch', 'EPIC', 600000, 600000),
  ('WATCH', 'Rolex Explorer 124270', 'LEGENDARY', 1200000, 1200000),
  ('WATCH', 'Omega Seamaster 300', 'COMMON', 220000, 220000),
  ('WATCH', 'Tudor Pelagos 39', 'COMMON', 250000, 250000),
  ('WATCH', 'Longines Spirit Zulu Time', 'COMMON', 280000, 280000),
  ('WATCH', 'Omega Aqua Terra', 'COMMON', 320000, 320000),
  ('WATCH', 'Omega Speedmaster Reduced', 'UNCOMMON', 450000, 450000),
  ('WATCH', 'Rolex Oyster Perpetual 41', 'UNCOMMON', 550000, 550000),
  ('WATCH', 'Rolex Explorer II 226570', 'RARE', 900000, 900000),
  ('WATCH', 'Rolex Submariner 124060', 'EPIC', 1400000, 1400000),
  ('WATCH', 'Rolex GMT-Master II 126710', 'LEGENDARY', 2500000, 2500000);

insert into public.pack_skus (
  category, name, tier, price_cents, stock_total, stock_on_hand, stock_reserved, is_drop, active
) values
  ('TRADING_CARD', 'Starter Pack', 'Starter', 1000, 500, 500, 0, false, true),
  ('TRADING_CARD', 'Collector Pack', 'Collector', 10000, 500, 500, 0, false, true),
  ('TRADING_CARD', 'Legendary Pack', 'Legendary', 50000, 500, 500, 0, false, true),
  ('SNEAKER', 'Street Pack', 'Street', 8000, 500, 500, 0, false, true),
  ('SNEAKER', 'Rare Pack', 'Rare', 25000, 500, 500, 0, false, true),
  ('SNEAKER', 'Vault Pack', 'Vault', 80000, 500, 500, 0, false, true),
  ('WATCH', 'Entry Vault', 'Entry Vault', 50000, 500, 500, 0, false, true),
  ('WATCH', 'Luxury Box', 'Luxury', 200000, 500, 500, 0, false, true),
  ('WATCH', 'Grail Box', 'Grail', 800000, 500, 500, 0, false, true),
  ('TRADING_CARD', 'Midnight Drop', 'Midnight', 2500, 40, 40, 0, true, true);

-- Odds and pools commit together. The coverage trigger is deferred, so a
-- rarity cannot be published without an item of that rarity in the pool.
do $$
declare
  tier_names text[][] := array[
    array['TRADING_CARD', 'Starter', 'Harbor Fox', 'Glass Minnow', 'Paper Lantern', 'Cedar Finch', 'Copper Relay', 'Night Market', 'Velvet Rook', 'Silver Orchard', 'Eclipse Wyrm'],
    array['TRADING_CARD', 'Collector', 'Marble Saint', 'Red Circuit', 'Hollow Choir', 'Brass Compass', 'Ivory Duelist', 'Storm Archive', 'Gilded Kraken', 'Obsidian Saint', 'Crown of Cinders'],
    array['TRADING_CARD', 'Legendary', 'Royal Courier', 'Pale Astronomer', 'Thorn Regent', 'Mirror Bishop', 'Sapphire Duel', 'Gold Reliquary', 'Eclipse Dragon', 'Void Empress', 'First Sovereign'],
    array['TRADING_CARD', 'Midnight', 'Harbor Fox', 'Glass Minnow', 'Paper Lantern', 'Cedar Finch', 'Copper Relay', 'Night Market', 'Velvet Rook', 'Silver Orchard', 'Eclipse Wyrm'],
    array['SNEAKER', 'Street', 'Nike Dunk Low Panda', 'Adidas Samba OG', 'New Balance 550 White', 'Nike Air Force 1', 'Jordan 1 Mid Chicago', 'Nike Dunk Low Jackie Robinson', 'Jordan 4 Military Black', 'Nike Dunk Low Travis Scott', 'Jordan 1 High Lost and Found'],
    array['SNEAKER', 'Rare', 'Nike Dunk Low Polar Blue', 'New Balance 2002R Protection Pack', 'Adidas Forum Low', 'Jordan 3 White Cement', 'Nike SB Dunk Low StrangeLove', 'Jordan 4 Bred Reimagined', 'Nike Dunk Low Ben and Jerrys', 'Jordan 1 High Travis Scott', 'Nike SB Dunk Low Staple Pigeon'],
    array['SNEAKER', 'Vault', 'Jordan 4 Union Guava', 'Nike Dunk Low Off-White Lot 1', 'Adidas Yeezy Boost 350 Beluga', 'Jordan 1 High Fragment', 'Nike Dunk Low Off-White University Red', 'Jordan 4 Off-White Sail', 'Jordan 11 Concord', 'Nike Dunk Low Off-White Michigan', 'Jordan 1 High Off-White Chicago'],
    array['WATCH', 'Entry Vault', 'Casio G-Shock GA2100', 'Seiko 5 Sports SRPD', 'Citizen Tsuyosa', 'Orient Bambino', 'Seiko Alpinist SPB121', 'Tissot PRX Quartz', 'Hamilton Khaki Field', 'Tissot PRX Powermatic 80', 'Longines HydroConquest'],
    array['WATCH', 'Luxury', 'Tissot Gentleman', 'Hamilton Jazzmaster', 'Mido Commander', 'Longines Conquest', 'Longines Spirit', 'Tudor Black Bay 36', 'Tudor Black Bay 58', 'Omega Speedmaster Moonwatch', 'Rolex Explorer 124270'],
    array['WATCH', 'Grail', 'Omega Seamaster 300', 'Tudor Pelagos 39', 'Longines Spirit Zulu Time', 'Omega Aqua Terra', 'Omega Speedmaster Reduced', 'Rolex Oyster Perpetual 41', 'Rolex Explorer II 226570', 'Rolex Submariner 124060', 'Rolex GMT-Master II 126710']
  ];
  tier_row text[];
  sku_id uuid;
  item_name text;
  low_odds integer[] := array[7200, 2000, 600, 180, 20];
  mid_odds integer[] := array[5000, 2800, 1500, 600, 100];
  high_odds integer[] := array[2500, 3000, 2800, 1400, 300];
  chosen integer[];
  rarities text[] := array['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
  rarity_index integer;
  problem record;
begin
  foreach tier_row slice 1 in array tier_names loop
    select id into sku_id
    from public.pack_skus
    where category = tier_row[1]
      and tier = tier_row[2];

    if sku_id is null then
      raise exception 'missing pack sku % %', tier_row[1], tier_row[2];
    end if;

    if tier_row[2] in ('Starter', 'Street', 'Entry Vault', 'Midnight') then
      chosen := low_odds;
    elsif tier_row[2] in ('Collector', 'Rare', 'Luxury') then
      chosen := mid_odds;
    else
      chosen := high_odds;
    end if;

    for rarity_index in 1..5 loop
      insert into public.pack_odds (pack_sku_id, rarity, probability_basis_points)
      values (sku_id, rarities[rarity_index], chosen[rarity_index]);
    end loop;

    for item_name in select unnest(tier_row[3:11]) loop
      insert into public.pack_sku_items (pack_sku_id, catalog_item_id)
      select sku_id, item.id
      from public.catalog_items item
      where item.category = tier_row[1]
        and item.name = item_name;

      if not found then
        raise exception 'missing catalog item %', item_name;
      end if;
    end loop;
  end loop;

  for problem in
    with rarity_value as (
      select
        pool.pack_sku_id,
        item.rarity,
        (sum(item.base_value_cents) / count(*))::bigint as avg_cents
      from public.pack_sku_items pool
      join public.catalog_items item on item.id = pool.catalog_item_id
      group by pool.pack_sku_id, item.rarity
    ),
    expected as (
      select
        sku.name,
        sku.price_cents,
        (sum(rarity_value.avg_cents * odds.probability_basis_points) / 10000)::bigint as ev_cents,
        count(odds.rarity) as priced_rarities
      from public.pack_skus sku
      join public.pack_odds odds on odds.pack_sku_id = sku.id
      join rarity_value
        on rarity_value.pack_sku_id = sku.id
       and rarity_value.rarity = odds.rarity
      group by sku.name, sku.price_cents
    )
    select name, price_cents, ev_cents, priced_rarities
    from expected
    where ev_cents >= price_cents
       or priced_rarities <> 5
  loop
    raise exception 'seed EV check failed for %: ev % price % rarities %',
      problem.name, problem.ev_cents, problem.price_cents, problem.priced_rarities;
  end loop;
end $$;

do $$
declare
  category_name text;
  item_count integer;
  tier_count integer;
  account_id uuid;
  account_email text;
  opening jsonb;
  account record;
begin
  foreach category_name in array array['TRADING_CARD', 'SNEAKER', 'WATCH'] loop
    select count(*) into item_count
    from public.catalog_items
    where category = category_name;

    select count(*) into tier_count
    from public.pack_skus
    where category = category_name
      and is_drop = false;

    if item_count < 20 or item_count > 30 then
      raise exception 'seed catalog count for % is %', category_name, item_count;
    end if;

    if tier_count <> 3 then
      raise exception 'seed tier count for % is %', category_name, tier_count;
    end if;
  end loop;

  update public.pack_skus
  set max_per_user = 10
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  insert into public.drops (pack_sku_id, starts_at, ends_at, initial_stock)
  select id, now() - interval '1 hour', now() + interval '30 days', stock_total
  from public.pack_skus
  where category = 'TRADING_CARD'
    and tier = 'Midnight';

  if (
    select derived.status
    from public.drops_with_status derived
    join public.pack_skus sku on sku.id = derived.pack_sku_id
    where sku.tier = 'Midnight'
  ) is distinct from 'LIVE' then
    raise exception 'seed drop is not live';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and column_name like '%\_cents' escape '\'
      and data_type <> 'bigint'
  ) then
    raise exception 'a money column is not bigint cents';
  end if;

  for account in
    select *
    from (
      values
        ('11111111-1111-4111-8111-111111111111'::uuid, 'reviewer@grailhaus.test'),
        ('22222222-2222-4222-8222-222222222222'::uuid, 'collector@grailhaus.test')
    ) as seeded(id, email)
  loop
    account_id := account.id;
    account_email := account.email;
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
      raw_user_meta_data,
      is_sso_user,
      is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000',
      account_id,
      'authenticated',
      'authenticated',
      account_email,
      extensions.crypt('Reviewer-10000', extensions.gen_salt('bf')),
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
      '{}'::jsonb,
      false,
      false
    );

    insert into auth.identities (
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      account_id,
      account_id::text,
      jsonb_build_object('sub', account_id::text, 'email', account_email),
      'email',
      now(),
      now(),
      now()
    );

    opening := private.apply_deposit(
      account_id,
      1000000,
      'seed-opening-' || account_id::text
    );

    if (opening ->> 'balanceCents')::bigint <> 1000000 then
      raise exception 'opening deposit for % did not land', account_email;
    end if;

    if (
      select balance_cents from public.wallets where user_id = account_id
    ) <> (
      select coalesce(sum(amount_cents), 0)
      from public.ledger_entries
      where user_id = account_id
    ) then
      raise exception 'wallet and ledger diverged for %', account_email;
    end if;
  end loop;
end $$;
