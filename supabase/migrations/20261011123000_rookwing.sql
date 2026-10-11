-- Scout / Starter / Midnight RARE card: Crystal Rook → Rookwing (art + display name).

update public.catalog_items
set name = 'Rookwing'
where category = 'TRADING_CARD'
  and name = 'Crystal Rook';
