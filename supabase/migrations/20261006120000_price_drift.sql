-- Collectible estimates move one integer step per hour.
-- Pack prices are not in this function. The walk is a function of the item id
-- and the hour bucket, so a missed hour does not need a worker to catch up.

create table private.price_drift_clock (
  singleton integer primary key,
  applied_bucket bigint,
  constraint price_drift_clock_singleton check (singleton = 1)
);

insert into private.price_drift_clock (singleton, applied_bucket)
values (1, null);

-- 30 basis points is 0.3% of the seeded value.
-- 100 steps reach the 30% edge, so the band is 70% to 130% of base_value_cents.
-- The phase repeats every 400 hours: down to the floor, up to the ceiling, and back.
create or replace function public.drifted_value_cents(
  p_item_id uuid,
  p_base_value_cents bigint,
  p_bucket bigint
)
returns bigint
language plpgsql
immutable
strict
set search_path = public, pg_catalog
as $$
declare
  v_offset bigint;
  v_pos bigint;
  v_steps bigint;
  v_raw bigint;
  v_low bigint;
  v_high bigint;
begin
  v_offset := (
    get_byte(uuid_send(p_item_id), 0)::bigint * 16777216
    + get_byte(uuid_send(p_item_id), 1)::bigint * 65536
    + get_byte(uuid_send(p_item_id), 2)::bigint * 256
    + get_byte(uuid_send(p_item_id), 3)::bigint
  ) % 400;
  v_pos := ((p_bucket + v_offset) % 400 + 400) % 400;
  if v_pos <= 200 then
    v_steps := v_pos - 100;
  else
    v_steps := 300 - v_pos;
  end if;

  v_low := greatest(1, (p_base_value_cents * 70) / 100);
  v_high := greatest(v_low, (p_base_value_cents * 130) / 100);
  v_raw := (p_base_value_cents * (10000 + v_steps * 30)) / 10000;
  if v_raw < v_low then
    return v_low;
  end if;
  if v_raw > v_high then
    return v_high;
  end if;
  if v_raw < 1 then
    return 1;
  end if;
  return v_raw;
end;
$$;

create or replace function public.apply_price_drift()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_bucket bigint;
  v_applied bigint;
begin
  v_bucket := floor(extract(epoch from now()) / 3600)::bigint;

  select clock.applied_bucket
    into v_applied
  from private.price_drift_clock clock
  where clock.singleton = 1
  for update;

  if v_applied is not distinct from v_bucket then
    return jsonb_build_object('bucket', v_bucket, 'applied', false);
  end if;

  update public.catalog_items item
  set current_value_cents = public.drifted_value_cents(
    item.id,
    item.base_value_cents,
    v_bucket
  )
  where item.base_value_cents > 0;

  update private.price_drift_clock
  set applied_bucket = v_bucket
  where singleton = 1;

  return jsonb_build_object('bucket', v_bucket, 'applied', true);
end;
$$;

revoke all on function public.drifted_value_cents(uuid, bigint, bigint) from public, anon;
revoke all on function public.apply_price_drift() from public, anon;

grant execute on function public.drifted_value_cents(uuid, bigint, bigint) to authenticated, service_role;
grant execute on function public.apply_price_drift() to authenticated, service_role;
