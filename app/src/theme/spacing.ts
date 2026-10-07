export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const layout = {
  screenPadding: spacing.base,
  sectionGap: spacing.lg,
  sectionGapLarge: spacing.xl,
  cardPadding: spacing.base,
  /** Minimum hit area for anything tappable, in points. */
  minTouchTarget: 44,
  /**
   * Extra scroll padding above a sticky CTA bar (one primary button + bar chrome).
   * The bar itself applies the safe-area inset; this only clears content.
   */
  stickyCtaClearance: spacing.xxl,
} as const;

export type SpacingKey = keyof typeof spacing;
