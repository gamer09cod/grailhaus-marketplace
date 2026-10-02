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

import {
  CartRejected,
  CartUnknown,
  loadCart,
  submitCart,
  type CartLine,
  type CartSnapshot,
} from "../../api/cart";
import { supabase } from "../../api/supabase";
import type { AppStackParamList } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";
import { holdHasEnded, remainingLabel } from "./countdown";

export function CartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingLineId, setPendingLineId] = useState<string | null>(null);
  const [awaitingResult, setAwaitingResult] = useState(false);
  const inflight = useRef<LineCartAction | null>(null);
  const cart = useQuery({
    queryKey: ["cart"],
    queryFn: loadCart,
  });

  const refreshCart = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["cart"] });
    void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      refreshCart();
    }, [refreshCart]),
  );

  useEffect(() => {
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refreshCart();
      }
    });
    const channel = supabase
      .channel("cart-stock")
      .on("postgres_changes", { event: "*", schema: "public", table: "pack_skus" }, () => {
        refreshCart();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cart_reservations" }, () => {
        refreshCart();
      })
      .subscribe();
    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [refreshCart]);

  useEffect(() => {
    const timer = setInterval(() => {
      const nextNow = Date.now();
      setNowMs(nextNow);
      const snapshot = cart.data;
      if (!snapshot) {
        return;
      }
      const due = snapshot.lines.some((line) =>
        line.expiresAt !== null
        && (line.state === "VALID" || line.state === "PRICE_CHANGED")
        && holdHasEnded(line.expiresAt, snapshot.serverNow, snapshot.fetchedAtMs, nextNow)
      );
      if (due) {
        refreshCart();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [cart.data, refreshCart]);

  async function runLineAction(action: LineCartAction, remember: boolean) {
    if (!online || (pendingLineId && remember)) {
      return;
    }
    if (remember) {
      inflight.current = action;
    }
    setPendingLineId(action.cartLineId);
    setNotice(action.action === "release" ? "Removing this pack…" : "Confirming reservation…");
    try {
      const snapshot = await submitCart(action);
      inflight.current = null;
      setAwaitingResult(false);
      queryClient.setQueryData(["cart"], snapshot);
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
      setNotice(null);
    } catch (error) {
      if (error instanceof CartUnknown) {
        setAwaitingResult(true);
        setNotice(messageFor(error));
        return;
      }
      inflight.current = null;
      setAwaitingResult(false);
      setNotice(messageFor(error));
    } finally {
      setPendingLineId(null);
    }
  }

  function startLineAction(line: CartLine, action: "release" | "retry" | "acceptPrice") {
    void runLineAction({
      action,
      cartLineId: line.lineId,
      idempotencyKey: Crypto.randomUUID(),
    }, true);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={cart.isRefetching && !cart.isLoading}
          tintColor="#e4c07a"
          onRefresh={() => void cart.refetch()}
        />
      }
      style={styles.screen}
    >
      <Pressable onPress={() => navigation.navigate("Shelf")}>
        <Text style={styles.link}>Shelf</Text>
      </Pressable>
      <Text style={styles.title}>Cart</Text>
      {!online ? (
        <Text style={styles.notice}>You're offline. Reservations stay disabled until the connection returns.</Text>
      ) : null}
      {cart.isLoading ? (
        <View>
          <ActivityIndicator color="#e4c07a" />
          <Text style={styles.notice}>Loading your cart…</Text>
        </View>
      ) : null}
      {cart.isError ? (
        <View>
          <Text style={styles.notice}>Your cart didn't load. Check the connection and try again.</Text>
          <Pressable style={styles.primary} onPress={() => void cart.refetch()}>
            <Text style={styles.primaryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {cart.data && cart.data.lines.length === 0 ? (
        <Text style={styles.notice}>Your cart is empty.</Text>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {awaitingResult ? (
        <Pressable
          style={styles.primary}
          onPress={() => {
            const action = inflight.current;
            if (action) {
              void runLineAction(action, false);
            }
          }}
        >
          <Text style={styles.primaryLabel}>Check again</Text>
        </Pressable>
      ) : null}
      {cart.data?.lines.map((line) => (
        <CartLineCard
          key={line.lineId}
          line={line}
          snapshot={cart.data}
          nowMs={nowMs}
          busy={pendingLineId === line.lineId}
          disabled={!online || pendingLineId !== null}
          onAccept={() => startLineAction(line, "acceptPrice")}
          onRemove={() => startLineAction(line, "release")}
          onRetry={() => startLineAction(line, "retry")}
        />
      ))}
    </ScrollView>
  );
}

function CartLineCard({
  line,
  snapshot,
  nowMs,
  busy,
  disabled,
  onAccept,
  onRemove,
  onRetry,
}: {
  line: CartLine;
  snapshot: CartSnapshot;
  nowMs: number;
  busy: boolean;
  disabled: boolean;
  onAccept: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const countdown = line.expiresAt
    ? remainingLabel(line.expiresAt, snapshot.serverNow, snapshot.fetchedAtMs, nowMs)
    : null;

  return (
    <View style={styles.card}>
      <Text style={styles.category}>{categoryLabel(line.category)}</Text>
      <Text style={styles.name}>{line.name}</Text>
      <Text style={styles.meta}>{line.tier} · {line.quantity} packs</Text>
      <Text style={styles.meta}>Shown price {formatCents(line.snapshotPriceCents)}</Text>
      <Text style={styles.meta}>Current price {formatCents(line.currentPriceCents)}</Text>
      <Text style={styles.meta}>{line.availableQuantity.toString()} available</Text>
      {line.state === "VALID" && countdown ? <Text style={styles.hold}>{countdown}</Text> : null}
      {line.state === "EXPIRED" ? (
        <View>
          <Text style={styles.warning}>Reservation expired</Text>
          <Text style={styles.meta}>These packs are no longer reserved.</Text>
          <ActionButton disabled={disabled} label={busy ? "Confirming…" : "Try Again"} onPress={onRetry} />
        </View>
      ) : null}
      {line.state === "PRICE_CHANGED" ? (
        <View>
          <Text style={styles.warning}>The pack price changed.</Text>
          <Text style={styles.meta}>Previous price: {formatCents(line.snapshotPriceCents)}</Text>
          <Text style={styles.meta}>Current price: {formatCents(line.currentPriceCents)}</Text>
          <ActionButton disabled={disabled} label={busy ? "Confirming…" : "Accept New Price"} onPress={onAccept} />
        </View>
      ) : null}
      {line.state === "PARTIALLY_AVAILABLE" ? (
        <Text style={styles.warning}>
          Only {line.availableQuantity.toString()} are available. This line is unchanged.
        </Text>
      ) : null}
      {line.state === "SOLD_OUT" ? <Text style={styles.warning}>Sold out</Text> : null}
      <Pressable disabled={disabled} onPress={onRemove}>
        <Text style={[styles.remove, disabled && styles.disabled]}>{busy ? "Removing…" : "Remove"}</Text>
      </Pressable>
    </View>
  );
}

function ActionButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable disabled={disabled} style={[styles.primary, disabled && styles.disabled]} onPress={onPress}>
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

type LineCartAction = {
  action: "release" | "retry" | "acceptPrice";
  cartLineId: string;
  idempotencyKey: string;
};

function messageFor(error: unknown): string {
  if (error instanceof CartUnknown) {
    return "Confirming reservation…\n\nThis hold may have completed.\nWe're checking before retrying.";
  }
  if (error instanceof CartRejected) {
    return error.message;
  }
  return "The cart action was rejected.";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#12110f" },
  content: { padding: 24, paddingTop: 48, paddingBottom: 48 },
  link: { color: "#e4c07a" },
  title: { color: "#f4efe6", fontSize: 28, fontWeight: "600", marginTop: 16, marginBottom: 8 },
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
  hold: { color: "#e4c07a", fontSize: 18, fontWeight: "600", marginTop: 12 },
  warning: { color: "#f4efe6", marginTop: 12 },
  primary: {
    alignSelf: "flex-start",
    backgroundColor: "#e4c07a",
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryLabel: { color: "#1a140c", fontWeight: "600" },
  remove: { color: "#e4c07a", marginTop: 16 },
  disabled: { opacity: 0.4 },
});
