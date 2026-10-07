import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppState,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { loadSealedPacks, type SealedPack } from "../../api/reveal";
import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { AppBottomSheet, SheetOption, SheetTrigger } from "../../components/AppBottomSheet";
import { Chip, ChipGroup } from "../../components/Chip";
import { CollectibleArt } from "../../components/CollectibleArt";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { HoldingGridSkeleton } from "../../components/Skeleton";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, maxFontScale, radius, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { HoldingCard } from "./HoldingCard";
import { loadHoldings, type OwnedHolding } from "./inventory";
import {
  allTimePercentLabel,
  categoryAllocation,
  formatSignedCents,
  portfolioTotals,
  profitCents,
  selectHoldings,
  topGainers,
  type PortfolioFilter,
  type PortfolioSort,
} from "./portfolio";

const filters: { id: PortfolioFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "TRADING_CARD", label: "Cards" },
  { id: "SNEAKER", label: "Sneakers" },
  { id: "WATCH", label: "Watches" },
  { id: "LISTED", label: "Listed" },
];

const sorts: { id: PortfolioSort; label: string }[] = [
  { id: "value", label: "Value" },
  { id: "pnl", label: "P&L" },
  { id: "recent", label: "Recently Acquired" },
];

const emptyHoldings: OwnedHolding[] = [];

export function CollectionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<PortfolioFilter>("ALL");
  const [sort, setSort] = useState<PortfolioSort>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const holdings = useQuery({
    queryKey: ["holdings"],
    queryFn: loadHoldings,
  });
  const sealed = useQuery({
    queryKey: ["sealed-packs"],
    queryFn: loadSealedPacks,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["holdings"] });
    void queryClient.invalidateQueries({ queryKey: ["sealed-packs"] });
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refresh();
      }
    });
    const stop = watchTables(
      "collection",
      [{ table: "owned_items" }, { table: "marketplace_listings" }, { table: "purchased_packs" }],
      refresh,
    );
    return () => {
      appState.remove();
      stop();
    };
  }, [refresh]);

  const items = holdings.data ?? emptyHoldings;
  const visible = useMemo(() => selectHoldings(items, filter, sort), [filter, items, sort]);
  const totals = useMemo(() => (holdings.data ? portfolioTotals(holdings.data) : null), [holdings.data]);
  const paidCents = useMemo(
    () => items.reduce((sum, item) => sum + item.acquisitionPriceCents, 0n),
    [items],
  );
  const allTimePercent = totals ? allTimePercentLabel(totals.valueCents, paidCents) : null;
  const allocation = useMemo(() => categoryAllocation(items), [items]);
  const gainers = useMemo(() => topGainers(items), [items]);
  const openListing = useCallback((ownedItemId: string) => {
    navigation.navigate("Listing", { ownedItemId });
  }, [navigation]);
  const openReveal = useCallback((purchasedPackId: string) => {
    navigation.navigate("Reveal", { purchasedPackIds: [purchasedPackId] });
  }, [navigation]);

  const collectionEmpty = holdings.data !== undefined
    && sealed.data !== undefined
    && holdings.data.length === 0
    && sealed.data.length === 0
    && !holdings.isError
    && !sealed.isError
    && !holdings.isLoading
    && !sealed.isLoading;
  const showFilters = items.length > 0;
  const columnGap = spacing.md;
  const cardWidth = (width - layout.screenPadding * 2 - columnGap) / 2;
  const artHeight = Math.round(cardWidth * 0.72);

  const header = (
    <View style={styles.header}>
      {totals && items.length > 0 ? (
        <View style={styles.summary}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>Portfolio</Text>
          <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.total}>
            {formatCents(totals.valueCents)}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.pnl}>
            {formatSignedCents(totals.profitCents)}
            {allTimePercent ? ` · ${allTimePercent} all-time` : " all-time"}
          </Text>
        </View>
      ) : null}

      {allocation.length > 1 ? (
        <View style={styles.section}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>Category Allocation</Text>
          {allocation.map((row) => (
            <View key={row.category} style={styles.allocRow}>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.allocLabel}>{row.label}</Text>
              <View style={styles.allocTrack}>
                <View
                  style={[
                    styles.allocFill,
                    {
                      backgroundColor: colors.category[row.category].solid,
                      width: `${row.share}%`,
                    },
                  ]}
                />
              </View>
              <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.allocPct}>{row.percentLabel}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {gainers.length > 0 ? (
        <View style={styles.section}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>Top Gainers</Text>
          {gainers.map((holding) => {
            const profit = profitCents(holding.estimatedValueCents, holding.acquisitionPriceCents);
            const percent = allTimePercentLabel(holding.estimatedValueCents, holding.acquisitionPriceCents);
            return (
              <Pressable
                key={holding.ownedItemId}
                accessibilityLabel={`${holding.name}. ${formatSignedCents(profit)}${percent ? `. All-time ${percent}` : ""}`}
                accessibilityRole="button"
                onPress={() => openListing(holding.ownedItemId)}
                style={({ pressed }) => [styles.gainer, pressed ? styles.pressed : null]}
              >
                <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.gainerName}>
                  {holding.name}
                </Text>
                <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.gainerPnl}>
                  {formatSignedCents(profit)}{percent ? ` · ${percent}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {sealed.data && sealed.data.length > 0 ? (
        <View style={styles.section}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>To open</Text>
          {sealed.data.map((pack) => (
            <SealedRow key={pack.purchasedPackId} pack={pack} onPress={() => openReveal(pack.purchasedPackId)} />
          ))}
        </View>
      ) : null}

      <ConnectivityBanner offlineDetail="This portfolio may be out of date. Listing and delist stay disabled until the connection returns." />
      {holdings.isLoading || sealed.isLoading ? (
        <HoldingGridSkeleton artHeight={artHeight} width={cardWidth} />
      ) : null}
      {holdings.isError || sealed.isError ? (
        <ErrorState
          body="Check the connection and try again."
          title="Your items didn't load."
          onRetry={() => {
            void holdings.refetch();
            void sealed.refetch();
          }}
        />
      ) : null}
      {collectionEmpty ? (
        <EmptyCollection
          onBrowseMarket={() => navigation.navigate("Tabs", { screen: "Market" })}
          onExplorePacks={() => navigation.navigate("Tabs", { screen: "Packs" })}
        />
      ) : null}
      {holdings.data && holdings.data.length === 0 && (sealed.data?.length ?? 0) > 0 ? (
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>Opened items show up here.</Text>
      ) : null}
      {holdings.data && visible.length === 0 && holdings.data.length > 0 ? (
        <EmptyState icon="albums-outline" title={emptyFilterCopy(filter)} />
      ) : null}
      {visible.length > 0 ? (
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>Collection</Text>
      ) : null}
    </View>
  );

  const renderHolding = useCallback(({ item }: { item: OwnedHolding }) => (
    <HoldingCard
      artHeight={artHeight}
      holding={item}
      width={cardWidth}
      onOpen={openListing}
    />
  ), [artHeight, cardWidth, openListing]);

  return (
    <View style={styles.screen}>
      <AppHeader cart title="Portfolio" />
      {showFilters ? (
        <View style={styles.filters}>
          <ChipGroup accessibilityLabel="Portfolio category">
            {filters.map((chip) => (
              <Chip
                key={chip.id}
                label={chip.label}
                selected={filter === chip.id}
                onPress={() => setFilter(chip.id)}
              />
            ))}
          </ChipGroup>
          <SheetTrigger
            label={`Sort · ${sorts.find((chip) => chip.id === sort)?.label ?? "Recently Acquired"}`}
            onPress={() => setSortOpen(true)}
          />
        </View>
      ) : null}
      <FlatList
        ListHeaderComponent={header}
        columnWrapperStyle={showFilters ? styles.columns : undefined}
        contentContainerStyle={[styles.content, collectionEmpty ? styles.contentEmpty : null]}
        data={visible}
        extraData={`${cardWidth}:${filter}:${sort}`}
        initialNumToRender={8}
        keyExtractor={(holding) => holding.ownedItemId}
        maxToRenderPerBatch={8}
        numColumns={2}
        refreshControl={
          <RefreshControl
            refreshing={(holdings.isRefetching || sealed.isRefetching) && !holdings.isLoading && !sealed.isLoading}
            tintColor={colors.accent.solid}
            onRefresh={() => {
              void holdings.refetch();
              void sealed.refetch();
            }}
          />
        }
        removeClippedSubviews={Platform.OS !== "web"}
        renderItem={renderHolding}
        style={styles.screen}
        windowSize={7}
      />
      <AppBottomSheet title="Sort" visible={sortOpen} onClose={() => setSortOpen(false)}>
        {sorts.map((chip) => (
          <SheetOption
            key={chip.id}
            label={chip.label}
            selected={sort === chip.id}
            onPress={() => {
              setSort(chip.id);
              setSortOpen(false);
            }}
          />
        ))}
      </AppBottomSheet>
    </View>
  );
}

function SealedRow({ pack, onPress }: { pack: SealedPack; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`${pack.name}. Sealed. ${pack.tier}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sealed, pressed ? styles.pressed : null]}
    >
      <CollectibleArt category="TRADING_CARD" height={56} style={styles.sealedArt} title={pack.name} />
      <View style={styles.sealedCopy}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sealedKicker}>
          {categoryLabel("TRADING_CARD")}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.gainerName}>{pack.name}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>{pack.tier} · Sealed</Text>
      </View>
    </Pressable>
  );
}

function EmptyCollection({
  onExplorePacks,
  onBrowseMarket,
}: {
  onExplorePacks: () => void;
  onBrowseMarket: () => void;
}) {
  return (
    <EmptyState
      body="Open your first pack or purchase a collectible from the market."
      illustration={
        <View style={styles.emptyStage}>
          <CollectibleArt category="TRADING_CARD" height={88} style={styles.emptyTile} title="Cards" />
          <CollectibleArt category="SNEAKER" height={88} style={styles.emptyTile} title="Sneakers" />
          <CollectibleArt category="WATCH" height={88} style={styles.emptyTile} title="Watches" />
        </View>
      }
      primaryAction={{ label: "Explore Packs", onPress: onExplorePacks }}
      secondaryAction={{ label: "Browse Market", onPress: onBrowseMarket }}
      title="Start your collection"
    />
  );
}
function emptyFilterCopy(filter: PortfolioFilter): string {
  if (filter === "TRADING_CARD") {
    return "Nothing in Cards is in your portfolio.";
  }
  if (filter === "SNEAKER") {
    return "Nothing in Sneakers is in your portfolio.";
  }
  if (filter === "WATCH") {
    return "Nothing in Watches is in your portfolio.";
  }
  if (filter === "LISTED") {
    return "None of your items are listed.";
  }
  return "You don't own any items yet.";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  filters: {
    gap: spacing.xs,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xs,
  },
  header: {
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  summary: {
    gap: spacing.xs,
  },
  kicker: {
    ...typography.label,
    color: colors.textTertiary,
  },
  total: {
    ...typography.moneyLarge,
    color: colors.textPrimary,
  },
  pnl: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  allocRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  allocLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    width: 88,
  },
  allocTrack: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.full,
    flex: 1,
    height: 6,
    overflow: "hidden",
  },
  allocFill: {
    borderRadius: radius.full,
    height: 6,
  },
  allocPct: {
    ...typography.moneySmall,
    color: colors.textPrimary,
    minWidth: 48,
    textAlign: "right",
  },
  gainer: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.xs,
  },
  gainerName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  gainerPnl: {
    ...typography.moneySmall,
    color: colors.textSecondary,
  },
  sealed: {
    alignItems: "center",
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    overflow: "hidden",
    padding: spacing.sm,
  },
  sealedArt: {
    borderRadius: radius.sm,
    width: 56,
  },
  sealedCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  sealedKicker: {
    ...typography.label,
    color: colors.textTertiary,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  status: {
    gap: spacing.sm,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  contentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  columns: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  emptyStage: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  emptyTile: {
    flex: 1,
    minWidth: 0,
  },
});
