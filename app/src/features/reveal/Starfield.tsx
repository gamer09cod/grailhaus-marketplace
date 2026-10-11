import { memo, useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { BlurMask, Canvas, Circle } from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { colors } from "../../theme";

type Star = { x: number; y: number; r: number; base: number; twinkle: number };

function buildStars(count: number, width: number, height: number): Star[] {
  const stars: Star[] = [];
  let seed = 7919;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: next() * width,
      y: next() * height,
      r: 0.6 + next() * 1.8,
      base: 0.12 + next() * 0.55,
      twinkle: next(),
    });
  }
  return stars;
}

type Props = {
  /** From qualityCaps.stars */
  starCount: number;
  /** 0–1 band intensity (SharedValue from RevealBackground). */
  intensity: SharedValue<number>;
  reduced: boolean;
  /** Soft gold dust vs cool white starfield. */
  tint?: "gold" | "white";
};

/** Single Skia canvas starfield — replaces AmbientParticles Views. */
export const Starfield = memo(function Starfield({ starCount, intensity, reduced, tint = "white" }: Props) {
  const { width, height } = useWindowDimensions();
  const count = reduced ? Math.min(12, starCount) : starCount;
  const stars = useMemo(() => buildStars(count, width, height), [count, width, height]);
  const color = tint === "gold" ? colors.premium.gold : colors.textPrimary;

  if (count <= 0) return null;

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {stars.map((star, index) => (
          <StarDot key={index} star={star} intensity={intensity} reduced={reduced} color={color} />
        ))}
      </Canvas>
    </View>
  );
});

function StarDot({
  star,
  intensity,
  reduced,
  color,
}: {
  star: Star;
  intensity: SharedValue<number>;
  reduced: boolean;
  color: string;
}) {
  const opacity = useDerivedValue(() => {
    const pulse = reduced ? 1 : 0.75 + 0.25 * Math.sin(intensity.value * Math.PI * 2 + star.twinkle * 6);
    return star.base * (0.35 + intensity.value * 0.9) * pulse * (reduced ? 0.7 : 1);
  });
  return (
    <Circle cx={star.x} cy={star.y} r={star.r} color={color} opacity={opacity}>
      {star.r > 1.4 ? <BlurMask blur={0.8} style="solid" /> : null}
    </Circle>
  );
}
