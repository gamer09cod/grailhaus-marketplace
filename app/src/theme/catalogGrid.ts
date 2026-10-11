import { imageAspect } from "./imageAspect";
import { layout, spacing } from "./spacing";

/**
 * Premium browse grid for Packs and Market.
 * Two columns give artwork room to be the hero; three columns stay too cramped.
 */
export const catalogGrid = {
  columns: 2,
  gap: spacing.md,
} as const;

export function catalogTileMetrics(screenWidth: number) {
  const { columns, gap } = catalogGrid;
  const width = (screenWidth - layout.screenPadding * 2 - gap * (columns - 1)) / columns;
  return {
    columns,
    gap,
    width,
    artHeight: Math.round(width * imageAspect.productPortrait),
  };
}
