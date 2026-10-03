-- Deferred pack-content checks run at commit as the signed-in user.
-- That user cannot see the private schema, so the check runs as its owner.
alter function private.assert_pack_contents() security definer;
alter function private.assert_ledger_insert_matches_wallet() security definer;
alter function private.assert_owned_item_listing() security definer;

-- One checkout pays every open cart line.
-- A listing is locked, transferred, and split into buyer, seller, and fee
-- rows in the same transaction as any packs. Any invalid line rolls it back.

create or replace function private.apply_pack_checkout(
  p_user_id uuid,
  p_cart_id uuid,
  p_expected_total_cents bigint,
  p_idempotency_key text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  locked_balance bigint;
  open_cart_id uuid;
  server_count integer;
  client_count integer;
  line record;
  offer record;
  seller_row record;
  client_line jsonb;
  pack_total bigint := 0;
  listing_total bigint := 0;
  authoritative_total bigint := 0;
  prior_packs integer;
  purchase_id uuid;
  pack_sequence integer := 0;
  unit_index integer;
  purchased_pack_id uuid;
  drawn record;
  pack_rows jsonb := '[]'::jsonb;
  listing_rows jsonb := '[]'::jsonb;
  content_rows jsonb;
  fee_cents bigint;
  seller_balance bigint;
  receipt jsonb;
begin
  if p_user_id is null then
    perform private.raise_domain('UNAUTHENTICATED', 'Sign in before paying.');
  end if;

  if p_expected_total_cents is null or p_expected_total_cents < 0 then
    perform private.raise_domain('CHECKOUT_TOTAL_CHANGED', 'Review your cart before paying.');
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' then
    perform private.raise_domain('CART_CHANGED', 'Review your cart before paying.');
  end if;

  existing := private.claim_idempotency(p_user_id, 'CHECKOUT', p_idempotency_key);
  if existing is not null then
    if (existing ->> 'cartId') is distinct from p_cart_id::text
       or (existing ->> 'totalCents')::bigint is distinct from p_expected_total_cents then
      perform private.raise_domain(
        'IDEMPOTENCY_KEY_REUSED',
        'This payment key was already used for a different cart or total.'
      );
    end if;
    return existing;
  end if;

  select balance_cents
    into locked_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    perform private.raise_domain('UNAUTHENTICATED', 'No wallet exists for this account.');
  end if;

  perform public.release_expired_reservations();

  select id
    into open_cart_id
  from public.carts
  where id = p_cart_id
    and user_id = p_user_id
    and status = 'OPEN'
  for update;

  if not found then
    perform private.raise_domain('CART_NOT_OPEN', 'This cart is no longer open.');
  end if;

  select count(*)
    into server_count
  from public.cart_lines
  where cart_id = open_cart_id
    and removed_at is null;

  client_count := jsonb_array_length(p_lines);
  if server_count = 0 or client_count = 0 then
    perform private.raise_domain('CART_EMPTY', 'Your cart is empty.');
  end if;

  if client_count <> server_count then
    perform private.raise_domain(
      'CART_CHANGED',
      'Some items are no longer available or their price changed.'
    );
  end if;

  perform sku.id
  from public.pack_skus sku
  where sku.id in (
    select pack_sku_id
    from public.cart_lines
    where cart_id = open_cart_id
      and removed_at is null
      and line_type = 'PACK'
  )
  order by sku.id
  for update;

  perform hold.id
  from public.cart_reservations hold
  where hold.cart_line_id in (
    select id
    from public.cart_lines
    where cart_id = open_cart_id
      and removed_at is null
      and line_type = 'PACK'
  )
    and hold.status = 'ACTIVE'
  order by hold.id
  for update;

  perform drop_row.id
  from public.drops drop_row
  where drop_row.pack_sku_id in (
    select pack_sku_id
    from public.cart_lines
    where cart_id = open_cart_id
      and removed_at is null
      and line_type = 'PACK'
  )
  order by drop_row.id
  for update;

  perform listing.id
  from public.marketplace_listings listing
  where listing.id in (
    select listing_id
    from public.cart_lines
    where cart_id = open_cart_id
      and removed_at is null
      and line_type = 'MARKETPLACE_LISTING'
  )
  order by listing.id
  for update;

  perform item.id
  from public.owned_items item
  where item.id in (
    select listing.owned_item_id
    from public.marketplace_listings listing
    where listing.id in (
      select listing_id
      from public.cart_lines
      where cart_id = open_cart_id
        and removed_at is null
        and line_type = 'MARKETPLACE_LISTING'
    )
  )
  order by item.id
  for update;

  for line in
    select
      cart_line.id,
      cart_line.quantity,
      cart_line.snapshot_price_cents,
      cart_line.pack_sku_id,
      sku.price_cents,
      sku.active,
      sku.is_drop,
      sku.max_per_user,
      sku.stock_on_hand,
      hold.id as hold_id,
      hold.quantity as hold_quantity,
      hold.expires_at
    from public.cart_lines cart_line
    join public.pack_skus sku on sku.id = cart_line.pack_sku_id
    left join public.cart_reservations hold
      on hold.cart_line_id = cart_line.id
     and hold.status = 'ACTIVE'
     and hold.user_id = p_user_id
     and hold.expires_at > now()
    where cart_line.cart_id = open_cart_id
      and cart_line.removed_at is null
      and cart_line.line_type = 'PACK'
    order by cart_line.id
    for update of cart_line
  loop
    client_line := null;
    select element
      into client_line
    from jsonb_array_elements(p_lines) element
    where (element ->> 'lineId')::uuid = line.id;

    if client_line is null then
      perform private.raise_domain(
        'CART_CHANGED',
        'Some items are no longer available or their price changed.'
      );
    end if;

    if (client_line ->> 'quantity')::integer is distinct from line.quantity then
      perform private.raise_domain(
        'QUANTITY_CHANGED',
        'The quantity in your cart changed. Review it before paying.'
      );
    end if;

    if (client_line ->> 'snapshotPriceCents')::bigint is distinct from line.snapshot_price_cents
       or line.snapshot_price_cents is distinct from line.price_cents then
      perform private.raise_domain(
        'PRICE_CHANGED',
        'The pack price changed. Accept the current price before paying.'
      );
    end if;

    if line.hold_id is null then
      if line.stock_on_hand <= 0 then
        perform private.raise_domain('SOLD_OUT', 'That pack is sold out.');
      end if;
      perform private.raise_domain('RESERVATION_EXPIRED', 'These packs are no longer reserved.');
    end if;

    if line.hold_quantity is distinct from line.quantity then
      perform private.raise_domain(
        'QUANTITY_CHANGED',
        'The quantity in your cart changed. Review it before paying.'
      );
    end if;

    if not line.active then
      perform private.raise_domain('PACK_UNAVAILABLE', 'That pack is not for sale.');
    end if;

    perform private.assert_drop_window(line.pack_sku_id);

    if line.max_per_user is not null then
      select count(*)
        into prior_packs
      from public.purchased_packs
      where user_id = p_user_id
        and pack_sku_id = line.pack_sku_id;

      if prior_packs + line.quantity > line.max_per_user then
        perform private.raise_domain(
          'PURCHASE_LIMIT',
          'You have reached the limit for this pack.'
        );
      end if;
    end if;

    pack_total := pack_total + (line.quantity::bigint * line.price_cents);
  end loop;

  for offer in
    select
      cart_line.id,
      cart_line.quantity,
      cart_line.snapshot_price_cents,
      listing.id as listing_id,
      listing.status as listing_status,
      listing.seller_id,
      listing.price_cents,
      listing.owned_item_id,
      item.owner_id as item_owner,
      item.state as item_state
    from public.cart_lines cart_line
    join public.marketplace_listings listing on listing.id = cart_line.listing_id
    join public.owned_items item on item.id = listing.owned_item_id
    where cart_line.cart_id = open_cart_id
      and cart_line.removed_at is null
      and cart_line.line_type = 'MARKETPLACE_LISTING'
    order by listing.id
    for update of cart_line
  loop
    client_line := null;
    select element
      into client_line
    from jsonb_array_elements(p_lines) element
    where (element ->> 'lineId')::uuid = offer.id;

    if client_line is null then
      perform private.raise_domain(
        'CART_CHANGED',
        'Some items are no longer available or their price changed.'
      );
    end if;

    if offer.quantity is distinct from 1
       or (client_line ->> 'quantity')::integer is distinct from 1 then
      perform private.raise_domain(
        'QUANTITY_CHANGED',
        'The quantity in your cart changed. Review it before paying.'
      );
    end if;

    if offer.seller_id = p_user_id then
      perform private.raise_domain('SELF_PURCHASE_FORBIDDEN', 'You cannot buy your own listing.');
    end if;

    if offer.listing_status = 'SOLD' then
      perform private.raise_domain('LISTING_SOLD', 'That listing has been sold.');
    end if;

    if offer.listing_status is distinct from 'ACTIVE' then
      perform private.raise_domain('LISTING_DELISTED', 'The seller removed this listing.');
    end if;

    if offer.item_owner is distinct from offer.seller_id
       or offer.item_state is distinct from 'LISTED' then
      perform private.raise_domain('LISTING_SOLD', 'That listing has been sold.');
    end if;

    if (client_line ->> 'snapshotPriceCents')::bigint is distinct from offer.snapshot_price_cents
       or offer.snapshot_price_cents is distinct from offer.price_cents then
      perform private.raise_domain(
        'LISTING_PRICE_CHANGED',
        'The seller changed the price.',
        jsonb_build_object(
          'previousPriceCents', offer.snapshot_price_cents::text,
          'currentPriceCents', offer.price_cents::text
        )
      );
    end if;

    listing_total := listing_total + offer.price_cents;
  end loop;

  authoritative_total := pack_total + listing_total;

  if authoritative_total <> p_expected_total_cents then
    perform private.raise_domain(
      'CHECKOUT_TOTAL_CHANGED',
      'The total changed. Review your cart before paying.',
      jsonb_build_object('totalCents', authoritative_total::text)
    );
  end if;

  if locked_balance < authoritative_total then
    perform private.raise_domain(
      'INSUFFICIENT_BALANCE',
      'You do not have enough in your wallet.',
      jsonb_build_object(
        'balanceCents', locked_balance::text,
        'totalCents', authoritative_total::text
      )
    );
  end if;

  insert into public.purchases (user_id, idempotency_key, total_cents)
  values (p_user_id, p_idempotency_key, authoritative_total)
  returning id into purchase_id;

  for line in
    select cart_line.id, cart_line.quantity, cart_line.pack_sku_id, cart_line.snapshot_price_cents
    from public.cart_lines cart_line
    where cart_line.cart_id = open_cart_id
      and cart_line.removed_at is null
      and cart_line.line_type = 'PACK'
    order by cart_line.id
  loop
    for unit_index in 1..line.quantity loop
      pack_sequence := pack_sequence + 1;

      insert into public.purchased_packs (
        purchase_id, user_id, pack_sku_id, sequence
      ) values (
        purchase_id, p_user_id, line.pack_sku_id, pack_sequence
      )
      returning id into purchased_pack_id;

      select drawn_item.catalog_item_id, drawn_item.rarity
        into drawn
      from private.draw_pack_item(line.pack_sku_id) drawn_item;

      insert into public.pack_contents (
        purchased_pack_id, catalog_item_id, rarity, reveal_order
      ) values (
        purchased_pack_id, drawn.catalog_item_id, drawn.rarity, 1
      );

      insert into public.owned_items (
        owner_id, catalog_item_id, source_type, acquisition_price_cents
      ) values (
        p_user_id, drawn.catalog_item_id, 'PACK', line.snapshot_price_cents
      );

      select jsonb_build_array(jsonb_build_object(
        'catalogItemId', drawn.catalog_item_id,
        'rarity', drawn.rarity,
        'revealOrder', 1
      ))
        into content_rows;

      pack_rows := pack_rows || jsonb_build_array(jsonb_build_object(
        'purchasedPackId', purchased_pack_id,
        'packSkuId', line.pack_sku_id,
        'sequence', pack_sequence,
        'contents', content_rows
      ));
    end loop;

    update public.cart_reservations
    set status = 'CONSUMED'
    where cart_line_id = line.id
      and status = 'ACTIVE';
  end loop;

  for offer in
    select
      listing.id as listing_id,
      listing.seller_id,
      listing.price_cents,
      listing.owned_item_id
    from public.cart_lines cart_line
    join public.marketplace_listings listing on listing.id = cart_line.listing_id
    where cart_line.cart_id = open_cart_id
      and cart_line.removed_at is null
      and cart_line.line_type = 'MARKETPLACE_LISTING'
    order by listing.id
  loop
    fee_cents := public.marketplace_fee_cents(offer.price_cents);

    update public.owned_items
    set owner_id = p_user_id,
        state = 'OWNED',
        source_type = 'MARKETPLACE',
        acquisition_price_cents = offer.price_cents,
        acquired_at = now()
    where id = offer.owned_item_id;

    update public.marketplace_listings
    set status = 'SOLD',
        sold_at = now()
    where id = offer.listing_id;

    listing_rows := listing_rows || jsonb_build_array(jsonb_build_object(
      'listingId', offer.listing_id,
      'ownedItemId', offer.owned_item_id,
      'priceCents', offer.price_cents::text,
      'feeCents', fee_cents::text,
      'sellerCents', public.seller_proceeds_cents(offer.price_cents)::text
    ));
  end loop;

  if pack_total > 0 then
    insert into public.ledger_entries (
      user_id, entry_type, amount_cents, reference_type, reference_id, idempotency_key
    ) values (
      p_user_id,
      'PACK_PURCHASE',
      -pack_total,
      'PURCHASE',
      purchase_id,
      p_idempotency_key
    );
  end if;

  if listing_total > 0 then
    insert into public.ledger_entries (
      user_id, entry_type, amount_cents, reference_type, reference_id, idempotency_key
    ) values (
      p_user_id,
      'MARKETPLACE_PURCHASE',
      -listing_total,
      'PURCHASE',
      purchase_id,
      p_idempotency_key
    );

    insert into public.ledger_entries (
      user_id, entry_type, amount_cents, reference_type, reference_id, idempotency_key
    )
    select
      listing.seller_id,
      'MARKETPLACE_SALE',
      sum(public.seller_proceeds_cents(listing.price_cents))::bigint,
      'PURCHASE',
      purchase_id,
      p_idempotency_key
    from public.cart_lines cart_line
    join public.marketplace_listings listing on listing.id = cart_line.listing_id
    where cart_line.cart_id = open_cart_id
      and cart_line.removed_at is null
      and cart_line.line_type = 'MARKETPLACE_LISTING'
    group by listing.seller_id;

    select coalesce(sum(public.marketplace_fee_cents(listing.price_cents)), 0)
      into fee_cents
    from public.cart_lines cart_line
    join public.marketplace_listings listing on listing.id = cart_line.listing_id
    where cart_line.cart_id = open_cart_id
      and cart_line.removed_at is null
      and cart_line.line_type = 'MARKETPLACE_LISTING';

    if fee_cents > 0 then
      insert into public.ledger_entries (
        user_id, entry_type, amount_cents, reference_type, reference_id, idempotency_key
      ) values (
        null,
        'MARKETPLACE_FEE',
        fee_cents,
        'PURCHASE',
        purchase_id,
        p_idempotency_key
      );
    end if;
  end if;

  update public.wallets
  set balance_cents = locked_balance - authoritative_total
  where user_id = p_user_id;

  for seller_row in
    select
      listing.seller_id,
      sum(public.seller_proceeds_cents(listing.price_cents))::bigint as credit
    from public.cart_lines cart_line
    join public.marketplace_listings listing on listing.id = cart_line.listing_id
    where cart_line.cart_id = open_cart_id
      and cart_line.removed_at is null
      and cart_line.line_type = 'MARKETPLACE_LISTING'
    group by listing.seller_id
    order by listing.seller_id
  loop
    select balance_cents
      into seller_balance
    from public.wallets
    where user_id = seller_row.seller_id
    for update;

    update public.wallets
    set balance_cents = seller_balance + seller_row.credit
    where user_id = seller_row.seller_id;
  end loop;

  update public.carts
  set status = 'CHECKED_OUT'
  where id = open_cart_id;

  receipt := jsonb_build_object(
    'purchaseId', purchase_id,
    'cartId', open_cart_id,
    'totalCents', authoritative_total::text,
    'balanceCents', (locked_balance - authoritative_total)::text,
    'idempotencyKey', p_idempotency_key,
    'packs', pack_rows,
    'listings', listing_rows
  );

  return private.finish_idempotency(p_user_id, 'CHECKOUT', p_idempotency_key, receipt);
end;
$$;
