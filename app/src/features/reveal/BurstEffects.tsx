import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { BlurMask, Canvas, Circle, Group, RadialGradient, vec } from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { colors } from "../../theme";

const W = 220;
const H = 300;
const CX = W / 2;
const CY = 72;

type SparkSpec = { angle: number; dist: number; size: number; warm: boolean };

function buildSparks(count: number): SparkSpec[] {
  const sparks: SparkSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    sparks.push({
      angle: (i / Math.max(1, count)) * Math.PI * 2 + (i % 3) * 0.11,
      dist: 36 + (i % 7) * 16,
      size: 1.5 + (i % 4) * 0.7,
      warm: i % 2 === 0,
    });
  }
  return sparks;
}

function Spark({
  progress,
  angle,
  dist,
  size,
  warm,
}: {
  progress: SharedValue<number>;
  angle: number;
  dist: number;
  size: number;
  warm: boolean;
}) {
  const cx = useDerivedValue(() => CX + Math.cos(angle) * dist * progress.value);
  const cy = useDerivedValue(() => CY + Math.sin(angle) * dist * progress.value * 0.85 - progress.value * 28);
  const opacity = useDerivedValue(() => {
    const p = progress.value;
    if (p <= 0.02) return 0;
    if (p < 0.2) return p / 0.2;
    return Math.max(0, 1 - (p - 0.2) / 0.8);
  });
  const r = useDerivedValue(() => size * (1.15 - progress.value * 0.55));
  return (
    <Circle cx={cx} cy={cy} r={r} color={warm ? colors.premium.gold : colors.textPrimary} opacity={opacity}>
      <BlurMask blur={1.2} style="solid" />
    </Circle>
  );
}

type Props = {
  progress: SharedValue<number>;
  /** From qualityCaps.particles — 0 disables the canvas. */
  particleCount: number;
  burst: boolean;
};

/** Single Skia canvas for tear burst flash + sparks. */
export const BurstEffects = memo(function BurstEffects({ progress, particleCount, burst }: Props) {
  const sparks = useMemo(() => buildSparks(Math.max(0, particleCount)), [particleCount]);
  const flashOpacity = useDerivedValue(() => {
    const p = progress.value;
    if (!burst || p <= 0) return 0;
    if (p < 0.12) return p / 0.12;
    if (p < 0.4) return 1 - (p - 0.12) / 0.28;
    return 0;
  });
  const flashRadius = useDerivedValue(() => 28 + progress.value * 110);
  const washOpacity = useDerivedValue(() => {
    if (!burst) return 0;
    const p = progress.value;
    if (p <= 0) return 0;
    if (p < 0.25) return p * 0.7;
    return Math.max(0, 0.35 * (1 - (p - 0.25) / 0.75));
  });

  if (!burst || particleCount <= 0) {
    return null;
  }

  return (
    <View pointerEvents="none" accessible={false} style={styles.wrap}>
      <Canvas style={styles.canvas}>
        <Circle cx={CX} cy={CY} r={flashRadius} opacity={flashOpacity}>
          <RadialGradient c={vec(CX, CY)} r={140} colors={[colors.textPrimary, colors.premium.gold, "transparent"]} />
        </Circle>
        <Circle cx={CX} cy={CY + 40} r={90} opacity={washOpacity} color={colors.premium.gold}>
          <BlurMask blur={28} style="normal" />
        </Circle>
        <Group>
          {sparks.map((spark, index) => (
            <Spark
              key={index}
              progress={progress}
              angle={spark.angle}
              dist={spark.dist}
              size={spark.size}
              warm={spark.warm}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    width: W,
    height: H,
    left: 0,
    top: 0,
  },
  canvas: {
    width: W,
    height: H,
  },
});
