import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { RevealImpact } from "./RevealImpact";
import { revealFx } from "./revealFx";
import { finalFlipPose, FLIP_TOTAL_MS } from "./finalFlip";
import { TradingCard } from "./TradingCard";

type Props = {
  compressed: boolean;
  rarity: string;
  flipping: boolean;
  active: boolean;
  reduced: boolean;
  token: number;
  onImpact: (token: number) => void;
  onFinished: (token: number) => void;
  front: ReactNode;
  children: ReactNode;
  /** qualityCaps.foil — 0 disables Skia foil. */
  foil?: number;
};

export function FinalCardFlip({
  compressed,
  rarity,
  flipping,
  active,
  reduced,
  token,
  onImpact,
  onFinished,
  front,
  children,
  foil = 0,
}: Props) {
  const progress = useSharedValue(0);
  const fx = revealFx(rarity);
  const duration = compressed ? 400 : fx.anticipationMs + 500 + fx.pauseMs;
  const elapsed = useDerivedValue(() =>
    flipping
      ? Math.max(0, progress.value * (compressed ? FLIP_TOTAL_MS : duration) - (compressed ? 0 : fx.anticipationMs))
      : -1,
  );
  const angle = useDerivedValue(() => {
    if (reduced) return progress.value * 180;
    return finalFlipPose(elapsed.value / FLIP_TOTAL_MS).angle;
  });
  const scale = useDerivedValue(() => {
    if (reduced || !flipping) return 1;
    return finalFlipPose(elapsed.value / FLIP_TOTAL_MS).scale;
  });
  const frontVisible = useDerivedValue(() => {
    if (reduced) return progress.value >= 0.5;
    return finalFlipPose(elapsed.value / FLIP_TOTAL_MS).frontVisible;
  });

  useEffect(() => {
    if (!flipping) {
      progress.set(0);
      return;
    }
    if (!active) {
      progress.set(1);
      onFinished(token);
      return;
    }
    progress.set(
      withTiming(1, { duration: reduced ? 180 : duration, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(onFinished, token);
      }),
    );
    return () => cancelAnimation(progress);
  }, [flipping, active, reduced, token, onFinished, progress, duration]);

  useAnimatedReaction(
    () => flipping && active && (reduced ? progress.value >= 0.8 : elapsed.value >= 400),
    (impact, previous) => {
      if (impact && !previous) scheduleOnRN(onImpact, token);
    },
    [flipping, active, reduced, token, onImpact],
  );

  return (
    <View style={styles.stage}>
      {flipping ? <RevealImpact elapsed={elapsed} rarity={rarity} reduced={reduced} /> : null}
      <TradingCard
        angle={angle}
        scale={scale}
        frontVisible={frontVisible}
        back={children}
        front={front}
        reduced={reduced}
        foil={foil}
        foilColor={fx.color}
        showFront={flipping}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 214, height: 300 },
});
