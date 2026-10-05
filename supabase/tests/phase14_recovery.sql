-- Phase 14 checks. Seed data must already be loaded.
-- A killed or backgrounded reveal keeps the checkout cards and the stored step.

begin;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

do $$
declare
  starter uuid;
  purchase uuid;
  open_cart uuid;
  pack_ids uuid[];
  drawn_item uuid;
  after_item uuid;
  pack_state text;
  sealed_count integer;
  content_count integer;
  receipt jsonb;
  replay jsonb;
  lines jsonb;
  pack_index integer;
begin
  select id into starter from public.pack_skus where category = 'TRADING_CARD' and tier = 'Starter';

  receipt := public.reserve_pack(starter, 10, 'phase14-reserve');
  open_cart := (receipt ->> 'cartId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', line ->> 'lineId',
    'quantity', (line ->> 'quantity')::integer,
    'snapshotPriceCents', (line ->> 'snapshotPriceCents')::bigint
  )), '[]'::jsonb)
    into lines
  from jsonb_array_elements(receipt -> 'lines') line;

  receipt := public.checkout(open_cart, 10000, 'phase14-pay', lines);
  purchase := (receipt ->> 'purchaseId')::uuid;

  select coalesce(array_agg(pack.id order by pack.sequence), '{}')
    into pack_ids
  from public.purchased_packs pack
  where pack.purchase_id = purchase;

  select count(*) into sealed_count
  from public.purchased_packs pack
  where pack.purchase_id = purchase
    and pack.reveal_state = 'SEALED';

  select count(*) into content_count
  from public.pack_contents content
  join public.purchased_packs pack on pack.id = content.purchased_pack_id
  where pack.purchase_id = purchase;

  if cardinality(pack_ids) <> 10 or sealed_count <> 10 or content_count <> 10 then
    raise exception 'fresh purchase packs % sealed % contents %', cardinality(pack_ids), sealed_count, content_count;
  end if;

  select content.catalog_item_id into drawn_item
  from public.pack_contents content
  where content.purchased_pack_id = pack_ids[6];

  for pack_index in 1..5 loop
    perform public.reveal_progress(pack_ids[pack_index], 'OPEN', 'phase14-open-' || pack_index);
    perform public.reveal_progress(pack_ids[pack_index], 'REVEALING_CARD', 'phase14-revealing-' || pack_index);
    perform public.reveal_progress(pack_ids[pack_index], 'CARD_REVEALED', 'phase14-revealed-' || pack_index);
    perform public.reveal_progress(pack_ids[pack_index], 'PACK_COMPLETE', 'phase14-complete-' || pack_index);
  end loop;

  perform public.reveal_progress(pack_ids[6], 'OPEN', 'phase14-open-6');

  select pack.reveal_state into pack_state from public.purchased_packs pack where pack.id = pack_ids[6];
  select content.catalog_item_id into after_item
  from public.pack_contents content
  where content.purchased_pack_id = pack_ids[6];
  if pack_state <> 'OPEN' or after_item is distinct from drawn_item then
    raise exception 'kill during reveal left state % card %', pack_state, after_item;
  end if;

  select count(*) into sealed_count
  from public.purchased_packs pack
  where pack.id = any(pack_ids[7:10])
    and pack.reveal_state = 'SEALED';
  if sealed_count <> 4 then
    raise exception 'packs after 6 did not stay sealed: %', sealed_count;
  end if;

  begin
    perform public.reveal_progress(pack_ids[7], 'PACK_COMPLETE', 'phase14-skip-7');
    raise exception 'a later sealed pack was opened';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'REVEAL_STEP' then
        raise exception 'expected REVEAL_STEP, got %', sqlerrm;
      end if;
  end;

  select pack.reveal_state into pack_state from public.purchased_packs pack where pack.id = pack_ids[7];
  if pack_state <> 'SEALED' then
    raise exception 'skipped pack 7 landed on %', pack_state;
  end if;

  perform public.reveal_progress(pack_ids[6], 'REVEALING_CARD', 'phase14-revealing-6');
  perform public.reveal_progress(pack_ids[6], 'CARD_REVEALED', 'phase14-revealed-6');

  select content.catalog_item_id into after_item
  from public.pack_contents content
  where content.purchased_pack_id = pack_ids[6];
  select pack.reveal_state into pack_state from public.purchased_packs pack where pack.id = pack_ids[6];
  if pack_state <> 'CARD_REVEALED' or after_item is distinct from drawn_item then
    raise exception 'resume replaced the card, state % card %', pack_state, after_item;
  end if;

  replay := public.reveal_progress(pack_ids[6], 'OPEN', 'phase14-open-6');
  select pack.reveal_state into pack_state from public.purchased_packs pack where pack.id = pack_ids[6];
  if replay ->> 'revealState' <> 'OPEN' or pack_state <> 'CARD_REVEALED' then
    raise exception 'replay rewound the interrupted pack to % / %', replay ->> 'revealState', pack_state;
  end if;

  begin
    set local role authenticated;
    update public.pack_contents
      set rarity = 'LEGENDARY'
    where purchased_pack_id = pack_ids[6];
    raise exception 'client rewrote pack contents';
  exception
    when insufficient_privilege then
      null;
  end;

  select content.catalog_item_id into after_item
  from public.pack_contents content
  where content.purchased_pack_id = pack_ids[6];
  if after_item is distinct from drawn_item then
    raise exception 'recovery changed the stored pull';
  end if;
end;
$$;

set local role authenticated;
set constraints all immediate;
reset role;

rollback;

\echo PHASE14_RECOVERY_OK
