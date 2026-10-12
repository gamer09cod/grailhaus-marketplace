import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { colors, revealCardFrame } from "../../theme";
import { AnimatedCardBack } from "./AnimatedCardBack";
import { FinalCardFlip } from "./FinalCardFlip";
import { FlyingCards } from "./FlyingCards";
import { PackArtwork } from "./PackArtwork";
import { RotatingRevealGlow } from "./RotatingRevealGlow";
import { cardLaunchMs, timingMode, type TimingMode } from "./revealTiming";
import { revealFx } from "./revealFx";

/** Ease-out with a short settle overshoot so the card punches into center. */
const RISE_EASING = Easing.bezier(0.16, 1.14, 0.28, 1);

type Props = {
  compressed: boolean;
  previous: ReactNode;
  tier: string;
  rarity: string;
  suspense: boolean;
  suspenseDurationMs: number;
  speedUp: boolean;
  suspenseToken: number;
  onSuspenseCue: (token: number, stage: number) => void;
  onSuspenseFinished: (token: number) => void;
  flipping: boolean;
  flipToken: number;
  onImpact: (token: number) => void;
  onFlipFinished: (token: number) => void;
  front: ReactNode;
  cardCount: number;
  entering: boolean;
  revealed: boolean;
  active: boolean;
  reduced: boolean;
  token: number;
  onFinished: (token: number) => void;
  children: ReactNode;
  /** qualityCaps.foil */
  foil?: number;
  /** qualityCaps.idleFloat */
  idleFloat?: boolean;
  /** Start translateY from pack rest (below center). */
  riseFromY?: number;
  /** Starting scale at pack mouth. */
  launchScale?: number;
};

export function CardStage({
  compressed,
  previous,
  tier,
  rarity,
  suspense,
  suspenseDurationMs,
  speedUp,
  suspenseToken,
  onSuspenseFinished,
  onSuspenseCue,
  flipping,
  flipToken,
  onImpact,
  onFlipFinished,
  front,
  cardCount,
  entering,
  revealed,
  active,
  reduced,
  token,
  onFinished,
  children,
  foil = 0,
  idleFloat = true,
  riseFromY = 160,
  launchScale = 0.78,
}: Props) {
  const entry = useSharedValue(entering ? 0 : 1);
  const float = useSharedValue(0);
  const sweep = useSharedValue(0);
  const fx = revealFx(rarity);
  const mode: TimingMode = timingMode({
    quality: reduced ? "reduced" : "balanced",
    compressed,
  });
  const launchMs = cardLaunchMs(mode);

  useEffect(() => {
    if (!entering) {
      entry.set(1);
      return;
    }
    if (!active) {
      entry.set(1);
      onFinished(token);
      return;
    }
    entry.set(
      withTiming(
        1,
        {
          duration: launchMs,
          easing: reduced || compressed ? Easing.out(Easing.cubic) : RISE_EASING,
        },
        (finished) => {
          if (finished) scheduleOnRN(onFinished, token);
        },
      ),
    );
    return () => {
      cancelAnimation(entry);
      onFinished(token);
    };
  }, [entering, active, reduced, token, onFinished, entry, compressed, launchMs]);

  useEffect(() => {
    cancelAnimation(float);
    const allow = revealed && active && !reduced && idleFloat;
    if (allow) {
      const drift = { duration: 3400, easing: Easing.inOut(Easing.sin) };
      float.set(
        withDelay(
          400,
          withRepeat(
            withSequence(withTiming(1, drift), withTiming(-1, drift)),
            -1,
            false,
          ),
        ),
      );
    } else {
      float.set(withTiming(0, { duration: 220 }));
    }
    return () => cancelAnimation(float);
  }, [revealed, active, reduced, idleFloat, float]);

  useEffect(() => {
    cancelAnimation(sweep);
    if (!revealed || reduced || !active) {
      sweep.set(0);
      return;
    }
    sweep.set(0);
    sweep.set(
      withSequence(
        withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 1 }),
      ),
    );
    return () => cancelAnimation(sweep);
  }, [revealed, reduced, active, sweep]);

  const cardMotion = useAnimatedStyle(() => {
    const startY = riseFromY;
    const startScale = launchScale;
    return {
      opacity: reduced
        ? entry.value
        : interpolate(entry.value, [0, 0.12, 1], [0, 1, 1]),
      transform: [
        {
          translateY:
            (reduced
              ? interpolate(entry.value, [0, 1], [startY * 0.35, 0])
              : interpolate(entry.value, [0, 0.55, 0.82, 1], [startY, -16, 5, 0]))
            + float.value * 3.5,
        },
        {
          translateX: reduced ? 0 : float.value * 1.2,
        },
        {
          scale: reduced
            ? interpolate(entry.value, [0, 1], [startScale, 1])
            : interpolate(entry.value, [0, 0.45, 0.78, 1], [startScale, 1.05, 1.02, 1]),
        },
        {
          rotateZ: `${reduced ? 0 : interpolate(entry.value, [0, 0.4, 1], [-5, 2.4, 0]) + float.value * 0.35}deg`,
        },
      ],
    };
  });

  const shadowMotion = useAnimatedStyle(() => ({
    opacity: interpolate(entry.value, [0, 0.35, 1], [0.15, 0.55, 0.4]),
    transform: [
      {
        scaleX: interpolate(entry.value, [0, 1], [0.7, 1]),
      },
      {
        translateY: interpolate(entry.value, [0, 1], [riseFromY * 0.15, 0]),
      },
    ],
  }));

  const packMotion = useAnimatedStyle(() => ({
    opacity: reduced
      ? 1 - entry.value
      : interpolate(entry.value, [0, 0.22, 0.5, 1], [1, 0.7, 0.12, 0]),
    transform: [
      { translateY: reduced ? 0 : interpolate(entry.value, [0, 0.35, 1], [riseFromY, riseFromY + 40, riseFromY + 160]) },
      { scale: reduced ? 1 : interpolate(entry.value, [0, 0.4, 1], [1, 0.92, 0.8]) },
      { rotateZ: `${reduced ? 0 : interpolate(entry.value, [0, 1], [0, -8])}deg` },
    ],
  }));

  const sweepMotion = useAnimatedStyle(() => ({
    opacity: interpolate(sweep.value, [0, 0.2, 0.7, 1], [0, 0.35, 0.18, 0]),
    transform: [{ translateX: interpolate(sweep.value, [0, 1], [-120, 160]) }, { rotate: "18deg" }],
  }));

  const glowActive = flipping || revealed;
  const glowSettling = revealed;
  // Décor backs launch only after the hero has arrived (spin / flip / result).
  const flyEntering = !entering && (suspense || flipping || revealed);

  return (
    <View style={styles.scene}>
      {previous}
      <FlyingCards active={active && flyEntering} count={cardCount} entering={flyEntering} reduced={reduced} />
      <View style={styles.stageCenter}>
        <Animated.View style={[styles.shadowPool, shadowMotion]} pointerEvents="none" />
        <RotatingRevealGlow
          active={glowActive && active}
          settling={glowSettling}
          color={fx.color}
          reduced={reduced}
        />
        <Animated.View style={[styles.cards, cardMotion]}>
          {/* Rim only after the face is settled — a full-size rim during flip left a grey hole. */}
          {revealed ? <View style={styles.rim} pointerEvents="none" /> : null}
          {revealed ? (
            children
          ) : (
            <FinalCardFlip
              compressed={compressed}
              rarity={rarity}
              flipping={flipping}
              active={active}
              reduced={reduced}
              token={flipToken}
              onImpact={onImpact}
              onFinished={onFlipFinished}
              front={front}
              foil={foil}
            >
              <AnimatedCardBack
                rarity={rarity}
                suspense={suspense}
                speedUp={speedUp}
                token={suspenseToken}
                onCue={onSuspenseCue}
                onFinished={onSuspenseFinished}
                durationMs={suspenseDurationMs}
                active={active}
                reduced={reduced}
              />
            </FinalCardFlip>
          )}
          {!reduced ? (
            <Animated.View pointerEvents="none" style={[styles.sweep, sweepMotion]} />
          ) : null}
        </Animated.View>
      </View>
      <Animated.View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.pack, packMotion]}
      >
        <PackArtwork labels={false} opened tier={tier} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    width: revealCardFrame.width,
    height: revealCardFrame.height,
    alignItems: "center",
    justifyContent: "center",
  },
  stageCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  cards: {
    width: revealCardFrame.width,
    height: revealCardFrame.height,
  },
  pack: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  shadowPool: {
    position: "absolute",
    bottom: -10,
    width: revealCardFrame.width * 0.78,
    height: 30,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.7,
    shadowRadius: 26,
  },
  rim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(217, 189, 133, 0.34)",
    shadowColor: colors.premium.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    zIndex: 4,
  },
  sweep: {
    position: "absolute",
    top: -20,
    bottom: -20,
    width: 54,
    backgroundColor: "rgba(255, 248, 230, 0.22)",
    zIndex: 5,
  },
});
