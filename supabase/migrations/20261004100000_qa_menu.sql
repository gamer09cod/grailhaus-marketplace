-- Hidden QA actions. Each one calls the same private mutation the product uses.
-- A reviewer can make another account buy, reprice, delist, sell, move a drop
-- window, set their own balance through the ledger, or expire their hold.

alter table public.ledger_entries
  drop constraint ledger_entries_type_check;

alter table public.ledger_entries
  add constraint ledger_entries_type_check check (
    entry_type in (
      'DEPOSIT',
      'PACK_PURCHASE',
      'MARKETPLACE_PURCHASE',
      'MARKETPLACE_SALE',
      'MARKETPLACE_FEE',
      'REFUND',
      'QA_ADJUSTMENT'
    )
  );

alter table public.ledger_entries
  drop constraint ledger_entries_sign_check;

alter table public.ledger_entries
  add constraint ledger_entries_sign_check check (
    case entry_type
      when 'DEPOSIT' then user_id is not null and amount_cents > 0
      when 'REFUND' then user_id is not null and amount_cents > 0
      when 'MARKETPLACE_SALE' then user_id is not null and amount_cents > 0
      when 'PACK_PURCHASE' then user_id is not null and amount_cents < 0
      when 'MARKETPLACE_PURCHASE' then user_id is not null and amount_cents < 0
      when 'MARKETPLACE_FEE' then user_id is null and amount_cents > 0
      when 'QA_ADJUSTMENT' then user_id is not null and amount_cents <> 0
      else false
    end
  );

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
      'QA_ACT'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wallets'
  ) then
    alter publication supabase_realtime add table public.wallets;
  end if;
end;
$$;

create or replace function private.qa_reviewer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id in (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid
  );
$$;

-- Stand-in buyer used by "another user" actions. Never the signed-in reviewer.
create or replace function private.qa_buyer()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  buyer_id uuid := '33333333-3333-4333-8333-333333333333';
begin
  if not exists (select 1 from auth.users where id = buyer_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new,
      email_change_token_current, recovery_token, phone_change, phone_change_token,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000',
      buyer_id,
      'authenticated',
      'authenticated',
      'qa-buyer@grailhaus.test',
      extensions.crypt('Qa-buyer-only', extensions.gen_salt('bf')),
      now(), now(), now(),
      '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      false,
      false
    );
  end if;

  return buyer_id;
end;
$$;

create or replace function private.qa_fund(p_user_id uuid, p_need_cents bigint, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_balance bigint;
  shortfall bigint;
begin
  select balance_cents
    into locked_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if locked_balance is null then
    perform private.raise_domain('UNAUTHENTICATED', 'No wallet exists for this account.');
  end if;

  shortfall := p_need_cents - locked_balance;
  if shortfall <= 0 then
    return;
  end if;

  if shortfall > 100000000 then
    perform private.raise_domain(
      'INSUFFICIENT_BALANCE',
      'The stand-in buyer cannot cover that purchase.'
    );
  end if;

  perform private.apply_deposit(p_user_id, shortfall, p_key);
end;
$$;

create or replace function private.qa_clear_cart(p_user_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  line_id text;
  line_number integer := 0;
begin
  for line_id in
    select line ->> 'lineId'
    from jsonb_array_elements(private.cart_snapshot(p_user_id) -> 'lines') line
  loop
    line_number := line_number + 1;
    perform private.apply_release_pack_line(p_user_id, line_id::uuid, p_key || ':c' || line_number::text);
  end loop;
end;
$$;

create or replace function private.qa_pay_cart(p_user_id uuid, p_snapshot jsonb, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  open_cart uuid;
  pay_lines jsonb;
  pay_total bigint;
begin
  open_cart := (p_snapshot ->> 'cartId')::uuid;
  pay_lines := null;
  pay_total := null;
  if open_cart is null then
    perform private.raise_domain('CART_EMPTY', 'The stand-in cart is empty.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'lineId', line ->> 'lineId',
      'quantity', (line ->> 'quantity')::integer,
      'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
    )), '[]'::jsonb),
    coalesce(sum((line ->> 'snapshotPriceCents')::bigint * (line ->> 'quantity')::integer), 0)
    into pay_lines, pay_total
  from jsonb_array_elements(p_snapshot -> 'lines') line;

  if pay_lines is null or pay_total is null then
    perform private.raise_domain('CART_EMPTY', 'The stand-in cart is empty.');
  end if;

  return private.apply_pack_checkout(p_user_id, open_cart, pay_total, p_key, pay_lines);
end;
$$;

create or replace function private.apply_qa_act(
  p_user_id uuid,
  p_action text,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  buyer_id uuid;
  offer_id uuid;
  seller_id uuid;
  sku_id uuid;
  quantity integer;
  price_cents bigint;
  target_cents bigint;
  locked_balance bigint;
  delta bigint;
  released_count integer;
  drop_status text;
  receipt jsonb;
  child jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before using the QA menu.');
  end if;

  if not private.qa_reviewer(p_user_id) then
    perform private.raise_domain('QA_FORBIDDEN', 'This menu is for the reviewer accounts.');
  end if;

  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 8
     or char_length(p_idempotency_key) > 120 then
    perform private.raise_domain('INVALID_IDEMPOTENCY_KEY', 'This QA action needs an idempotency key.');
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    perform private.raise_domain('INVALID_QA', 'This QA action needs a payload.');
  end if;

  if p_action not in (
    'buyPack',
    'repriceListing',
    'delistListing',
    'sellListing',
    'startDrop',
    'endDrop',
    'setBalance',
    'expireReservation'
  ) then
    perform private.raise_domain('QA_ACTION_UNKNOWN', 'That QA action is not available.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'QA_ACT', p_idempotency_key);
  if existing is not null then
    if (existing ->> 'action') is distinct from p_action then
      perform private.raise_domain(
        'IDEMPOTENCY_KEY_REUSED',
        'This QA key was already used for a different action.'
      );
    end if;
    return existing;
  end if;

  if p_action = 'buyPack' then
    sku_id := (p_payload ->> 'packSkuId')::uuid;
    quantity := (p_payload ->> 'quantity')::integer;
    if sku_id is null or quantity is null or quantity < 1 or quantity > 100 then
      perform private.raise_domain('INVALID_QUANTITY', 'Choose a quantity from 1 to 100.');
    end if;

    select pack.price_cents
      into price_cents
    from public.pack_skus pack
    where pack.id = sku_id;

    if price_cents is null then
      perform private.raise_domain('PACK_NOT_FOUND', 'That pack is not on the shelf.');
    end if;

    buyer_id := private.qa_buyer();
    perform private.qa_fund(buyer_id, price_cents * quantity, p_idempotency_key || ':fund');
    perform private.qa_clear_cart(buyer_id, p_idempotency_key || ':clear');
    child := private.apply_reserve_pack(buyer_id, sku_id, quantity, p_idempotency_key || ':reserve');
    child := private.qa_pay_cart(buyer_id, child, p_idempotency_key || ':pay');
    receipt := jsonb_build_object(
      'action', p_action,
      'packSkuId', sku_id,
      'quantity', quantity,
      'totalCents', child ->> 'totalCents',
      'purchaseId', child ->> 'purchaseId'
    );

  elsif p_action = 'repriceListing' then
    offer_id := (p_payload ->> 'listingId')::uuid;
    price_cents := (p_payload ->> 'priceCents')::bigint;
    select listing.seller_id
      into seller_id
    from public.marketplace_listings listing
    where listing.id = offer_id;

    if seller_id is null then
      perform private.raise_domain('LISTING_DELISTED', 'That listing is no longer available.');
    end if;

    child := private.apply_reprice_listing(seller_id, offer_id, price_cents, p_idempotency_key || ':reprice');
    receipt := jsonb_build_object(
      'action', p_action,
      'listingId', offer_id,
      'priceCents', child ->> 'priceCents'
    );

  elsif p_action = 'delistListing' then
    offer_id := (p_payload ->> 'listingId')::uuid;
    select listing.seller_id
      into seller_id
    from public.marketplace_listings listing
    where listing.id = offer_id;

    if seller_id is null then
      perform private.raise_domain('LISTING_DELISTED', 'That listing is no longer available.');
    end if;

    child := private.apply_delist(seller_id, offer_id, p_idempotency_key || ':delist');
    receipt := jsonb_build_object(
      'action', p_action,
      'listingId', offer_id,
      'status', child ->> 'status'
    );

  elsif p_action = 'sellListing' then
    offer_id := (p_payload ->> 'listingId')::uuid;
    select listing.price_cents, listing.seller_id
      into price_cents, seller_id
    from public.marketplace_listings listing
    where listing.id = offer_id
    for update;

    if seller_id is null or price_cents is null then
      perform private.raise_domain('LISTING_DELISTED', 'That listing is no longer available.');
    end if;

    buyer_id := private.qa_buyer();
    if buyer_id = seller_id then
      perform private.raise_domain('SELF_PURCHASE_FORBIDDEN', 'You cannot buy your own listing.');
    end if;

    perform private.qa_fund(buyer_id, price_cents, p_idempotency_key || ':fund');
    perform private.qa_clear_cart(buyer_id, p_idempotency_key || ':clear');
    child := private.apply_add_listing(buyer_id, offer_id, p_idempotency_key || ':add');
    child := private.qa_pay_cart(buyer_id, child, p_idempotency_key || ':pay');
    receipt := jsonb_build_object(
      'action', p_action,
      'listingId', offer_id,
      'totalCents', child ->> 'totalCents',
      'purchaseId', child ->> 'purchaseId'
    );

  elsif p_action in ('startDrop', 'endDrop') then
    sku_id := (p_payload ->> 'packSkuId')::uuid;
    if p_action = 'startDrop' then
      update public.drops
      set starts_at = now() - interval '1 minute',
          ends_at = case
            when ends_at <= now() then now() + interval '30 days'
            else ends_at
          end
      where pack_sku_id = sku_id;
    else
      update public.drops
      set starts_at = least(starts_at, now() - interval '1 minute'),
          ends_at = now()
      where pack_sku_id = sku_id;
    end if;

    if not found then
      perform private.raise_domain('DROP_NOT_FOUND', 'That pack is not a timed drop.');
    end if;

    select derived.status
      into drop_status
    from public.drops_with_status derived
    where derived.pack_sku_id = sku_id;

    receipt := jsonb_build_object(
      'action', p_action,
      'packSkuId', sku_id,
      'status', drop_status
    );

  elsif p_action = 'setBalance' then
    target_cents := (p_payload ->> 'balanceCents')::bigint;
    if target_cents is null or target_cents < 0 or target_cents > 100000000 then
      perform private.raise_domain(
        'INVALID_AMOUNT',
        'Enter a balance from $0.00 to $1,000,000.'
      );
    end if;

    select balance_cents
      into locked_balance
    from public.wallets
    where user_id = p_user_id
    for update;

    delta := target_cents - locked_balance;
    if delta > 0 then
      perform private.apply_deposit(p_user_id, delta, p_idempotency_key || ':deposit');
    elsif delta < 0 then
      insert into public.ledger_entries (
        user_id, entry_type, amount_cents, idempotency_key
      ) values (
        p_user_id, 'QA_ADJUSTMENT', delta, p_idempotency_key || ':adjust'
      );

      update public.wallets
      set balance_cents = locked_balance + delta
      where user_id = p_user_id;
    end if;

    receipt := jsonb_build_object(
      'action', p_action,
      'balanceCents', target_cents::text
    );

  else
    perform set_config('grailhaus.reservation_admin', 'on', true);

    update public.cart_reservations
    set expires_at = now() - interval '1 second'
    where user_id = p_user_id
      and status = 'ACTIVE'
      and (
        nullif(p_payload ->> 'lineId', '') is null
        or cart_line_id = (p_payload ->> 'lineId')::uuid
      );

    if not found then
      perform private.raise_domain('RESERVATION_EXPIRED', 'You have no active reservation.');
    end if;

    released_count := public.release_expired_reservations();
    receipt := jsonb_build_object(
      'action', p_action,
      'released', released_count
    );
  end if;

  return private.finish_idempotency(p_user_id, 'QA_ACT', p_idempotency_key, receipt);
end;
$$;

create or replace function public.qa_act(
  p_action text,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return private.apply_qa_act(auth.uid(), p_action, p_payload, p_idempotency_key);
end;
$$;

revoke all on function private.qa_reviewer(uuid) from public, anon, authenticated, service_role;
revoke all on function private.qa_buyer() from public, anon, authenticated, service_role;
revoke all on function private.qa_fund(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke all on function private.qa_clear_cart(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.qa_pay_cart(uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function private.apply_qa_act(uuid, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.qa_act(text, jsonb, text) from public, anon;
grant execute on function public.qa_act(text, jsonb, text) to authenticated, service_role;
