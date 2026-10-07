import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  colors,
  layout,
  maxFontScale,
  motionProfile,
  press,
  radius,
  spacing,
  typography,
  useReducedMotion,
  type MotionProfile,
} from "../../theme";

export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /** Keeps the button visible and filled, blocks presses, and shows a spinner with `loadingLabel`. */
  loading?: boolean;
  /** Inline progress copy such as "Confirming purchase…". Defaults to `label`. */
  loadingLabel?: string;
  disabled?: boolean;
  /** Receives the label color so the icon matches every state. */
  icon?: (color: string) => ReactNode;
  iconPosition?: "leading" | "trailing";
  fullWidth?: boolean;
  size?: ButtonSize;
  /** Use "financial" on cart, checkout, wallet, and listing screens. */
  motion?: MotionProfile;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export type ButtonAppearance = {
  background: string;
  backgroundPressed: string;
  border: string;
  text: string;
};

const disabledFilled: ButtonAppearance = {
  background: colors.surfaceDisabled,
  backgroundPressed: colors.surfaceDisabled,
  border: "transparent",
  text: colors.textDisabled,
};

const sizes: Record<ButtonSize, { minHeight: number; paddingHorizontal: number; hitSlop: Insets }> = {
  sm: { minHeight: 36, paddingHorizontal: spacing.md, hitSlop: { top: 4, bottom: 4 } },
  md: { minHeight: 48, paddingHorizontal: spacing.base + spacing.xs, hitSlop: {} },
  lg: { minHeight: 56, paddingHorizontal: spacing.lg, hitSlop: {} },
};

export function BaseButton({
  label,
  onPress,
  loading = false,
  loadingLabel,
  disabled = false,
  icon,
  iconPosition = "leading",
  fullWidth = false,
  size = "md",
  motion = "discovery",
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  appearance,
  disabledAppearance = disabledFilled,
  compact = false,
}: ButtonProps & {
  appearance: ButtonAppearance;
  disabledAppearance?: ButtonAppearance;
  /** Text-only buttons keep the touch height but use less side padding. */
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  const inactive = disabled || loading;
  const look = disabled ? disabledAppearance : appearance;
  const pressScale = reduced ? 1 : motionProfile[motion].pressScale;
  const metrics = sizes[size];
  const shown = loading ? (loadingLabel ?? label) : label;
  const textStyle = size === "sm" ? typography.buttonSmall : typography.button;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? shown}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={metrics.hitSlop}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: metrics.minHeight,
          paddingHorizontal: compact ? spacing.sm : metrics.paddingHorizontal,
          backgroundColor: pressed ? look.backgroundPressed : look.background,
          borderColor: look.border,
        },
        fullWidth ? styles.fullWidth : styles.inline,
        pressed && pressScale !== 1 ? { transform: [{ scale: pressScale }] } : null,
        pressed && look.background === "transparent" ? { opacity: press.pressedOpacity } : null,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={look.text} size="small" /> : null}
        {!loading && icon && iconPosition === "leading" ? icon(look.text) : null}
        <Text
          maxFontSizeMultiplier={maxFontScale.body}
          numberOfLines={2}
          style={[textStyle, styles.label, { color: look.text }]}
        >
          {shown}
        </Text>
        {!loading && icon && iconPosition === "trailing" ? icon(look.text) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: layout.minTouchTarget,
    paddingVertical: spacing.sm,
  },
  inline: {
    alignSelf: "flex-start",
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  label: {
    flexShrink: 1,
    textAlign: "center",
  },
});
