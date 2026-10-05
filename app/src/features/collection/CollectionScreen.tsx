import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ListingRejected, ListingUnknown, submitListing } from "../../api/listing";
import { loadSealedPacks } from "../../api/reveal";
import { supabase } from "../../api/supabase";
import type { AppStackParamList, PackCategory } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";
import { loadHoldings, type OwnedHolding } from "./inventory";
import {
  formatSignedCents,
  listedStateLabel,
  portfolioTotals,
  profitCents,
  selectHoldings,
  type PortfolioFilter,
  type PortfolioSort,
} from "./portfolio";

const filters: { id: PortfolioFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "TRADING_CARD", label: "Cards" },
  { id: "SNEAKER", label: "Sneakers" },
  { id: "WATCH", label: "Watches" },
];

const sorts: { id: PortfolioSort; label: string }[] = [
  { id: "value", label: "Value" },
  { id: "pnl", label: "P&L" },
  { id: "recent", label: "Recently Acquired" },
];

export function CollectionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [filter, setFilter] = useState<PortfolioFilter>("ALL");
  const [sort, setSort] = useState<PortfolioSort>("recent");
  const [notice, setNotice] = useState<string | null>(null);
  const [delistingId, setDelistingId] = useState<string | null>(null);
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
    const channel = supabase
      .channel(`collection-listings-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "owned_items" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_listings" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "purchased_packs" }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  async function delist(holding: OwnedHolding) {
    if (!holding.listingId || !online || delistingId) {
      return;
    }
    setDelistingId(holding.ownedItemId);
    setNotice("Removing the listing…");
    try {
      await submitListing({
        action: "delist",
        listingId: holding.listingId,
        idempotencyKey: Crypto.randomUUID(),
      });
      setNotice(null);
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
    } catch (error) {
      if (error instanceof ListingUnknown) {
        setNotice("Removing the listing… This change may have completed. We're checking before retrying.");
        return;
      }
      setNotice(error instanceof ListingRejected ? error.message : "The listing was rejected.");
    } finally {
      setDelistingId(null);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={(holdings.isRefetching || sealed.isRefetching) && !holdings.isLoading && !sealed.isLoading}
          tintColor="#e4c07a"
          onRefresh={() => {
            void holdings.refetch();
            void sealed.refetch();
          }}
        />
      }
      style={styles.screen}
    >
      <Pressable onPress={() => navigation.navigate("Shelf")}>
        <Text style={styles.link}>Shelf</Text>
      </Pressable>
      <Text style={styles.title}>Portfolio</Text>
      {holdings.data ? (
        <View>
          <Text style={styles.notice}>Total portfolio value</Text>
          <Text style={styles.amount}>{formatCents(portfolioTotals(holdings.data).valueCents)}</Text>
          <Text style={styles.notice}>P&L</Text>
          <Text style={styles.amount}>{formatSignedCents(portfolioTotals(holdings.data).profitCents)}</Text>
        </View>
      ) : null}
      <View style={styles.chips}>
        {filters.map((choice) => (
          <Pressable
            key={choice.id}
            accessibilityRole="button"
            accessibilityLabel={choice.label}
            style={[styles.chip, filter === choice.id ? styles.chipOn : null]}
            onPress={() => setFilter(choice.id)}
          >
            <Text style={[styles.chipLabel, filter === choice.id ? styles.chipLabelOn : null]}>{choice.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.chips}>
        {sorts.map((choice) => (
          <Pressable
            key={choice.id}
            accessibilityRole="button"
            accessibilityLabel={choice.label}
            style={[styles.chip, sort === choice.id ? styles.chipOn : null]}
            onPress={() => setSort(choice.id)}
          >
            <Text style={[styles.chipLabel, sort === choice.id ? styles.chipLabelOn : null]}>{choice.label}</Text>
          </Pressable>
        ))}
      </View>
      {!online ? (
        <Text style={styles.notice}>You're offline. Listing and delist stay disabled until the connection returns.</Text>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {holdings.isLoading || sealed.isLoading ? (
        <View>
          <ActivityIndicator color="#e4c07a" />
          <Text style={styles.notice}>Loading your items…</Text>
        </View>
      ) : null}
      {holdings.isError || sealed.isError ? (
        <View>
          <Text style={styles.notice}>Your items didn't load. Check the connection and try again.</Text>
          <Pressable
            style={styles.primary}
            onPress={() => {
              void holdings.refetch();
              void sealed.refetch();
            }}
          >
            <Text style={styles.primaryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {sealed.data?.map((pack) => (
        <Pressable
          key={pack.purchasedPackId}
          style={styles.card}
          onPress={() => navigation.navigate("Reveal", { purchasedPackIds: [pack.purchasedPackId] })}
        >
          <Text style={styles.category}>Trading cards</Text>
          <Text style={styles.name}>{pack.name}</Text>
          <Text style={styles.meta}>{pack.tier}</Text>
          <Text style={styles.listed}>Sealed</Text>
        </Pressable>
      ))}
      {holdings.data && holdings.data.length === 0 && (sealed.data?.length ?? 0) === 0 ? (
        <Text style={styles.notice}>You don't own any items yet.</Text>
      ) : null}
      {holdings.data && holdings.data.length === 0 && (sealed.data?.length ?? 0) > 0 ? (
        <Text style={styles.notice}>Opened items show up here.</Text>
      ) : null}
      {holdings.data && selectHoldings(holdings.data, filter, sort).length === 0 && holdings.data.length > 0 ? (
        <Text style={styles.notice}>{emptyFilterCopy(filter)}</Text>
      ) : null}
      {selectHoldings(holdings.data ?? [], filter, sort).map((holding) => (
        <View key={holding.ownedItemId} style={styles.card}>
          <View style={styles.item}>
            {holding.imageUrl ? (
              <Image accessibilityLabel={holding.name} source={{ uri: holding.imageUrl }} style={styles.thumb} />
            ) : (
              <View style={styles.thumb}>
                <Text style={styles.mark}>{categoryMark(holding.category)}</Text>
              </View>
            )}
            <View style={styles.itemBody}>
              <Text style={styles.category}>{categoryLabel(holding.category)}</Text>
              <Text style={styles.name}>{holding.name}</Text>
              <Text style={styles.meta}>{holding.rarity}</Text>
              <Text style={styles.meta}>Current value {formatCents(holding.estimatedValueCents)}</Text>
              <Text style={styles.meta}>
                P&L {formatSignedCents(profitCents(holding.estimatedValueCents, holding.acquisitionPriceCents))}
              </Text>
              <Text style={styles.listed}>
                {holding.state === "LISTED" && holding.listingPriceCents !== null
                  ? `Listed at ${formatCents(holding.listingPriceCents)}`
                  : listedStateLabel(holding.state)}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View details"
              onPress={() => navigation.navigate("Listing", { ownedItemId: holding.ownedItemId })}
            >
              <Text style={styles.action}>View details</Text>
            </Pressable>
            {holding.state === "LISTED" && holding.listingId ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit listing"
                  onPress={() => navigation.navigate("Listing", { ownedItemId: holding.ownedItemId })}
                >
                  <Text style={styles.action}>Edit listing</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delist"
                  disabled={!online || delistingId !== null}
                  onPress={() => void delist(holding)}
                >
                  <Text style={styles.action}>{delistingId === holding.ownedItemId ? "Removing…" : "Delist"}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="List for sale"
                onPress={() => navigation.navigate("Listing", { ownedItemId: holding.ownedItemId })}
              >
                <Text style={styles.action}>List for sale</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
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
  return "You don't own any items yet.";
}

function categoryMark(category: PackCategory): string {
  if (category === "TRADING_CARD") {
    return "C";
  }
  if (category === "SNEAKER") {
    return "S";
  }
  return "W";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#12110f" },
  content: { padding: 24, paddingTop: 48, paddingBottom: 48 },
  link: { color: "#e4c07a" },
  title: { color: "#f4efe6", fontSize: 28, fontWeight: "600", marginTop: 16 },
  notice: { color: "#c9bfb2", lineHeight: 20, marginTop: 12 },
  amount: { color: "#f4efe6", fontSize: 26, fontWeight: "600", marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  chip: {
    borderColor: "#3a342c",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: "#e4c07a", borderColor: "#e4c07a" },
  chipLabel: { color: "#e4c07a", fontWeight: "600" },
  chipLabelOn: { color: "#1a140c" },
  card: {
    borderColor: "#2e2a26",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  item: { flexDirection: "row", gap: 12 },
  itemBody: { flex: 1 },
  thumb: {
    alignItems: "center",
    backgroundColor: "#1c1916",
    borderRadius: 12,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  mark: { color: "#e4c07a", fontSize: 22, fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 12 },
  action: { color: "#e4c07a", fontWeight: "600" },
  category: { color: "#a3988c", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  name: { color: "#f4efe6", fontSize: 20, fontWeight: "600", marginTop: 8 },
  meta: { color: "#c9bfb2", marginTop: 4 },
  listed: { color: "#e4c07a", fontWeight: "600", marginTop: 12 },
  primary: {
    alignSelf: "flex-start",
    backgroundColor: "#e4c07a",
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryLabel: { color: "#1a140c", fontWeight: "600" },
});
