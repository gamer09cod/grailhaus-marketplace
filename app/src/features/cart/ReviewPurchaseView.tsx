import { StyleSheet, Text, View } from "react-native";

import { InlineStatusCard } from "../../components/InlineStatusCard";
import { colors, layout, maxFontScale, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";
import { CartSummary } from "./CartSummary";
import type { ReviewChange, ReviewSnapshot, ReviewedLine } from "./reviewSnapshot";

type ReviewPurchaseViewProps = {
  reviewed: ReviewSnapshot;
  changes: ReviewChange[];
  balance: bigint | undefined;
  after: bigint | null;
  short: boolean;
  onReviewCart: () => void;
};

export function ReviewPurchaseView({
  reviewed,
  changes,
  balance,
  after,
  short,
  onReviewCart,
}: ReviewPurchaseViewProps) {
  const count = reviewed.lines.length;
  const countLabel = count === 1 ? "1 item" : `${count} items`;

  return (
    <View style={styles.body}>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.count}>{countLabel}</Text>
      <View style={styles.list}>
        {reviewed.lines.map((item) => (
          <ReviewLineRow key={item.lineId} item={item} />
        ))}
      </View>
      {changes.length > 0 ? (
        <InlineStatusCard
          action={{ label: "Review Cart", motion: "financial", variant: "secondary", onPress: onReviewCart }}
          body="One or more items changed since you reviewed your order."
          icon="alert-circle-outline"
          title="Your cart changed"
          tone="warning"
        >
          {changes.map((change) => (
            <View key={change.lineId} style={styles.changedItem}>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.changedName}>{change.name}</Text>
              <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.changedPrice}>
                {change.toCents === null
                  ? `${formatCents(change.fromCents)} → removed`
                  : change.fromCents === 0n
                    ? formatCents(change.toCents)
                    : `${formatCents(change.fromCents)} → ${formatCents(change.toCents)}`}
              </Text>
            </View>
          ))}
        </InlineStatusCard>
      ) : null}
      <CartSummary
        after={after}
        balance={balance}
        marketCents={reviewed.marketCents}
        packCents={reviewed.packCents}
        short={short}
        totalCents={reviewed.totalCents}
      />
    </View>
  );
}

function ReviewLineRow({ item }: { item: ReviewedLine }) {
  const label = item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name;
  return (
    <View style={styles.row}>
      <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>{label}</Text>
      <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>
        {formatCents(item.priceCents * BigInt(item.quantity))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: layout.sectionGap,
  },
  count: {
    ...typography.body,
    color: colors.textSecondary,
  },
  list: {
    gap: spacing.base,
  },
  row: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  name: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  price: {
    ...typography.money,
    color: colors.textPrimary,
  },
  changedItem: {
    gap: spacing.xxs,
  },
  changedName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  changedPrice: {
    ...typography.money,
    color: colors.textPrimary,
  },
});
