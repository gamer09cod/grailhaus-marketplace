-- Collector / Elite LEGENDARY card: Cinder Crown → Auric Crown (art + display name).

update public.catalog_items
set name = 'Auric Crown'
where category = 'TRADING_CARD'
  and name = 'Cinder Crown';
