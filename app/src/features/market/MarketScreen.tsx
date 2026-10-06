import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
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

import { CartRejected, CartUnknown, submitCart } from "../../api/cart";
import { supabase } from "../../api/supabase";
import type { AppStackParamList } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";
import { loadMarket, type MarketListing } from "./board";

export function MarketScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const addKey = useRef<string | null>(null);
  const pendingListing = useRef<string | null>(null);
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

  useEffect(() => {
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refresh();
      }
    });
    const channel = supabase
      .channel("market-listings")
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_listings" }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  function addListing(listing: MarketListing, remember: boolean) {
    if (!online || listing.isOwn || pendingId) {
      return;
    }
    const idempotencyKey = remember || !addKey.current ? Crypto.randomUUID() : addKey.current;
    if (remember) {
      addKey.current = idempotencyKey;
    }
    pendingListing.current = listing.listingId;
    setPendingId(listing.listingId);
    setNotice("Adding to cart…");
    void submitCart({
      action: "addListing",
      listingId: listing.listingId,
      idempotencyKey,
    }).then((snapshot) => {
      addKey.current = null;
      setUnknown(false);
      queryClient.setQueryData(["cart"], snapshot);
      navigation.navigate("Cart");
    }).catch((error: unknown) => {
      if (error instanceof CartUnknown) {
        setUnknown(true);
        setNotice("Adding to cart…\n\nThis may have completed.\nWe're checking before retrying.");
        return;
      }
      addKey.current = null;
      setUnknown(false);
      setNotice(error instanceof CartRejected ? error.message : "That listing was not added. Refresh the market and try again.");
    }).finally(() => {
      setPendingId(null);
    });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={market.isRefetching && !market.isLoading}
          tintColor="#e4c07a"
          onRefresh={() => void market.refetch()}
        />
      }
      style={styles.screen}
    >
      <Pressable onPress={() => navigation.navigate("Shelf")}>
        <Text style={styles.link}>Shelf</Text>
      </Pressable>
      <Text style={styles.title}>Market</Text>
      <Text style={styles.notice}>Listings are not reserved. The seller can still change or remove one.</Text>
      {!online ? (
        <Text style={styles.notice}>You're offline. These listings may be out of date. Adding a listing stays disabled until the connection returns.</Text>
      ) : null}
      {market.isLoading ? (
        <View>
          <ActivityIndicator color="#e4c07a" />
          <Text style={styles.notice}>Loading listings…</Text>
        </View>
      ) : null}
      {market.isError ? (
        <View>
          <Text style={styles.notice}>The market didn't load. Check the connection and try again.</Text>
          <Pressable style={styles.primary} onPress={() => void market.refetch()}>
            <Text style={styles.primaryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {market.data && market.data.length === 0 ? (
        <Text style={styles.notice}>No listings are for sale.</Text>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {market.data?.map((listing) => (
        <View key={listing.listingId} style={styles.card}>
          <Text style={styles.category}>{categoryLabel(listing.category)}</Text>
          <Text style={styles.name}>{listing.name}</Text>
          <Text style={styles.meta}>{listing.rarity}</Text>
          <Text style={styles.price}>{formatCents(listing.priceCents)}</Text>
          <Text style={styles.meta}>Seller {listing.sellerUsername}</Text>
          {listing.isOwn ? (
            <Text style={styles.meta}>Your listing</Text>
          ) : (
            <Pressable
              disabled={!online || pendingId !== null || unknown}
              style={[styles.primary, (!online || pendingId !== null || unknown) && styles.disabled]}
              onPress={() => addListing(listing, true)}
            >
              <Text style={styles.primaryLabel}>{pendingId === listing.listingId ? "Adding…" : "Add to cart"}</Text>
            </Pressable>
          )}
        </View>
      ))}
      {unknown ? (
        <Pressable
          style={styles.primary}
          onPress={() => {
            const listing = market.data?.find((candidate) => candidate.listingId === pendingListing.current);
            if (listing) {
              addListing(listing, false);
            }
          }}
        >
          <Text style={styles.primaryLabel}>Check again</Text>
        </Pressable>
      ) : null}
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
  price: { color: "#e4c07a", fontSize: 22, fontWeight: "600", marginTop: 12 },
  primary: {
    alignSelf: "flex-start",
    backgroundColor: "#e4c07a",
    borderRadius: 999,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryLabel: { color: "#1a140c", fontWeight: "600" },
  disabled: { opacity: 0.35 },
});
