import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppState,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { AppBottomSheet, SheetOption, SheetTrigger } from "../../components/AppBottomSheet";
import { Chip, ChipGroup } from "../../components/Chip";
import { Icon, iconSlot } from "../../components/Icon";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { MarketGridSkeleton } from "../../components/Skeleton";
import { IconButton, TertiaryButton } from "../../components/buttons";
import type { AppStackParamList, MainTabParamList } from "../../navigation/types";
import { colors, layout, maxFontScale, radius, spacing, typography } from "../../theme";
import { timeAgo } from "../shelf/timeAgo";
import {
  packTierClassLabel,
  rarityLabel,
  rarityOrder,
  type PackTierClass,
  type Rarity,
} from "../shelf/packs";
import { MarketplaceItemCard } from "./MarketplaceItemCard";
import { loadMarket, type MarketListing } from "./board";
import {
  emptyMarketCopy,
  selectListings,
  type MarketCategoryFilter,
  type MarketSort,
} from "./select";

const categoryChips: { id: MarketCategoryFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "TRADING_CARD", label: "Cards" },
  { id: "SNEAKER", label: "Sneakers" },
  { id: "WATCH", label: "Watches" },
];

const priceChips: { id: PackTierClass; label: string }[] = [
  { id: "entry", label: packTierClassLabel("entry") },
  { id: "premium", label: packTierClassLabel("premium") },
  { id: "grail", label: packTierClassLabel("grail") },
];

const sortChips: { id: MarketSort; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "priceAsc", label: "Price: Low" },
  { id: "priceDesc", label: "Price: High" },
];

const emptyListings: MarketListing[] = [];

export function MarketScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<MainTabParamList, "Market">>();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState("");
  const [pickedCategory, setPickedCategory] = useState<MarketCategoryFilter>("ALL");
  const category = route.params?.category ?? pickedCategory;
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [priceBand, setPriceBand] = useState<PackTierClass | null>(null);
  const [belowFmv, setBelowFmv] = useState(false);
  const [sort, setSort] = useState<MarketSort>("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const market = useQuery({
    queryKey: ["market"],
    queryFn: loadMarket,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["market"] });
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function chooseCategory(next: MarketCategoryFilter) {
    setPickedCategory(next);
    if (route.params?.category) {
      navigation.navigate("Tabs", { screen: "Market", params: {} });
    }
  }

  useEffect(() => {
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refresh();
      }
    });
    const stop = watchTables("market-listings", [{ table: "marketplace_listings" }], refresh);
    const clock = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => {
      appState.remove();
      stop();
      clearInterval(clock);
    };
  }, [refresh]);

  const listings = market.data ?? emptyListings;
  const visible = useMemo(
    () => selectListings(listings, { search, category, rarity, priceBand, belowFmv, sort }),
    [belowFmv, category, listings, priceBand, rarity, search, sort],
  );
  const extraFilters = (rarity ? 1 : 0) + (priceBand ? 1 : 0) + (belowFmv ? 1 : 0);
  const sortLabel = sortChips.find((chip) => chip.id === sort)?.label ?? "Recent";
  const showFmvFilter = listings.some((listing) => listing.currentValueCents !== null);
  const columnGap = spacing.md;
  const cardWidth = (width - layout.screenPadding * 2 - columnGap) / 2;
  const artHeight = Math.round(cardWidth);

  const header = (
    <View style={styles.notices}>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
        Listings are not reserved. The seller can still change or remove one.
      </Text>
      <ConnectivityBanner offlineDetail="These listings may be out of date. Adding a listing stays disabled until the connection returns." />
      {market.isLoading ? (
        <MarketGridSkeleton artHeight={artHeight} width={cardWidth} />
      ) : null}
      {market.isError ? (
        <ErrorState
          body="Check the connection and try again."
          title="The market didn't load."
          onRetry={() => void market.refetch()}
        />
      ) : null}
      {market.data && visible.length === 0 ? (
        <EmptyState
          icon="storefront-outline"
          title={emptyMarketCopy(listings, { search, category, rarity, priceBand, belowFmv, sort })}
        />
      ) : null}
    </View>
  );

  const openListing = useCallback((listingId: string) => {
    navigation.navigate("MarketDetail", { listingId });
  }, [navigation]);

  const renderListing = useCallback(({ item }: { item: MarketListing }) => (
    <MarketplaceItemCard
      artHeight={artHeight}
      listedLabel={item.listedAt ? timeAgo(item.listedAt, nowMs) : null}
      listing={item}
      width={cardWidth}
      onOpen={openListing}
    />
  ), [artHeight, cardWidth, nowMs, openListing]);

  return (
    <View style={styles.screen}>
      <AppHeader cart title="Market" />
      <View style={styles.filters}>
        <View style={styles.search}>
          <Icon color={colors.textTertiary} name="search-outline" size={18} />
          <TextInput
            accessibilityLabel="Search listings"
            autoCapitalize="none"
            autoCorrect={false}
            maxFontSizeMultiplier={maxFontScale.body}
            placeholder="Search listings"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <IconButton
              accessibilityLabel="Clear search"
              icon={iconSlot("close-circle", 18)}
              size="sm"
              onPress={() => setSearch("")}
            />
          ) : null}
        </View>
        <ChipGroup accessibilityLabel="Listing category">
          {categoryChips.map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              selected={category === chip.id}
              onPress={() => chooseCategory(chip.id)}
            />
          ))}
        </ChipGroup>
        <View style={styles.toolbar}>
          <SheetTrigger
            label={extraFilters > 0 ? `Filters · ${extraFilters}` : "Filters"}
            onPress={() => setFiltersOpen(true)}
          />
          <SheetTrigger label={`Sort · ${sortLabel}`} onPress={() => setSortOpen(true)} />
        </View>
      </View>
      <FlatList
        ListHeaderComponent={header}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.content}
        data={visible}
        extraData={`${nowMs}:${cardWidth}`}
        initialNumToRender={8}
        keyExtractor={(listing) => listing.listingId}
        maxToRenderPerBatch={8}
        numColumns={2}
        refreshControl={
          <RefreshControl
            refreshing={market.isRefetching && !market.isLoading}
            tintColor={colors.accent.solid}
            onRefresh={() => void market.refetch()}
          />
        }
        removeClippedSubviews={Platform.OS !== "web"}
        renderItem={renderListing}
        style={styles.screen}
        windowSize={7}
      />
      <AppBottomSheet
        title="Filters"
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        footer={
          extraFilters > 0 ? (
            <TertiaryButton
              fullWidth
              label="Clear filters"
              onPress={() => {
                setRarity(null);
                setPriceBand(null);
                setBelowFmv(false);
                setFiltersOpen(false);
              }}
            />
          ) : null
        }
      >
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetKicker}>Rarity</Text>
        <SheetOption
          label="Any rarity"
          selected={rarity === null}
          onPress={() => setRarity(null)}
        />
        {rarityOrder.map((id) => (
          <SheetOption
            key={id}
            label={rarityLabel(id)}
            selected={rarity === id}
            onPress={() => setRarity(id)}
          />
        ))}
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetKicker}>Price</Text>
        <SheetOption
          label="Any price"
          selected={priceBand === null}
          onPress={() => setPriceBand(null)}
        />
        {priceChips.map((chip) => (
          <SheetOption
            key={chip.id}
            label={chip.label}
            selected={priceBand === chip.id}
            onPress={() => setPriceBand(chip.id)}
          />
        ))}
        {showFmvFilter ? (
          <SheetOption
            detail="Listing price is under the catalog estimate"
            label="Below FMV"
            selected={belowFmv}
            onPress={() => setBelowFmv((current) => !current)}
          />
        ) : null}
      </AppBottomSheet>
      <AppBottomSheet title="Sort" visible={sortOpen} onClose={() => setSortOpen(false)}>
        {sortChips.map((chip) => (
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
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sheetKicker: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  search: {
    alignItems: "center",
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: layout.minTouchTarget,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  searchInput: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  notices: {
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  columns: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
});
