import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import { colors, maxFontScale, radius, spacing, typography, usePressMotion } from "../../theme";
import { formatCents } from "../../utils/money";
import { packTierClass, scarcityLabel, type ShelfPack } from "./packs";

type HomePackTileProps = {
  pack: ShelfPack;
  width: number;
  artHeight: number;
  onOpen: (packId: string) => void;
};

export const HomePackTile = memo(function HomePackTile({
  pack,
  width,
  artHeight,
  onOpen,
}: HomePackTileProps) {
  const pressMotion = usePressMotion("discovery");
  const stock = scarcityLabel(pack.reservable);
  const klass = packTierClass(pack.priceCents);
  return (
    <Pressable
      accessibilityLabel={`${pack.name}. ${pack.tier}. ${formatCents(pack.priceCents)}${stock ? `. ${stock}` : ""}`}
      accessibilityRole="button"
      onPress={() => onOpen(pack.id)}
      style={({ pressed }) => [
        styles.tile,
        klass === "grail" ? styles.tileGrail : klass === "premium" ? styles.tilePremium : null,
        { width },
        pressed ? styles.pressed : null,
        pressMotion(pressed),
      ]}
    >
      <CollectibleArt category={pack.category} fit="contain" height={artHeight} title={pack.name} />
      <View style={styles.info}>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>
          {formatCents(pack.priceCents)}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>
          {pack.name}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.tier}>
          {pack.tier}
        </Text>
        {stock ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.stock}>{stock}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}, (prev, next) => (
  prev.onOpen === next.onOpen
  && prev.width === next.width
  && prev.artHeight === next.artHeight
  && prev.pack.id === next.pack.id
  && prev.pack.name === next.pack.name
  && prev.pack.tier === next.pack.tier
  && prev.pack.priceCents === next.pack.priceCents
  && prev.pack.reservable === next.pack.reservable
  && prev.pack.category === next.pack.category
));

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  tilePremium: {
    borderColor: colors.accent.border,
  },
  tileGrail: {
    borderColor: colors.premium.goldBorder,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  info: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  price: {
    ...typography.moneySmall,
    color: colors.textPrimary,
  },
  name: {
    ...typography.productTitle,
    color: colors.textPrimary,
  },
  tier: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stock: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
