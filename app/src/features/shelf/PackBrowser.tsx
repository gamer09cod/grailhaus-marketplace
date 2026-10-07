import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Platform, RefreshControl, StyleSheet, View } from "react-native";

import { AppBottomSheet, SheetOption, SheetTrigger } from "../../components/AppBottomSheet";
import { Chip, ChipGroup } from "../../components/Chip";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { PackListSkeleton } from "../../components/Skeleton";
import { TertiaryButton } from "../../components/buttons";
import type { AppStackParamList, PackCategory } from "../../navigation/types";
import { colors, layout, spacing, typography } from "../../theme";
import type { TimedDrop } from "../drops/board";
import { useDropBoard } from "../drops/useDropBoard";
import { PackCard, type PackCardBadge } from "./PackCard";
import {
  categoryLabel,
  loadShelfPacks,
  packTierClass,
  packTierClassLabel,
  stockLabel,
  type PackTierClass,
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
const emptyDrops: TimedDrop[] = [];

export function PackBrowser({ initialCategory = "ALL" }: { initialCategory?: PacksCategoryFilter }) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<PacksCategoryFilter>(initialCategory);
  const [tier, setTier] = useState<PackTierClass | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const packs = useQuery({ queryKey: ["shelf-packs"], queryFn: loadShelfPacks });
  const drops = useDropBoard();

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
    }, [queryClient]),
  );

  const rows = useMemo(
    () => visibleRows(category, tier, packs.data ?? emptyPacks, drops.data?.drops ?? emptyDrops),
    [category, drops.data?.drops, packs.data, tier],
  );
  const empty = !packs.isLoading && !drops.isLoading && rows.length === 0;
  const refreshing = (packs.isRefetching || drops.isRefetching) && !packs.isLoading && !drops.isLoading;

  const openPack = useCallback((packId: string) => {
    navigation.navigate("PackDetail", { packId });
  }, [navigation]);

  const renderRow = useCallback(({ item }: { item: BrowseRow }) => (
    <PackCard
      availability={item.availability}
      badges={item.badges}
      category={item.category}
      name={item.name}
      packId={item.packId}
      priceCents={item.priceCents}
      tier={item.tier}
      onOpen={openPack}
    />
  ), [openPack]);

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
      {packs.isLoading || (category === "DROPS" && drops.isLoading) ? <PackListSkeleton /> : null}
      {empty ? (
        <EmptyState icon="cube-outline" title={emptyCopy(category, tier)} />
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.filters}>
        <ChipGroup accessibilityLabel="Pack category">
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
        ItemSeparatorComponent={RowGap}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.content}
        data={empty || packs.isLoading || (category === "DROPS" && drops.isLoading) ? [] : rows}
        initialNumToRender={6}
        keyExtractor={(row) => row.id}
        maxToRenderPerBatch={6}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent.solid}
            onRefresh={() => {
              void packs.refetch();
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
          label="Any tier"
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

function RowGap() {
  return <View style={styles.rowGap} />;
}

type BrowseRow = {
  id: string;
  packId: string;
  category: PackCategory;
  name: string;
  tier: string;
  priceCents: bigint;
  availability: string;
  badges: PackCardBadge[];
};

function visibleRows(
  category: PacksCategoryFilter,
  tier: PackTierClass | null,
  packs: ShelfPack[],
  drops: TimedDrop[],
): BrowseRow[] {
  const source = category === "DROPS" ? drops.filter(dropIsBrowsable).map(dropRow) : packs.map(shelfRow);
  return source.filter((row) => {
    if (category !== "ALL" && category !== "DROPS" && row.category !== category) {
      return false;
    }
    if (tier && packTierClass(row.priceCents) !== tier) {
      return false;
    }
    return true;
  });
}

function shelfRow(pack: ShelfPack): BrowseRow {
  return {
    id: pack.id,
    packId: pack.id,
    category: pack.category,
    name: pack.name,
    tier: pack.tier,
    priceCents: pack.priceCents,
    availability: stockLabel(pack.reservable),
    badges: pack.reservable <= 0n ? ["SOLD_OUT"] : [],
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
    id: drop.dropId,
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
    return "No packs match those filters.";
  }
  if (category !== "ALL" && category !== "DROPS") {
    return `Nothing in ${categoryLabel(category)} is on the shelf.`;
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
  rowGap: {
    height: spacing.base,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  status: {
    gap: spacing.sm,
  },
});
