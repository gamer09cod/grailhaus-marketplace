import { StyleSheet } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { suspenseStops, type SuspensePalette } from "./suspense";

type Props = { progress: SharedValue<number>; palette: SuspensePalette; reduced: boolean };
export function RarityGlow({ progress, palette, reduced }: Props) {
  const light = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, suspenseStops, [...palette.stops]),
    // Keep both color and intensity neutral until the common opening has passed.
    opacity: reduced ? 0.025 : 0.03 + Math.max(0, progress.value - 0.45) / 0.55 * palette.intensity,
    transform: [{
      scale: reduced
        ? 1
        : 0.96 + progress.value * 0.08 + (progress.value > 0.7 ? Math.sin(progress.value * Math.PI * 6) * 0.012 : 0),
    }],
  }));
  return <Animated.View pointerEvents="none" accessible={false} style={[styles.glow, light]} />;
}
const styles = StyleSheet.create({ glow: { position: "absolute", width: 252, height: 338, left: -19, top: -19, borderRadius: 32 } });
