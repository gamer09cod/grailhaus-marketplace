import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import { colors, layout, maxFontScale, radius, spacing, typography, usePressMotion } from "../../theme";
import { formatCents } from "../../utils/money";
import { scarcityLabel, type ShelfPack } from "./packs";

const tileWidth = 168;

type HomePackTileProps = {
  pack: ShelfPack;
  onOpen: (packId: string) => void;
};

export const HomePackTile = memo(function HomePackTile({ pack, onOpen }: HomePackTileProps) {
  const pressMotion = usePressMotion("discovery");
  const stock = scarcityLabel(pack.reservable);
  return (
    <Pressable
      accessibilityLabel={`${pack.name}. ${pack.tier}. ${formatCents(pack.priceCents)}${stock ? `. ${stock}` : ""}`}
      accessibilityRole="button"
      onPress={() => onOpen(pack.id)}
      style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null, pressMotion(pressed)]}
    >
      <CollectibleArt category={pack.category} height={120} title={pack.name} />
      <View style={styles.info}>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>
          {pack.name}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.tier}>
          {pack.tier}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>
          {formatCents(pack.priceCents)}
        </Text>
        {stock ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.stock}>{stock}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}, (prev, next) => (
  prev.onOpen === next.onOpen
  && prev.pack.id === next.pack.id
  && prev.pack.name === next.pack.name
  && prev.pack.tier === next.pack.tier
  && prev.pack.priceCents === next.pack.priceCents
  && prev.pack.reservable === next.pack.reservable
  && prev.pack.category === next.pack.category
));

export const homePackTileWidth = tileWidth;

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
    width: tileWidth,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  info: {
    gap: spacing.xxs,
    padding: spacing.md,
  },
  name: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    minHeight: layout.minTouchTarget - 12,
  },
  tier: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  price: {
    ...typography.moneySmall,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  stock: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
