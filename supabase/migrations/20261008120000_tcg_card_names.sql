-- Rename fantasy trading cards to original TCG-style creature names.
-- Values, rarities, and pack pools stay the same; only display names change.

update public.catalog_items set name = 'Ember Pup' where category = 'TRADING_CARD' and name = 'Harbor Fox';
update public.catalog_items set name = 'Tide Minnow' where category = 'TRADING_CARD' and name = 'Glass Minnow';
update public.catalog_items set name = 'Glow Sprite' where category = 'TRADING_CARD' and name = 'Paper Lantern';
update public.catalog_items set name = 'Gust Finch' where category = 'TRADING_CARD' and name = 'Cedar Finch';
update public.catalog_items set name = 'Volt Mite' where category = 'TRADING_CARD' and name = 'Copper Relay';
update public.catalog_items set name = 'Shade Cub' where category = 'TRADING_CARD' and name = 'Night Market';
update public.catalog_items set name = 'Crystal Rook' where category = 'TRADING_CARD' and name = 'Velvet Rook';
update public.catalog_items set name = 'Bloom Wyrmling' where category = 'TRADING_CARD' and name = 'Silver Orchard';
update public.catalog_items set name = 'Ember Drake' where category = 'TRADING_CARD' and name = 'Eclipse Wyrm';
update public.catalog_items set name = 'Stone Cub' where category = 'TRADING_CARD' and name = 'Marble Saint';
update public.catalog_items set name = 'Spark Circuit' where category = 'TRADING_CARD' and name = 'Red Circuit';
update public.catalog_items set name = 'Hollow Howl' where category = 'TRADING_CARD' and name = 'Hollow Choir';
update public.catalog_items set name = 'Brass Scout' where category = 'TRADING_CARD' and name = 'Brass Compass';
update public.catalog_items set name = 'Ivory Fang' where category = 'TRADING_CARD' and name = 'Ivory Duelist';
update public.catalog_items set name = 'Storm Ledger' where category = 'TRADING_CARD' and name = 'Storm Archive';
update public.catalog_items set name = 'Tide Kraken' where category = 'TRADING_CARD' and name = 'Gilded Kraken';
update public.catalog_items set name = 'Obsidian Guard' where category = 'TRADING_CARD' and name = 'Obsidian Saint';
update public.catalog_items set name = 'Cinder Crown' where category = 'TRADING_CARD' and name = 'Crown of Cinders';
update public.catalog_items set name = 'Royal Runner' where category = 'TRADING_CARD' and name = 'Royal Courier';
update public.catalog_items set name = 'Pale Orbit' where category = 'TRADING_CARD' and name = 'Pale Astronomer';
update public.catalog_items set name = 'Thorn Viper' where category = 'TRADING_CARD' and name = 'Thorn Regent';
update public.catalog_items set name = 'Mirror Scale' where category = 'TRADING_CARD' and name = 'Mirror Bishop';
update public.catalog_items set name = 'Sapphire Clash' where category = 'TRADING_CARD' and name = 'Sapphire Duel';
update public.catalog_items set name = 'Gold Relic' where category = 'TRADING_CARD' and name = 'Gold Reliquary';
update public.catalog_items set name = 'Eclipse Sovereign' where category = 'TRADING_CARD' and name = 'Eclipse Dragon';
