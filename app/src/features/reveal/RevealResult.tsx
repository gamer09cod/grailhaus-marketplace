import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { RevealCard } from "../../api/reveal";
import { CollectibleArt } from "../../components/CollectibleArt";
import { revealCardFrame, spacing } from "../../theme";
import { CardFoilEffect } from "./CardFoilEffect";
import type { RevealQuality } from "./quality";
import { ResultPanel } from "./ResultPanel";

export const RevealFaceArtwork = memo(function RevealFaceArtwork({
  name,
  imageUrl,
  foilIntensity = 0,
  reduced = false,
  foilColor,
}: {
  name: string;
  imageUrl?: string | null;
  rarity?: string;
  foilIntensity?: number;
  reduced?: boolean;
  foilColor?: string;
}) {
  const tilt = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(tilt);
    if (foilIntensity <= 0 || reduced) {
      tilt.set(20);
      return;
    }
    tilt.set(
      withRepeat(
        withTiming(160, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(tilt);
  }, [foilIntensity, reduced, tilt]);

  return (
    <View pointerEvents="none" style={styles.art}>
      <CollectibleArt
        category="TRADING_CARD"
        fit="contain"
        height={revealCardFrame.height}
        imageUrl={imageUrl}
        style={styles.image}
        title={name}
      />
      {foilIntensity > 0 && !reduced ? (
        <CardFoilEffect tilt={tilt} intensity={foilIntensity * 0.55} color={foilColor} />
      ) : null}
    </View>
  );
});

type Props = {
  compressed: boolean;
  card: RevealCard;
  packId: string;
  active: boolean;
  reduced: boolean;
  ready: boolean;
  quality: RevealQuality;
  onReady: (packId: string) => void;
  rarityColor: string;
  foilIntensity?: number;
};

/** Card face + sequenced ResultPanel metadata. */
export function RevealResult({
  compressed,
  card,
  packId,
  active,
  reduced,
  ready,
  quality,
  onReady,
  rarityColor,
  foilIntensity = 0,
}: Props) {
  return (
    <>
      <RevealFaceArtwork
        foilIntensity={foilIntensity}
        foilColor={rarityColor}
        imageUrl={card.imageUrl}
        name={card.name}
        rarity={card.rarity}
        reduced={reduced}
      />
      <View style={styles.metadata}>
        <ResultPanel
          active={active}
          compressed={compressed}
          estimatedValueCents={card.estimatedValueCents}
          name={card.name}
          onReady={onReady}
          packId={packId}
          quality={quality}
          rarity={card.rarity}
          rarityColor={rarityColor}
          ready={ready}
          reduced={reduced}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  art: { ...StyleSheet.absoluteFill },
  image: { width: "100%", height: "100%", borderRadius: 0 },
  metadata: {
    position: "absolute",
    top: Math.round(revealCardFrame.height * 0.55),
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    justifyContent: "flex-start",
  },
});
