/**
 * Shared image proportions for catalog and reveal surfaces.
 * Source assets for sneakers/watches are 1024×1024 JPEGs; card faces use a portrait frame.
 */

export const imageAspect = {
  /** Packs / market product tiles — portrait so art leads the card. */
  productPortrait: 5 / 4,
  /** Legacy square ratio (home thumbs when needed). */
  productSquare: 1,
  /** Portfolio holdings art height relative to tile width. */
  holdingPortrait: 5 / 4,
  /** Reveal card face (logical portrait frame). */
  tradingCard: 268 / 376,
  /** Category pack sleeves (wider packaging art). */
  packSleeve: 3 / 2,
  /** Editorial hero banners when used. */
  hero: 16 / 9,
} as const;

/** Logical reveal card frame used by CardStage / PreviousCards. */
export const revealCardFrame = {
  width: 268,
  height: 376,
} as const;

/** Catalog source raster size for sneaker/watch bundled art. */
export const catalogSourcePx = {
  productSquare: 1024,
} as const;

export type ImageAspectKey = keyof typeof imageAspect;
