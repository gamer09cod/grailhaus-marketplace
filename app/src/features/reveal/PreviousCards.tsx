import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { RevealCard } from "../../api/reveal";
import { colors, radius, revealCardFrame } from "../../theme";
import { RevealFaceArtwork } from "./RevealResult";
import { previousCardPositions } from "./multiCard";

export const PreviousCards = memo(function PreviousCards({ cards, index, reduced }: { cards: readonly RevealCard[]; index: number; reduced: boolean }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    {previousCardPositions(index).map((position) => {
      const card = cards[position];
      if (!card) return null;
      const depth = index - position;
      return <Animated.View key={position} entering={reduced ? undefined : FadeIn.duration(180)} style={[styles.card, { transform: [{ translateX: depth * -6 }, { translateY: depth * -4 }, { scale: 1 - depth * 0.025 }] }]}><RevealFaceArtwork imageUrl={card.imageUrl} name={card.name} /></Animated.View>;
    })}
  </View>;
});
const styles = StyleSheet.create({
  card: {
    position: "absolute",
    width: revealCardFrame.width,
    height: revealCardFrame.height,
    borderRadius: radius.modal,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    opacity: 0.55,
  },
});
