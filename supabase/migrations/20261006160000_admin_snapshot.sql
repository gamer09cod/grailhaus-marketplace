-- Reviewer-only totals. Pack revenue is the SKU price of each completed
-- pack. Those prices are not updated, so the sum matches the pack debit.
-- Contents payout is the current collectible estimate after this hour's drift.
-- Marketplace fees are the fee rows already written. A refunded purchase
-- drops out of the pack totals and leaves the fee rows in place.

create or replace function public.admin_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  packs_sold bigint;
  pack_revenue bigint;
  payout bigint;
  fees bigint;
  categories jsonb;
begin
  if not private.qa_reviewer(auth.uid()) then
    perform private.raise_domain(
      'ADMIN_FORBIDDEN',
      'This screen is for reviewers.'
    );
  end if;

  perform public.apply_price_drift();

  select count(*), coalesce(sum(sku.price_cents), 0)
    into packs_sold, pack_revenue
  from public.purchased_packs pack
  join public.purchases purchase on purchase.id = pack.purchase_id
  join public.pack_skus sku on sku.id = pack.pack_sku_id
  where purchase.status = 'COMPLETED';

  select coalesce(sum(item.current_value_cents), 0)
    into payout
  from public.pack_contents content
  join public.purchased_packs pack on pack.id = content.purchased_pack_id
  join public.purchases purchase on purchase.id = pack.purchase_id
  join public.catalog_items item on item.id = content.catalog_item_id
  where purchase.status = 'COMPLETED';

  select coalesce(sum(amount_cents), 0)
    into fees
  from public.ledger_entries
  where entry_type = 'MARKETPLACE_FEE';

  select jsonb_agg(
    jsonb_build_object(
      'category', names.category,
      'marginCents', (coalesce(revenue.revenue_cents, 0) - coalesce(payouts.payout_cents, 0))::text
    )
    order by names.ord
  )
    into categories
  from (
    values
      ('TRADING_CARD'::text, 1),
      ('SNEAKER'::text, 2),
      ('WATCH'::text, 3)
  ) as names(category, ord)
  left join (
    select sku.category, coalesce(sum(sku.price_cents), 0) as revenue_cents
    from public.purchased_packs pack
    join public.purchases purchase on purchase.id = pack.purchase_id
    join public.pack_skus sku on sku.id = pack.pack_sku_id
    where purchase.status = 'COMPLETED'
    group by sku.category
  ) revenue on revenue.category = names.category
  left join (
    select sku.category, coalesce(sum(item.current_value_cents), 0) as payout_cents
    from public.pack_contents content
    join public.purchased_packs pack on pack.id = content.purchased_pack_id
    join public.purchases purchase on purchase.id = pack.purchase_id
    join public.pack_skus sku on sku.id = pack.pack_sku_id
    join public.catalog_items item on item.id = content.catalog_item_id
    where purchase.status = 'COMPLETED'
    group by sku.category
  ) payouts on payouts.category = names.category;

  return jsonb_build_object(
    'packsSold', packs_sold,
    'packRevenueCents', pack_revenue::text,
    'contentsPayoutCents', payout::text,
    'grossPackMarginCents', (pack_revenue - payout)::text,
    'marketplaceFeesCents', fees::text,
    'categories', categories
  );
end;
$$;

revoke all on function public.admin_snapshot() from public, anon;
grant execute on function public.admin_snapshot() to authenticated, service_role;
