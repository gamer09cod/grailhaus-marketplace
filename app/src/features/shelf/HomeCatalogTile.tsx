import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import { colors, maxFontScale, radius, spacing, typography, usePressMotion } from "../../theme";
import { formatCents } from "../../utils/money";
import { rarityLabel, type ShelfCatalogItem } from "./packs";

type Props = {
  item: ShelfCatalogItem;
  width: number;
  artHeight: number;
  onOpen: (item: ShelfCatalogItem) => void;
};

/** Home rail tile for sneaker/watch catalog products (product art, not pack sleeves). */
export const HomeCatalogTile = memo(function HomeCatalogTile({
  item,
  width,
  artHeight,
  onOpen,
}: Props) {
  const pressMotion = usePressMotion("discovery");
  const rarity = rarityLabel(item.rarity);
  return (
    <Pressable
      accessibilityLabel={`${item.name}. ${rarity}. ${formatCents(item.valueCents)}`}
      accessibilityRole="button"
      onPress={() => onOpen(item)}
      style={({ pressed }) => [
        styles.tile,
        { width },
        pressed ? styles.pressed : null,
        pressMotion(pressed),
      ]}
    >
      <CollectibleArt
        category={item.category}
        fit="contain"
        height={artHeight}
        imageUrl={item.imageUrl}
        title={item.name}
      />
      <View style={styles.info}>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>
          {formatCents(item.valueCents)}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>
          {item.name}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.meta}>
          {rarity}
        </Text>
      </View>
    </Pressable>
  );
}, (prev, next) => (
  prev.onOpen === next.onOpen
  && prev.width === next.width
  && prev.artHeight === next.artHeight
  && prev.item.id === next.item.id
  && prev.item.name === next.item.name
  && prev.item.rarity === next.item.rarity
  && prev.item.valueCents === next.item.valueCents
  && prev.item.imageUrl === next.item.imageUrl
  && prev.item.category === next.item.category
));

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
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
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
