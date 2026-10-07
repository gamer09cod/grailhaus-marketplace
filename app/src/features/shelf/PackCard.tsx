import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import type { PackCategory } from "../../navigation/types";
import { colors, layout, maxFontScale, radius, spacing, typography, usePressMotion } from "../../theme";
import { formatCents } from "../../utils/money";

export type PackCardBadge = "LIVE" | "DROP" | "SOLD_OUT";

export type PackCardProps = {
  packId: string;
  category: PackCategory;
  name: string;
  tier: string;
  priceCents: bigint;
  availability: string;
  badges?: PackCardBadge[];
  imageUrl?: string | null;
  onOpen: (packId: string) => void;
};

export const PackCard = memo(function PackCard({
  packId,
  category,
  name,
  tier,
  priceCents,
  availability,
  badges = [],
  imageUrl,
  onOpen,
}: PackCardProps) {
  const pressMotion = usePressMotion("discovery");
  const price = formatCents(priceCents);
  const badgeNames = badges.map(badgeLabel).join(", ");
  return (
    <Pressable
      accessibilityLabel={`${name}. ${tier}. ${price}. ${availability}${badgeNames ? `. ${badgeNames}` : ""}`}
      accessibilityRole="button"
      onPress={() => onOpen(packId)}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null, pressMotion(pressed)]}
    >
      <CollectibleArt
        category={category}
        height={168}
        imageUrl={imageUrl}
        overlay={
          badges.length > 0 ? (
            <View pointerEvents="none" style={styles.badges}>
              {badges.map((badge) => (
                <View key={badge} style={[styles.badge, badgeStyle[badge]]}>
                  {badge === "LIVE" ? <View style={styles.liveDot} /> : null}
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={[styles.badgeLabel, badgeLabelStyle[badge]]}>
                    {badgeLabel(badge)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null
        }
        style={styles.art}
        title={name}
      />
      <View style={styles.info}>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>{name}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.tier}>{tier}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>{price}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.availability}>{availability}</Text>
      </View>
    </Pressable>
  );
}, packCardPropsEqual);

function packCardPropsEqual(prev: PackCardProps, next: PackCardProps): boolean {
  const prevBadges = prev.badges ?? [];
  const nextBadges = next.badges ?? [];
  return (
    prev.packId === next.packId
    && prev.category === next.category
    && prev.name === next.name
    && prev.tier === next.tier
    && prev.priceCents === next.priceCents
    && prev.availability === next.availability
    && prev.imageUrl === next.imageUrl
    && prev.onOpen === next.onOpen
    && prevBadges.length === nextBadges.length
    && prevBadges.every((badge, index) => badge === nextBadges[index])
  );
}

function badgeLabel(badge: PackCardBadge): string {
  if (badge === "SOLD_OUT") {
    return "Sold out";
  }
  return badge;
}

const badgeStyle: Record<PackCardBadge, object> = {
  LIVE: {
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.border,
  },
  DROP: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
  },
  SOLD_OUT: {
    backgroundColor: colors.status.error.muted,
    borderColor: colors.status.error.border,
  },
};

const badgeLabelStyle: Record<PackCardBadge, object> = {
  LIVE: { color: colors.textPrimary },
  DROP: { color: colors.textPrimary },
  SOLD_OUT: { color: colors.status.error.solid },
};

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
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    left: spacing.md,
    position: "absolute",
    top: spacing.md,
  },
  badge: {
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 24,
    paddingHorizontal: spacing.sm,
  },
  liveDot: {
    backgroundColor: colors.status.success.solid,
    borderRadius: radius.full,
    height: 6,
    width: 6,
  },
  badgeLabel: {
    ...typography.label,
  },
  info: {
    gap: spacing.xxs,
    padding: layout.cardPadding,
  },
  name: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  tier: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  price: {
    ...typography.money,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  availability: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
