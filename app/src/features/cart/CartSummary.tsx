import { StyleSheet, Text, View } from "react-native";

import { Icon } from "../../components/Icon";
import { colors, layout, maxFontScale, radius, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";

type CartSummaryProps = {
  packCents: bigint;
  marketCents: bigint;
  totalCents: bigint;
  balance: bigint | undefined;
  after: bigint | null;
  short: boolean;
  /** Post-checkout receipt labels instead of cart “to pay”. */
  receipt?: boolean;
};

export function CartSummary({
  packCents,
  marketCents,
  totalCents,
  balance,
  after,
  short,
  receipt = false,
}: CartSummaryProps) {
  return (
    <View style={styles.summary}>
      <View style={styles.heading}>
        <Icon color={colors.textPrimary} name="receipt-outline" size={18} />
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.headingText}>
          {receipt ? "Order total" : "Bill summary"}
        </Text>
      </View>
      {packCents > 0n ? <SummaryRow label="Packs" value={formatCents(packCents)} /> : null}
      {marketCents > 0n ? <SummaryRow label="Marketplace" value={formatCents(marketCents)} /> : null}
      <SummaryRow label="Item total" value={formatCents(totalCents)} />
      <View style={styles.rule} />
      <SummaryRow emphasis label={receipt ? "Paid" : "To pay"} value={formatCents(totalCents)} />
      {receipt ? (
        <SummaryRow emphasis label="Wallet balance" value={after !== null ? formatCents(after) : "—"} />
      ) : (
        <>
          <SummaryRow label="Wallet balance" value={balance !== undefined ? formatCents(balance) : "—"} />
          <SummaryRow
            emphasis={!short}
            label="Balance after"
            tone={short ? "warning" : undefined}
            value={after !== null ? formatCents(after) : "—"}
          />
        </>
      )}
      {short && !receipt ? (
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
          You do not have enough in your wallet. Add funds, then pay again.
        </Text>
      ) : null}
    </View>
  );
}

function SummaryRow({
  label,
  value,
  emphasis = false,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "warning";
}) {
  return (
    <View style={styles.summaryRow}>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={emphasis ? styles.summaryLabelStrong : styles.summaryLabel}>
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={maxFontScale.display}
        style={[
          emphasis ? styles.summaryValueStrong : styles.summaryValue,
          tone === "warning" ? styles.summaryValueWarn : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.card,
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  heading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xxs,
  },
  headingText: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  rule: {
    backgroundColor: colors.borderSubtle,
    height: StyleSheet.hairlineWidth,
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
  summaryValueWarn: {
    color: colors.status.warning.solid,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.status.warning.solid,
  },
});
