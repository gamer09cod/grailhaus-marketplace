-- Phase 8 checks. Seed data must already be loaded.
-- Listing mutations roll back with this transaction.
-- Concurrent list attempts are scripts/list-race.ts. They need two sessions.

begin;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

do $$
declare
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  collector uuid := '22222222-2222-4222-8222-222222222222';
  catalog_id uuid;
  owned_id uuid;
  other_owned uuid;
  listing_id uuid;
  quote jsonb;
  receipt jsonb;
  replay jsonb;
  listed_price bigint;
  item_state text;
  listing_status text;
  active_count integer;
  listing_sold_at timestamptz;
begin
  select id
    into catalog_id
  from public.catalog_items
  where name = 'Harbor Fox';

  quote := public.listing_quote(45000);
  if (quote ->> 'feeCents')::bigint <> public.marketplace_fee_cents(45000)
     or (quote ->> 'sellerCents')::bigint <> public.seller_proceeds_cents(45000)
     or (quote ->> 'feeCents')::bigint <> 3600
     or (quote ->> 'sellerCents')::bigint <> 41400 then
    raise exception 'listing quote is %', quote;
  end if;

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (reviewer, catalog_id, 'PACK', 200)
  returning id into owned_id;

  begin
    perform public.list_item(owned_id, 0, 'phase8-invalid-price');
    raise exception 'zero price was listed';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'INVALID_PRICE' then
        raise exception 'expected INVALID_PRICE, got %', sqlerrm;
      end if;
  end;

  insert into public.owned_items (owner_id, catalog_item_id, source_type, acquisition_price_cents)
  values (collector, catalog_id, 'PACK', 200)
  returning id into other_owned;

  begin
    perform public.list_item(other_owned, 45000, 'phase8-not-owned');
    raise exception 'another collector item was listed';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'ITEM_NOT_OWNED' then
        raise exception 'expected ITEM_NOT_OWNED, got %', sqlerrm;
      end if;
  end;

  receipt := public.list_item(owned_id, 45000, 'phase8-list');
  replay := public.list_item(owned_id, 45000, 'phase8-list');
  if receipt <> replay then
    raise exception 'list replay changed the receipt';
  end if;

  listing_id := (receipt ->> 'listingId')::uuid;
  if (receipt ->> 'priceCents')::bigint <> 45000
     or (receipt ->> 'feeCents')::bigint <> 3600
     or (receipt ->> 'sellerCents')::bigint <> 41400
     or receipt ->> 'status' <> 'ACTIVE'
     or receipt ->> 'itemState' <> 'LISTED' then
    raise exception 'list receipt is %', receipt;
  end if;

  select state
    into item_state
  from public.owned_items
  where id = owned_id;

  select count(*)
    into active_count
  from public.marketplace_listings
  where owned_item_id = owned_id
    and status = 'ACTIVE';

  if item_state <> 'LISTED' or active_count <> 1 then
    raise exception 'listed item state % active %', item_state, active_count;
  end if;

  begin
    perform public.list_item(owned_id, 45000, 'phase8-duplicate');
    raise exception 'duplicate listing was created';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_ALREADY_ACTIVE' then
        raise exception 'expected LISTING_ALREADY_ACTIVE, got %', sqlerrm;
      end if;
  end;

  receipt := public.reprice_listing(listing_id, 50000, 'phase8-reprice');
  replay := public.reprice_listing(listing_id, 12000, 'phase8-reprice');
  if receipt <> replay or (replay ->> 'priceCents')::bigint <> 50000 then
    raise exception 'reprice replay changed the price %', replay;
  end if;

  select price_cents
    into listed_price
  from public.marketplace_listings
  where id = listing_id;

  if listed_price <> 50000 then
    raise exception 'stored price is %', listed_price;
  end if;

  receipt := public.delist(listing_id, 'phase8-delist');
  if receipt ->> 'status' <> 'DELISTED' or receipt ->> 'itemState' <> 'OWNED' then
    raise exception 'delist receipt is %', receipt;
  end if;

  select state
    into item_state
  from public.owned_items
  where id = owned_id;

  select status
    into listing_status
  from public.marketplace_listings
  where id = listing_id;

  select count(*)
    into active_count
  from public.marketplace_listings
  where owned_item_id = owned_id
    and status = 'ACTIVE';

  if item_state <> 'OWNED' or listing_status <> 'DELISTED' or active_count <> 0 then
    raise exception 'delist left state % status % active %', item_state, listing_status, active_count;
  end if;

  begin
    perform public.delist(listing_id, 'phase8-delist-again');
    raise exception 'delisted listing was delisted again';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_NOT_ACTIVE' then
        raise exception 'expected LISTING_NOT_ACTIVE, got %', sqlerrm;
      end if;
  end;

  receipt := public.list_item(owned_id, 45000, 'phase8-relist');
  listing_id := (receipt ->> 'listingId')::uuid;

  update public.owned_items
  set owner_id = collector,
      state = 'OWNED'
  where id = owned_id;

  update public.marketplace_listings
  set status = 'SOLD',
      sold_at = now()
  where id = listing_id;

  begin
    perform public.reprice_listing(listing_id, 61000, 'phase8-sold-reprice');
    raise exception 'sold listing was repriced';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_SOLD' then
        raise exception 'expected LISTING_SOLD, got %', sqlerrm;
      end if;
  end;

  begin
    perform public.delist(listing_id, 'phase8-sold-delist');
    raise exception 'sold listing was delisted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'LISTING_SOLD' then
        raise exception 'expected LISTING_SOLD on delist, got %', sqlerrm;
      end if;
  end;

  select status, marketplace_listings.sold_at, price_cents
    into listing_status, listing_sold_at, listed_price
  from public.marketplace_listings
  where id = listing_id;

  if listing_status <> 'SOLD' or listing_sold_at is null or listed_price <> 45000 then
    raise exception 'sold listing was mutated to % % %', listing_status, listing_sold_at, listed_price;
  end if;

  begin
    perform public.list_item(owned_id, 45000, 'phase8-transferred');
    raise exception 'transferred item was listed by the old owner';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'ITEM_NOT_OWNED' then
        raise exception 'expected ITEM_NOT_OWNED after transfer, got %', sqlerrm;
      end if;
  end;

  raise notice 'PHASE8_LISTINGS_OK';
end;
$$;

rollback;
