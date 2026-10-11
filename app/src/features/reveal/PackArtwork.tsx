import { memo, useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { colors, maxFontScale, radius, spacing, typography } from "../../theme";

import { packArtworkSource } from "../../components/catalogArtwork";

type Props = { tier: string; name?: string; hint?: string; opened?: boolean; sealIdle?: boolean; labels?: boolean };

/** Sealed pack sleeve — artwork stays pixel-true; elevation is outer chrome only. */
export const PackArtwork = memo(function PackArtwork({ tier, name, hint, opened = false, sealIdle = false, labels = true }: Props) {
  const glint = useSharedValue(0.35);
  useEffect(() => {
    cancelAnimation(glint);
    if (!sealIdle || opened) {
      glint.set(0.35);
      return;
    }
    glint.set(withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    ));
    return () => cancelAnimation(glint);
  }, [sealIdle, opened, glint]);
  const glintStyle = useAnimatedStyle(() => ({ opacity: glint.value }));

  return (
    <View style={styles.stage}>
      <View style={styles.shadowPool} pointerEvents="none" />
      <View style={styles.rimLight} pointerEvents="none" />
      <View style={styles.pack}>
        <Image source={packArtworkSource("TRADING_CARD", name ?? tier)} resizeMode="contain" style={styles.image} accessible={false} />
        {opened ? (
          <>
            <View style={styles.mouth} />
            <View style={styles.mouthLip} />
            <View style={styles.mouthShadow} />
          </>
        ) : (
          <View style={styles.sealBand} pointerEvents="none">
            {Array.from({ length: 18 }, (_, index) => (
              <View key={index} style={styles.ridge} />
            ))}
            <View style={styles.waxIdle} />
            <Animated.View style={[styles.sealGlint, glintStyle]} />
          </View>
        )}
        {labels ? <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.tier}>{tier}</Text> : null}
        {labels && hint ? <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.hint}>{hint}</Text> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    alignItems: "center",
    height: 312,
    justifyContent: "center",
    width: 230,
  },
  shadowPool: {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 40,
    bottom: 10,
    height: 36,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.7,
    shadowRadius: 28,
    width: 168,
  },
  rimLight: {
    borderColor: "rgba(217, 189, 133, 0.38)",
    borderRadius: radius.modal + 2,
    borderWidth: 1,
    bottom: 4,
    left: 6,
    position: "absolute",
    right: 6,
    shadowColor: colors.premium.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    top: 4,
  },
  image: {
    height: "100%",
    left: 0,
    position: "absolute",
    top: 0,
    width: "100%",
  },
  pack: {
    alignItems: "center",
    backgroundColor: "#07080C",
    borderRadius: radius.modal,
    elevation: 18,
    height: 300,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.62,
    shadowRadius: 26,
    width: 214,
  },
  mouth: {
    backgroundColor: colors.backgroundPrimary,
    borderRadius: 6,
    height: 36,
    left: 10,
    position: "absolute",
    right: 10,
    top: 8,
  },
  mouthLip: {
    backgroundColor: colors.premium.gold,
    borderRadius: 2,
    height: 3,
    left: 12,
    opacity: 0.55,
    position: "absolute",
    right: 12,
    top: 40,
  },
  mouthShadow: {
    backgroundColor: colors.overlay.impact,
    borderRadius: 8,
    height: 28,
    left: 18,
    opacity: 0.35,
    position: "absolute",
    right: 18,
    top: 44,
  },
  sealBand: {
    alignItems: "center",
    backgroundColor: "rgba(8,9,12,0.55)",
    borderBottomColor: colors.premium.gold,
    borderBottomWidth: 1,
    flexDirection: "row",
    height: 36,
    justifyContent: "space-evenly",
    left: 0,
    paddingHorizontal: 6,
    position: "absolute",
    right: 0,
    top: 0,
  },
  ridge: {
    backgroundColor: colors.textSecondary,
    borderRadius: 1,
    height: 22,
    opacity: 0.55,
    width: 2,
  },
  waxIdle: {
    alignSelf: "center",
    backgroundColor: colors.premium.gold,
    borderColor: colors.premium.goldBorder,
    borderRadius: 8,
    borderWidth: 1,
    height: 16,
    opacity: 0.92,
    position: "absolute",
    width: 16,
  },
  sealGlint: {
    alignSelf: "center",
    backgroundColor: colors.textPrimary,
    borderRadius: 7,
    height: 14,
    position: "absolute",
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
    width: 14,
  },
  tier: {
    ...typography.title,
    bottom: 52,
    color: colors.textPrimary,
    marginTop: spacing.md,
    position: "absolute",
  },
  hint: {
    ...typography.bodySmall,
    bottom: 20,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    position: "absolute",
  },
});
