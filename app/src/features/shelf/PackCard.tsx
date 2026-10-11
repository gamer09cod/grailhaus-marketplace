import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import type { PackCategory } from "../../navigation/types";
import { colors, fontWeight, maxFontScale, radius, spacing, typography, usePressMotion } from "../../theme";
import { formatCents } from "../../utils/money";
import { packTierClass, type PackTierClass } from "./packs";

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
  width: number;
  artHeight: number;
  onOpen: () => void;
};

export const PackCard = memo(function PackCard({
  packId: _packId,
  category,
  name,
  tier,
  priceCents,
  availability,
  badges = [],
  imageUrl,
  width,
  artHeight,
  onOpen,
}: PackCardProps) {
  const pressMotion = usePressMotion("discovery");
  const price = formatCents(priceCents);
  const klass = packTierClass(priceCents);
  const badgeNames = badges.map(badgeLabel).join(", ");
  return (
    <Pressable
      accessibilityLabel={`${name}. ${tier}. ${price}. ${availability}${badgeNames ? `. ${badgeNames}` : ""}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        tierCardStyle[klass],
        { width },
        pressed ? styles.pressed : null,
        pressMotion(pressed),
      ]}
    >
      <CollectibleArt
        category={category}
        height={artHeight}
        fit="contain"
        imageUrl={imageUrl}
        overlay={
          <View pointerEvents="none" style={styles.overlay}>
            <View style={[styles.tierChip, tierChipStyle[klass]]}>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={[styles.tierChipLabel, tierChipLabelStyle[klass]]}>
                {tier}
              </Text>
            </View>
            {badges.length > 0 ? (
              <View style={styles.badges}>
                {badges.map((badge) => (
                  <View key={badge} style={[styles.badge, badgeStyle[badge]]}>
                    {badge === "LIVE" ? <View style={styles.liveDot} /> : null}
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={[styles.badgeLabel, badgeLabelStyle[badge]]}>
                      {badgeLabel(badge)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        }
        style={styles.art}
        title={name}
      />
      <View style={styles.info}>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>{price}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>{name}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.availability}>
          {availability}
        </Text>
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
    && prev.width === next.width
    && prev.artHeight === next.artHeight
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

const tierCardStyle: Record<PackTierClass, object> = {
  entry: {
    borderColor: colors.borderSubtle,
  },
  premium: {
    borderColor: colors.accent.border,
  },
  grail: {
    borderColor: colors.premium.goldBorder,
  },
};

const tierChipStyle: Record<PackTierClass, object> = {
  entry: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
  },
  premium: {
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.border,
  },
  grail: {
    backgroundColor: colors.premium.goldMuted,
    borderColor: colors.premium.goldBorder,
  },
};

const tierChipLabelStyle: Record<PackTierClass, object> = {
  entry: { color: colors.textSecondary },
  premium: { color: colors.accent.solid },
  grail: { color: colors.premium.gold },
};

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
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    padding: spacing.sm,
  },
  tierChip: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  tierChipLabel: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  badges: {
    alignSelf: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  badge: {
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xxs,
    minHeight: 20,
    paddingHorizontal: spacing.xs,
  },
  liveDot: {
    backgroundColor: colors.status.success.solid,
    borderRadius: radius.full,
    height: 5,
    width: 5,
  },
  badgeLabel: {
    ...typography.caption,
  },
  info: {
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  price: {
    ...typography.money,
    color: colors.textPrimary,
  },
  name: {
    ...typography.productTitle,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
  availability: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
});
