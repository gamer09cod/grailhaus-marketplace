import { StyleSheet, Text, View } from "react-native";

import { colors, maxFontScale, spacing, typography } from "../../theme";

type Props = {
  /** Reduced-motion / screen-reader path uses a primary CTA instead; hide this hint. */
  visible?: boolean;
};

/** Quiet sealed-stage instruction under the pack. */
export function SealedControls({ visible = true }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.hint}>
        Slice the seal
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingBottom: spacing.sm,
    paddingTop: spacing.xl,
  },
  hint: {
    ...typography.body,
    color: colors.textSecondary,
    letterSpacing: 0.2,
    textAlign: "center",
  },
});
