-- Reviewer totals for completed packs and marketplace fees.
-- The transaction rolls back, so the seed stays at the opening balances.

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
  outsider uuid := '99999999-9999-4999-8999-999999999999';
  starter uuid;
  owned_id uuid;
  bought_id uuid;
  open_cart uuid;
  active_listing uuid;
  receipt jsonb;
  pay_lines jsonb;
  snapshot jsonb;
  payout bigint;
  card_margin bigint;
  sneaker_margin bigint;
  watch_margin bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', outsider::text, true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', outsider, 'role', 'authenticated')::text,
      true
    );
    set local role authenticated;
    perform public.admin_snapshot();
    raise exception 'an outsider read the admin numbers';
  exception
    when sqlstate 'P0001' then
      reset role;
      if sqlerrm is distinct from 'ADMIN_FORBIDDEN' then
        raise exception 'outsider error was %', sqlerrm;
      end if;
    when others then
      reset role;
      raise;
  end;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  set local role authenticated;
  snapshot := public.admin_snapshot();
  reset role;

  if snapshot <> jsonb_build_object(
    'packsSold', 0,
    'packRevenueCents', '0',
    'contentsPayoutCents', '0',
    'grossPackMarginCents', '0',
    'marketplaceFeesCents', '0',
    'categories', jsonb_build_array(
      jsonb_build_object('category', 'TRADING_CARD', 'marginCents', '0'),
      jsonb_build_object('category', 'SNEAKER', 'marginCents', '0'),
      jsonb_build_object('category', 'WATCH', 'marginCents', '0')
    )
  ) then
    raise exception 'empty books were %', snapshot;
  end if;

  select id into starter
  from public.pack_skus
  where category = 'TRADING_CARD' and tier = 'Starter';

  receipt := public.reserve_pack(starter, 1, 'phase19-reserve');
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;
  open_cart := (receipt ->> 'cartId')::uuid;
  receipt := public.checkout(open_cart, 1000, 'phase19-pay-pack', pay_lines);
  bought_id := (receipt ->> 'purchaseId')::uuid;

  set local role authenticated;
  snapshot := public.admin_snapshot();
  reset role;

  select item.current_value_cents
    into payout
  from public.pack_contents content
  join public.purchased_packs pack on pack.id = content.purchased_pack_id
  join public.catalog_items item on item.id = content.catalog_item_id
  where pack.purchase_id = bought_id;

  if (snapshot ->> 'packsSold')::bigint <> 1
     or (snapshot ->> 'packRevenueCents')::bigint <> 1000
     or (snapshot ->> 'contentsPayoutCents')::bigint <> payout
     or (snapshot ->> 'grossPackMarginCents')::bigint <> 1000 - payout
     or (snapshot ->> 'marketplaceFeesCents')::bigint <> 0 then
    raise exception 'pack snapshot % payout %', snapshot, payout;
  end if;

  select (category ->> 'marginCents')::bigint
    into card_margin
  from jsonb_array_elements(snapshot -> 'categories') category
  where category ->> 'category' = 'TRADING_CARD';
  select (category ->> 'marginCents')::bigint
    into sneaker_margin
  from jsonb_array_elements(snapshot -> 'categories') category
  where category ->> 'category' = 'SNEAKER';
  select (category ->> 'marginCents')::bigint
    into watch_margin
  from jsonb_array_elements(snapshot -> 'categories') category
  where category ->> 'category' = 'WATCH';
  if card_margin <> 1000 - payout or sneaker_margin <> 0 or watch_margin <> 0 then
    raise exception 'category margins % % %', card_margin, sneaker_margin, watch_margin;
  end if;

  if (
    select -sum(amount_cents)
    from public.ledger_entries
    where entry_type = 'PACK_PURCHASE'
      and reference_id = bought_id
  ) <> 1000 then
    raise exception 'pack debit did not match the SKU price';
  end if;

  select id into owned_id
  from public.owned_items
  where owner_id = reviewer
    and source_type = 'PACK';
  receipt := public.list_item(owned_id, 45000, 'phase19-list');
  active_listing := (receipt ->> 'listingId')::uuid;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );
  receipt := public.add_listing(active_listing, 'phase19-add');
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into pay_lines
  from jsonb_array_elements(receipt -> 'lines') line;
  open_cart := (receipt ->> 'cartId')::uuid;
  perform public.checkout(open_cart, 45000, 'phase19-pay-sale', pay_lines);

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  snapshot := public.admin_snapshot();
  reset role;

  if (snapshot ->> 'packsSold')::bigint <> 1
     or (snapshot ->> 'packRevenueCents')::bigint <> 1000
     or (snapshot ->> 'contentsPayoutCents')::bigint <> payout
     or (snapshot ->> 'marketplaceFeesCents')::bigint <> 3600 then
    raise exception 'fee snapshot %', snapshot;
  end if;

  update public.purchases
  set status = 'REFUNDED'
  where id = bought_id;

  set local role authenticated;
  snapshot := public.admin_snapshot();
  reset role;

  if (snapshot ->> 'packsSold')::bigint <> 0
     or (snapshot ->> 'packRevenueCents')::bigint <> 0
     or (snapshot ->> 'contentsPayoutCents')::bigint <> 0
     or (snapshot ->> 'grossPackMarginCents')::bigint <> 0
     or (snapshot ->> 'marketplaceFeesCents')::bigint <> 3600 then
    raise exception 'refunded pack still counted %', snapshot;
  end if;
end;
$$;

rollback;

\echo PHASE19_ADMIN_OK
