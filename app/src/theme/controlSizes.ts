import { layout, spacing } from "./spacing";

/** Button min heights and horizontal padding (matches BaseButton). */
export const buttonSize = {
  sm: { minHeight: 36, paddingHorizontal: spacing.md },
  md: { minHeight: 48, paddingHorizontal: spacing.base + spacing.xs },
  lg: { minHeight: 56, paddingHorizontal: spacing.lg },
} as const;

/** Icon glyph sizes. Decorative icons; the control owns the a11y label. */
export const iconSize = {
  sm: 16,
  md: 20,
  lg: 22,
  xl: 28,
} as const;

/** Prefer layout.minTouchTarget (44) for tappable chrome. */
export const touchTarget = {
  min: layout.minTouchTarget,
} as const;

export type ButtonSizeKey = keyof typeof buttonSize;
export type IconSizeKey = keyof typeof iconSize;
