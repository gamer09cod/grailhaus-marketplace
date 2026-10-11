-- Elite / Collector EPIC card: Obsidian Guard → Nyxara (art + display name).

update public.catalog_items
set name = 'Nyxara'
where category = 'TRADING_CARD'
  and name = 'Obsidian Guard';
