import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { colors } from "../../theme";
import { revealFx, revealFxEnvelope } from "./revealFx";

type Props = { elapsed: SharedValue<number>; rarity: string; reduced: boolean };
const Particle = memo(function Particle({ elapsed, color, index, count }: { elapsed: SharedValue<number>; color: string; index: number; count: number }) {
  const angle = index * Math.PI * 2 / count;
  const motion = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (elapsed.value - 400) / 300));
    return { opacity: p > 0 ? (1 - p) * 0.9 : 0, transform: [{ translateX: Math.cos(angle) * (90 + p * 95) }, { translateY: Math.sin(angle) * (130 + p * 95) }, { scale: 1 + p * 0.6 }] };
  });
  return <Animated.View style={[styles.particle, { backgroundColor: color }, motion]} />;
});
export function RevealImpact({ elapsed, rarity, reduced }: Props) {
  const fx = useMemo(() => revealFx(rarity), [rarity]);
  const halo = useAnimatedStyle(() => ({ opacity: revealFxEnvelope(elapsed.value) * fx.glow * (reduced ? 0.35 : 1) }));
  const dark = useAnimatedStyle(() => ({ opacity: reduced ? 0 : fx.darkening * Math.max(0, 1 - elapsed.value / 500) }));
  const radial = useAnimatedStyle(() => ({ opacity: reduced ? 0 : revealFxEnvelope(elapsed.value) * 0.18, transform: [{ scale: 0.9 + Math.min(1, elapsed.value / 650) * 0.15 }] }));
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Animated.View style={[styles.darkness, dark]} />
    <Animated.View style={[styles.halo, { borderColor: fx.color, backgroundColor: fx.color }, halo]} />
    {fx.radial && !reduced ? <Animated.View style={[styles.radial, { borderColor: fx.color }, radial]} /> : null}
    {!reduced ? Array.from({ length: fx.particles }, (_, index) => <Particle key={index} index={index} count={fx.particles} color={fx.color} elapsed={elapsed} />) : null}
  </View>;
}
const styles = StyleSheet.create({
  darkness: { position: "absolute", top: -120, bottom: -120, left: -120, right: -120, borderRadius: 140, backgroundColor: colors.overlay.impact },
  halo: { position: "absolute", top: -10, bottom: -10, left: -10, right: -10, borderRadius: 32, borderWidth: 5 },
  radial: { position: "absolute", top: -48, bottom: -48, left: -48, right: -48, borderRadius: 180, borderWidth: 22 },
  particle: { position: "absolute", top: 148, left: 105, width: 5, height: 5, borderRadius: 3 },
});
