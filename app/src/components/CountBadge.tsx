import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, spacing, typography } from "../theme";

export type CountBadgeProps = {
  count: number;
  style?: StyleProp<ViewStyle>;
};

/** Numeric badge. The number is the signal, so it never depends on color alone. */
export function CountBadge({ count, style }: CountBadgeProps) {
  if (count <= 0) {
    return null;
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.badge, style]}
    >
      <Text maxFontSizeMultiplier={1.2} style={styles.label}>
        {count > 9 ? "9+" : count.toString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    backgroundColor: colors.accent.fill,
    borderColor: colors.backgroundPrimary,
    borderRadius: radius.full,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textOnAccent,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
});
