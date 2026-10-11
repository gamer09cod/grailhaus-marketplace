import { memo, useEffect, useState, type ReactNode } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { PackCategory } from "../navigation/types";
import { colors, fontWeight, maxFontScale, radius } from "../theme";

import { catalogArtworkSource } from "./catalogArtwork";

type CollectibleArtProps = {
  category: PackCategory;
  title: string;
  /** Remote URL used only when no bundled catalog JPEG matches the title. */
  imageUrl?: string | null;
  height: number;
  fit?: "cover" | "contain";
  overlay?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Shared artwork resolver keeps shelf, reveal, holdings and marketplace consistent. */
export const CollectibleArt = memo(function CollectibleArt({
  category,
  title,
  imageUrl,
  height,
  fit = "cover",
  overlay,
  style,
}: CollectibleArtProps) {
  const tone = colors.category[category];
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const bundled = catalogArtworkSource(category, title);
  // Prefer app/assets/catalog matches so sneaker/watch listings never stick on empty remote URLs.
  const remote = imageUrl && imageUrl !== failedUrl ? imageUrl : null;
  const source = bundled ?? (remote ? { uri: remote } : undefined);

  useEffect(() => {
    setFailedUrl(null);
  }, [imageUrl, title, category]);

  return (
    <View style={[styles.frame, { height }, style]}>
      {source ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode={fit}
          source={source}
          onError={() => {
            if (remote && !bundled) {
              setFailedUrl(remote);
            }
          }}
          style={styles.photo}
        />
      ) : (
        <Text maxFontSizeMultiplier={maxFontScale.display} style={[styles.mark, { color: tone.solid }]}>
          {monogram(title)}
        </Text>
      )}
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
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.card,
    justifyContent: "center",
    overflow: "hidden",
  },
  photo: {
    // Bound the native image explicitly; absolute edges alone can retain its
    // intrinsic asset size, so the frame clips it before contain can fit it.
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  mark: {
    fontSize: 36,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.5,
  },
});
