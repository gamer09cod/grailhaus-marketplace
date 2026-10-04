-- Card reveal plays the contents written at checkout. It does not draw again.
-- Dragging and tearing stay on the device. The server records the tear once
-- it commits, then each later step, and never rewrites pack_contents.

alter table public.owned_items
  add column origin_pack_id uuid references public.purchased_packs (id);

create unique index owned_items_origin_pack_uidx
  on public.owned_items (origin_pack_id)
  where origin_pack_id is not null;

-- Checkout inserts the purchased pack, then the owned item, one unit at a time.
-- The newest unlinked pack for this owner is the one this item came from.
create or replace function private.link_pack_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_type = 'PACK' and new.origin_pack_id is null then
    select pack.id
      into new.origin_pack_id
    from public.purchased_packs pack
    where pack.user_id = new.owner_id
      and not exists (
        select 1
        from public.owned_items item
        where item.origin_pack_id = pack.id
      )
    order by pack.created_at desc, pack.sequence desc
    limit 1;
  end if;

  return new;
end;
$$;

create trigger owned_items_link_pack_origin
before insert on public.owned_items
for each row
execute function private.link_pack_origin();

revoke all on function private.link_pack_origin() from public, anon, authenticated, service_role;

alter table public.idempotency_records
  drop constraint idempotency_records_operation_check;

alter table public.idempotency_records
  add constraint idempotency_records_operation_check check (
    operation in (
      'CHECKOUT',
      'DEPOSIT',
      'RESERVE_PACK',
      'RELEASE_PACK_LINE',
      'RETRY_PACK_RESERVATION',
      'ACCEPT_PACK_PRICE',
      'LIST_ITEM',
      'REPRICE_LISTING',
      'DELIST',
      'ADD_LISTING',
      'ACCEPT_LISTING_PRICE',
      'QA_ACT',
      'REVEAL'
    )
  );

create or replace function private.reveal_step_ok(p_current text, p_requested text)
returns boolean
language sql
immutable
as $$
  select case
    when p_current = 'SEALED' and p_requested = 'OPEN' then true
    when p_current = 'OPEN' and p_requested = 'REVEALING_CARD' then true
    when p_current = 'REVEALING_CARD' and p_requested = 'CARD_REVEALED' then true
    when p_current = 'CARD_REVEALED' and p_requested = 'PACK_COMPLETE' then true
    else false
  end;
$$;

revoke all on function private.reveal_step_ok(text, text) from public, anon, authenticated, service_role;

create or replace function private.apply_reveal_progress(
  p_user_id uuid,
  p_purchased_pack_id uuid,
  p_reveal_state text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  current_state text;
  pack_category text;
  response jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in to open a pack.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'REVEAL', p_idempotency_key);
  if existing is not null then
    return existing;
  end if;

  current_state := null;
  pack_category := null;
  select pack.reveal_state, sku.category
    into current_state, pack_category
  from public.purchased_packs pack
  join public.pack_skus sku on sku.id = pack.pack_sku_id
  where pack.id = p_purchased_pack_id
    and pack.user_id = p_user_id
  for update of pack;

  if current_state is null then
    perform private.raise_domain('PACK_NOT_FOUND', 'That pack is not in your collection.');
  end if;

  if pack_category <> 'TRADING_CARD' then
    perform private.raise_domain('REVEAL_CATEGORY', 'This reveal is for a trading-card pack.');
  end if;

  if p_reveal_state is distinct from current_state then
    if not private.reveal_step_ok(current_state, p_reveal_state) then
      perform private.raise_domain(
        'REVEAL_STEP',
        'Open this pack in order. A tap does not finish it.'
      );
    end if;

    update public.purchased_packs
      set reveal_state = p_reveal_state
    where id = p_purchased_pack_id;

    current_state := p_reveal_state;
  end if;

  response := jsonb_build_object(
    'purchasedPackId', p_purchased_pack_id,
    'revealState', current_state
  );

  return private.finish_idempotency(p_user_id, 'REVEAL', p_idempotency_key, response);
end;
$$;

create or replace function public.reveal_progress(
  p_purchased_pack_id uuid,
  p_reveal_state text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_reveal_progress(
    auth.uid(),
    p_purchased_pack_id,
    p_reveal_state,
    p_idempotency_key
  );
end;
$$;

revoke all on function private.apply_reveal_progress(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reveal_progress(uuid, text, text) from public, anon;
grant execute on function public.reveal_progress(uuid, text, text) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchased_packs'
  ) then
    alter publication supabase_realtime add table public.purchased_packs;
  end if;
end;
$$;
