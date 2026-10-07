import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import { PrimaryButton, SecondaryButton } from "../../components/buttons";
import { colors, glow, layout, maxFontScale, radius, shadows, spacing, typography, usePressMotion } from "../../theme";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import type { DropBoard, TimedDrop } from "./board";
import { DropStatus } from "./DropStatus";
import { dropCtaLabel } from "./dropCopy";

type DropCardProps = {
  board: DropBoard;
  drop: TimedDrop;
  onOpen: () => void;
  onAction: () => void;
};

export function DropCard({ board, drop, onOpen, onAction }: DropCardProps) {
  const pressMotion = usePressMotion("discovery");
  const live = drop.status === "LIVE";
  const price = formatCents(drop.priceCents);
  const cta = dropCtaLabel(drop.status);
  const summary = `${drop.name}. ${statusSummary(drop)}. ${price}. ${cta}`;

  return (
    <View style={[styles.card, live ? styles.liveCard : null]}>
      <Pressable
        accessibilityHint={cta}
        accessibilityLabel={summary}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.body, pressed ? styles.pressed : null, pressMotion(pressed)]}
      >
        <CollectibleArt category={drop.category} height={148} style={styles.art} title={drop.name} />
        <View style={styles.info}>
          <DropStatus board={board} drop={drop} />
          <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>
            {drop.name}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.meta}>
            {categoryLabel(drop.category)} · {drop.tier} · {price}
          </Text>
        </View>
      </Pressable>
      <View style={styles.action}>
        {live ? (
          <PrimaryButton fullWidth label={cta} onPress={onAction} />
        ) : (
          <SecondaryButton fullWidth label={cta} onPress={onAction} />
        )}
      </View>
    </View>
  );
}

function statusSummary(drop: TimedDrop): string {
  if (drop.status === "LIVE") {
    return `Live. ${drop.reservable.toString()} remaining`;
  }
  if (drop.status === "UPCOMING") {
    return "Upcoming";
  }
  if (drop.status === "SOLD_OUT") {
    return "Sold out";
  }
  return "Drop ended";
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    overflow: "hidden",
    paddingBottom: layout.cardPadding,
    ...shadows.low,
  },
  liveCard: {
    borderColor: colors.accent.border,
    ...glow(colors.accent.brand, 14),
  },
  body: {
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  art: {
    borderRadius: 0,
  },
  info: {
    gap: spacing.sm,
    paddingHorizontal: layout.cardPadding,
  },
  action: {
    paddingHorizontal: layout.cardPadding,
  },
  name: {
    ...typography.title,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
