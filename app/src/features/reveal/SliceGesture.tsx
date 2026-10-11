import { useEffect, useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { colors } from "../../theme";
import { completesSeal, sealProgress, SEAL_WIDTH } from "./seal";
import { SEAL_SNAP_MS } from "./revealTiming";

/** Full pack width; tall enough for a comfortable horizontal swipe. */
export const SEAL_HIT_WIDTH = 214;
export const SEAL_HIT_HEIGHT = 104;

type Props = {
  children: ReactNode;
  enabled: boolean;
  resetToken: number;
  tearing: boolean;
  onBegin: () => void;
  onComplete: () => void;
  onReset: () => void;
  onTick: (stage: number) => void;
};

/** Horizontal seal slice — large hit zone; completion math stays in seal.ts. */
export function SliceGesture({ children, enabled, resetToken, tearing, onBegin, onComplete, onReset, onTick }: Props) {
  const progress = useSharedValue(0);
  const locked = useSharedValue(false);
  const tick = useSharedValue(0);
  const generation = useSharedValue(0);

  useEffect(() => {
    generation.set(generation.get() + 1);
    cancelAnimation(progress);
    progress.set(tearing ? 1 : 0);
    locked.set(!enabled);
    tick.set(0);
    return () => {
      generation.set(generation.get() + 1);
      cancelAnimation(progress);
    };
  }, [enabled, resetToken, tearing, generation, locked, progress, tick]);

  const gesture = useMemo(() => Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .activeOffsetX(6)
    .failOffsetY([-52, 52])
    .hitSlop({ top: 12, bottom: 12, left: 8, right: 8 })
    .onStart(() => {
      if (locked.value) return;
      cancelAnimation(progress);
      tick.set(0);
      scheduleOnRN(onBegin);
    })
    .onUpdate((event) => {
      if (locked.value) return;
      progress.set(sealProgress(event.translationX));
      const stage = Math.min(3, Math.floor(progress.value * 4));
      if (stage > tick.value) {
        tick.set(stage);
        scheduleOnRN(onTick, stage);
      }
    })
    .onEnd((event) => {
      if (locked.value) return;
      locked.set(true);
      if (completesSeal(event.translationX, event.velocityX)) {
        progress.set(withTiming(1, { duration: SEAL_SNAP_MS }));
        scheduleOnRN(onComplete);
      } else {
        const epoch = generation.value;
        progress.set(withSpring(0, { damping: 16, stiffness: 240 }, (finished) => {
          if (finished && generation.value === epoch) {
            locked.set(false);
            scheduleOnRN(onReset);
          }
        }));
      }
    })
    .onFinalize((_event, success) => {
      if (success || locked.value) return;
      locked.set(true);
      const epoch = generation.value;
      progress.set(withSpring(0, { damping: 16, stiffness: 240 }, (finished) => {
        if (finished && generation.value === epoch) {
          locked.set(false);
          scheduleOnRN(onReset);
        }
      }));
    }), [enabled, generation, locked, onBegin, onComplete, onReset, onTick, progress, tick]);

  const deformation = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 0.45, 1], [0, -4, -10]) },
      { skewX: `${interpolate(progress.value, [0, 1], [0, 3.2])}deg` },
      { scaleX: interpolate(progress.value, [0, 1], [1, 0.96]) },
      { scaleY: interpolate(progress.value, [0, 0.5, 1], [1, 1.02, 0.975]) },
    ],
  }));
  const highlight = useAnimatedStyle(() => ({
    opacity: tearing ? 0 : interpolate(progress.value, [0, 0.1, 1], [0.18, 0.7, 1]),
    transform: [{ scaleX: Math.max(0.02, progress.value) }],
  }));
  const strip = useAnimatedStyle(() => {
    const peel = Math.max(0, progress.value - 0.12);
    return {
      opacity: tearing ? 0 : 1,
      transform: [
        { translateY: interpolate(peel, [0, 0.88], [0, -32]) },
        { translateX: interpolate(peel, [0, 0.88], [0, 16]) },
        { rotateZ: `${interpolate(peel, [0, 0.88], [0, 11])}deg` },
      ],
    };
  });
  const spark = useAnimatedStyle(() => ({
    opacity: progress.value >= 0.06 && progress.value < 1 ? 1 : 0,
    transform: [
      { translateX: progress.value * SEAL_WIDTH },
      { scale: interpolate(progress.value, [0.06, 0.4, 1], [0.7, 1.55, 1.15]) },
    ],
  }));
  const tension = useAnimatedStyle(() => ({
    opacity: tearing ? 0 : interpolate(progress.value, [0, 0.28, 1], [0, 0.45, 0.9]),
    transform: [{ scaleX: Math.max(0.02, progress.value) }],
  }));

  return (
    <Animated.View style={deformation}>
      {children}
      <GestureDetector gesture={gesture}>
        <Animated.View accessible={false} style={styles.zone}>
          <Animated.View pointerEvents="none" style={[styles.strip, strip]}>
            <View style={styles.ridges}>
              {Array.from({ length: 18 }, (_, index) => (
                <View key={index} style={styles.ridge} />
              ))}
            </View>
            <Animated.View style={[styles.tension, tension]} />
            <Animated.View style={[styles.highlight, highlight]} />
            <Animated.View style={[styles.spark, spark]} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  zone: {
    position: "absolute",
    top: 0,
    left: 0,
    width: SEAL_HIT_WIDTH,
    height: SEAL_HIT_HEIGHT,
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  strip: {
    height: 36,
    marginHorizontal: 6,
    justifyContent: "center",
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "rgba(8,9,12,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.premium.gold,
  },
  ridges: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 4,
  },
  ridge: {
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: colors.textSecondary,
    opacity: 0.55,
  },
  tension: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 14,
    top: 11,
    backgroundColor: colors.premium.gold,
    opacity: 0.35,
    transformOrigin: "left center",
  },
  highlight: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 5,
    top: 15,
    backgroundColor: colors.premium.gold,
    transformOrigin: "left center",
  },
  spark: {
    position: "absolute",
    left: 4,
    top: 12,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.textPrimary,
    shadowColor: colors.textPrimary,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
