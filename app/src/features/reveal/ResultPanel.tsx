import { memo, useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { colors, maxFontScale, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";
import { spokenRarity } from "./access";
import { resultCascadeDelays } from "./resultCascade";
import { timingMode } from "./revealTiming";
import type { RevealQuality } from "./quality";

type Props = {
  name: string;
  rarity: string;
  rarityColor: string;
  estimatedValueCents: bigint;
  packId: string;
  active: boolean;
  ready: boolean;
  compressed: boolean;
  reduced: boolean;
  quality: RevealQuality;
  onReady: (packId: string) => void;
};

/** Sequenced metadata: name → rarity → estimated value. */
export const ResultPanel = memo(function ResultPanel({
  name,
  rarity,
  rarityColor,
  estimatedValueCents,
  packId,
  active,
  ready,
  compressed,
  reduced,
  quality,
  onReady,
}: Props) {
  const nameOp = useSharedValue(ready ? 1 : 0);
  const rarityOp = useSharedValue(ready ? 1 : 0);
  const valueOp = useSharedValue(ready ? 1 : 0);

  useEffect(() => {
    cancelAnimation(nameOp);
    cancelAnimation(rarityOp);
    cancelAnimation(valueOp);
    if (ready) {
      nameOp.set(1);
      rarityOp.set(1);
      valueOp.set(1);
      return;
    }
    nameOp.set(0);
    rarityOp.set(0);
    valueOp.set(0);
    if (!active) return;

    const mode = timingMode({ quality: reduced ? "reduced" : quality, compressed });
    const cascade = resultCascadeDelays(mode);
    const fade = { duration: cascade.fadeMs };

    nameOp.set(withDelay(cascade.nameAt, withTiming(1, fade)));
    rarityOp.set(withDelay(cascade.rarityAt, withTiming(1, fade)));
    valueOp.set(
      withDelay(
        cascade.valueAt,
        withTiming(1, fade, (finished) => {
          if (finished) scheduleOnRN(onReady, packId);
        }),
      ),
    );

    return () => {
      cancelAnimation(nameOp);
      cancelAnimation(rarityOp);
      cancelAnimation(valueOp);
    };
  }, [active, ready, reduced, compressed, quality, packId, onReady, nameOp, rarityOp, valueOp]);

  const nameStyle = useAnimatedStyle(() => ({ opacity: nameOp.value }));
  const rarityStyle = useAnimatedStyle(() => ({ opacity: rarityOp.value }));
  const valueStyle = useAnimatedStyle(() => ({ opacity: valueOp.value }));

  return (
    <View
      accessibilityElementsHidden={!ready}
      importantForAccessibility={ready ? "auto" : "no-hide-descendants"}
      style={styles.panel}
    >
      <ScrollView nestedScrollEnabled contentContainerStyle={styles.content}>
        <Animated.Text maxFontSizeMultiplier={maxFontScale.display} style={[styles.name, nameStyle]}>
          {name}
        </Animated.Text>
        <Animated.Text
          maxFontSizeMultiplier={maxFontScale.body}
          style={[styles.rarity, { color: rarityColor }, rarityStyle]}
        >
          {spokenRarity(rarity)}
        </Animated.Text>
        <Animated.View style={valueStyle}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.label}>Estimated value</Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.value}>
            {formatCents(estimatedValueCents)}
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: {
    flexGrow: 1,
  },
  content: {
    alignItems: "center",
    gap: 4,
    paddingBottom: 4,
  },
  name: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center",
    textShadowColor: colors.overlay.impact,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  rarity: {
    ...typography.label,
    letterSpacing: 1.2,
    textShadowColor: colors.overlay.impact,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  label: {
    ...typography.caption,
    color: colors.textPrimary,
    marginTop: spacing.xxs,
    textAlign: "center",
    textShadowColor: colors.overlay.impact,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  value: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    textAlign: "center",
    textShadowColor: colors.overlay.impact,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
