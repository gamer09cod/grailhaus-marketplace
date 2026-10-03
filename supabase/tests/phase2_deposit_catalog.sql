-- Phase 2 checks. Seed data must already be loaded.
-- Deposit mutations roll back with this transaction.

begin;

do $$
declare
  category_name text;
  item_count integer;
  tier_count integer;
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  odds_gap integer;
begin
  foreach category_name in array array['TRADING_CARD', 'SNEAKER', 'WATCH'] loop
    select count(*) into item_count from public.catalog_items where category = category_name;
    select count(*) into tier_count
    from public.pack_skus
    where category = category_name
      and is_drop = false;

    if item_count < 20 or item_count > 30 then
      raise exception 'catalog count for % is %', category_name, item_count;
    end if;

    if tier_count <> 3 then
      raise exception 'tier count for % is %', category_name, tier_count;
    end if;
  end loop;

  select count(*) into odds_gap
  from (
    select pack_sku_id
    from public.pack_odds
    group by pack_sku_id
    having sum(probability_basis_points) <> 10000
  ) bad;

  if odds_gap <> 0 then
    raise exception 'pack odds do not sum to 10000';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and column_name like '%\_cents' escape '\'
      and data_type <> 'bigint'
  ) then
    raise exception 'money column is not bigint';
  end if;

  if (select balance_cents from public.wallets where user_id = reviewer) <> 1000000 then
    raise exception 'reviewer opening balance is not 1000000 cents';
  end if;

  if (
    select coalesce(sum(amount_cents), 0)
    from public.ledger_entries
    where user_id = reviewer
  ) <> 1000000 then
    raise exception 'reviewer ledger does not sum to the wallet';
  end if;

  if (
    select count(*)
    from public.ledger_entries
    where user_id = reviewer
      and entry_type = 'DEPOSIT'
  ) <> 1 then
    raise exception 'opening balance was not a single deposit';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

do $$
declare
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  first_receipt jsonb;
  second_receipt jsonb;
  deposit_rows integer;
begin
  first_receipt := public.deposit(10000, 'phase2-deposit-retry-key');
  second_receipt := public.deposit(10000, 'phase2-deposit-retry-key');

  if first_receipt <> second_receipt then
    raise exception 'idempotent deposit returned a different receipt';
  end if;

  if (first_receipt ->> 'balanceCents')::bigint <> 1010000 then
    raise exception 'deposit balance is %', first_receipt ->> 'balanceCents';
  end if;

  select count(*) into deposit_rows
  from public.ledger_entries
  where user_id = reviewer
    and idempotency_key = 'phase2-deposit-retry-key';

  if deposit_rows <> 1 then
    raise exception 'retry created % ledger rows', deposit_rows;
  end if;

  if (
    select balance_cents from public.wallets where user_id = reviewer
  ) <> (
    select coalesce(sum(amount_cents), 0)
    from public.ledger_entries
    where user_id = reviewer
  ) then
    raise exception 'wallet and ledger diverged after deposit';
  end if;
end $$;

do $$
begin
  perform public.deposit(50000, 'phase2-deposit-retry-key');
  raise exception 'reused key with a new amount succeeded';
exception
  when raise_exception then
    if sqlerrm <> 'IDEMPOTENCY_KEY_REUSED' then
      raise;
    end if;
end $$;

do $$
begin
  perform public.deposit(0, 'phase2-zero-amount');
  raise exception 'zero deposit succeeded';
exception
  when raise_exception then
    if sqlerrm <> 'INVALID_AMOUNT' then
      raise;
    end if;
end $$;

do $$
declare
  reviewer uuid := '11111111-1111-4111-8111-111111111111';
  visible_items integer;
  visible_packs integer;
begin
  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  select count(*) into visible_items from public.catalog_items;
  select count(*) into visible_packs from public.pack_skus;

  if visible_items <> 81 or visible_packs <> 10 then
    raise exception 'catalog load saw % items and % packs', visible_items, visible_packs;
  end if;

  begin
    insert into public.ledger_entries (user_id, entry_type, amount_cents)
    values (reviewer, 'DEPOSIT', 100);
    raise exception 'authenticated ledger insert succeeded';
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'reset role';
end $$;

do $$
begin
  raise notice 'PHASE2_DEPOSIT_CATALOG_OK';
end $$;

rollback;
