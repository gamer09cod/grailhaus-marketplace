-- Add two evergreen choices per category without changing existing prices,
-- stock, reservations, purchased contents, or ownership. Drops stay separate.
do $$
declare
  target record;
  source_id uuid;
  target_id uuid;
begin
  for target in select * from (values
    ('TRADING_CARD', 'Starter', 'Scout Pack', 'Scout', 2500::bigint),
    ('TRADING_CARD', 'Collector', 'Elite Pack', 'Elite', 25000::bigint),
    ('SNEAKER', 'Street', 'Daily Pack', 'Daily', 12000::bigint),
    ('SNEAKER', 'Rare', 'Archive Pack', 'Archive', 50000::bigint),
    ('WATCH', 'Entry Vault', 'Heritage Box', 'Heritage', 100000::bigint),
    ('WATCH', 'Luxury', 'Prestige Box', 'Prestige', 400000::bigint)
  ) as additions(category, source_tier, name, tier, price_cents) loop
    select id into source_id from public.pack_skus
      where category = target.category and tier = target.source_tier and not is_drop
      order by created_at, id limit 1;
    -- A clean database gets these rows from seed.sql after migrations.
    if source_id is null then continue; end if;
    if exists (select 1 from public.pack_skus where category = target.category and tier = target.tier and not is_drop) then continue; end if;
    insert into public.pack_skus(category, name, tier, price_cents, stock_total, stock_on_hand, stock_reserved, is_drop, active)
      values (target.category, target.name, target.tier, target.price_cents, 500, 500, 0, false, true)
      returning id into target_id;
    -- Copy a validated pool/odds pair. Higher new price preserves its EV margin.
    insert into public.pack_odds(pack_sku_id, rarity, probability_basis_points)
      select target_id, rarity, probability_basis_points from public.pack_odds where pack_sku_id = source_id;
    insert into public.pack_sku_items(pack_sku_id, catalog_item_id)
      select target_id, catalog_item_id from public.pack_sku_items where pack_sku_id = source_id;
  end loop;
end $$;
