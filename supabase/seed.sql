-- Seed structure for a clean database.
--
-- Phase 1 does not load the catalog. Phase 2 inserts collectibles, pack tiers,
-- odds, and reviewer deposits in the marked sections below.
--
-- This file must succeed on an empty public schema after migrations.

-- Catalog items: Phase 2
-- Pack SKUs and odds: Phase 2
-- Drops: Phase 2
-- Reviewer auth users and $10,000 opening deposits: Phase 2

do $$
begin
  if public.marketplace_fee_cents(45000) <> 3600 then
    raise exception 'seed check failed: 45000 cent listing fee must be 3600';
  end if;

  if public.seller_proceeds_cents(45000) <> 41400 then
    raise exception 'seed check failed: seller proceeds for 45000 cents must be 41400';
  end if;

  -- Floor division must not invent a fractional cent.
  if public.marketplace_fee_cents(1) <> 0 then
    raise exception 'seed check failed: 1 cent fee must be 0';
  end if;

  if public.seller_proceeds_cents(1) <> 1 then
    raise exception 'seed check failed: seller must keep the remainder cent';
  end if;
end $$;
