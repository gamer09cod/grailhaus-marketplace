import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "../../components/AppHeader";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { PrimaryButton, SecondaryButton } from "../../components/buttons";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, maxFontScale, spacing, typography } from "../../theme";
import { centsFromWire, formatCents } from "../../utils/money";
import { CartSummary } from "./CartSummary";
import type { OrderSummaryLine } from "./orderSummary";

export function OrderSummaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "OrderSummary">>();
  const insets = useSafeAreaInsets();
  const order = route.params;
  const totalCents = centsFromWire(order.totalCents);
  const balanceCents = centsFromWire(order.balanceCents);
  const packCents = centsFromWire(order.packCents);
  const marketCents = centsFromWire(order.marketCents);
  const sealed = order.sealedPackIds;
  const delivered = order.deliveredPackCount;
  const listings = order.listingCount;
  const count = order.lines.length;
  const statusBody = statusCopy(sealed.length, delivered, listings);

  return (
    <View style={styles.screen}>
      <AppHeader
        back={() => navigation.navigate("Tabs", { screen: "Home" })}
        title="Order summary"
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.xxl },
        ]}
        style={styles.scroll}
      >
        <InlineStatusCard
          body={statusBody}
          icon="checkmark-circle"
          title={`Paid ${formatCents(totalCents)}.`}
          tone="success"
        />

        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.count}>
          {count === 1 ? "1 item" : `${count} items`}
        </Text>
        <View style={styles.list}>
          {order.lines.map((item) => (
            <OrderLineRow key={item.lineId} item={item} />
          ))}
        </View>

        <CartSummary
          after={balanceCents}
          balance={balanceCents}
          marketCents={marketCents}
          packCents={packCents}
          receipt
          short={false}
          totalCents={totalCents}
        />
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {sealed.length > 0 ? (
          <PrimaryButton
            fullWidth
            label={sealed.length === 1 ? "Open pack" : `Open ${sealed.length} packs`}
            motion="financial"
            onPress={() => navigation.replace("Reveal", { purchasedPackIds: sealed })}
          />
        ) : null}
        {delivered > 0 || listings > 0 ? (
          <PrimaryButton
            fullWidth
            label="View Collection"
            motion="financial"
            onPress={() => navigation.navigate("Tabs", { screen: "Portfolio" })}
          />
        ) : null}
        <SecondaryButton
          fullWidth
          label="Done"
          motion="financial"
          onPress={() => navigation.navigate("Tabs", { screen: "Home" })}
        />
      </View>
    </View>
  );
}

function OrderLineRow({ item }: { item: OrderSummaryLine }) {
  const price = centsFromWire(item.priceCents) * BigInt(item.quantity);
  const label = item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name;
  return (
    <View style={styles.row}>
      <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.name}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>
        {formatCents(price)}
      </Text>
    </View>
  );
}

function statusCopy(sealed: number, delivered: number, listings: number): string {
  const parts: string[] = [];
  if (sealed > 0) {
    parts.push(sealed === 1 ? "1 pack is sealed." : `${sealed} packs are sealed.`);
  }
  if (delivered > 0) {
    parts.push(delivered === 1 ? "1 item is in your collection." : `${delivered} items are in your collection.`);
  }
  if (listings > 0) {
    parts.push(listings === 1 ? "1 listing is now yours." : `${listings} listings are now yours.`);
  }
  return parts.length > 0 ? parts.join(" ") : "Your order is complete.";
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.backgroundPrimary,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: layout.sectionGap,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
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
  ctaBar: {
    backgroundColor: colors.backgroundPrimary,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
});
