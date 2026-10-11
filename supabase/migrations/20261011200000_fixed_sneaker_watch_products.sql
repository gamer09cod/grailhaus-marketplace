-- Sneakers and watches sell as individual products, not mystery packs.
-- Each catalog item gets one fixed SKU (100% that item). Old evergreen packs deactivate.
-- tier uses the product name so (category, tier) stays unique.

alter table public.pack_skus
  add column if not exists fixed_catalog_item_id uuid references public.catalog_items (id);

create unique index if not exists pack_skus_fixed_catalog_item_uidx
  on public.pack_skus (fixed_catalog_item_id)
  where fixed_catalog_item_id is not null;

comment on column public.pack_skus.fixed_catalog_item_id is
  'When set, checkout always delivers this catalog item. Used for sneaker/watch retail products.';

-- Retire mystery evergreen SKUs (keep rows for historical purchased_packs).
update public.pack_skus
set active = false
where category in ('SNEAKER', 'WATCH')
  and is_drop = false
  and fixed_catalog_item_id is null
  and active = true;

do $$
declare
  item record;
  sku_id uuid;
begin
  for item in
    select id, category, name, rarity, base_value_cents
    from public.catalog_items
    where category in ('SNEAKER', 'WATCH')
    order by category, name
  loop
    select id
      into sku_id
    from public.pack_skus
    where fixed_catalog_item_id = item.id;

    if sku_id is null then
      select id
        into sku_id
      from public.pack_skus
      where category = item.category
        and name = item.name
      limit 1;
    end if;

    if sku_id is null then
      insert into public.pack_skus (
        category,
        name,
        tier,
        price_cents,
        stock_total,
        stock_on_hand,
        stock_reserved,
        is_drop,
        active,
        fixed_catalog_item_id
      ) values (
        item.category,
        item.name,
        item.name,
        item.base_value_cents,
        500,
        500,
        0,
        false,
        true,
        item.id
      )
      returning id into sku_id;
    else
      update public.pack_skus
      set
        name = item.name,
        tier = item.name,
        price_cents = item.base_value_cents,
        active = true,
        is_drop = false,
        category = item.category,
        fixed_catalog_item_id = item.id
      where id = sku_id;
    end if;

    delete from public.pack_odds where pack_sku_id = sku_id;
    delete from public.pack_sku_items where pack_sku_id = sku_id;

    insert into public.pack_odds (pack_sku_id, rarity, probability_basis_points)
    values (sku_id, item.rarity, 10000);

    insert into public.pack_sku_items (pack_sku_id, catalog_item_id)
    values (sku_id, item.id);
  end loop;
end;
$$;
