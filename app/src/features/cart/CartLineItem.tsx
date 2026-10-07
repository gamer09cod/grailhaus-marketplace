import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { CartLine, CartSnapshot } from "../../api/cart";
import { CollectibleArt } from "../../components/CollectibleArt";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import type { IconName } from "../../components/Icon";
import { DestructiveButton, PrimaryButton, SecondaryButton, TertiaryButton } from "../../components/buttons";
import {
  colors,
  layout,
  maxFontScale,
  radius,
  spacing,
  typography,
  type Tone,
} from "../../theme";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { isHoldExpiring, remainingLabel } from "./countdown";
import { lineAmount } from "./cartTotals";

type CartLineItemProps = {
  line: CartLine;
  snapshot: CartSnapshot;
  busy: boolean;
  disabled: boolean;
  compact?: boolean;
  onAccept: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onBrowseMarket: () => void;
};

export function CartLineItem({
  line,
  snapshot,
  busy,
  disabled,
  compact = false,
  onAccept,
  onRemove,
  onRetry,
  onBrowseMarket,
}: CartLineItemProps) {
  const amount = formatCents(lineAmount(line));
  const price = line.lineType === "PACK"
    ? `${line.quantity} × ${formatCents(line.snapshotPriceCents)}`
    : formatCents(line.snapshotPriceCents);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <CollectibleArt
          category={line.category}
          height={72}
          style={styles.art}
          title={line.name}
        />
        <View style={styles.copy}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>
            {categoryLabel(line.category)}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>
            {line.name}
          </Text>
          {line.lineType === "PACK" ? (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.meta}>{line.tier}</Text>
          ) : (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.meta}>Seller {line.sellerUsername}</Text>
          )}
          <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.priceLine}>{price}</Text>
          {line.lineType === "PACK" && line.quantity > 1 ? (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.amount}>{amount}</Text>
          ) : null}
        </View>
      </View>

      {compact ? null : (
        <LineStatus
          busy={busy}
          disabled={disabled}
          line={line}
          snapshot={snapshot}
          onAccept={onAccept}
          onBrowseMarket={onBrowseMarket}
          onRemove={onRemove}
          onRetry={onRetry}
        />
      )}
    </View>
  );
}

function LineStatus({
  line,
  snapshot,
  busy,
  disabled,
  onAccept,
  onRemove,
  onRetry,
  onBrowseMarket,
}: Omit<CartLineItemProps, "compact">) {
  const confirming = busy ? "Confirming…" : undefined;
  const removing = busy ? "Removing…" : "Remove";

  if (line.lineType === "MARKETPLACE_LISTING") {
    if (line.state === "LISTING_PRICE_CHANGED") {
      return (
        <StatusBlock
          icon="alert-circle-outline"
          title="Price changed"
          tone={colors.status.warning}
        >
          <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.priceShift}>
            {formatCents(line.snapshotPriceCents)} → {formatCents(line.currentPriceCents)}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.statusBody}>Seller changed the price.</Text>
          <View style={styles.actions}>
            <PrimaryButton disabled={disabled} label={confirming ?? "Accept"} motion="financial" size="sm" onPress={onAccept} />
            <DestructiveButton disabled={disabled} label={removing} motion="financial" size="sm" onPress={onRemove} />
          </View>
        </StatusBlock>
      );
    }
    if (line.state === "LISTING_SOLD") {
      return (
        <StatusBlock
          icon="close-circle-outline"
          title="This listing has already sold."
          tone={colors.status.error}
        >
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.statusBody}>
            Browse similar listings or remove it from your cart.
          </Text>
          <View style={styles.actions}>
            <SecondaryButton label="Browse Marketplace" motion="financial" size="sm" onPress={onBrowseMarket} />
            <DestructiveButton disabled={disabled} label={removing} motion="financial" size="sm" onPress={onRemove} />
          </View>
        </StatusBlock>
      );
    }
    if (line.state === "LISTING_DELISTED") {
      return (
        <StatusBlock
          icon="remove-circle-outline"
          title="The seller removed this listing."
          tone={colors.status.warning}
        >
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.statusBody}>
            Remove it from your cart, or browse what is still for sale.
          </Text>
          <View style={styles.actions}>
            <SecondaryButton label="Browse Marketplace" motion="financial" size="sm" onPress={onBrowseMarket} />
            <DestructiveButton disabled={disabled} label={removing} motion="financial" size="sm" onPress={onRemove} />
          </View>
        </StatusBlock>
      );
    }
    return (
      <StatusBlock icon="pricetag-outline" title="Listing available" tone={colors.status.info}>
        <TertiaryButton disabled={disabled} label={removing} motion="financial" size="sm" onPress={onRemove} />
      </StatusBlock>
    );
  }

  if (line.state === "EXPIRED") {
    return (
      <StatusBlock icon="time-outline" title="Reservation expired" tone={colors.status.warning}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.statusBody}>
          These packs are no longer reserved.
        </Text>
        <View style={styles.actions}>
          <PrimaryButton disabled={disabled} label={confirming ?? "Reserve Again"} motion="financial" size="sm" onPress={onRetry} />
          <DestructiveButton disabled={disabled} label={removing} motion="financial" size="sm" onPress={onRemove} />
        </View>
      </StatusBlock>
    );
  }
  if (line.state === "PRICE_CHANGED") {
    return (
      <StatusBlock icon="alert-circle-outline" title="Price changed" tone={colors.status.warning}>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.priceShift}>
          {formatCents(line.snapshotPriceCents)} → {formatCents(line.currentPriceCents)}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.statusBody}>The pack price changed.</Text>
        <View style={styles.actions}>
          <PrimaryButton disabled={disabled} label={confirming ?? "Accept"} motion="financial" size="sm" onPress={onAccept} />
          <DestructiveButton disabled={disabled} label={removing} motion="financial" size="sm" onPress={onRemove} />
        </View>
      </StatusBlock>
    );
  }
  if (line.state === "PARTIALLY_AVAILABLE") {
    return (
      <StatusBlock
        icon="alert-circle-outline"
        title={`Only ${line.availableQuantity.toString()} are available. This line is unchanged.`}
        tone={colors.status.warning}
      >
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.statusBody}>
          Remove it, then reserve {line.availableQuantity.toString()} from the shelf.
        </Text>
        <DestructiveButton disabled={disabled} label={removing} motion="financial" size="sm" onPress={onRemove} />
      </StatusBlock>
    );
  }
  if (line.state === "SOLD_OUT") {
    return (
      <StatusBlock icon="close-circle-outline" title="That pack is sold out." tone={colors.status.error}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.statusBody}>Remove it from your cart.</Text>
        <DestructiveButton disabled={disabled} label={removing} motion="financial" size="sm" onPress={onRemove} />
      </StatusBlock>
    );
  }
  if (line.expiresAt) {
    return (
      <HoldStatus
        busy={busy}
        disabled={disabled}
        expiresAt={line.expiresAt}
        fetchedAtMs={snapshot.fetchedAtMs}
        serverNow={snapshot.serverNow}
        onRemove={onRemove}
      />
    );
  }
  return <TertiaryButton disabled={disabled} label={removing} motion="financial" size="sm" onPress={onRemove} />;
}

function HoldStatus({
  expiresAt,
  serverNow,
  fetchedAtMs,
  busy,
  disabled,
  onRemove,
}: {
  expiresAt: string;
  serverNow: string;
  fetchedAtMs: number;
  busy: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expiring = isHoldExpiring(expiresAt, serverNow, fetchedAtMs, nowMs);
  const hold = remainingLabel(expiresAt, serverNow, fetchedAtMs, nowMs);
  return (
    <StatusBlock
      icon="time-outline"
      title={expiring ? "Expiring" : "Reserved"}
      tone={expiring ? colors.status.warning : colors.status.info}
    >
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.countdown}>{hold}</Text>
      <TertiaryButton disabled={disabled} label={busy ? "Removing…" : "Remove"} motion="financial" size="sm" onPress={onRemove} />
    </StatusBlock>
  );
}

function StatusBlock({
  icon,
  title,
  tone,
  children,
}: {
  icon: IconName;
  title: string;
  tone: Tone;
  children?: ReactNode;
}) {
  return (
    <InlineStatusCard enterFade icon={icon} title={title} tone={tone}>
      {children}
    </InlineStatusCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  art: {
    borderRadius: radius.sm,
    width: 72,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
  kicker: {
    ...typography.label,
    color: colors.textTertiary,
  },
  name: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  priceLine: {
    ...typography.money,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  amount: {
    ...typography.moneySmall,
    color: colors.textSecondary,
  },
  statusBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  countdown: {
    ...typography.countdown,
    color: colors.textPrimary,
  },
  priceShift: {
    ...typography.money,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
