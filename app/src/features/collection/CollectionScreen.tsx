import { useCallback, useEffect } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { loadSealedPacks } from "../../api/reveal";
import { supabase } from "../../api/supabase";
import type { AppStackParamList } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { loadHoldings } from "./inventory";

export function CollectionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
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
      <Text style={styles.title}>Collection</Text>
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
      {holdings.data?.map((holding) => (
        <Pressable
          key={holding.ownedItemId}
          style={styles.card}
          onPress={() => navigation.navigate("Listing", { ownedItemId: holding.ownedItemId })}
        >
          <Text style={styles.category}>{categoryLabel(holding.category)}</Text>
          <Text style={styles.name}>{holding.name}</Text>
          <Text style={styles.meta}>Estimated value {formatCents(holding.estimatedValueCents)}</Text>
          {holding.state === "LISTED" && holding.listingPriceCents !== null ? (
            <Text style={styles.listed}>Listed at {formatCents(holding.listingPriceCents)}</Text>
          ) : (
            <Text style={styles.listed}>List for sale</Text>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#12110f" },
  content: { padding: 24, paddingTop: 48, paddingBottom: 48 },
  link: { color: "#e4c07a" },
  title: { color: "#f4efe6", fontSize: 28, fontWeight: "600", marginTop: 16 },
  notice: { color: "#c9bfb2", lineHeight: 20, marginTop: 12 },
  card: {
    borderColor: "#2e2a26",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
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
