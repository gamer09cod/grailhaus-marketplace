-- Deposit is one transaction: ledger row, cached balance, idempotency receipt.
-- Pack pools say which items a tier can pull. Odds alone do not.

create or replace function private.raise_domain(
  p_code text,
  p_message text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code,
    detail = jsonb_build_object(
      'code', p_code,
      'message', p_message,
      'details', coalesce(p_details, '{}'::jsonb)
    )::text;
end;
$$;

-- Mock deposits create trial funds on purpose. The cap stops one request
-- from minting an unbounded balance. $1,000,000 = 100000000 cents.
create or replace function private.apply_deposit(
  p_user_id uuid,
  p_amount_cents bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_status text;
  existing_response jsonb;
  locked_balance bigint;
  reference_id uuid := gen_random_uuid();
  receipt jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before depositing.');
  end if;

  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 8
     or char_length(p_idempotency_key) > 200 then
    perform private.raise_domain(
      'INVALID_IDEMPOTENCY_KEY',
      'Deposit needs an idempotency key.'
    );
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    perform private.raise_domain(
      'INVALID_AMOUNT',
      'Enter an amount from $0.01 to $1,000,000.',
      jsonb_build_object('minCents', 1, 'maxCents', 100000000)
    );
  end if;

  select status, response_json
    into existing_status, existing_response
  from public.idempotency_records
  where user_id = p_user_id
    and operation = 'DEPOSIT'
    and idempotency_key = p_idempotency_key;

  if found then
    if existing_status = 'COMPLETED' then
      if (existing_response ->> 'amountCents')::bigint is distinct from p_amount_cents then
        perform private.raise_domain(
          'IDEMPOTENCY_KEY_REUSED',
          'This deposit key was already used for a different amount.',
          jsonb_build_object('amountCents', existing_response ->> 'amountCents')
        );
      end if;
      return existing_response;
    end if;

    perform private.raise_domain(
      'IDEMPOTENCY_IN_PROGRESS',
      'This deposit is already being confirmed.'
    );
  end if;

  -- Claim the key before locking the wallet. A concurrent retry waits on this
  -- unique key and then replays the receipt instead of crediting twice.
  begin
    insert into public.idempotency_records (
      user_id, operation, idempotency_key, status
    ) values (
      p_user_id, 'DEPOSIT', p_idempotency_key, 'PROCESSING'
    );
  exception
    when unique_violation then
      select status, response_json
        into existing_status, existing_response
      from public.idempotency_records
      where user_id = p_user_id
        and operation = 'DEPOSIT'
        and idempotency_key = p_idempotency_key;

      if existing_status = 'COMPLETED' then
        if (existing_response ->> 'amountCents')::bigint is distinct from p_amount_cents then
          perform private.raise_domain(
            'IDEMPOTENCY_KEY_REUSED',
            'This deposit key was already used for a different amount.',
            jsonb_build_object('amountCents', existing_response ->> 'amountCents')
          );
        end if;
        return existing_response;
      end if;

      perform private.raise_domain(
        'IDEMPOTENCY_IN_PROGRESS',
        'This deposit is already being confirmed.'
      );
  end;

  select balance_cents
    into locked_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    perform private.raise_domain('UNAUTHENTICATED', 'No wallet exists for this account.');
  end if;

  insert into public.ledger_entries (
    user_id,
    entry_type,
    amount_cents,
    reference_type,
    reference_id,
    idempotency_key
  ) values (
    p_user_id,
    'DEPOSIT',
    p_amount_cents,
    'DEPOSIT',
    reference_id,
    p_idempotency_key
  );

  update public.wallets
  set balance_cents = locked_balance + p_amount_cents
  where user_id = p_user_id;

  -- Text cents keep the receipt exact if a client parses JSON numbers poorly.
  receipt := jsonb_build_object(
    'amountCents', p_amount_cents::text,
    'balanceCents', (locked_balance + p_amount_cents)::text,
    'idempotencyKey', p_idempotency_key,
    'referenceId', reference_id
  );

  update public.idempotency_records
  set status = 'COMPLETED',
      response_json = receipt
  where user_id = p_user_id
    and operation = 'DEPOSIT'
    and idempotency_key = p_idempotency_key;

  return receipt;
end;
$$;

create or replace function public.deposit(
  p_amount_cents bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before depositing.');
  end if;

  return private.apply_deposit(auth.uid(), p_amount_cents, p_idempotency_key);
end;
$$;

revoke all on function private.raise_domain(text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.apply_deposit(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.deposit(bigint, text) from public, anon;
grant execute on function public.deposit(bigint, text) to authenticated, service_role;

create unique index catalog_items_category_name_uidx
  on public.catalog_items (category, name);

create unique index pack_skus_category_tier_uidx
  on public.pack_skus (category, tier);

create table public.pack_sku_items (
  pack_sku_id uuid not null references public.pack_skus (id) on delete restrict,
  catalog_item_id uuid not null references public.catalog_items (id) on delete restrict,
  primary key (pack_sku_id, catalog_item_id)
);

create index pack_sku_items_catalog_item_idx
  on public.pack_sku_items (catalog_item_id);

create or replace function private.enforce_pack_pool_category()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sku_category text;
  item_category text;
begin
  select category into sku_category
  from public.pack_skus
  where id = new.pack_sku_id;

  select category into item_category
  from public.catalog_items
  where id = new.catalog_item_id;

  if sku_category is distinct from item_category then
    raise exception 'pack pool item category must match the pack'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger pack_sku_items_category
before insert or update on public.pack_sku_items
for each row execute function private.enforce_pack_pool_category();

-- A rarity with published odds must have at least one item in that pack's pool.
create or replace function private.enforce_pack_pool_covers_odds()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sku_id uuid;
  missing_rarity text;
begin
  if tg_op = 'DELETE' then
    sku_id := old.pack_sku_id;
  else
    sku_id := new.pack_sku_id;
  end if;

  select o.rarity
    into missing_rarity
  from public.pack_odds o
  where o.pack_sku_id = sku_id
    and not exists (
      select 1
      from public.pack_sku_items pool
      join public.catalog_items item on item.id = pool.catalog_item_id
      where pool.pack_sku_id = sku_id
        and item.rarity = o.rarity
    )
  limit 1;

  if missing_rarity is not null then
    raise exception 'pack % has % odds but no pool item of that rarity', sku_id, missing_rarity
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger pack_odds_pool_coverage
after insert or update on public.pack_odds
deferrable initially deferred
for each row execute function private.enforce_pack_pool_covers_odds();

create constraint trigger pack_sku_items_pool_coverage
after insert or update or delete on public.pack_sku_items
deferrable initially deferred
for each row execute function private.enforce_pack_pool_covers_odds();

revoke all on function private.enforce_pack_pool_category() from public, anon, authenticated, service_role;
revoke all on function private.enforce_pack_pool_covers_odds() from public, anon, authenticated, service_role;

alter table public.pack_sku_items enable row level security;
revoke all on table public.pack_sku_items from public, anon, authenticated;
grant select on table public.pack_sku_items to authenticated;
grant select, insert, update, delete on table public.pack_sku_items to service_role;

create policy pack_sku_items_select_authenticated
on public.pack_sku_items
for select
to authenticated
using (true);
