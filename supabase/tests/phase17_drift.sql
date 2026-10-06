-- Phase 17 checks. Seed data must already be loaded.
-- Collectible estimates walk inside 70% to 130% of the seeded value.
-- Pack prices stay on the row that was seeded.

begin;

do $$
declare
  sample_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  other_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  bucket bigint;
  previous bigint;
  current_value bigint;
  low_cents bigint;
  high_cents bigint;
  moved integer;
  first_pass jsonb;
  second_pass jsonb;
  prices_before jsonb;
  prices_after jsonb;
  bases_before jsonb;
  bases_after jsonb;
  finch_base bigint;
  finch_id uuid;
  finch_value bigint;
  starter_price bigint;
begin
  if public.drifted_value_cents(sample_id, 100000, 0)
     is distinct from public.drifted_value_cents(sample_id, 100000, 0) then
    raise exception 'the same item and hour did not return the same cents';
  end if;

  previous := public.drifted_value_cents(sample_id, 100000, 0);
  for bucket in 0..799 loop
    current_value := public.drifted_value_cents(sample_id, 100000, bucket);
    low_cents := greatest(1, (100000 * 70) / 100);
    high_cents := greatest(low_cents, (100000 * 130) / 100);
    if current_value < low_cents or current_value > high_cents then
      raise exception 'drift left the 70 to 130 percent band at bucket %', bucket;
    end if;
    if bucket > 0 and abs(current_value - previous) <> 300 then
      raise exception 'a 0.3 percent step was not 300 cents at bucket %', bucket;
    end if;
    previous := current_value;
  end loop;

  if public.drifted_value_cents(sample_id, 100000, -1) < (100000 * 70) / 100
     or public.drifted_value_cents(sample_id, 100000, -1) > (100000 * 130) / 100 then
    raise exception 'a negative hour left the band';
  end if;

  if public.drifted_value_cents(sample_id, 1, 50) < 1 then
    raise exception 'a one-cent item drifted to zero';
  end if;

  if public.drifted_value_cents(sample_id, 100000, 10)
     = public.drifted_value_cents(other_id, 100000, 10) then
    raise exception 'two items shared a phase';
  end if;

  select coalesce(jsonb_object_agg(sku.id::text, sku.price_cents), '{}'::jsonb)
    into prices_before
  from public.pack_skus sku;

  select coalesce(jsonb_object_agg(item.id::text, item.base_value_cents), '{}'::jsonb)
    into bases_before
  from public.catalog_items item;

  update private.price_drift_clock
  set applied_bucket = null
  where singleton = 1;

  first_pass := public.apply_price_drift();
  if first_pass ->> 'applied' is distinct from 'true' then
    raise exception 'the first read of this hour did not apply the walk';
  end if;

  select count(*)
    into moved
  from public.catalog_items item
  where item.current_value_cents is distinct from item.base_value_cents;
  if moved < 1 then
    raise exception 'every collectible stayed on its seeded value';
  end if;

  if exists (
    select 1
    from public.catalog_items item
    where item.current_value_cents
      is distinct from public.drifted_value_cents(
        item.id,
        item.base_value_cents,
        (first_pass ->> 'bucket')::bigint
      )
      or item.current_value_cents < greatest(1, (item.base_value_cents * 70) / 100)
      or item.current_value_cents > greatest(1, (item.base_value_cents * 130) / 100)
  ) then
    raise exception 'a stored value was not the integer walk for this hour';
  end if;

  select item.base_value_cents, item.id, item.current_value_cents
    into finch_base, finch_id, finch_value
  from public.catalog_items item
  where item.name = 'Cedar Finch';
  if finch_value is distinct from public.drifted_value_cents(
    finch_id,
    finch_base,
    (first_pass ->> 'bucket')::bigint
  ) then
    raise exception 'Cedar Finch did not use the stored walk';
  end if;

  second_pass := public.apply_price_drift();
  if second_pass ->> 'applied' is distinct from 'false'
     or second_pass ->> 'bucket' is distinct from first_pass ->> 'bucket' then
    raise exception 'the same hour walked a second time';
  end if;

  select coalesce(jsonb_object_agg(sku.id::text, sku.price_cents), '{}'::jsonb)
    into prices_after
  from public.pack_skus sku;
  if prices_after is distinct from prices_before then
    raise exception 'a pack price drifted';
  end if;

  select sku.price_cents
    into starter_price
  from public.pack_skus sku
  where sku.name = 'Starter Pack';
  if starter_price is distinct from 1000 then
    raise exception 'the starter pack price is no longer 1000 cents';
  end if;

  select coalesce(jsonb_object_agg(item.id::text, item.base_value_cents), '{}'::jsonb)
    into bases_after
  from public.catalog_items item;
  if bases_after is distinct from bases_before then
    raise exception 'the seeded value was overwritten';
  end if;

  begin
    set local role authenticated;
    update public.catalog_items
    set current_value_cents = 1
    where name = 'Cedar Finch';
    raise exception 'a signed-in client wrote a collectible value';
  exception
    when insufficient_privilege then
      reset role;
  end;
end;
$$;

set constraints all immediate;

rollback;

\echo PHASE17_DRIFT_OK
