-- Starter / Scout / Midnight COMMON card: Ember Pup → Emberkin (art + display name).

update public.catalog_items
set name = 'Emberkin'
where category = 'TRADING_CARD'
  and name = 'Ember Pup';
