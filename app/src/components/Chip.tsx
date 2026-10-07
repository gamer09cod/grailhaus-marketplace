import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, layout, maxFontScale, radius, spacing, typography, usePressMotion } from "../theme";

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
};

export function Chip({ label, selected, onPress, accessibilityLabel, disabled = false }: ChipProps) {
  const pressMotion = usePressMotion("discovery");
  return (
    <Pressable
      accessibilityLabel={`${accessibilityLabel ?? label}${selected ? ", selected" : ""}`}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipIdle,
        disabled ? styles.chipDisabled : null,
        pressed && !disabled ? styles.chipPressed : null,
        pressed && !disabled ? pressMotion(pressed) : null,
      ]}
    >
      <Text
        maxFontSizeMultiplier={maxFontScale.body}
        style={[
          selected ? styles.labelSelected : styles.labelIdle,
          disabled ? styles.labelDisabled : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipGroup({ children, accessibilityLabel }: { children: ReactNode; accessibilityLabel: string }) {
  return (
    <View accessibilityLabel={accessibilityLabel}>
      <ScrollView
        horizontal
        contentContainerStyle={styles.row}
        showsHorizontalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    alignItems: "center",
    borderRadius: radius.chip,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    minWidth: layout.minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  chipIdle: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
  },
  chipSelected: {
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.border,
  },
  chipPressed: {
    backgroundColor: colors.surfacePressed,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  labelIdle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  labelSelected: {
    ...typography.bodySmall,
    color: colors.accent.solid,
    fontWeight: "600",
  },
  labelDisabled: {
    color: colors.textDisabled,
  },
});
