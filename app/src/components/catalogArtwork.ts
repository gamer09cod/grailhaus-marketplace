import type { ImageSourcePropType } from "react-native";
import type { PackCategory } from "../navigation/types";

// Bundled original artwork remains available offline and needs no CDN credentials.
const cards: Record<string, ImageSourcePropType> = {
  "Emberkin": require("../../assets/catalog/emberkin.jpg"),
  "Tide Minnow": require("../../assets/catalog/tide-minnow.jpg"),
  "Glow Sprite": require("../../assets/catalog/glow-sprite.jpg"),
  "Gust Finch": require("../../assets/catalog/gust-finch.jpg"),
  "Volt Mite": require("../../assets/catalog/volt-mite.jpg"),
  "Shade Cub": require("../../assets/catalog/shade-cub.jpg"),
  "Rookwing": require("../../assets/catalog/rookwing.jpg"),
  "Bloom Wyrmling": require("../../assets/catalog/bloom-wyrmling.jpg"),
  "Ember Drake": require("../../assets/catalog/ember-drake.jpg"),
  "Stone Cub": require("../../assets/catalog/stone-cub.jpg"),
  "Spark Circuit": require("../../assets/catalog/spark-circuit.jpg"),
  "Hollow Howl": require("../../assets/catalog/hollow-howl.jpg"),
  "Brass Scout": require("../../assets/catalog/brass-scout.jpg"),
  "Ivory Fang": require("../../assets/catalog/ivory-fang.jpg"),
  "Storm Ledger": require("../../assets/catalog/storm-ledger.jpg"),
  "Tide Kraken": require("../../assets/catalog/tide-kraken.jpg"),
  "Nyxara": require("../../assets/catalog/nyxara.jpg"),
  "Auric Crown": require("../../assets/catalog/auric-crown.jpg"),
  "Royal Runner": require("../../assets/catalog/royal-runner.jpg"),
  "Pale Orbit": require("../../assets/catalog/pale-orbit.jpg"),
  "Thorn Viper": require("../../assets/catalog/thorn-viper.jpg"),
  "Mirror Scale": require("../../assets/catalog/mirror-scale.jpg"),
  "Sapphire Clash": require("../../assets/catalog/sapphire-clash.jpg"),
  "Gold Relic": require("../../assets/catalog/gold-relic.jpg"),
  "Eclipse Sovereign": require("../../assets/catalog/eclipse-sovereign.jpg"),
  "Void Empress": require("../../assets/catalog/void-empress.jpg"),
  "Aurelith Drake": require("../../assets/catalog/aurelith-drake.jpg"),
};
const sneakers: Record<string, ImageSourcePropType> = {
  "Nike Dunk Low Panda": require("../../assets/catalog/nike-dunk-low-panda.jpg"),
  "Jordan 1 Mid Chicago": require("../../assets/catalog/jordan-1-mid-chicago.jpg"),
  "Jordan 4 Military Black": require("../../assets/catalog/jordan-4-military-black.jpg"),
  "Nike Dunk Low Travis Scott": require("../../assets/catalog/nike-dunk-low-travis-scott.jpg"),
  "Jordan 1 High Lost and Found": require("../../assets/catalog/jordan-1-high-lost-and-found.jpg"),
};
const watches: Record<string, ImageSourcePropType> = {
  "Casio G-Shock GA2100": require("../../assets/catalog/casio-g-shock-ga2100.jpg"),
  "Seiko Alpinist SPB121": require("../../assets/catalog/seiko-alpinist-spb121.jpg"),
  "Hamilton Khaki Field": require("../../assets/catalog/hamilton-khaki-field.jpg"),
  "Tissot PRX Powermatic 80": require("../../assets/catalog/tissot-prx-powermatic-80.jpg"),
  "Longines HydroConquest": require("../../assets/catalog/longines-hydroconquest.jpg"),
};
/** Distinct sleeve art per trading-card pack SKU, plus Midnight Drop. */
const cardPackStarter = require("../../assets/catalog/pack-card.jpg");
const cardPackScout = require("../../assets/catalog/pack-card-scout.jpg");
const cardPackCollector = require("../../assets/catalog/pack-card-collector.jpg");
const cardPackElite = require("../../assets/catalog/pack-card-elite.jpg");
const cardPackLegendary = require("../../assets/catalog/pack-card-legendary.jpg");
const cardPackMidnight = require("../../assets/catalog/pack-card-midnight.jpg");
const packs: Record<PackCategory, ImageSourcePropType> = {
  TRADING_CARD: cardPackStarter,
  SNEAKER: require("../../assets/catalog/pack-sneaker.jpg"),
  WATCH: require("../../assets/catalog/pack-watch.jpg"),
};
const packByName: Record<string, ImageSourcePropType> = {
  "Starter Pack": cardPackStarter,
  "Scout Pack": cardPackScout,
  "Midnight Drop": cardPackMidnight,
  "Collector Pack": cardPackCollector,
  "Elite Pack": cardPackElite,
  "Legendary Pack": cardPackLegendary,
  "Street Pack": packs.SNEAKER,
  "Daily Pack": packs.SNEAKER,
  "Rare Pack": packs.SNEAKER,
  "Archive Pack": packs.SNEAKER,
  "Vault Pack": packs.SNEAKER,
  "Entry Vault": packs.WATCH,
  "Heritage Box": packs.WATCH,
  "Luxury Box": packs.WATCH,
  "Prestige Box": packs.WATCH,
  "Grail Box": packs.WATCH,
};
const packByTier: Record<string, ImageSourcePropType> = {
  Starter: cardPackStarter,
  Scout: cardPackScout,
  Midnight: cardPackMidnight,
  Collector: cardPackCollector,
  Elite: cardPackElite,
  Legendary: cardPackLegendary,
};

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

function lookup(map: Record<string, ImageSourcePropType>, title: string): ImageSourcePropType | undefined {
  const key = normalizeTitle(title);
  if (map[key]) return map[key];
  const lower = key.toLowerCase();
  for (const [name, source] of Object.entries(map)) {
    if (name.toLowerCase() === lower) return source;
  }
  return undefined;
}

export function packArtworkSource(category: PackCategory, nameOrTier?: string): ImageSourcePropType {
  if (nameOrTier) {
    const named = lookup(packByName, nameOrTier);
    if (named) return named;
    const byTier = lookup(packByTier, nameOrTier);
    if (byTier) return byTier;
  }
  return packs[category];
}

/**
 * Resolve bundled catalog art by product/pack name.
 * Sneaker and watch items always prefer product JPEGs over category pack sleeves.
 */
export function catalogArtworkSource(category: PackCategory, title: string): ImageSourcePropType | undefined {
  const key = normalizeTitle(title);
  if (!key) return undefined;

  if (category === "TRADING_CARD") {
    return lookup(cards, key) ?? lookup(packByName, key);
  }
  if (category === "SNEAKER") {
    return lookup(sneakers, key) ?? lookup(packByName, key);
  }
  return lookup(watches, key) ?? lookup(packByName, key);
}

/** True when a seeded product JPEG exists for this catalog item name (not pack sleeves). */
export function hasProductArtwork(category: PackCategory, title: string): boolean {
  const key = normalizeTitle(title);
  if (!key) return false;
  if (category === "TRADING_CARD") return Boolean(lookup(cards, key));
  if (category === "SNEAKER") return Boolean(lookup(sneakers, key));
  return Boolean(lookup(watches, key));
}

/** Shelf/market rows may show when bundled product art or a remote image_url exists. */
export function hasListingArtwork(
  category: PackCategory,
  title: string,
  imageUrl?: string | null,
): boolean {
  if (hasProductArtwork(category, title)) return true;
  return typeof imageUrl === "string" && imageUrl.length > 0;
}
