-- A sold listing is checked when that row is marked sold, at the end of
-- the statement. Checkout has already moved the item to the buyer, so a
-- real sale passes. Marking the row sold while the seller still owns the
-- item fails. The check is not deferred: a later buyback can make an older
-- seller the owner again, and that must still commit.
-- sold_at is the clock time of the sale so a later sale sorts after an
-- earlier one even inside one database transaction.

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

  return null;
end;
$$;

create or replace function private.stamp_listing_sold_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'SOLD'
     and (tg_op = 'INSERT' or old.status is distinct from 'SOLD') then
    new.sold_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger marketplace_listings_stamp_sold_at
before insert or update on public.marketplace_listings
for each row execute function private.stamp_listing_sold_at();

create or replace function private.assert_sold_listing_transferred()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item_owner uuid;
begin
  if new.status is distinct from 'SOLD' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'SOLD' then
    return null;
  end if;

  select owner_id
    into item_owner
  from public.owned_items
  where id = new.owned_item_id;

  if item_owner = new.seller_id then
    raise exception 'sold listing for item % still names the current owner', new.owned_item_id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create trigger marketplace_listings_sold_transferred
after insert or update on public.marketplace_listings
for each row execute function private.assert_sold_listing_transferred();
