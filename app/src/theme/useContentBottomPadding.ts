import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "./spacing";

/**
 * Scroll content bottom padding for stack screens.
 * Includes the home-indicator inset so the last row is not clipped.
 * Sticky CTA bars already consume the inset on the bar itself — use a plain
 * `spacing.xxl` (or similar) on those screens instead.
 */
export function useContentBottomPadding(extra: number = spacing.xxl): number {
  const insets = useSafeAreaInsets();
  return extra + insets.bottom;
}
