-- Legendary pack hero card: First Sovereign → Aurelith Drake (art + display name).

update public.catalog_items
set name = 'Aurelith Drake'
where category = 'TRADING_CARD'
  and name = 'First Sovereign';
