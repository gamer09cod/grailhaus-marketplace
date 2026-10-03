import { useCallback, useEffect, useRef, useState } from "react";
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

import { supabase } from "../../api/supabase";
import type { AppStackParamList } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { clockLabel, secondsUntil } from "../cart/countdown";
import { categoryLabel } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";
import { loadDropBoard, type DropBoard, type TimedDrop } from "./board";

export function DropsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const boundaryKey = useRef<string | null>(null);
  const board = useQuery({
    queryKey: ["drop-board"],
    queryFn: loadDropBoard,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["drop-board"] });
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
      .channel("drop-stock")
      .on("postgres_changes", { event: "*", schema: "public", table: "pack_skus" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "drops" }, () => {
        refresh();
      })
      .subscribe();
    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      const nextNow = Date.now();
      setNowMs(nextNow);
      if (board.data && boundaryReached(board.data, nextNow) && boundaryKey.current !== board.data.serverNow) {
        boundaryKey.current = board.data.serverNow;
        refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [board.data, refresh]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={board.isRefetching && !board.isLoading}
          tintColor="#e4c07a"
          onRefresh={() => void board.refetch()}
        />
      }
      style={styles.screen}
    >
      <Pressable onPress={() => navigation.navigate("Shelf")}>
        <Text style={styles.link}>Shelf</Text>
      </Pressable>
      <Text style={styles.title}>Drops</Text>
      {!online ? (
        <Text style={styles.notice}>You're offline. This countdown may be out of date.</Text>
      ) : null}
      {board.isLoading ? (
        <View>
          <ActivityIndicator color="#e4c07a" />
          <Text style={styles.notice}>Loading drops…</Text>
        </View>
      ) : null}
      {board.isError ? (
        <View>
          <Text style={styles.notice}>Drops didn't load. Check the connection and try again.</Text>
          <Pressable style={styles.primary} onPress={() => void board.refetch()}>
            <Text style={styles.primaryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {board.data && board.data.drops.length === 0 ? (
        <Text style={styles.notice}>No timed drops are scheduled.</Text>
      ) : null}
      {board.data?.drops.map((drop) => (
        <Pressable
          key={drop.dropId}
          style={styles.card}
          onPress={() => navigation.navigate("PackDetail", { packId: drop.packSkuId })}
        >
          <Text style={styles.category}>{categoryLabel(drop.category)}</Text>
          <Text style={styles.name}>{drop.name}</Text>
          <Text style={styles.meta}>{drop.tier} · {formatCents(drop.priceCents)}</Text>
          <DropStatusText board={board.data} drop={drop} nowMs={nowMs} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function DropStatusText({
  board,
  drop,
  nowMs,
}: {
  board: DropBoard;
  drop: TimedDrop;
  nowMs: number;
}) {
  if (drop.status === "UPCOMING") {
    const label = clockLabel(secondsUntil(drop.startsAt, board.serverNow, board.fetchedAtMs, nowMs));
    return <Text style={styles.live}>Starts in {label}</Text>;
  }
  if (drop.status === "LIVE") {
    return (
      <View>
        <Text style={styles.live}>LIVE</Text>
        <Text style={styles.meta}>{drop.reservable.toString()} remaining</Text>
      </View>
    );
  }
  if (drop.status === "SOLD_OUT") {
    return <Text style={styles.live}>SOLD OUT</Text>;
  }
  return <Text style={styles.meta}>Ended</Text>;
}

function boundaryReached(board: DropBoard, nowMs: number): boolean {
  return board.drops.some((drop) => {
    const target = drop.status === "UPCOMING" ? drop.startsAt : drop.status === "LIVE" ? drop.endsAt : null;
    if (!target) {
      return false;
    }
    return secondsUntil(target, board.serverNow, board.fetchedAtMs, nowMs) === 0;
  });
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
  live: { color: "#e4c07a", fontSize: 18, fontWeight: "600", marginTop: 12 },
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
