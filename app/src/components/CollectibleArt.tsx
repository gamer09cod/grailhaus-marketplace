import { memo, type ReactNode } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { PackCategory } from "../navigation/types";
import { colors, fontWeight, maxFontScale, radius } from "../theme";

type CollectibleArtProps = {
  category: PackCategory;
  title: string;
  /** Used when the catalog has an image. Seeded items currently have none. */
  imageUrl?: string | null;
  height: number;
  overlay?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Category-tinted stand-in art so image-led cards work before real assets land. */
export const CollectibleArt = memo(function CollectibleArt({
  category,
  title,
  imageUrl,
  height,
  overlay,
  style,
}: CollectibleArtProps) {
  const tone = colors.category[category];
  return (
    <View style={[styles.frame, { backgroundColor: tone.muted, height }, style]}>
      <View pointerEvents="none" style={[styles.wash, { backgroundColor: tone.solid }]} />
      <View pointerEvents="none" style={[styles.orb, { backgroundColor: tone.solid }]} />
      {imageUrl ? (
        <Image accessibilityIgnoresInvertColors resizeMode="cover" source={{ uri: imageUrl }} style={styles.photo} />
      ) : (
        <Text maxFontSizeMultiplier={maxFontScale.display} style={[styles.mark, { color: tone.solid }]}>
          {monogram(title)}
        </Text>
      )}
      <View pointerEvents="none" style={styles.fade} />
      {overlay}
    </View>
  );
});

export function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0]?.[0];
  const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
  return `${first ?? "G"}${second ?? "H"}`.toUpperCase();
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    borderRadius: radius.card,
    justifyContent: "center",
    overflow: "hidden",
  },
  wash: {
    ...StyleSheet.absoluteFill,
    opacity: 0.22,
  },
  orb: {
    borderRadius: radius.full,
    height: 160,
    opacity: 0.28,
    position: "absolute",
    right: -36,
    top: -48,
    width: 160,
  },
  photo: {
    ...StyleSheet.absoluteFill,
  },
  mark: {
    fontSize: 40,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
  },
  fade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay.heroFade,
    opacity: 0.55,
    top: "42%",
  },
});
