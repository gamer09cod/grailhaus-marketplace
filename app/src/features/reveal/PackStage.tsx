import { useEffect, type ReactNode } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { packExitMs, type TimingMode } from "./revealTiming";

type PackStageProps = {
  children: ReactNode;
  idle: boolean;
  active: boolean;
  reduced: boolean;
  /** When false, skips idle float (quality reduced / mid-tear). */
  idleFloat?: boolean;
  /** After burst — fade/scale away before CardStage takes over. */
  exiting?: boolean;
  /** Timing mode for pack exit duration (defaults to full / reduced). */
  exitMode?: TimingMode;
  /** Downward travel (px) when ripping away from bottom rest. */
  exitTravelY?: number;
};

/** Separate transforms from the inner gesture sleeve: idle never changes finger distance. */
export function PackStage({
  children,
  idle,
  active,
  reduced,
  idleFloat = true,
  exiting = false,
  exitMode,
  exitTravelY = 180,
}: PackStageProps) {
  const entrance = useSharedValue(0);
  const float = useSharedValue(0);
  const exit = useSharedValue(0);
  const mode: TimingMode = exitMode ?? (reduced ? "reduced" : "full");
  const exitDuration = packExitMs(mode);

  useEffect(() => {
    if (!active) {
      cancelAnimation(entrance);
      entrance.set(1);
      return;
    }
    entrance.set(withTiming(1, { duration: reduced ? 180 : 720, easing: Easing.bezier(0.16, 1.05, 0.3, 1) }));
    return () => cancelAnimation(entrance);
  }, [active, reduced, entrance]);

  useEffect(() => {
    cancelAnimation(float);
    const allowFloat = active && idle && !reduced && idleFloat && !exiting;
    if (allowFloat) {
      const drift = { duration: 3000, easing: Easing.inOut(Easing.sin) };
      float.set(withDelay(600, withSequence(
        withTiming(-1, { ...drift, duration: 1500 }),
        withRepeat(withSequence(withTiming(1, drift), withTiming(-1, drift)), -1, false),
      )));
    } else {
      float.set(0);
      if (!idle || exiting) {
        cancelAnimation(entrance);
        entrance.set(1);
      }
    }
    return () => cancelAnimation(float);
  }, [active, idle, reduced, idleFloat, exiting, float, entrance]);

  useEffect(() => {
    cancelAnimation(exit);
    if (exiting && active) {
      exit.set(withTiming(1, {
        duration: reduced ? Math.min(exitDuration, 140) : exitDuration,
        easing: Easing.in(Easing.cubic),
      }));
    } else {
      exit.set(0);
    }
    return () => cancelAnimation(exit);
  }, [exiting, active, reduced, exit, exitDuration]);

  const motion = useAnimatedStyle(() => ({
    opacity: entrance.value * (1 - exit.value * 0.95),
    transform: [
      {
        // Enter from slightly below rest; exit continues downward (ripped away).
        translateY:
          (1 - entrance.value) * 28
          + float.value * (reduced ? 0 : 3.5)
          + exit.value * (reduced ? Math.min(exitTravelY * 0.35, 48) : exitTravelY),
      },
      {
        scale: reduced
          ? 1 - exit.value * 0.08
          : (0.88 + entrance.value * 0.12) * (1 - exit.value * 0.22),
      },
      {
        rotateZ: `${reduced ? 0 : float.value * 0.55 + exit.value * -10}deg`,
      },
    ],
  }));

  return <Animated.View style={motion}>{children}</Animated.View>;
}
