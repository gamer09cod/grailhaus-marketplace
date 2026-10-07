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
