import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import { colors, layout, maxFontScale, radius, spacing, typography, usePressMotion } from "../../theme";
import { formatCents } from "../../utils/money";
import { isRarity, rarityLabel } from "../shelf/packs";
import type { OwnedHolding } from "./inventory";
import { allTimePercentLabel, formatSignedCents, profitCents } from "./portfolio";

type HoldingCardProps = {
  holding: OwnedHolding;
  artHeight: number;
  width: number;
  onOpen: (ownedItemId: string) => void;
};

export const HoldingCard = memo(function HoldingCard({ holding, artHeight, width, onOpen }: HoldingCardProps) {
  const pressMotion = usePressMotion("discovery");
  const rarity = isRarity(holding.rarity) ? rarityLabel(holding.rarity) : holding.rarity;
  const profit = profitCents(holding.estimatedValueCents, holding.acquisitionPriceCents);
  const percent = allTimePercentLabel(holding.estimatedValueCents, holding.acquisitionPriceCents);
  const listed = holding.state === "LISTED";
  const a11y = [
    holding.name,
    rarity,
    formatCents(holding.estimatedValueCents),
    `P and L ${formatSignedCents(profit)}`,
    percent ? `All-time ${percent}` : null,
    listed && holding.listingPriceCents !== null
      ? `Listed at ${formatCents(holding.listingPriceCents)}`
      : listed
        ? "Listed"
        : "Not listed",
  ].filter((part): part is string => part !== null).join(". ");

  return (
    <Pressable
      accessibilityLabel={a11y}
      accessibilityRole="button"
      onPress={() => onOpen(holding.ownedItemId)}
      style={({ pressed }) => [styles.card, { width }, pressed ? styles.pressed : null, pressMotion(pressed)]}
    >
      <CollectibleArt
        category={holding.category}
        height={artHeight}
        imageUrl={holding.imageUrl}
        overlay={
          listed ? (
            <View pointerEvents="none" style={styles.badge}>
              <View style={styles.listedFill}>
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.listedLabel}>LISTED</Text>
              </View>
            </View>
          ) : null
        }
        style={styles.art}
        title={holding.name}
      />
      <View style={styles.info}>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>
          {holding.name}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.meta}>
          {rarity}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.value}>
          {formatCents(holding.estimatedValueCents)}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.meta}>
          {formatSignedCents(profit)}{percent ? ` · ${percent}` : ""}
        </Text>
        {listed && holding.listingPriceCents !== null ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.listedPrice}>
            {formatCents(holding.listingPriceCents)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}, holdingCardPropsEqual);

function holdingCardPropsEqual(prev: HoldingCardProps, next: HoldingCardProps): boolean {
  return (
    prev.width === next.width
    && prev.artHeight === next.artHeight
    && prev.onOpen === next.onOpen
    && prev.holding.ownedItemId === next.holding.ownedItemId
    && prev.holding.name === next.holding.name
    && prev.holding.rarity === next.holding.rarity
    && prev.holding.state === next.holding.state
    && prev.holding.estimatedValueCents === next.holding.estimatedValueCents
    && prev.holding.acquisitionPriceCents === next.holding.acquisitionPriceCents
    && prev.holding.listingPriceCents === next.holding.listingPriceCents
    && prev.holding.imageUrl === next.holding.imageUrl
    && prev.holding.category === next.holding.category
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
  listedFill: {
    backgroundColor: colors.status.warning.muted,
    borderColor: colors.status.warning.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  listedLabel: {
    ...typography.caption,
    color: colors.status.warning.solid,
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
  value: {
    ...typography.moneySmall,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  listedPrice: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
