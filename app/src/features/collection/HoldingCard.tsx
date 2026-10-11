import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import { colors, maxFontScale, radius, spacing, typography, usePressMotion } from "../../theme";
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
  const gain = profit >= 0n;
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
        fit="contain"
        imageUrl={holding.imageUrl}
        overlay={
          listed ? (
            <View pointerEvents="none" style={styles.badge}>
              <View style={styles.listedFill}>
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.listedLabel}>Listed</Text>
              </View>
            </View>
          ) : null
        }
        style={styles.art}
        title={holding.name}
      />
      <View style={styles.info}>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.value}>
          {formatCents(holding.estimatedValueCents)}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>
          {holding.name}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.meta}>
          {rarity}
        </Text>
        <Text
          maxFontSizeMultiplier={maxFontScale.body}
          numberOfLines={1}
          style={[styles.pnl, gain ? styles.pnlUp : styles.pnlDown]}
        >
          {formatSignedCents(profit)}{percent ? ` · ${percent}` : ""}
        </Text>
        {listed && holding.listingPriceCents !== null ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.listedPrice}>
            Ask {formatCents(holding.listingPriceCents)}
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
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  listedLabel: {
    ...typography.label,
    color: colors.accent.solid,
    fontSize: 10,
  },
  info: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  value: {
    ...typography.money,
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
  pnl: {
    ...typography.caption,
  },
  pnlUp: {
    color: colors.status.success.solid,
  },
  pnlDown: {
    color: colors.status.error.solid,
  },
  listedPrice: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
