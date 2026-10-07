import type { ReactNode } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCartCount } from "../features/cart/useCartCount";
import { useWalletBalance } from "../features/wallet/useWalletBalance";
import type { AppStackParamList } from "../navigation/types";
import { colors, layout, maxFontScale, radius, spacing, typography } from "../theme";
import { formatCents } from "../utils/money";
import { IconButton } from "./buttons";
import { CountBadge } from "./CountBadge";
import { Icon, iconSlot } from "./Icon";

export type AppHeaderProps = {
  /** Screen title. Ignored when `logo` is set. */
  title?: string;
  /** GrailHaus wordmark on the left instead of a title. */
  logo?: boolean;
  /** Shows a back control. `true` goes back in the stack. A function overrides it. */
  back?: boolean | (() => void);
  /** Back control style. "close" suits full-screen flows such as the reveal. */
  backKind?: "back" | "close";
  backLabel?: string;
  /** Live wallet balance chip. Opens the wallet. */
  wallet?: boolean;
  /** Cart button with a line-count badge. Opens the cart. */
  cart?: boolean;
  /** Present only once there is a notification model. */
  notifications?: { count: number; onPress: () => void };
  /** Extra screen-specific controls, placed before the wallet and cart. */
  actions?: ReactNode;
};

export function AppHeader({
  title,
  logo = false,
  back,
  backKind = "back",
  backLabel,
  wallet = false,
  cart = false,
  notifications,
  actions,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  const goBack = () => {
    if (typeof back === "function") {
      back();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("Tabs", { screen: "Home" });
  };

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.xs }]}>
      <View style={styles.leading}>
        {back ? (
          <IconButton
            accessibilityLabel={backLabel ?? (backKind === "close" ? "Close" : "Back")}
            icon={iconSlot(backKind === "close" ? "close" : "chevron-back", 24)}
            onPress={goBack}
          />
        ) : null}
        {logo ? (
          <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.display} style={styles.wordmark}>
            Grail<Text style={styles.wordmarkAccent}>Haus</Text>
          </Text>
        ) : title ? (
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={maxFontScale.display}
            numberOfLines={1}
            style={[styles.title, back ? styles.titleAfterBack : null]}
          >
            {title}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {actions}
        {wallet ? <WalletChip /> : null}
        {notifications ? (
          <BadgedIconButton
            count={notifications.count}
            icon="notifications-outline"
            label={notifications.count > 0 ? `Notifications, ${notifications.count} new` : "Notifications"}
            onPress={notifications.onPress}
          />
        ) : null}
        {cart ? <CartButton /> : null}
      </View>
    </View>
  );
}

function WalletChip() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const balance = useWalletBalance();
  const amount = balance.data !== undefined ? formatCents(balance.data) : null;
  const label = amount
    ? `Wallet balance ${amount}. Open wallet`
    : balance.isError
      ? "Wallet. Balance unavailable. Open wallet"
      : "Wallet. Loading balance. Open wallet";

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={() => navigation.navigate("Wallet")}
      style={({ pressed }) => [styles.walletChip, pressed ? styles.walletChipPressed : null]}
    >
      <Icon color={colors.textSecondary} name="wallet-outline" size={16} />
      <Text maxFontSizeMultiplier={maxFontScale.display} numberOfLines={1} style={styles.walletAmount}>
        {amount ?? "—"}
      </Text>
    </Pressable>
  );
}

function CartButton() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const count = useCartCount() ?? 0;
  return (
    <BadgedIconButton
      count={count}
      icon="bag-outline"
      label={count === 0 ? "Cart, empty" : count === 1 ? "Cart, 1 item" : `Cart, ${count} items`}
      onPress={() => navigation.navigate("Cart")}
    />
  );
}

function BadgedIconButton({
  icon,
  label,
  count,
  onPress,
}: {
  icon: Parameters<typeof iconSlot>[0];
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <View>
      <IconButton accessibilityLabel={label} icon={iconSlot(icon, 22)} onPress={onPress} />
      <CountBadge count={count} style={styles.badge} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: 56,
    paddingBottom: spacing.xs,
    paddingHorizontal: layout.screenPadding,
  },
  leading: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    minHeight: layout.minTouchTarget,
  },
  trailing: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: spacing.xs,
  },
  wordmark: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  wordmarkAccent: {
    color: colors.accent.solid,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  titleAfterBack: {
    marginLeft: spacing.xs,
  },
  walletChip: {
    alignItems: "center",
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs + 2,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.md,
  },
  walletChipPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  walletAmount: {
    ...typography.moneySmall,
    color: colors.textPrimary,
  },
  badge: {
    position: "absolute",
    right: 2,
    top: 2,
  },
});
