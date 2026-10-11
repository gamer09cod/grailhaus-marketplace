import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Platform, RefreshControl, StyleSheet, useWindowDimensions, View } from "react-native";

import { AppBottomSheet, SheetOption, SheetTrigger } from "../../components/AppBottomSheet";
import { Chip, ChipGroup } from "../../components/Chip";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { PackListSkeleton } from "../../components/Skeleton";
import { TertiaryButton } from "../../components/buttons";
import type { AppStackParamList, PackCategory } from "../../navigation/types";
import { catalogGrid, catalogTileMetrics, colors, layout, spacing, typography } from "../../theme";
import type { TimedDrop } from "../drops/board";
import { useDropBoard } from "../drops/useDropBoard";
import { PackCard, type PackCardBadge } from "./PackCard";
import {
  loadShelfCatalogItems,
  loadShelfPacks,
  packTierClass,
  packTierClassLabel,
  rarityLabel,
  stockLabel,
  type PackTierClass,
  type ShelfCatalogItem,
  type ShelfPack,
} from "./packs";

export type PacksCategoryFilter = "ALL" | PackCategory | "DROPS";

const categoryChips: { id: PacksCategoryFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "TRADING_CARD", label: "Cards" },
  { id: "SNEAKER", label: "Sneakers" },
  { id: "WATCH", label: "Watches" },
  { id: "DROPS", label: "Drops" },
];

const tierChips: { id: PackTierClass; label: string }[] = [
  { id: "entry", label: packTierClassLabel("entry") },
  { id: "premium", label: packTierClassLabel("premium") },
  { id: "grail", label: packTierClassLabel("grail") },
];

const emptyPacks: ShelfPack[] = [];
const emptyItems: ShelfCatalogItem[] = [];
const emptyDrops: TimedDrop[] = [];

export function PackBrowser({ initialCategory = "ALL" }: { initialCategory?: PacksCategoryFilter }) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  const { width: cardWidth, artHeight, gap } = catalogTileMetrics(windowWidth);
  const [category, setCategory] = useState<PacksCategoryFilter>(initialCategory);
  const [tier, setTier] = useState<PackTierClass | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const packs = useQuery({ queryKey: ["shelf-packs"], queryFn: loadShelfPacks });
  const catalogItems = useQuery({ queryKey: ["shelf-catalog-items"], queryFn: loadShelfCatalogItems });
  const drops = useDropBoard();

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
      void queryClient.invalidateQueries({ queryKey: ["shelf-catalog-items"] });
    }, [queryClient]),
  );

  const rows = useMemo(
    () => visibleRows(
      category,
      tier,
      packs.data ?? emptyPacks,
      catalogItems.data ?? emptyItems,
      drops.data?.drops ?? emptyDrops,
    ),
    [catalogItems.data, category, drops.data?.drops, packs.data, tier],
  );
  const loading = packs.isLoading
    || catalogItems.isLoading
    || (category === "DROPS" && drops.isLoading);
  const empty = !loading && rows.length === 0;
  const refreshing = (packs.isRefetching || catalogItems.isRefetching || drops.isRefetching)
    && !packs.isLoading
    && !catalogItems.isLoading
    && !drops.isLoading;

  const openRow = useCallback((row: BrowseRow) => {
    if (row.kind === "item") {
      navigation.navigate("Tabs", { screen: "Market", params: { category: row.category } });
      return;
    }
    navigation.navigate("PackDetail", { packId: row.packId });
  }, [navigation]);

  const renderRow = useCallback(({ item }: { item: BrowseRow }) => (
    <PackCard
      artHeight={artHeight}
      availability={item.availability}
      badges={item.badges}
      category={item.category}
      imageUrl={item.imageUrl}
      name={item.name}
      packId={item.id}
      priceCents={item.priceCents}
      tier={item.tier}
      width={cardWidth}
      onOpen={() => openRow(item)}
    />
  ), [artHeight, cardWidth, openRow]);

  const listHeader = (
    <View style={styles.header}>
      <ConnectivityBanner offlineDetail="This shelf may be out of date." />
      {packs.isError ? (
        <ErrorState
          body="Check the connection and try again."
          title="These packs didn't load."
          onRetry={() => void packs.refetch()}
        />
      ) : null}
      {category === "DROPS" && drops.isError ? (
        <ErrorState
          body="Check the connection and try again."
          title="Drops didn't load."
          onRetry={() => void drops.refetch()}
        />
      ) : null}
      {loading ? (
        <PackListSkeleton artHeight={artHeight} width={cardWidth} />
      ) : null}
      {empty ? (
        <EmptyState icon="cube-outline" title={emptyCopy(category, tier)} />
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.filters}>
        <ChipGroup accessibilityLabel="Category">
          {categoryChips.map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              selected={category === chip.id}
              onPress={() => setCategory(chip.id)}
            />
          ))}
        </ChipGroup>
        <SheetTrigger
          label={tier ? `Filters · ${packTierClassLabel(tier)}` : "Filters"}
          onPress={() => setFiltersOpen(true)}
        />
      </View>
      <FlatList
        ListHeaderComponent={listHeader}
        columnWrapperStyle={[styles.columns, { gap }]}
        contentContainerStyle={styles.content}
        data={empty || loading ? [] : rows}
        extraData={`${cardWidth}`}
        initialNumToRender={9}
        keyExtractor={(row) => row.id}
        maxToRenderPerBatch={9}
        numColumns={catalogGrid.columns}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent.solid}
            onRefresh={() => {
              void packs.refetch();
              void catalogItems.refetch();
              void drops.refetch();
            }}
          />
        }
        removeClippedSubviews={Platform.OS !== "web"}
        renderItem={renderRow}
        style={styles.screen}
        windowSize={7}
      />
      <AppBottomSheet
        title="Filters"
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        footer={
          tier ? (
            <TertiaryButton
              fullWidth
              label="Clear filters"
              onPress={() => {
                setTier(null);
                setFiltersOpen(false);
              }}
            />
          ) : null
        }
      >
        <SheetOption
          label="Any price"
          selected={tier === null}
          onPress={() => {
            setTier(null);
            setFiltersOpen(false);
          }}
        />
        {tierChips.map((chip) => (
          <SheetOption
            key={chip.id}
            label={chip.label}
            selected={tier === chip.id}
            onPress={() => {
              setTier(chip.id);
              setFiltersOpen(false);
            }}
          />
        ))}
      </AppBottomSheet>
    </View>
  );
}

type BrowseRow = {
  kind: "pack" | "item";
  id: string;
  packId: string;
  category: PackCategory;
  name: string;
  tier: string;
  priceCents: bigint;
  availability: string;
  badges: PackCardBadge[];
  imageUrl?: string | null;
};

function visibleRows(
  category: PacksCategoryFilter,
  tier: PackTierClass | null,
  packs: ShelfPack[],
  items: ShelfCatalogItem[],
  drops: TimedDrop[],
): BrowseRow[] {
  if (category === "DROPS") {
    return drops.filter(dropIsBrowsable).map(dropRow).filter((row) => matchesTier(row, tier));
  }

  // Cards stay as pack SKUs; sneakers/watches surface as catalog products with item art.
  const packRows = packs
    .filter((pack) => pack.category === "TRADING_CARD")
    .filter((pack) => category === "ALL" || category === "TRADING_CARD")
    .map(shelfPackRow);

  const itemRows = items
    .filter((item) => category === "ALL" || item.category === category)
    .map(catalogItemRow);

  return [...packRows, ...itemRows].filter((row) => matchesTier(row, tier));
}

function matchesTier(row: BrowseRow, tier: PackTierClass | null): boolean {
  if (!tier) {
    return true;
  }
  return packTierClass(row.priceCents) === tier;
}

function shelfPackRow(pack: ShelfPack): BrowseRow {
  return {
    kind: "pack",
    id: `pack:${pack.id}`,
    packId: pack.id,
    category: pack.category,
    name: pack.name,
    tier: pack.tier,
    priceCents: pack.priceCents,
    availability: stockLabel(pack.reservable),
    badges: pack.reservable <= 0n ? ["SOLD_OUT"] : [],
  };
}

function catalogItemRow(item: ShelfCatalogItem): BrowseRow {
  return {
    kind: "item",
    id: `item:${item.id}`,
    packId: item.id,
    category: item.category,
    name: item.name,
    tier: rarityLabel(item.rarity),
    priceCents: item.valueCents,
    availability: "Catalog",
    badges: [],
    imageUrl: item.imageUrl,
  };
}

function dropRow(drop: TimedDrop): BrowseRow {
  const badges: PackCardBadge[] = [];
  if (drop.status === "LIVE") {
    badges.push("LIVE");
  } else {
    badges.push("DROP");
  }
  if (drop.status === "SOLD_OUT") {
    badges.push("SOLD_OUT");
  }
  return {
    kind: "pack",
    id: `drop:${drop.dropId}`,
    packId: drop.packSkuId,
    category: drop.category,
    name: drop.name,
    tier: drop.tier,
    priceCents: drop.priceCents,
    availability: dropAvailability(drop),
    badges,
  };
}

function dropIsBrowsable(drop: TimedDrop): boolean {
  return drop.status === "LIVE" || drop.status === "UPCOMING" || drop.status === "SOLD_OUT";
}

function dropAvailability(drop: TimedDrop): string {
  if (drop.status === "LIVE") {
    return `${drop.reservable.toString()} remaining`;
  }
  if (drop.status === "SOLD_OUT") {
    return "Sold out";
  }
  return stockLabel(drop.reservable);
}

function emptyCopy(category: PacksCategoryFilter, tier: PackTierClass | null): string {
  if (category === "DROPS" && !tier) {
    return "No timed drops are scheduled.";
  }
  if (tier) {
    return "Nothing matches those filters.";
  }
  if (category === "SNEAKER") {
    return "No sneakers are in the catalog.";
  }
  if (category === "WATCH") {
    return "No watches are in the catalog.";
  }
  if (category === "TRADING_CARD") {
    return "No card packs are on the shelf.";
  }
  return "Nothing is on the shelf right now.";
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
    gap: spacing.base,
    marginBottom: spacing.base,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  columns: {
    marginBottom: catalogGrid.gap,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  status: {
    gap: spacing.sm,
  },
});
