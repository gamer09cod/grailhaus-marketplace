import { memo, useEffect, useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  RadialGradient,
  Rect,
  vec,
} from "@shopify/react-native-skia";
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { colors } from "../../theme";
import { starfieldIntensity, type PhaseBand } from "./revealPhases";

type Props = {
  band?: PhaseBand;
  reduced?: boolean;
  /** From qualityCaps.stars — drives particle density. */
  starCount?: number;
};

type DepthLayer = "far" | "mid" | "near";

type Particle = {
  x: number;
  y: number;
  r: number;
  base: number;
  twinkle: number;
  layer: DepthLayer;
  driftX: number;
  driftY: number;
};

type Glint = { x: number; y: number; size: number; rotate: number; opacity: number };

function haloCenterY(band: PhaseBand, height: number): number {
  if (band === "sealed" || band === "tear") return height * 0.62;
  if (band === "emergence") return height * 0.48;
  return height * 0.4;
}

function layerFromRoll(roll: number): DepthLayer {
  if (roll < 0.45) return "far";
  if (roll < 0.78) return "mid";
  return "near";
}

function buildParticles(count: number, width: number, height: number, band: PhaseBand): Particle[] {
  const particles: Particle[] = [];
  let seed = 9173;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const cx = width * 0.5;
  const cy = haloCenterY(band, height);

  for (let i = 0; i < count; i += 1) {
    const layer = layerFromRoll(next());
    // Scatter across the stage; bias slightly toward the focal column.
    const x = next() * width;
    const yBias = layer === "far" ? 0.5 : layer === "mid" ? 0.55 : 0.58;
    const y = next() * height * 0.92 + height * 0.04;
    const towardFocus = 0.35 + next() * 0.65;
    const px = x * (1 - towardFocus * 0.25) + (cx + (next() - 0.5) * width * 0.35) * towardFocus * 0.25;
    const py = y * 0.7 + cy * 0.3 * yBias + (next() - 0.5) * height * 0.08;

    const size =
      layer === "far" ? 1.6 + next() * 3.2
        : layer === "mid" ? 0.9 + next() * 1.8
          : 0.5 + next() * 1.2;

    particles.push({
      x: px,
      y: py,
      r: size,
      base:
        layer === "far" ? 0.06 + next() * 0.14
          : layer === "mid" ? 0.12 + next() * 0.28
            : 0.22 + next() * 0.4,
      twinkle: next(),
      layer,
      driftX: (next() - 0.5) * (layer === "near" ? 18 : layer === "mid" ? 10 : 5),
      driftY: (next() - 0.5) * (layer === "near" ? 22 : layer === "mid" ? 12 : 6),
    });
  }
  return particles;
}

function buildGlints(width: number, height: number, band: PhaseBand): Glint[] {
  const cx = width * 0.5;
  const cy = haloCenterY(band, height);
  return [
    { x: cx - width * 0.16, y: cy - height * 0.08, size: 4.2, rotate: 18, opacity: 0.2 },
    { x: cx + width * 0.18, y: cy - height * 0.02, size: 3.4, rotate: -24, opacity: 0.16 },
    { x: cx + width * 0.1, y: cy + height * 0.1, size: 2.8, rotate: 40, opacity: 0.14 },
    { x: cx - width * 0.12, y: cy + height * 0.05, size: 3, rotate: -8, opacity: 0.12 },
  ];
}

/**
 * Layered near-black stage with warm gold halo and multi-depth particles.
 * Far (blurred) / mid / near (crisp) drifts create a 2.5D volume without clutter.
 */
export const RevealBackground = memo(function RevealBackground({
  band = "sealed",
  reduced = false,
  starCount = 40,
}: Props) {
  const { width, height } = useWindowDimensions();
  const intensity = useSharedValue(starfieldIntensity(band));
  const pulse = useSharedValue(reduced ? 0.5 : 0);
  const drift = useSharedValue(0);
  const particleCount = reduced
    ? Math.min(10, Math.floor(starCount * 0.3))
    : Math.min(56, Math.max(28, Math.floor(starCount * 0.85)));
  const particles = useMemo(
    () => buildParticles(particleCount, width, height, band),
    [particleCount, width, height, band],
  );
  const glints = useMemo(() => buildGlints(width, height, band), [width, height, band]);
  const cx = width * 0.5;
  const cy = haloCenterY(band, height);
  const haloR = Math.min(width, height) * 0.5;
  const vignetteR = Math.max(width, height) * 0.78;
  const far = useMemo(() => particles.filter((p) => p.layer === "far"), [particles]);
  const mid = useMemo(() => particles.filter((p) => p.layer === "mid"), [particles]);
  const near = useMemo(() => particles.filter((p) => p.layer === "near"), [particles]);
  const energetic = band === "tear" || band === "emergence" || band === "suspense" || band === "flip";

  useEffect(() => {
    cancelAnimation(intensity);
    intensity.set(
      withTiming(reduced ? Math.min(0.26, starfieldIntensity(band)) : starfieldIntensity(band), {
        duration: reduced ? 120 : 480,
        easing: Easing.out(Easing.cubic),
      }),
    );
    return () => cancelAnimation(intensity);
  }, [band, reduced, intensity]);

  useEffect(() => {
    cancelAnimation(pulse);
    if (reduced) {
      pulse.set(0.45);
      return;
    }
    pulse.set(
      withSequence(
        withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
        withRepeat(
          withTiming(0.55, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
          -1,
          true,
        ),
      ),
    );
    return () => cancelAnimation(pulse);
  }, [band, reduced, pulse]);

  useEffect(() => {
    cancelAnimation(drift);
    if (reduced) {
      drift.set(0);
      return;
    }
    // Continuous slow volume drift; slightly faster during energetic beats.
    const duration = energetic ? 2800 : 5200;
    drift.set(
      withRepeat(
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(drift);
  }, [energetic, reduced, drift]);

  const haloOpacity = useDerivedValue(() => {
    const base = reduced ? 0.5 : 0.38 + intensity.value * 0.28;
    return base * (0.72 + pulse.value * 0.28);
  });

  // Whole-layer parallax — far drifts least, near most (opposite sense).
  const farTransform = useDerivedValue(() => [{ translateY: reduced ? 0 : drift.value * 6 }]);
  const midTransform = useDerivedValue(() => [{ translateY: reduced ? 0 : drift.value * -10 }]);
  const nearTransform = useDerivedValue(() => [{ translateY: reduced ? 0 : drift.value * 16 }]);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.background}
    >
      <View style={styles.base} />

      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={cx} cy={cy} r={haloR} opacity={haloOpacity}>
          <RadialGradient
            c={vec(cx, cy)}
            r={haloR}
            colors={[
              "rgba(217, 189, 133, 0.26)",
              "rgba(184, 154, 98, 0.11)",
              "rgba(184, 154, 98, 0.03)",
              "rgba(9, 10, 13, 0)",
            ]}
            positions={[0, 0.35, 0.62, 1]}
          />
        </Circle>

        {/* Far volume — soft, blurred dust behind the subject. */}
        <Group transform={farTransform}>
          {far.map((particle, index) => (
            <DepthParticle
              key={`far-${index}`}
              particle={particle}
              intensity={intensity}
              drift={drift}
              reduced={reduced}
              blur={3.2}
              color="rgba(184, 154, 98, 0.85)"
            />
          ))}
        </Group>

        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(cx, cy)}
            r={vignetteR}
            colors={["rgba(7,8,12,0)", "rgba(5,6,8,0.32)", "rgba(2,3,4,0.88)"]}
            positions={[0.3, 0.68, 1]}
          />
        </Rect>

        {/* Mid field — between vignette and subject. */}
        <Group transform={midTransform}>
          {mid.map((particle, index) => (
            <DepthParticle
              key={`mid-${index}`}
              particle={particle}
              intensity={intensity}
              drift={drift}
              reduced={reduced}
              blur={1.4}
              color={colors.premium.gold}
            />
          ))}
        </Group>

        {/* Near motes — crisp sparks in front of the volume. */}
        <Group transform={nearTransform}>
          {near.map((particle, index) => (
            <DepthParticle
              key={`near-${index}`}
              particle={particle}
              intensity={intensity}
              drift={drift}
              reduced={reduced}
              blur={0}
              color="rgba(245, 236, 214, 0.95)"
            />
          ))}
        </Group>
      </Canvas>

      {!reduced ? (
        <View style={styles.glintLayer}>
          {glints.map((glint, index) => (
            <View
              key={index}
              style={[
                styles.glint,
                {
                  left: glint.x - glint.size,
                  top: glint.y - glint.size,
                  width: glint.size * 2,
                  height: glint.size * 2,
                  opacity: glint.opacity,
                  transform: [{ rotate: `${glint.rotate}deg` }, { scaleY: 0.55 }],
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

function DepthParticle({
  particle,
  intensity,
  drift,
  reduced,
  blur,
  color,
}: {
  particle: Particle;
  intensity: SharedValue<number>;
  drift: SharedValue<number>;
  reduced: boolean;
  blur: number;
  color: string;
}) {
  const opacity = useDerivedValue(() => {
    const twinkle = reduced
      ? 1
      : 0.78 + 0.22 * Math.sin(intensity.value * Math.PI * 2 + particle.twinkle * 6.2 + drift.value * Math.PI);
    return particle.base * (0.4 + intensity.value * 0.85) * twinkle;
  });
  const cx = useDerivedValue(() => {
    if (reduced) return particle.x;
    return particle.x + drift.value * particle.driftX;
  });
  const cy = useDerivedValue(() => {
    if (reduced) return particle.y;
    return particle.y + drift.value * particle.driftY;
  });
  const radius = useDerivedValue(() => {
    if (reduced || blur > 2) return particle.r;
    // Near particles breathe slightly with drift for depth shimmer.
    return particle.r * (0.92 + drift.value * 0.16);
  });

  return (
    <Circle cx={cx} cy={cy} r={radius} color={color} opacity={opacity}>
      {blur > 0 ? <BlurMask blur={blur} style="normal" /> : particle.r > 1 ? <BlurMask blur={0.5} style="solid" /> : null}
    </Circle>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#07080C",
    overflow: "hidden",
  },
  base: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#07080C",
  },
  glintLayer: {
    ...StyleSheet.absoluteFill,
  },
  glint: {
    backgroundColor: "rgba(245, 236, 214, 0.9)",
    borderRadius: 1,
    position: "absolute",
    shadowColor: colors.premium.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 5,
  },
});
