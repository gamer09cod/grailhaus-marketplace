import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../../theme";

type Props = {
  active: boolean;
  /** When true, bloom peaks then fades to a calm resting glow. */
  settling: boolean;
  color: string;
  reduced: boolean;
};

/**
 * Soft bloom behind the revealed face — no hard rings or concentric circles.
 * Pulses on reveal, then settles to a quiet gold wash.
 */
export const RotatingRevealGlow = memo(function RotatingRevealGlow({
  active,
  settling,
  color,
  reduced,
}: Props) {
  const bloom = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(bloom);
    if (!active) {
      bloom.set(0);
      return;
    }
    if (reduced) {
      bloom.set(0.28);
      return;
    }
    bloom.set(withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(bloom);
  }, [active, reduced, bloom]);

  useEffect(() => {
    if (!settling || !active) return;
    cancelAnimation(bloom);
    if (reduced) {
      bloom.set(0.22);
      return;
    }
    bloom.set(
      withDelay(
        120,
        withTiming(0.2, { duration: 980, easing: Easing.out(Easing.cubic) }),
      ),
    );
  }, [settling, active, reduced, bloom]);

  const core = useAnimatedStyle(() => ({
    opacity: bloom.value * 0.2,
    transform: [{ scale: interpolate(bloom.value, [0, 1], [0.96, 1.04]) }],
  }));

  if (!active && !settling) return null;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.wrap}
    >
      <Animated.View
        style={[
          styles.core,
          { backgroundColor: color === colors.premium.gold ? colors.premium.gold : color },
          core,
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    position: "absolute",
    width: 220,
    height: 300,
    borderRadius: 28,
    // Soft card-shaped wash — not a concentric ring.
    opacity: 0.2,
  },
});
