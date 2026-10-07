import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import { colors, layout, maxFontScale, radius, spacing, typography, usePressMotion } from "../../theme";
import { formatCents } from "../../utils/money";
import { rarityLabel } from "../shelf/packs";
import type { MarketListing } from "./board";
import { listingRarity, marketDeltaLabel } from "./select";

type MarketplaceItemCardProps = {
  listing: MarketListing;
  listedLabel: string | null;
  artHeight: number;
  width: number;
  onOpen: (listingId: string) => void;
};

export const MarketplaceItemCard = memo(function MarketplaceItemCard({
  listing,
  listedLabel,
  artHeight,
  width,
  onOpen,
}: MarketplaceItemCardProps) {
  const pressMotion = usePressMotion("discovery");
  const rarity = listingRarity(listing);
  const rarityText = rarity ? rarityLabel(rarity) : listing.rarity;
  const price = formatCents(listing.priceCents);
  const fmv = listing.currentValueCents !== null ? formatCents(listing.currentValueCents) : null;
  const delta = marketDeltaLabel(listing.priceCents, listing.currentValueCents);
  const tone = rarity ? colors.rarity[rarity] : null;
  const a11y = [
    listing.name,
    rarityText,
    price,
    fmv ? `FMV ${fmv}` : null,
    delta,
    listedLabel,
    `Seller ${listing.sellerUsername}`,
    listing.isOwn ? "Your listing" : null,
  ].filter((part): part is string => part !== null).join(". ");

  return (
    <Pressable
      accessibilityLabel={a11y}
      accessibilityRole="button"
      onPress={() => onOpen(listing.listingId)}
      style={({ pressed }) => [styles.card, { width }, pressed ? styles.pressed : null, pressMotion(pressed)]}
    >
      <CollectibleArt
        category={listing.category}
        height={artHeight}
        imageUrl={listing.imageUrl}
        overlay={
          tone ? (
            <View pointerEvents="none" style={styles.badge}>
              <View style={[styles.badgeFill, { backgroundColor: tone.muted, borderColor: tone.border }]}>
                <Text maxFontSizeMultiplier={maxFontScale.body} style={[styles.badgeLabel, { color: tone.solid }]}>
                  {rarityText}
                </Text>
              </View>
            </View>
          ) : null
        }
        style={styles.art}
        title={listing.name}
      />
      <View style={styles.info}>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>
          {listing.name}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>{price}</Text>
        {fmv ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.meta}>
            FMV {fmv}
          </Text>
        ) : null}
        {delta ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.meta}>{delta}</Text>
        ) : null}
        {listedLabel ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.meta}>{listedLabel}</Text>
        ) : null}
        {listing.isOwn ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.own}>Your listing</Text>
        ) : null}
      </View>
    </Pressable>
  );
}, marketCardPropsEqual);

function marketCardPropsEqual(prev: MarketplaceItemCardProps, next: MarketplaceItemCardProps): boolean {
  return (
    prev.width === next.width
    && prev.artHeight === next.artHeight
    && prev.listedLabel === next.listedLabel
    && prev.onOpen === next.onOpen
    && prev.listing.listingId === next.listing.listingId
    && prev.listing.priceCents === next.listing.priceCents
    && prev.listing.currentValueCents === next.listing.currentValueCents
    && prev.listing.name === next.listing.name
    && prev.listing.rarity === next.listing.rarity
    && prev.listing.listedAt === next.listing.listedAt
    && prev.listing.isOwn === next.listing.isOwn
    && prev.listing.sellerUsername === next.listing.sellerUsername
    && prev.listing.imageUrl === next.listing.imageUrl
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  art: {
    borderRadius: 0,
  },
  badge: {
    left: spacing.sm,
    position: "absolute",
    top: spacing.sm,
  },
  badgeFill: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  badgeLabel: {
    ...typography.caption,
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
  price: {
    ...typography.moneySmall,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  own: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
