-- Market browse needs listed time, catalog art, and the catalog estimate.
-- The estimate is current_value_cents. The client calls apply_price_drift before this read.

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
          'isOwn', listing.seller_id = auth.uid(),
          'listedAt', listing.created_at,
          'imageUrl', catalog.image_url,
          'currentValueCents', catalog.current_value_cents::text
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
