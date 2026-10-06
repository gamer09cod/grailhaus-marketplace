import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CartRejected, CartUnknown, submitCart } from "../../api/cart";
import { watchTables } from "../../api/live";
import type { AppStackParamList } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { secondsUntil } from "../cart/countdown";
import { loadDropBoard, type TimedDrop } from "../drops/board";
import { DropStatusText } from "../drops/DropsScreen";
import {
  categoryLabel,
  clampQuantity,
  formatBasisPoints,
  loadPackOdds,
  loadShelfPacks,
  rarityLabel,
  stockLabel,
  tierPresence,
} from "./packs";
import { useOnline } from "./useOnline";

export function PackDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "PackDetail">>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [requested, setRequested] = useState(1);
  const [reserving, setReserving] = useState(false);
  const [reserveNotice, setReserveNotice] = useState<string | null>(null);
  const [reserveUnknown, setReserveUnknown] = useState(false);
  const reserveKey = useRef<string | null>(null);
  const boundaryKey = useRef<string | null>(null);
  const packs = useQuery({
    queryKey: ["shelf-packs"],
    queryFn: loadShelfPacks,
  });
  const drops = useQuery({
    queryKey: ["drop-board"],
    queryFn: loadDropBoard,
  });
  const odds = useQuery({
    queryKey: ["pack-odds", route.params.packId],
    queryFn: () => loadPackOdds(route.params.packId),
  });
  const shelfPack = packs.data?.find((candidate) => candidate.id === route.params.packId);
  const drop = drops.data?.drops.find((candidate) => candidate.packSkuId === route.params.packId);
  const pack = shelfPack
    ? { ...shelfPack, maxPerUser: null as number | null, drop: null as TimedDrop | null }
    : drop
      ? {
          id: drop.packSkuId,
          category: drop.category,
          name: drop.name,
          tier: drop.tier,
          priceCents: drop.priceCents,
          reservable: drop.reservable,
          maxPerUser: drop.maxPerUser,
          drop,
        }
      : undefined;
  const selectionCap = pack ? reserveCap(pack.reservable, pack.maxPerUser) : 0n;
  const quantity = pack ? clampQuantity(requested, selectionCap) : 0;
  const presence = pack ? tierPresence(pack.priceCents) : "quiet";
  const dropOpen = !pack?.drop || pack.drop.status === "LIVE";
  const loading = (packs.isLoading || drops.isLoading) && !pack;
  const failed = !pack && packs.isError && drops.isError;

  const refreshDrops = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["drop-board"] });
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      refreshDrops();
    }, [refreshDrops]),
  );

  useEffect(() => {
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refreshDrops();
      }
    });
    const stop = watchTables("drop-detail", [{ table: "pack_skus" }, { table: "drops" }], () => {
      refreshDrops();
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
    });
    return () => {
      appState.remove();
      stop();
    };
  }, [queryClient, refreshDrops, route.params.packId]);

  useEffect(() => {
    if (!drop || !drops.data) {
      return;
    }
    const timer = setInterval(() => {
      const nextNow = Date.now();
      const target = drop.status === "UPCOMING" ? drop.startsAt : drop.status === "LIVE" ? drop.endsAt : null;
      if (
        target
        && secondsUntil(target, drops.data.serverNow, drops.data.fetchedAtMs, nextNow) === 0
        && boundaryKey.current !== drops.data.serverNow
      ) {
        boundaryKey.current = drops.data.serverNow;
        refreshDrops();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [drop, drops.data, refreshDrops]);

  function startReserve(remember: boolean) {
    if (!pack || !online || !dropOpen || quantity < 1) {
      return;
    }
    const idempotencyKey = remember || !reserveKey.current ? Crypto.randomUUID() : reserveKey.current;
    if (remember) {
      reserveKey.current = idempotencyKey;
    }
    setReserving(true);
    setReserveNotice("Confirming reservation…");
    void submitCart({
      action: "reserve",
      packSkuId: pack.id,
      quantity,
      idempotencyKey,
    }).then((snapshot) => {
      reserveKey.current = null;
      setReserveUnknown(false);
      queryClient.setQueryData(["cart"], snapshot);
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
      void queryClient.invalidateQueries({ queryKey: ["drop-board"] });
      navigation.navigate("Cart");
    }).catch((error: unknown) => {
      if (error instanceof CartUnknown) {
        setReserveUnknown(true);
        setReserveNotice("Confirming reservation…\n\nThis hold may have completed.\nWe're checking before retrying.");
        return;
      }
      reserveKey.current = null;
      setReserveUnknown(false);
      setReserveNotice(error instanceof CartRejected ? error.message : "The reservation was rejected.");
    }).finally(() => {
      setReserving(false);
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      {!online ? (
        <Text style={styles.notice}>You're offline. Price and availability may be out of date.</Text>
      ) : null}

      {loading ? (
        <View style={styles.status}>
          <ActivityIndicator color="#e4c07a" />
          <Text style={styles.notice}>Loading this pack…</Text>
        </View>
      ) : null}

      {failed ? (
        <View style={styles.status}>
          <Text style={styles.notice}>This pack didn't load. Check the connection and try again.</Text>
          <Pressable style={styles.retry} onPress={() => {
            void packs.refetch();
            void drops.refetch();
          }}>
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {packs.data && drops.data && !pack ? (
        <Text style={styles.notice}>This pack is not on the shelf.</Text>
      ) : null}

      {pack ? (
        <View>
          <Text style={styles.category}>{categoryLabel(pack.category)}</Text>
          <Text style={styles.tier}>{pack.tier}</Text>
          <Text style={[styles.name, presence === "grail" ? styles.nameGrail : null]}>{pack.name}</Text>
          <Text style={[styles.price, presence === "grail" ? styles.priceGrail : null, presence === "quiet" ? styles.priceQuiet : null]}>
            {formatCents(pack.priceCents)}
          </Text>
          {pack.drop && drops.data ? (
            <DropStatusText board={drops.data} drop={pack.drop} />
          ) : (
            <Text style={styles.availability}>{stockLabel(pack.reservable)}</Text>
          )}
          {pack.maxPerUser ? (
            <Text style={styles.notice}>Maximum {pack.maxPerUser} packs per user</Text>
          ) : null}

          <Text style={styles.section}>Rarity odds</Text>
          {odds.isLoading ? <Text style={styles.notice}>Loading odds…</Text> : null}
          {odds.isError ? (
            <View>
              <Text style={styles.notice}>Odds didn't load. Try again.</Text>
              <Pressable style={styles.retry} onPress={() => void odds.refetch()}>
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
          {odds.data && odds.data.length === 0 ? (
            <Text style={styles.notice}>Odds are not published for this pack.</Text>
          ) : null}
          {odds.data?.map((row) => (
            <View key={row.rarity} style={styles.oddsRow}>
              <Text style={styles.oddsRarity}>{rarityLabel(row.rarity)}</Text>
              <Text style={styles.oddsValue}>{formatBasisPoints(row.basisPoints)}</Text>
            </View>
          ))}

          {pack.drop && !dropOpen ? null : (
          <View>
          <Text style={styles.section}>Quantity</Text>
          {quantity === 0 ? (
            <Text style={styles.notice}>Sold out. None of these packs are left to reserve.</Text>
          ) : (
            <View>
              <View style={styles.stepper}>
                <Pressable
                  disabled={quantity <= 1}
                  style={[styles.step, quantity <= 1 && styles.stepDisabled]}
                  onPress={() => setRequested(quantity - 1)}
                >
                  <Text style={styles.stepLabel}>−</Text>
                </Pressable>
                <Text style={styles.quantity}>{quantity}</Text>
                <Pressable
                  disabled={selectionCap <= BigInt(quantity)}
                  style={[styles.step, selectionCap <= BigInt(quantity) && styles.stepDisabled]}
                  onPress={() => setRequested(quantity + 1)}
                >
                  <Text style={styles.stepLabel}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.total}>
                {quantity} × {formatCents(pack.priceCents)} = {formatCents(pack.priceCents * BigInt(quantity))}
              </Text>
              <Pressable
                disabled={!online || !dropOpen || reserving || reserveUnknown}
                style={[styles.retry, (!online || !dropOpen || reserving || reserveUnknown) && styles.stepDisabled]}
                onPress={() => startReserve(true)}
              >
                <Text style={styles.retryLabel}>{reserving ? "Reserving…" : "Reserve"}</Text>
              </Pressable>
              {reserveNotice ? <Text style={styles.notice}>{reserveNotice}</Text> : null}
              {reserveUnknown ? (
                <Pressable style={styles.retry} onPress={() => startReserve(false)}>
                  <Text style={styles.retryLabel}>Check again</Text>
                </Pressable>
              ) : null}
              {!online ? (
                <Text style={styles.notice}>You're offline. Reservations stay disabled until the connection returns.</Text>
              ) : null}
            </View>
          )}
          </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

function reserveCap(reservable: bigint, maxPerUser: number | null): bigint {
  if (maxPerUser === null) {
    return reservable;
  }
  const limit = BigInt(maxPerUser);
  return reservable < limit ? reservable : limit;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#12110f",
  },
  content: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },
  link: {
    color: "#e4c07a",
    marginBottom: 20,
  },
  status: {
    marginTop: 12,
  },
  category: {
    color: "#a3988c",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tier: {
    color: "#c9bfb2",
    marginTop: 8,
  },
  name: {
    color: "#f4efe6",
    fontSize: 28,
    fontWeight: "600",
    marginTop: 8,
  },
  nameGrail: {
    fontSize: 36,
  },
  price: {
    color: "#f4efe6",
    fontSize: 32,
    fontWeight: "600",
    marginTop: 16,
  },
  priceQuiet: {
    fontSize: 22,
  },
  priceGrail: {
    color: "#e4c07a",
    fontSize: 44,
  },
  availability: {
    color: "#c9bfb2",
    marginTop: 8,
  },
  section: {
    color: "#f4efe6",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 32,
    marginBottom: 12,
  },
  notice: {
    color: "#c9bfb2",
    lineHeight: 20,
    marginTop: 8,
  },
  retry: {
    alignSelf: "flex-start",
    backgroundColor: "#e4c07a",
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryLabel: {
    color: "#1a140c",
    fontWeight: "600",
  },
  oddsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomColor: "#2e2a26",
    borderBottomWidth: 1,
  },
  oddsRarity: {
    color: "#f4efe6",
  },
  oddsValue: {
    color: "#e4c07a",
  },
  stepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
  },
  step: {
    alignItems: "center",
    backgroundColor: "#2a241c",
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  stepDisabled: {
    opacity: 0.35,
  },
  stepLabel: {
    color: "#f4efe6",
    fontSize: 22,
  },
  quantity: {
    color: "#f4efe6",
    fontSize: 22,
    fontWeight: "600",
    minWidth: 32,
    textAlign: "center",
  },
  total: {
    color: "#f4efe6",
    marginTop: 16,
  },
});
