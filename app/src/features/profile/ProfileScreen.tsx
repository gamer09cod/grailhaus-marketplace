import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { supabase } from "../../api/supabase";
import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { SecondaryButton } from "../../components/buttons";
import { Icon, iconSlot, type IconName } from "../../components/Icon";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, maxFontScale, radius, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";
import { useAuth } from "../auth/AuthProvider";
import { loadHoldings, type OwnedHolding } from "../collection/inventory";
import { portfolioTotals } from "../collection/portfolio";
import { loadHapticsEnabled, saveHapticsEnabled } from "../reveal/haptics";
import { useWalletBalance } from "../wallet/useWalletBalance";
import { loadUsername } from "./identity";

const appVersion = "1.0.0";
const emptyHoldings: OwnedHolding[] = [];

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const email = session?.user.email ?? "";
  const balance = useWalletBalance();
  const [hapticsOn, setHapticsOn] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  // The server rejects QA and admin calls from anyone else; this only hides the entry points.
  const reviewer = __DEV__ || email.endsWith("@grailhaus.test");

  const profile = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => loadUsername(userId),
    enabled: userId.length > 0,
  });
  const holdings = useQuery({
    queryKey: ["holdings"],
    queryFn: loadHoldings,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    void queryClient.invalidateQueries({ queryKey: ["holdings"] });
    void queryClient.invalidateQueries({ queryKey: ["wallet", userId] });
  }, [queryClient, userId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const stop = watchTables(
      "profile",
      [{ table: "owned_items" }, { table: "marketplace_listings" }],
      refresh,
    );
    return () => {
      stop();
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void loadHapticsEnabled().then((enabled) => {
      if (!cancelled) {
        setHapticsOn(enabled);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleHaptics(next: boolean) {
    setHapticsOn(next);
    void saveHapticsEnabled(next);
  }

  async function signOut() {
    setSigningOut(true);
    setSignOutFailed(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      setSignOutFailed(true);
    }
  }

  const items = holdings.data ?? emptyHoldings;
  const listedCount = useMemo(() => items.filter((item) => item.state === "LISTED").length, [items]);
  const portfolioValue = useMemo(
    () => (holdings.data ? portfolioTotals(holdings.data).valueCents : null),
    [holdings.data],
  );

  const balanceLabel = balance.data !== undefined
    ? formatCents(balance.data)
    : balance.isError
      ? "Unavailable"
      : "—";
  const portfolioLabel = portfolioValue !== null
    ? formatCents(portfolioValue)
    : holdings.isError
      ? "Unavailable"
      : "—";
  const listingsLabel = holdings.data !== undefined ? String(listedCount) : "—";

  return (
    <View style={styles.screen}>
      <AppHeader title="Profile" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={(holdings.isRefetching || balance.isRefetching) && !holdings.isLoading && !balance.isLoading}
            tintColor={colors.accent.solid}
            onRefresh={refresh}
          />
        }
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Icon color={colors.textSecondary} name="person" size={24} />
          </View>
          <View style={styles.identityText}>
            <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.email}>
              {email || "Unknown account"}
            </Text>
            {profile.data ? (
              <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.handle}>
                @{profile.data}
              </Text>
            ) : null}
          </View>
        </View>

        <ConnectivityBanner offlineDetail="This account may be out of date." />

        <View style={styles.summary}>
          <Stat
            label="Balance"
            value={balanceLabel}
            onPress={() => navigation.navigate("Wallet")}
          />
          <Stat
            label="Portfolio"
            value={portfolioLabel}
            onPress={() => navigation.navigate("Tabs", { screen: "Portfolio" })}
          />
          <Stat
            label="Listings"
            value={listingsLabel}
            onPress={() => navigation.navigate("Tabs", { screen: "Portfolio" })}
          />
        </View>

        <Section title="Account">
          <Row
            detail={balance.data !== undefined ? formatCents(balance.data) : balance.isError ? "Balance unavailable" : "Loading balance"}
            detailIsMoney={balance.data !== undefined}
            icon="wallet-outline"
            label="Wallet"
            onPress={() => navigation.navigate("Wallet")}
          />
          <Row
            detail="Deposits, purchases, and sales"
            icon="swap-vertical-outline"
            label="Activity"
            onPress={() => navigation.navigate("Activity")}
          />
          <Row
            detail="Packs and listings you bought"
            icon="receipt-outline"
            label="Purchases"
            onPress={() => navigation.navigate("Purchases")}
          />
          <Row
            detail={holdings.data ? listingsCopy(listedCount) : "Items you have for sale"}
            icon="pricetags-outline"
            label="Listings"
            onPress={() => navigation.navigate("Tabs", { screen: "Portfolio" })}
          />
        </Section>

        <Section title="Settings">
          <View style={styles.row}>
            <Icon color={colors.textSecondary} name="phone-portrait-outline" size={22} />
            <View style={styles.rowText}>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.rowLabel}>Haptics</Text>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.rowDetail}>
                Vibration during pack opening. Card details always stay on screen.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Haptics"
              accessibilityState={{ checked: hapticsOn }}
              ios_backgroundColor={colors.surfacePressed}
              thumbColor={colors.textPrimary}
              trackColor={{ false: colors.surfacePressed, true: colors.accent.fill }}
              value={hapticsOn}
              onValueChange={toggleHaptics}
            />
          </View>
        </Section>

        <Section title="Help">
          <Row
            detail="How buying, selling, and the wallet work"
            icon="help-circle-outline"
            label="Support"
            onPress={() => navigation.navigate("Support")}
          />
        </Section>

        {reviewer ? (
          <Section title="Reviewer tools">
            <Row
              detail="Simulate other buyers, drops, and listings"
              icon="construct-outline"
              label="QA tools"
              onPress={() => navigation.navigate("Qa")}
            />
            <Row
              detail="Revenue, payout, and margin"
              icon="stats-chart-outline"
              label="Admin numbers"
              onPress={() => navigation.navigate("Admin")}
            />
          </Section>
        ) : null}

        <View style={styles.signOut}>
          <SecondaryButton
            fullWidth
            icon={iconSlot("log-out-outline")}
            label="Sign out"
            loading={signingOut}
            loadingLabel="Signing out…"
            onPress={() => void signOut()}
          />
          {signOutFailed ? (
            <Text style={styles.error}>Sign out did not finish. Check the connection and try again.</Text>
          ) : null}
        </View>

        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.version}>Version {appVersion}</Text>
      </ScrollView>
    </View>
  );
}

function listingsCopy(count: number): string {
  if (count === 1) {
    return "1 item listed";
  }
  return `${count} items listed`;
}

function Stat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}. ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.stat, pressed ? styles.statPressed : null]}
    >
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.statLabel}>{label}</Text>
      <Text maxFontSizeMultiplier={maxFontScale.display} numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  detail,
  detailIsMoney = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  detail: string;
  detailIsMoney?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}. ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <Icon color={colors.textSecondary} name={icon} size={22} />
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.rowLabel}>{label}</Text>
        <Text
          maxFontSizeMultiplier={maxFontScale.body}
          numberOfLines={2}
          style={detailIsMoney ? styles.rowMoney : styles.rowDetail}
        >
          {detail}
        </Text>
      </View>
      <Icon color={colors.textTertiary} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  identity: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.full,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  email: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  handle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  summary: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: layout.sectionGap,
    overflow: "hidden",
  },
  stat: {
    flex: 1,
    gap: spacing.xxs,
    minHeight: 64,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  statPressed: {
    backgroundColor: colors.surfacePressed,
  },
  statLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  statValue: {
    ...typography.moneySmall,
    color: colors.textPrimary,
  },
  section: {
    marginTop: layout.sectionGap,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  group: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  rowDetail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  rowMoney: {
    ...typography.moneySmall,
    color: colors.textSecondary,
  },
  signOut: {
    marginTop: layout.sectionGapLarge,
  },
  error: {
    ...typography.bodySmall,
    color: colors.status.error.solid,
    marginTop: spacing.sm,
  },
  version: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
