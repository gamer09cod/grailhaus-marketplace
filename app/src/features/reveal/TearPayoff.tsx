import { useEffect, type ReactNode } from "react";
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { BurstEffects } from "./BurstEffects";
import { TearEffects } from "./TearEffects";
import { tearBurstMs, timingMode } from "./revealTiming";
import type { RevealQuality } from "./quality";
import { qualityCaps } from "./quality";

type Props = {
  compressed: boolean;
  children: ReactNode;
  tearing: boolean;
  active: boolean;
  reduced: boolean;
  quality?: RevealQuality;
  onFinished: () => void;
};

export function TearPayoff({
  compressed,
  children,
  tearing,
  active,
  reduced,
  quality = reduced ? "reduced" : "balanced",
  onFinished,
}: Props) {
  const payoff = useSharedValue(0);
  const caps = qualityCaps(quality);
  const mode = timingMode({ quality, compressed });
  const duration = tearBurstMs(mode);
  const allowBurst = !reduced && caps.burst;
  const particleCount = caps.particles;

  useEffect(() => {
    if (!tearing) {
      payoff.set(0);
      return;
    }
    if (!active) {
      onFinished();
      return;
    }
    payoff.set(withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished) scheduleOnRN(onFinished);
    }));
    return () => {
      cancelAnimation(payoff);
      // Settle the tear gate if this effect restarts or unmounts mid-payoff.
      // tearCompletion.finish() is idempotent.
      onFinished();
    };
  }, [tearing, active, onFinished, payoff, duration]);

  const recoil = useAnimatedStyle(() => ({
    transform: [{
      scale: allowBurst
        ? interpolate(payoff.value, [0, 0.16, 0.42, 0.72, 1], [1, 1.08, 0.95, 1.03, 1])
        : 1,
    }, {
      rotateZ: `${allowBurst ? interpolate(payoff.value, [0, 0.18, 0.5, 1], [0, -1.6, 0.8, 0]) : 0}deg`,
    }, {
      translateX: allowBurst
        ? interpolate(payoff.value, [0, 0.12, 0.28, 0.5, 1], [0, -3, 4, -2, 0])
        : 0,
    }],
  }));

  return (
    <Animated.View style={recoil}>
      {children}
      {tearing ? <TearEffects progress={payoff} active={tearing} reduced={!allowBurst} /> : null}
      {tearing && allowBurst ? (
        <BurstEffects progress={payoff} particleCount={particleCount} burst={allowBurst} />
      ) : null}
    </Animated.View>
  );
}
