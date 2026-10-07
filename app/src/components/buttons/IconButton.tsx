import type { ReactNode } from "react";
import { Pressable, StyleSheet, type Insets, type StyleProp, type ViewStyle } from "react-native";

import { colors, layout, press, radius, useReducedMotion } from "../../theme";

type IconButtonVariant = "ghost" | "surface" | "accent";

export type IconButtonProps = {
  /** Receives the icon color for the current state. */
  icon: (color: string) => ReactNode;
  onPress: () => void;
  /** Required. An icon alone does not tell a screen reader what the button does. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  variant?: IconButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const variants: Record<IconButtonVariant, { background: string; pressed: string; border: string; icon: string }> = {
  ghost: { background: "transparent", pressed: colors.surfaceElevated, border: "transparent", icon: colors.textPrimary },
  surface: { background: colors.surfaceElevated, pressed: colors.surfacePressed, border: colors.borderSubtle, icon: colors.textPrimary },
  accent: { background: colors.accent.fill, pressed: colors.accent.fillPressed, border: colors.accent.fill, icon: colors.textOnAccent },
};

const dimensions: Record<"sm" | "md", { box: number; hitSlop: Insets }> = {
  sm: { box: 36, hitSlop: { top: 4, bottom: 4, left: 4, right: 4 } },
  md: { box: layout.minTouchTarget, hitSlop: {} },
};

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = "ghost",
  size = "md",
  disabled = false,
  testID,
  style,
}: IconButtonProps) {
  const reduced = useReducedMotion();
  const look = variants[variant];
  const { box, hitSlop } = dimensions[size];
  const iconColor = disabled ? colors.textDisabled : look.icon;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          width: box,
          height: box,
          backgroundColor: disabled && variant !== "ghost" ? colors.surfaceDisabled : pressed ? look.pressed : look.background,
          borderColor: disabled ? "transparent" : look.border,
        },
        pressed && !reduced ? { transform: [{ scale: press.scale }] } : null,
        style,
      ]}
    >
      {icon(iconColor)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: "center",
  },
});
