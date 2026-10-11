import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { colors } from "../../theme";

type Props = {
  progress: SharedValue<number>;
  active: boolean;
  reduced: boolean;
};

/**
 * Layered seal tear (non-Rive): wax break, departing strip, fibers, mouth light, seam flash.
 * All motion stays inline in worklets — do not call plain JS helpers from useAnimatedStyle.
 */
export const TearEffects = memo(function TearEffects({ progress, active, reduced }: Props) {
  const strip = useAnimatedStyle(() => ({
    opacity: active ? interpolate(progress.value, [0, 0.45, 1], [1, 0.55, 0]) : 0,
    transform: [
      { translateY: reduced ? 0 : interpolate(progress.value, [0, 1], [0, -150]) },
      { translateX: reduced ? 0 : interpolate(progress.value, [0, 1], [0, 48]) },
      { rotateZ: `${reduced ? 0 : interpolate(progress.value, [0, 1], [0, 22])}deg` },
      { scaleX: reduced ? 1 : interpolate(progress.value, [0, 0.3, 1], [1, 1.08, 0.75]) },
    ],
  }));
  const wax = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : interpolate(progress.value, [0, 0.08, 0.35, 0.7], [1, 1, 0.35, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -36]) },
      { translateX: interpolate(progress.value, [0, 1], [0, 18]) },
      { scale: interpolate(progress.value, [0, 0.2, 1], [1, 1.15, 0.4]) },
      { rotateZ: `${interpolate(progress.value, [0, 1], [0, 40])}deg` },
    ],
  }));
  const flash = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : interpolate(progress.value, [0, 0.05, 0.2, 0.48, 1], [0, 1, 0.45, 0, 0]),
  }));
  const mouth = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : interpolate(progress.value, [0, 0.18, 0.55, 1], [0, 0.7, 0.42, 0.08]),
    transform: [{ scaleY: interpolate(progress.value, [0, 1], [0.35, 1.2]) }],
  }));
  const crease = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : interpolate(progress.value, [0, 0.12, 0.4, 1], [0, 0.85, 0.3, 0]),
    transform: [{ scaleX: interpolate(progress.value, [0, 1], [0.15, 1]) }],
  }));
  const fiberA = useAnimatedStyle(() => {
    if (reduced) return { opacity: 0, transform: [{ translateY: 0 }] };
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.12, 0.55, 1], [0, 0.9, 0.45, 0]),
      transform: [
        { translateX: interpolate(p, [0, 1], [0, -28]) },
        { translateY: interpolate(p, [0, 1], [0, -70]) },
        { rotateZ: `${interpolate(p, [0, 1], [8, -28])}deg` },
        { scaleY: interpolate(p, [0, 0.4, 1], [0.6, 1.2, 0.8]) },
      ],
    };
  });
  const fiberB = useAnimatedStyle(() => {
    if (reduced) return { opacity: 0, transform: [{ translateY: 0 }] };
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.12, 0.55, 1], [0, 0.9, 0.45, 0]),
      transform: [
        { translateX: interpolate(p, [0, 1], [0, 40]) },
        { translateY: interpolate(p, [0, 1], [0, -88]) },
        { rotateZ: `${interpolate(p, [0, 1], [-8, 28])}deg` },
        { scaleY: interpolate(p, [0, 0.4, 1], [0.6, 1.2, 0.8]) },
      ],
    };
  });
  const fiberC = useAnimatedStyle(() => {
    if (reduced) return { opacity: 0, transform: [{ translateY: 0 }] };
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.12, 0.55, 1], [0, 0.9, 0.45, 0]),
      transform: [
        { translateX: interpolate(p, [0, 1], [0, -11]) },
        { translateY: interpolate(p, [0, 1], [0, -106]) },
        { rotateZ: `${interpolate(p, [0, 1], [3, -11])}deg` },
        { scaleY: interpolate(p, [0, 0.4, 1], [0.6, 1.2, 0.8]) },
      ],
    };
  });

  if (!active) return null;

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.mouth, mouth]} />
      <Animated.View style={[styles.crease, crease]} />
      <Animated.View style={[styles.strip, strip]}>
        {Array.from({ length: 14 }, (_, index) => (
          <View key={index} style={styles.ridge} />
        ))}
      </Animated.View>
      <Animated.View style={[styles.wax, wax]} />
      <Animated.View style={[styles.fiber, styles.fiberLeft, fiberA]} />
      <Animated.View style={[styles.fiber, styles.fiberRight, fiberB]} />
      <Animated.View style={[styles.fiber, styles.fiberMid, fiberC]} />
      <Animated.View style={[styles.flash, flash]} />
    </View>
  );
});

const styles = StyleSheet.create({
  mouth: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 36,
    height: 120,
    borderRadius: 14,
    backgroundColor: colors.premium.gold,
  },
  crease: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textPrimary,
  },
  strip: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 10,
    height: 22,
    borderRadius: 4,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 2,
    borderTopColor: colors.premium.gold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  ridge: {
    width: 2,
    height: 14,
    borderRadius: 1,
    backgroundColor: colors.textSecondary,
    opacity: 0.55,
  },
  wax: {
    position: "absolute",
    top: 14,
    left: 98,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.premium.gold,
    borderWidth: 1,
    borderColor: colors.premium.goldBorder,
  },
  fiber: {
    position: "absolute",
    top: 30,
    width: 3,
    height: 28,
    borderRadius: 1,
    backgroundColor: colors.textTertiary,
  },
  fiberLeft: { left: 36 },
  fiberRight: { right: 36 },
  fiberMid: { left: 106 },
  flash: {
    position: "absolute",
    top: 18,
    left: 8,
    right: 8,
    height: 5,
    borderRadius: 2,
    backgroundColor: colors.textPrimary,
  },
});
