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
import { colors, radius, revealCardFrame } from "../../theme";
import { CardBack } from "./CardBack";
import { decorBackCount } from "./multiCard";

type Props = {
  count: number;
  entering: boolean;
  active: boolean;
  reduced: boolean;
};

/**
 * Supporting backs launch from the pack mouth, fly with depth, then settle
 * behind the winning card. Faces stay hidden — décor only; never invents
 * extra owned items or valuations. Real multi-card ownership needs backend.
 */
export const FlyingCards = memo(function FlyingCards({ count, entering, active, reduced }: Props) {
  const supporting = decorBackCount(count, reduced);
  if (supporting === 0) {
    return null;
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: supporting }, (_, index) => (
        <FlyingBack
          key={index}
          active={active}
          entering={entering}
          index={index}
          reduced={reduced}
          total={supporting}
        />
      ))}
    </View>
  );
});

function FlyingBack({
  index,
  total,
  entering,
  active,
  reduced,
}: {
  index: number;
  total: number;
  entering: boolean;
  active: boolean;
  reduced: boolean;
}) {
  const flight = useSharedValue(entering ? 0 : 1);
  const side = index % 2 === 0 ? -1 : 1;
  const depth = index + 1;

  useEffect(() => {
    cancelAnimation(flight);
    if (!entering) {
      flight.set(1);
      return;
    }
    if (!active || reduced) {
      flight.set(1);
      return;
    }
    flight.set(0);
    flight.set(
      withDelay(
        index * 55,
        withTiming(1, {
          duration: 720 + index * 40,
          easing: Easing.bezier(0.16, 1.05, 0.28, 1),
        }),
      ),
    );
    return () => cancelAnimation(flight);
  }, [entering, active, reduced, flight, index]);

  const motion = useAnimatedStyle(() => {
    const t = flight.value;
    return {
      opacity: reduced ? 0.45 : interpolate(t, [0, 0.15, 0.7, 1], [0, 0.85, 0.55, 0.4]),
      transform: [
        { translateX: reduced ? -depth * 4 : interpolate(t, [0, 0.45, 0.75, 1], [0, side * (48 + depth * 22), side * (18 + depth * 6), -depth * 5]) },
        { translateY: reduced ? -depth * 4 : interpolate(t, [0, 0.4, 0.7, 1], [160, -28 - depth * 8, 8, -depth * 4]) },
        { rotateZ: `${reduced ? 0 : interpolate(t, [0, 0.5, 1], [side * -18, side * 12, side * -2])}deg` },
        { rotateY: `${reduced ? 0 : interpolate(t, [0, 0.55, 1], [side * 25, side * -10, 0])}deg` },
        { scale: reduced ? 1 - depth * 0.03 : interpolate(t, [0, 0.35, 0.7, 1], [0.55, 1.08, 0.98, 1 - depth * 0.03]) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.card, motion]}>
      <CardBack />
      <View style={styles.rim} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderStrong,
    borderRadius: radius.modal,
    borderWidth: 1,
    height: revealCardFrame.height,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    top: 0,
    width: revealCardFrame.width,
  },
  rim: {
    ...StyleSheet.absoluteFill,
    borderColor: colors.premium.goldBorder,
    borderRadius: radius.modal,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.5,
  },
});
