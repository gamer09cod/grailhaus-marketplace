import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, interpolateColor, useAnimatedStyle, useAnimatedReaction, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import { backPaletteProgress, backRotation, shouldRotateBack } from "./backRotation";
import { runOnUI, scheduleOnRN } from "react-native-worklets";
import { remainingSuspenseMs } from "./suspenseTiming";
import { suspenseHapticStage } from "./hapticTrack";
import { revealCardFrame } from "../../theme";
import { CardBack } from "./CardBack";
import { RarityGlow } from "./RarityGlow";
import { suspensePalette, suspenseStops } from "./suspense";

type Props = { rarity: string; suspense: boolean; durationMs: number; active: boolean; reduced: boolean; speedUp: boolean; token: number; onCue: (token: number, stage: number) => void; onFinished: (token: number) => void };
export function AnimatedCardBack({ rarity, suspense, durationMs, active, reduced, speedUp, token, onCue, onFinished }: Props) {
  const progress = useSharedValue(0);
  const accelerated = useSharedValue(false);
  const palette = useMemo(() => suspensePalette(rarity), [rarity]);
  const rotating = shouldRotateBack(durationMs, reduced);
  useEffect(() => {
    cancelAnimation(progress);
    if (!suspense) return;
    accelerated.set(false);
    progress.set(0);
    if (!active) { progress.set(1); onFinished(token); return; }
    progress.set(withTiming(1, { duration: reduced ? 180 : durationMs, easing: Easing.linear }, (finished) => {
      if (finished) scheduleOnRN(onFinished, token);
    }));
    return () => cancelAnimation(progress);
  }, [suspense, durationMs, active, reduced, progress, accelerated, token, onFinished]);
  useEffect(() => {
    if (!speedUp || !suspense || !active || reduced) return;
    runOnUI(() => {
      "worklet";
      if (accelerated.value || progress.value >= 1) return;
      accelerated.set(true);
      const remaining = remainingSuspenseMs(durationMs, progress.value);
      cancelAnimation(progress);
      progress.set(withTiming(1, { duration: remaining, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(onFinished, token);
      }));
    })();
  }, [speedUp, suspense, active, reduced, durationMs, progress, accelerated, onFinished, token]);
  useAnimatedReaction(
    () => suspense && active && !reduced && durationMs >= 600 ? suspenseHapticStage(progress.value, rarity) : 0,
    (stage, previous) => {
      if (stage > 0 && stage > (previous ?? 0)) scheduleOnRN(onCue, token, stage);
    }, [suspense, active, reduced, durationMs, rarity, token, onCue],
  );
  const angle = useDerivedValue(() => rotating ? backRotation(progress.value) : 0);
  const appearance = useDerivedValue(() => rotating ? backPaletteProgress(angle.value) : progress.value);
  const edge = useAnimatedStyle(() => ({
    borderColor: interpolateColor(appearance.value, suspenseStops, [...palette.stops]),
    backgroundColor: interpolateColor(appearance.value, suspenseStops, [...palette.stops]),
    opacity: 0.04 + progress.value * 0.09,
  }));
  const rotation = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1100 },
      { rotateY: `${angle.value}deg` },
      { rotateX: rotating ? `${Math.sin(angle.value * Math.PI / 180) * 4}deg` : "0deg" },
      // Keep ≥1 so foreshortening does not open a hole against the stage.
      { scale: rotating ? 1 + Math.abs(Math.sin(angle.value * Math.PI / 180)) * 0.06 : 1 },
    ],
  }));
  return <View accessible accessibilityLabel="Card back. Purchased contents remain hidden.">
    <RarityGlow progress={progress} palette={palette} reduced={reduced} />
    <Animated.View style={[styles.rotator, rotation]}>
      <View style={styles.face}>
        <CardBack />
        <Animated.View pointerEvents="none" style={[styles.edge, edge]} />
      </View>
      <View style={[styles.face, styles.reverse]}>
        <CardBack />
        <Animated.View pointerEvents="none" style={[styles.edge, edge]} />
      </View>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  rotator: { width: revealCardFrame.width, height: revealCardFrame.height },
  face: {
    position: "absolute",
    top: 0,
    left: 0,
    width: revealCardFrame.width,
    height: revealCardFrame.height,
    backfaceVisibility: "hidden",
    overflow: "hidden",
    borderRadius: 24,
  },
  reverse: { transform: [{ rotateY: "180deg" }] },
  edge: {
    position: "absolute",
    top: 0,
    left: 0,
    width: revealCardFrame.width,
    height: revealCardFrame.height,
    borderRadius: 24,
    borderWidth: 2,
  },
});
