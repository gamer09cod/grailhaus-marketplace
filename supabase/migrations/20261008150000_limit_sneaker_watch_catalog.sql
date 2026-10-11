-- Keep a compact, repeatable sneaker/watch catalog without deleting historical
-- catalog rows that may already be referenced by purchased contents or listings.
do $$
declare
  sneaker_names text[] := array[
    'Nike Dunk Low Panda', 'Jordan 1 Mid Chicago', 'Jordan 4 Military Black',
    'Nike Dunk Low Travis Scott', 'Jordan 1 High Lost and Found'
  ];
  watch_names text[] := array[
    'Casio G-Shock GA2100', 'Seiko Alpinist SPB121', 'Hamilton Khaki Field',
    'Tissot PRX Powermatic 80', 'Longines HydroConquest'
  ];
begin
  -- A migration can run before seed data exists; leave that clean database alone.
  if (select count(*) from public.catalog_items where name = any(sneaker_names)) <> 5
    or (select count(*) from public.catalog_items where name = any(watch_names)) <> 5 then
    raise notice 'Skipping compact catalog pool update because its seed items do not exist yet';
    return;
  end if;

  delete from public.pack_sku_items pool
  using public.pack_skus sku
  where pool.pack_sku_id = sku.id
    and sku.category in ('SNEAKER', 'WATCH');

  insert into public.pack_sku_items (pack_sku_id, catalog_item_id)
  select sku.id, item.id
  from public.pack_skus sku
  join public.catalog_items item
    on (sku.category = 'SNEAKER' and item.name = any(sneaker_names))
    or (sku.category = 'WATCH' and item.name = any(watch_names))
  where sku.category in ('SNEAKER', 'WATCH')
  on conflict do nothing;
end;
$$;
