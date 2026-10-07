import { StyleSheet, Text, View } from "react-native";

import { colors, layout, maxFontScale, radius, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";

type CartSummaryProps = {
  packCents: bigint;
  marketCents: bigint;
  totalCents: bigint;
  balance: bigint | undefined;
  after: bigint | null;
  short: boolean;
};

export function CartSummary({
  packCents,
  marketCents,
  totalCents,
  balance,
  after,
  short,
}: CartSummaryProps) {
  return (
    <View style={styles.summary}>
      {packCents > 0n ? <SummaryRow label="Packs" value={formatCents(packCents)} /> : null}
      {marketCents > 0n ? <SummaryRow label="Marketplace" value={formatCents(marketCents)} /> : null}
      <SummaryRow emphasis label="Total" value={formatCents(totalCents)} />
      <SummaryRow label="Available Balance" value={balance !== undefined ? formatCents(balance) : "—"} />
      <SummaryRow
        emphasis
        label="Balance After Purchase"
        value={after !== null ? formatCents(after) : "—"}
      />
      {short ? (
        <Text style={styles.notice}>You do not have enough in your wallet.{"\n\n"}Add funds, then pay again.</Text>
      ) : null}
    </View>
  );
}

function SummaryRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={emphasis ? styles.summaryLabelStrong : styles.summaryLabel}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={maxFontScale.display} style={emphasis ? styles.summaryValueStrong : styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  summaryRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  summaryLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  summaryLabelStrong: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  summaryValue: {
    ...typography.moneySmall,
    color: colors.textSecondary,
  },
  summaryValueStrong: {
    ...typography.money,
    color: colors.textPrimary,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
