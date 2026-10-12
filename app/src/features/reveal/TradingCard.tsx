import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { revealCardFrame } from "../../theme";
import { CardFoilEffect } from "./CardFoilEffect";

type Props = {
  /** rotateY degrees for the back face (0 = facing camera as back). */
  angle: SharedValue<number>;
  scale: SharedValue<number>;
  /** When true, show front (angle past 90). Derived by parent for opacity swap. */
  frontVisible: SharedValue<boolean>;
  back: ReactNode;
  front: ReactNode;
  reduced: boolean;
  /** Foil intensity 0–1; 0 disables Skia foil. */
  foil: number;
  foilColor?: string;
  showFront: boolean;
};

/**
 * Two-face collectible with backfaceVisibility hidden.
 * Parent owns timing; this component only maps angle/scale SharedValues.
 */
export const TradingCard = memo(function TradingCard({
  angle,
  scale,
  frontVisible,
  back,
  front,
  reduced,
  foil,
  foilColor,
  showFront,
}: Props) {
  const backStyle = useAnimatedStyle(() => ({
    opacity: reduced ? (frontVisible.value ? 0 : 1) : frontVisible.value ? 0 : 1,
    transform: [
      { perspective: 1100 },
      { rotateY: `${reduced ? 0 : angle.value}deg` },
      { scale: scale.value },
    ],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: reduced ? (frontVisible.value ? 1 : 0) : frontVisible.value ? 1 : 0,
    transform: [
      { perspective: 1100 },
      { rotateY: `${reduced ? 0 : angle.value - 180}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={styles.stage}>
      {/* Full-frame chassis stays put while faces rotate — no stage bleed at edge-on. */}
      <View pointerEvents="none" style={styles.plate} />
      <Animated.View style={[styles.surface, backStyle]}>{back}</Animated.View>
      {showFront ? (
        <Animated.View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.surface, frontStyle]}
        >
          {front}
          {!reduced && foil > 0 ? <CardFoilEffect tilt={angle} intensity={foil} color={foilColor} /> : null}
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    width: revealCardFrame.width,
    height: revealCardFrame.height,
  },
  plate: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0A0B0F",
    borderRadius: 22,
  },
  surface: {
    position: "absolute",
    top: 0,
    left: 0,
    width: revealCardFrame.width,
    height: revealCardFrame.height,
    backfaceVisibility: "hidden",
  },
});
