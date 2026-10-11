import { DarkTheme, type Theme } from "@react-navigation/native";

import { colors } from "./colors";
import {
  activeMotionProfile,
  duration,
  easing,
  enterDuration,
  motionProfile,
  press,
  pressMotionStyle,
  revealMotion,
} from "./motion";
import { radius } from "./radius";
import { glow, shadows } from "./shadows";
import { catalogGrid } from "./catalogGrid";
import { buttonSize, iconSize, touchTarget } from "./controlSizes";
import { fontFamily } from "./fonts";
import { catalogSourcePx, imageAspect, revealCardFrame } from "./imageAspect";
import { layout, spacing } from "./spacing";
import { fontWeight, maxFontScale, typography } from "./typography";

export { colors } from "./colors";
export type { Colors, RarityKey, StatusKey, Tone } from "./colors";
export {
  activeMotionProfile,
  duration,
  easing,
  enterDuration,
  motionProfile,
  press,
  pressMotionStyle,
  revealMotion,
} from "./motion";
export type { MotionProfile } from "./motion";
export { radius } from "./radius";
export type { RadiusKey } from "./radius";
export { glow, shadows } from "./shadows";
export type { ShadowKey } from "./shadows";
export { catalogGrid, catalogTileMetrics } from "./catalogGrid";
export { buttonSize, iconSize, touchTarget } from "./controlSizes";
export type { ButtonSizeKey, IconSizeKey } from "./controlSizes";
export { fontFamily, manropeFonts } from "./fonts";
export { catalogSourcePx, imageAspect, revealCardFrame } from "./imageAspect";
export type { ImageAspectKey } from "./imageAspect";
export { layout, spacing } from "./spacing";
export type { SpacingKey } from "./spacing";
export { fontWeight, maxFontScale, typography } from "./typography";
export type { TypographyVariant } from "./typography";
export { useContentBottomPadding } from "./useContentBottomPadding";
export { usePressMotion } from "./usePressMotion";
export { useReducedMotion } from "./useReducedMotion";

export const theme = {
  colors,
  spacing,
  layout,
  catalogGrid,
  imageAspect,
  revealCardFrame,
  catalogSourcePx,
  buttonSize,
  iconSize,
  touchTarget,
  fontFamily,
  typography,
  fontWeight,
  maxFontScale,
  radius,
  shadows,
  glow,
  motion: {
    duration,
    easing,
    press,
    profile: motionProfile,
    reveal: revealMotion,
    activeProfile: activeMotionProfile,
    pressStyle: pressMotionStyle,
    enterDuration,
  },
} as const;

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent.solid,
    background: colors.backgroundPrimary,
    card: colors.backgroundSecondary,
    text: colors.textPrimary,
    border: colors.borderSubtle,
    notification: colors.status.error.solid,
  },
};
