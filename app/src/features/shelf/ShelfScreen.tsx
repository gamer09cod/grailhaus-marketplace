import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { loadSealedPacks } from "../../api/reveal";
import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { CollectibleArt } from "../../components/CollectibleArt";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { HomeRailSkeleton } from "../../components/Skeleton";
import { PrimaryButton, SecondaryButton, TertiaryButton } from "../../components/buttons";
import { Icon } from "../../components/Icon";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, maxFontScale, radius, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";
import { loadHoldings, type OwnedHolding } from "../collection/inventory";
import { formatSignedCents, portfolioTotals } from "../collection/portfolio";
import type { DropBoard, TimedDrop } from "../drops/board";
import { DropStatus } from "../drops/DropStatus";
import { HeroDropCard } from "../drops/HeroDropCard";
import { otherActiveDrops, pickHeroDrop } from "../drops/select";
import { useDropBoard } from "../drops/useDropBoard";
import { useWalletBalance } from "../wallet/useWalletBalance";
import { HomePackTile } from "./HomePackTile";
import { featuredPacks, loadShelfPacks, rarityLabel, type Rarity, type ShelfPack } from "./packs";
import { timeAgo } from "./timeAgo";
export function ShelfScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const packs = useQuery({ queryKey: ["shelf-packs"], queryFn: loadShelfPacks });
  const drops = useDropBoard();
  const holdings = useQuery({ queryKey: ["holdings"], queryFn: loadHoldings });
  const sealed = useQuery({ queryKey: ["sealed-packs"], queryFn: loadSealedPacks });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
    void queryClient.invalidateQueries({ queryKey: ["drop-board"] });
    void queryClient.invalidateQueries({ queryKey: ["holdings"] });
    void queryClient.invalidateQueries({ queryKey: ["sealed-packs"] });
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
      void queryClient.invalidateQueries({ queryKey: ["sealed-packs"] });
    }, [queryClient]),
  );

  useEffect(() => {
    const stopStock = watchTables("shelf-stock", [{ table: "pack_skus" }], () => {
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
    });
    const stopOwned = watchTables(
      "home-owned",
      [{ table: "owned_items" }, { table: "purchased_packs" }],
      () => {
        void queryClient.invalidateQueries({ queryKey: ["holdings"] });
        void queryClient.invalidateQueries({ queryKey: ["sealed-packs"] });
      },
    );
    return () => {
      stopStock();
      stopOwned();
    };
  }, [queryClient]);

  const board = drops.data;
  const hero = board ? pickHeroDrop(board.drops) : null;
  const moreDrops = board ? otherActiveDrops(board.drops, hero?.dropId ?? null) : [];
  const showcase = packs.data ? showcasePacks(packs.data) : [];
  const recent = (holdings.data ?? []).slice(0, 8);
  const totals = holdings.data && holdings.data.length > 0 ? portfolioTotals(holdings.data) : null;
  const sealedPacks = sealed.data ?? [];
  const refreshing = (packs.isRefetching || drops.isRefetching || holdings.isRefetching || sealed.isRefetching)
    && !packs.isLoading
    && !drops.isLoading;

  const openPack = useCallback((packId: string) => {
    navigation.navigate("PackDetail", { packId });
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <AppHeader cart logo wallet />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent.solid}
            onRefresh={refresh}
          />
        }
        style={styles.screen}
      >
        <ConnectivityBanner offlineDetail="This shelf may be out of date." />

        {packs.isError ? (
          <ErrorState
            body="Check the connection and try again."
            title="The shelf didn't load."
            onRetry={() => void packs.refetch()}
          />
        ) : null}

        {drops.isError ? (
          <ErrorState
            body="Check the connection and try again."
            title="Drops didn't load."
            onRetry={() => void drops.refetch()}
          />
        ) : null}

        {board && (hero || moreDrops.length > 0) ? (
          <Section
            actionLabel="All drops"
            title="Drops"
            onAction={() => navigation.navigate("Drops")}
          >
            {hero ? (
              <HeroDropCard
                board={board}
                drop={hero}
                onPress={() => openPack(hero.packSkuId)}
              />
            ) : null}
            {moreDrops.length > 0 ? (
              <View style={styles.stack}>
                {moreDrops.map((drop) => (
                  <DropRailRow
                    key={drop.dropId}
                    board={board}
                    drop={drop}
                    onPress={() => openPack(drop.packSkuId)}
                  />
                ))}
              </View>
            ) : null}
          </Section>
        ) : drops.isLoading || drops.isError ? null : (
          <Section title="Drops" actionLabel="All drops" onAction={() => navigation.navigate("Drops")}>
            <Text style={styles.muted}>
              {board && board.drops.length === 0
                ? "No timed drops are scheduled."
                : "Timed drops appear here when one is live or starting soon."}
            </Text>
          </Section>
        )}

        <WalletSummary onDeposit={() => navigation.navigate("Wallet")} />

        {sealedPacks.length > 0 ? (
          <ContinueOpening
            count={sealedPacks.length}
            onPress={() => navigation.navigate("Reveal", {
              purchasedPackIds: sealedPacks.map((pack) => pack.purchasedPackId),
            })}
          />
        ) : null}

        {packs.isLoading ? (
          <Section title="Featured packs">
            <ScrollView horizontal contentContainerStyle={styles.rail} showsHorizontalScrollIndicator={false}>
              <HomeRailSkeleton />
            </ScrollView>
          </Section>
        ) : showcase.length > 0 ? (
          <Section
            actionLabel="See all"
            title="Featured packs"
            onAction={() => navigation.navigate("Tabs", { screen: "Packs" })}
          >
            <ScrollView horizontal contentContainerStyle={styles.rail} showsHorizontalScrollIndicator={false}>
              {showcase.map((pack) => (
                <HomePackTile key={pack.id} pack={pack} onOpen={openPack} />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {packs.data && packs.data.length === 0 && !packs.isLoading ? (
          <EmptyState icon="cube-outline" title="Nothing is on the shelf right now." />
        ) : null}

        {recent.length > 0 ? (
          <Section
            actionLabel="Portfolio"
            title="Recent additions"
            onAction={() => navigation.navigate("Tabs", { screen: "Portfolio" })}
          >
            <ScrollView horizontal contentContainerStyle={styles.rail} showsHorizontalScrollIndicator={false}>
              {recent.map((item) => (
                <RecentTile key={item.ownedItemId} item={item} />
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {totals ? (
          <PortfolioSnapshot
            profitCents={totals.profitCents}
            valueCents={totals.valueCents}
            onPress={() => navigation.navigate("Tabs", { screen: "Portfolio" })}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function WalletSummary({ onDeposit }: { onDeposit: () => void }) {
  const balance = useWalletBalance();
  const amount = balance.data !== undefined
    ? formatCents(balance.data)
    : balance.isError
      ? "Unavailable"
      : "—";
  return (
    <View style={styles.wallet}>
      <View style={styles.walletText}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>Balance</Text>
        <Text maxFontSizeMultiplier={maxFontScale.display} numberOfLines={1} style={styles.walletAmount}>
          {amount}
        </Text>
      </View>
      <SecondaryButton label="Deposit" onPress={onDeposit} size="sm" />
    </View>
  );
}

function ContinueOpening({ count, onPress }: { count: number; onPress: () => void }) {
  const label = count === 1 ? "1 pack to open" : `${count} packs to open`;
  return (
    <View style={styles.continue}>
      <Icon color={colors.accent.solid} name="gift-outline" size={22} />
      <View style={styles.continueText}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>Continue opening</Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.muted}>{label}</Text>
      </View>
      <PrimaryButton label={count === 1 ? "Open pack" : "Open packs"} onPress={onPress} size="sm" />
    </View>
  );
}

function PortfolioSnapshot({
  valueCents,
  profitCents,
  onPress,
}: {
  valueCents: bigint;
  profitCents: bigint;
  onPress: () => void;
}) {
  const gain = profitCents >= 0n;
  return (
    <Pressable
      accessibilityLabel={`Portfolio ${formatCents(valueCents)}. All-time P and L ${formatSignedCents(profitCents)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.snapshot, pressed ? styles.pressed : null]}
    >
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>Portfolio</Text>
      <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.walletAmount}>{formatCents(valueCents)}</Text>
      <View style={styles.pnlRow}>
        <Icon
          color={gain ? colors.status.success.solid : colors.status.error.solid}
          name={gain ? "trending-up" : "trending-down"}
          size={16}
        />
        <Text
          maxFontSizeMultiplier={maxFontScale.body}
          style={[styles.pnl, { color: gain ? colors.status.success.solid : colors.status.error.solid }]}
        >
          {formatSignedCents(profitCents)} all time
        </Text>
      </View>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.link}>View Portfolio</Text>
    </Pressable>
  );
}

function DropRailRow({
  drop,
  board,
  onPress,
}: {
  drop: TimedDrop;
  board: DropBoard;
  onPress: () => void;
}) {
  const live = drop.status === "LIVE";
  const spoken = live
    ? `${drop.name}. Live. ${drop.reservable.toString()} remaining`
    : `${drop.name}. Upcoming`;
  return (
    <Pressable
      accessibilityLabel={spoken}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.dropRow, pressed ? styles.pressed : null]}
    >
      <CollectibleArt category={drop.category} height={56} style={styles.dropThumb} title={drop.name} />
      <View style={styles.dropCopy}>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.bodyMedium}>{drop.name}</Text>
        <DropStatus board={board} drop={drop} size="compact" />
      </View>
      <Icon color={colors.textTertiary} name="chevron-forward" size={18} />
    </Pressable>
  );
}

function RecentTile({ item }: { item: OwnedHolding }) {
  const [nowMs] = useState(() => Date.now());
  const rarity = isRarity(item.rarity) ? rarityLabel(item.rarity) : item.rarity;
  return (
    <View style={styles.recent}>
      <CollectibleArt
        category={item.category}
        height={120}
        imageUrl={item.imageUrl}
        title={item.name}
      />
      <View style={styles.recentInfo}>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.bodyMedium}>{item.name}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.muted}>{rarity}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.money}>{formatCents(item.estimatedValueCents)}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.muted}>{timeAgo(item.acquiredAt, nowMs)}</Text>
      </View>
    </View>
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
      {children}
    </View>
  );
}

function showcasePacks(packs: ShelfPack[]): ShelfPack[] {
  const featured = featuredPacks(packs);
  const seen = new Set(featured.map((pack) => pack.id));
  return [...featured, ...packs.filter((pack) => !seen.has(pack.id))];
}

function isRarity(value: string): value is Rarity {
  return value === "COMMON"
    || value === "UNCOMMON"
    || value === "RARE"
    || value === "EPIC"
    || value === "LEGENDARY";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  content: {
    gap: layout.sectionGap,
    paddingBottom: spacing.xxl,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  muted: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  block: {
    gap: spacing.sm,
  },
  wallet: {
    alignItems: "center",
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: spacing.md,
  },
  walletText: {
    flex: 1,
  },
  kicker: {
    ...typography.label,
    color: colors.textTertiary,
  },
  walletAmount: {
    ...typography.money,
    color: colors.textPrimary,
  },
  continue: {
    alignItems: "center",
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  continueText: {
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: layout.minTouchTarget,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rail: {
    gap: spacing.md,
    paddingRight: layout.screenPadding,
  },
  stack: {
    gap: spacing.sm,
  },
  dropRow: {
    alignItems: "center",
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: layout.minTouchTarget,
    padding: spacing.sm,
  },
  dropThumb: {
    borderRadius: radius.sm,
    width: 56,
  },
  dropCopy: {
    flex: 1,
  },
  bodyMedium: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  recent: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
    width: 168,
  },
  recentInfo: {
    gap: spacing.xxs,
    padding: spacing.md,
  },
  money: {
    ...typography.moneySmall,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  snapshot: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: layout.cardPadding,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  pnlRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  pnl: {
    ...typography.bodySmall,
  },
  link: {
    ...typography.bodySmall,
    color: colors.accent.solid,
    marginTop: spacing.sm,
  },
});
