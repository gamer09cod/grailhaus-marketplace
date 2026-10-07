import { Pressable, StyleSheet, Text, View } from "react-native";

import { CollectibleArt } from "../../components/CollectibleArt";
import { colors, glow, layout, maxFontScale, radius, shadows, spacing, typography, usePressMotion } from "../../theme";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import type { DropBoard, TimedDrop } from "./board";
import { DropCountdown } from "./DropCountdown";
import { dropCtaLabel } from "./dropCopy";

type HeroDropCardProps = {
  board: DropBoard;
  drop: TimedDrop;
  onPress: () => void;
};

export function HeroDropCard({ board, drop, onPress }: HeroDropCardProps) {
  const pressMotion = usePressMotion("discovery");
  const live = drop.status === "LIVE";
  const cta = dropCtaLabel(live ? "LIVE" : "UPCOMING");
  const remaining = live ? `${drop.reservable.toString()} remaining` : null;
  const summary = live
    ? `${drop.name}. Live. ${remaining}. Ends in. ${cta}`
    : `${drop.name}. Upcoming. ${cta}`;

  return (
    <Pressable
      accessibilityHint={cta}
      accessibilityLabel={summary}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        live ? styles.liveCard : null,
        pressed ? styles.pressed : null,
        pressMotion(pressed),
      ]}
    >
      <CollectibleArt
        category={drop.category}
        height={260}
        overlay={
          <View style={styles.overlay}>
            {live ? (
              <View style={styles.liveBlock}>
                <View style={styles.liveRow}>
                  <View style={styles.liveDot} />
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.live}>LIVE</Text>
                  {remaining ? (
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.remaining}>{remaining}</Text>
                  ) : null}
                </View>
                <DropCountdown
                  fetchedAtMs={board.fetchedAtMs}
                  label="Ends in"
                  serverNow={board.serverNow}
                  size="hero"
                  targetIso={drop.endsAt}
                />
              </View>
            ) : (
              <DropCountdown
                fetchedAtMs={board.fetchedAtMs}
                label="Starts in"
                serverNow={board.serverNow}
                size="hero"
                targetIso={drop.startsAt}
              />
            )}
            <Text maxFontSizeMultiplier={maxFontScale.display} numberOfLines={2} style={styles.name}>
              {drop.name}
            </Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.meta}>
              {categoryLabel(drop.category)} · {drop.tier} · {formatCents(drop.priceCents)}
            </Text>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.cta}>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.ctaLabel}>{cta}</Text>
            </View>
          </View>
        }
        title={drop.name}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    ...shadows.medium,
  },
  liveCard: {
    borderColor: colors.accent.border,
    ...glow(colors.accent.brand, 16),
  },
  pressed: {
    opacity: 0.92,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    gap: spacing.sm,
    justifyContent: "flex-end",
    padding: layout.cardPadding,
  },
  liveBlock: {
    gap: spacing.sm,
  },
  liveRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  liveDot: {
    backgroundColor: colors.status.success.solid,
    borderRadius: radius.full,
    height: 8,
    width: 8,
  },
  live: {
    ...typography.label,
    color: colors.textPrimary,
  },
  remaining: {
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  name: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  cta: {
    alignItems: "center",
    backgroundColor: colors.accent.fill,
    borderRadius: radius.button,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.base,
  },
  ctaLabel: {
    ...typography.button,
    color: colors.textOnAccent,
  },
});
