import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { supabase } from "../../api/supabase";
import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { CollectibleArt } from "../../components/CollectibleArt";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { SecondaryButton, TertiaryButton } from "../../components/buttons";
import { Icon, iconSlot, type IconName } from "../../components/Icon";
import type { AppStackParamList } from "../../navigation/types";
import {
  colors,
  layout,
  maxFontScale,
  radius,
  spacing,
  typography,
  useContentBottomPadding,
  usePressMotion,
} from "../../theme";
import { formatCents } from "../../utils/money";
import { useAuth } from "../auth/AuthProvider";
import { loadHoldings, type OwnedHolding } from "../collection/inventory";
import {
  formatSignedCents,
  portfolioTotals,
} from "../collection/portfolio";
import { isRarity, rarityLabel, rarityOrder, type Rarity } from "../shelf/packs";
import { loadHapticsEnabled, saveHapticsEnabled } from "../reveal/haptics";
import { useWalletBalance } from "../wallet/useWalletBalance";
import { loadUsername } from "./identity";

const appVersion = "1.0.0";
const emptyHoldings: OwnedHolding[] = [];
const previewLimit = 5;

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const contentBottom = useContentBottomPadding(spacing.xxl);
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
  const totals = useMemo(
    () => (holdings.data ? portfolioTotals(holdings.data) : null),
    [holdings.data],
  );
  const rarityCounts = useMemo(() => countByRarity(items), [items]);
  const preview = useMemo(() => items.slice(0, previewLimit), [items]);

  const username = publicUsername(profile.data, userId);
  const displayName =
    username
    ?? ((email.includes("@") ? email.split("@")[0]! : email) || "Collector");
  const balanceLabel = balance.data !== undefined
    ? formatCents(balance.data)
    : balance.isError
      ? "Unavailable"
      : "—";
  const portfolioLabel = totals !== null
    ? formatCents(totals.valueCents)
    : holdings.isError
      ? "Unavailable"
      : "—";
  const listingsLabel = holdings.data !== undefined ? String(listedCount) : "—";
  const pnlLabel = totals !== null ? formatSignedCents(totals.profitCents) : null;
  const pnlUp = totals !== null && totals.profitCents >= 0n;

  const openCollection = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Portfolio" });
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <AppHeader title="Profile" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={(holdings.isRefetching || balance.isRefetching) && !holdings.isLoading && !balance.isLoading}
            tintColor={colors.accent.solid}
            onRefresh={refresh}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.identity}>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.avatarMark}>
                  {initials(displayName)}
                </Text>
              </View>
            </View>
            <View style={styles.identityText}>
              <Text maxFontSizeMultiplier={maxFontScale.display} numberOfLines={1} style={styles.displayName}>
                {displayName}
              </Text>
              <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.email}>
                {email || "Unknown account"}
              </Text>
              <View style={styles.identityMeta}>
                {username ? (
                  <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.handle}>
                    @{username}
                  </Text>
                ) : null}
                {reviewer ? (
                  <View style={styles.collectorBadge}>
                    <Icon color={colors.premium.gold} name="diamond-outline" size={12} />
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.collectorBadgeLabel}>
                      Reviewer
                    </Text>
                  </View>
                ) : (
                  <View style={styles.collectorBadgeMuted}>
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.collectorBadgeMutedLabel}>
                      Collector
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        <ConnectivityBanner offlineDetail="This account may be out of date." />

        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.summaryKicker}>
              Portfolio summary
            </Text>
            {pnlLabel ? (
              <Text
                maxFontSizeMultiplier={maxFontScale.body}
                style={[styles.summaryPnl, { color: pnlUp ? colors.status.success.solid : colors.status.error.solid }]}
              >
                {pnlLabel} all time
              </Text>
            ) : null}
          </View>
          <View style={styles.summaryRow}>
            <Stat
              label="Balance"
              value={balanceLabel}
              onPress={() => navigation.navigate("Wallet")}
            />
            <View style={styles.summaryDivider} />
            <Stat
              label="Portfolio"
              value={portfolioLabel}
              onPress={openCollection}
            />
            <View style={styles.summaryDivider} />
            <Stat
              label="Listings"
              value={listingsLabel}
              onPress={openCollection}
            />
          </View>
          {holdings.data !== undefined ? (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.summaryFoot}>
              {items.length === 0
                ? "No collectibles yet"
                : `${items.length} ${items.length === 1 ? "item" : "items"} in collection`}
            </Text>
          ) : null}
        </View>

        <Section
          actionLabel={items.length > 0 ? "View all" : undefined}
          title="Collection"
          onAction={items.length > 0 ? openCollection : undefined}
        >
          {holdings.isLoading && items.length === 0 ? (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.emptyCopy}>
              Loading your collection…
            </Text>
          ) : items.length === 0 ? (
            <View style={styles.emptyCollection}>
              <Icon color={colors.premium.gold} name="albums-outline" size={28} />
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.emptyTitle}>
                Your vault is empty
              </Text>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.emptyCopy}>
                Open a pack or buy from the market to start your collection.
              </Text>
              <TertiaryButton label="Browse packs" onPress={() => navigation.navigate("Tabs", { screen: "Packs" })} />
            </View>
          ) : (
            <View style={styles.collectionBody}>
              <ScrollView
                horizontal
                contentContainerStyle={styles.previewRail}
                showsHorizontalScrollIndicator={false}
              >
                {preview.map((item) => (
                  <Pressable
                    key={item.ownedItemId}
                    accessibilityLabel={`${item.name}. Open collection`}
                    accessibilityRole="button"
                    onPress={openCollection}
                    style={styles.previewTile}
                  >
                    <CollectibleArt
                      category={item.category}
                      fit="contain"
                      height={88}
                      imageUrl={item.imageUrl}
                      style={styles.previewArt}
                      title={item.name}
                    />
                  </Pressable>
                ))}
                {items.length > previewLimit ? (
                  <Pressable
                    accessibilityLabel={`View ${items.length - previewLimit} more in collection`}
                    accessibilityRole="button"
                    onPress={openCollection}
                    style={styles.previewMore}
                  >
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.previewMoreLabel}>
                      +{items.length - previewLimit}
                    </Text>
                  </Pressable>
                ) : null}
              </ScrollView>
              {rarityCounts.length > 0 ? (
                <View style={styles.rarityRow}>
                  {rarityCounts.map((row) => (
                    <View
                      key={row.rarity}
                      style={[styles.rarityChip, { backgroundColor: colors.rarity[row.rarity].muted, borderColor: colors.rarity[row.rarity].border }]}
                    >
                      <Text
                        maxFontSizeMultiplier={maxFontScale.body}
                        style={[styles.rarityChipLabel, { color: colors.rarity[row.rarity].solid }]}
                      >
                        {rarityLabel(row.rarity)} · {row.count}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </Section>

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
            onPress={openCollection}
          />
        </Section>

        <Section title="Settings">
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Icon color={colors.accent.solid} name="phone-portrait-outline" size={20} />
            </View>
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

/** Hide auth/system ids so Profile never shows a raw UUID-style handle. */
function publicUsername(value: string | null | undefined, userId: string): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/^@/, "");
  if (!cleaned) return null;
  const compactUserId = userId.replace(/-/g, "");
  if (cleaned === userId || cleaned === compactUserId) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)) return null;
  if (/^[0-9a-f]{32}$/i.test(cleaned)) return null;
  if (/^u[0-9a-f]{20,}$/i.test(cleaned)) return null;
  return cleaned;
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter((part) => part.length > 0);
  const first = parts[0]?.[0];
  const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
  return `${first ?? "G"}${second ?? "H"}`.toUpperCase();
}

function countByRarity(items: readonly OwnedHolding[]): { rarity: Rarity; count: number }[] {
  const counts = new Map<Rarity, number>();
  for (const item of items) {
    if (!isRarity(item.rarity)) {
      continue;
    }
    counts.set(item.rarity, (counts.get(item.rarity) ?? 0) + 1);
  }
  return rarityOrder
    .filter((rarity) => (counts.get(rarity) ?? 0) > 0)
    .map((rarity) => ({ rarity, count: counts.get(rarity)! }));
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

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>
          {title}
        </Text>
        {actionLabel && onAction ? (
          <TertiaryButton label={actionLabel} onPress={onAction} size="sm" />
        ) : null}
      </View>
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
  const pressMotion = usePressMotion("discovery");
  return (
    <Pressable
      accessibilityLabel={`${label}. ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null, pressMotion(pressed)]}
    >
      <View style={styles.rowIcon}>
        <Icon color={colors.accent.solid} name={icon} size={20} />
      </View>
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
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  hero: {
    marginBottom: spacing.md,
    overflow: "hidden",
    paddingBottom: spacing.sm,
  },
  heroGlow: {
    backgroundColor: colors.premium.goldMuted,
    borderRadius: radius.full,
    height: 160,
    left: -40,
    opacity: 0.9,
    position: "absolute",
    top: -70,
    width: 220,
  },
  identity: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  avatarRing: {
    alignItems: "center",
    backgroundColor: colors.premium.goldMuted,
    borderColor: colors.premium.goldBorder,
    borderRadius: radius.full,
    borderWidth: 1,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
  avatarMark: {
    ...typography.title,
    color: colors.premium.gold,
  },
  identityText: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  displayName: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  email: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  identityMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  handle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  collectorBadge: {
    alignItems: "center",
    backgroundColor: colors.premium.goldMuted,
    borderColor: colors.premium.goldBorder,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  collectorBadgeLabel: {
    ...typography.label,
    color: colors.premium.gold,
    fontSize: 10,
  },
  collectorBadgeMuted: {
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  collectorBadgeMutedLabel: {
    ...typography.label,
    color: colors.accent.solid,
    fontSize: 10,
  },
  summaryCard: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.base,
  },
  summaryTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  summaryKicker: {
    ...typography.label,
    color: colors.textTertiary,
  },
  summaryPnl: {
    ...typography.caption,
  },
  summaryRow: {
    flexDirection: "row",
  },
  summaryDivider: {
    backgroundColor: colors.borderSubtle,
    width: StyleSheet.hairlineWidth,
  },
  summaryFoot: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  stat: {
    flex: 1,
    gap: spacing.xxs,
    minHeight: 56,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statPressed: {
    opacity: 0.85,
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
  sectionHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    minHeight: layout.minTouchTarget,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
  },
  group: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  collectionBody: {
    gap: spacing.md,
    padding: spacing.md,
  },
  previewRail: {
    gap: spacing.sm,
  },
  previewTile: {
    borderColor: colors.borderSubtle,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: "hidden",
    width: 72,
  },
  previewArt: {
    borderRadius: 0,
  },
  previewMore: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderSubtle,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 88,
    justifyContent: "center",
    width: 72,
  },
  previewMoreLabel: {
    ...typography.heading,
    color: colors.accent.solid,
  },
  rarityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  rarityChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  rarityChipLabel: {
    ...typography.label,
    fontSize: 10,
  },
  emptyCollection: {
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.base,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  emptyCopy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    padding: spacing.base,
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
  rowIcon: {
    alignItems: "center",
    backgroundColor: colors.accent.muted,
    borderRadius: radius.sm,
    height: 36,
    justifyContent: "center",
    width: 36,
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
