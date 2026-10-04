-- Phase 12 checks. Seed data must already be loaded.
-- Reveal progress rolls back with this transaction.

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
  starter uuid;
  street uuid;
  card_pack uuid;
  street_pack uuid;
  drawn_item uuid;
  after_item uuid;
  drawn_rarity text;
  after_rarity text;
  origin_id uuid;
  content_count integer;
  stored_order integer;
  pack_state text;
  receipt jsonb;
  replay jsonb;
  open_cart uuid;
  lines jsonb;
begin
  select id into starter from public.pack_skus where category = 'TRADING_CARD' and tier = 'Starter';
  select id into street from public.pack_skus where category = 'SNEAKER' and tier = 'Street';

  receipt := public.reserve_pack(starter, 1, 'phase12-reserve-card');
  open_cart := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;

  receipt := public.checkout(open_cart, 1000, 'phase12-pay-card', lines);
  card_pack := (receipt -> 'packs' -> 0 ->> 'purchasedPackId')::uuid;
  drawn_item := (receipt -> 'packs' -> 0 -> 'contents' -> 0 ->> 'catalogItemId')::uuid;
  drawn_rarity := receipt -> 'packs' -> 0 -> 'contents' -> 0 ->> 'rarity';

  select pack.reveal_state, count(content.id), min(content.reveal_order)
    into pack_state, content_count, stored_order
  from public.purchased_packs pack
  join public.pack_contents content on content.purchased_pack_id = pack.id
  where pack.id = card_pack
  group by pack.reveal_state;

  if pack_state <> 'SEALED' or content_count <> 1 or stored_order <> 1 then
    raise exception 'checkout left state % contents % order %', pack_state, content_count, stored_order;
  end if;

  select item.origin_pack_id
    into origin_id
  from public.owned_items item
  where item.owner_id = reviewer
    and item.source_type = 'PACK'
    and item.catalog_item_id = drawn_item;

  if origin_id is distinct from card_pack then
    raise exception 'owned item origin % is not the sealed pack', origin_id;
  end if;

  begin
    perform public.reveal_progress(card_pack, 'PACK_COMPLETE', 'phase12-skip');
    raise exception 'a sealed pack jumped to complete';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'REVEAL_STEP' then
        raise exception 'expected REVEAL_STEP, got %', sqlerrm;
      end if;
  end;

  select pack.reveal_state into pack_state from public.purchased_packs pack where pack.id = card_pack;
  if pack_state <> 'SEALED' then
    raise exception 'rejected skip left state %', pack_state;
  end if;

  receipt := public.reveal_progress(card_pack, 'OPEN', 'phase12-open');
  replay := public.reveal_progress(card_pack, 'OPEN', 'phase12-open-again');
  if (receipt ->> 'revealState') <> 'OPEN' or (replay ->> 'revealState') <> 'OPEN' then
    raise exception 'open did not stay OPEN';
  end if;

  perform public.reveal_progress(card_pack, 'REVEALING_CARD', 'phase12-revealing');
  perform public.reveal_progress(card_pack, 'CARD_REVEALED', 'phase12-card');
  perform public.reveal_progress(card_pack, 'PACK_COMPLETE', 'phase12-done');

  select content.catalog_item_id, content.rarity, pack.reveal_state
    into after_item, after_rarity, pack_state
  from public.pack_contents content
  join public.purchased_packs pack on pack.id = content.purchased_pack_id
  where content.purchased_pack_id = card_pack;

  if after_item is distinct from drawn_item or after_rarity is distinct from drawn_rarity or pack_state <> 'PACK_COMPLETE' then
    raise exception 'reveal changed the stored card';
  end if;

  select count(*) into content_count from public.pack_contents where purchased_pack_id = card_pack;
  if content_count <> 1 then
    raise exception 'reveal wrote % content rows', content_count;
  end if;

  replay := public.reveal_progress(card_pack, 'PACK_COMPLETE', 'phase12-open');
  if (replay ->> 'revealState') <> 'OPEN' then
    raise exception 'replay replaced the stored response';
  end if;
  select pack.reveal_state into pack_state from public.purchased_packs pack where pack.id = card_pack;
  if pack_state <> 'PACK_COMPLETE' then
    raise exception 'replay rewound the pack to %', pack_state;
  end if;

  begin
    perform public.reveal_progress(card_pack, 'OPEN', 'phase12-open-late');
    raise exception 'a finished pack accepted another tear';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'REVEAL_STEP' then
        raise exception 'expected REVEAL_STEP, got %', sqlerrm;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', collector::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', collector, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.reveal_progress(card_pack, 'OPEN', 'phase12-other');
    raise exception 'another user opened the pack';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'PACK_NOT_FOUND' then
        raise exception 'expected PACK_NOT_FOUND, got %', sqlerrm;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', reviewer::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', reviewer, 'role', 'authenticated')::text,
    true
  );

  receipt := public.reserve_pack(street, 1, 'phase12-reserve-street');
  open_cart := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;

  receipt := public.checkout(open_cart, 8000, 'phase12-pay-street', lines);
  street_pack := (receipt -> 'packs' -> 0 ->> 'purchasedPackId')::uuid;

  begin
    perform public.reveal_progress(street_pack, 'OPEN', 'phase12-street');
    raise exception 'a sneaker pack used the card reveal';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'REVEAL_CATEGORY' then
        raise exception 'expected REVEAL_CATEGORY, got %', sqlerrm;
      end if;
  end;

  select pack.reveal_state into pack_state from public.purchased_packs pack where pack.id = street_pack;
  if pack_state <> 'SEALED' then
    raise exception 'sneaker reveal left state %', pack_state;
  end if;

  select content.catalog_item_id into after_item
  from public.pack_contents content
  where content.purchased_pack_id = card_pack;
  if after_item is distinct from drawn_item then
    raise exception 'later checkout replaced the card';
  end if;

  begin
    set local role authenticated;
    update public.purchased_packs
      set reveal_state = 'SEALED'
    where id = card_pack;
    raise exception 'client wrote reveal state';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    set local role authenticated;
    update public.pack_contents
      set rarity = 'LEGENDARY'
    where purchased_pack_id = card_pack;
    raise exception 'client rewrote pack contents';
  exception
    when insufficient_privilege then
      null;
  end;

  select pack.reveal_state into pack_state from public.purchased_packs pack where pack.id = card_pack;
  select content.rarity into after_rarity from public.pack_contents content where content.purchased_pack_id = card_pack;
  if pack_state <> 'PACK_COMPLETE' or after_rarity is distinct from drawn_rarity then
    raise exception 'client write changed the stored pull';
  end if;
end;
$$;

set local role authenticated;
set constraints all immediate;
reset role;

rollback;

\echo PHASE12_REVEAL_OK
