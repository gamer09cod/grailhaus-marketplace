import { memo } from "react";
import { StyleSheet, View } from "react-native";
import {
  BlurMask,
  Canvas,
  LinearGradient,
  RoundedRect,
  vec,
} from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { colors, radius, revealCardFrame } from "../../theme";

type Props = {
  /** Card rotateY in degrees (from flip / suspense). */
  tilt: SharedValue<number>;
  /** 0–1 from qualityCaps.foil — 0 hides the effect. */
  intensity: number;
  color?: string;
};

const W = revealCardFrame.width;
const H = revealCardFrame.height;

/**
 * Clipped holographic foil that reacts to card rotation.
 * Skia draw stays inside the card frame (parent should overflow:hidden).
 */
export const CardFoilEffect = memo(function CardFoilEffect({ tilt, intensity, color = colors.premium.gold }: Props) {
  const beamX = useDerivedValue(() => {
    // Map ±180° tilt into a sweep across the card face.
    const t = ((tilt.value % 360) + 360) % 360;
    const norm = t <= 180 ? t / 180 : (360 - t) / 180;
    return -40 + norm * (W + 80);
  });
  const opacity = useDerivedValue(() => {
    if (intensity <= 0) return 0;
    const edge = Math.abs(Math.sin((tilt.value * Math.PI) / 180));
    return intensity * (0.12 + edge * 0.45);
  });
  const edgeOpacity = useDerivedValue(() => {
    if (intensity <= 0) return 0;
    return intensity * (0.15 + Math.abs(Math.cos((tilt.value * Math.PI) / 180)) * 0.35);
  });
  const x1 = useDerivedValue(() => beamX.value);
  const x2 = useDerivedValue(() => beamX.value + 48);

  if (intensity <= 0) return null;

  return (
    <View pointerEvents="none" accessible={false} style={styles.wrap}>
      <Canvas style={styles.canvas}>
        <RoundedRect x={0} y={0} width={W} height={H} r={radius.modal} opacity={opacity}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(W, H)}
            colors={["transparent", color, colors.textPrimary, color, "transparent"]}
            positions={[0, 0.35, 0.5, 0.65, 1]}
          />
        </RoundedRect>
        <RoundedRect x={x1} y={-20} width={36} height={H + 40} r={4} opacity={opacity} color={colors.textPrimary}>
          <BlurMask blur={6} style="normal" />
        </RoundedRect>
        <RoundedRect
          x={2}
          y={2}
          width={W - 4}
          height={H - 4}
          r={radius.modal - 2}
          style="stroke"
          strokeWidth={2}
          color={color}
          opacity={edgeOpacity}
        />
        {/* Keep a second soft wash tied to beam for chrome shimmer */}
        <RoundedRect x={x2} y={0} width={12} height={H} r={2} opacity={opacity} color={color}>
          <BlurMask blur={4} style="normal" />
        </RoundedRect>
      </Canvas>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.modal,
    overflow: "hidden",
  },
  canvas: {
    width: W,
    height: H,
  },
});
