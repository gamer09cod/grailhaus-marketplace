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
import {
  CheckoutRejected,
  CheckoutUnknown,
  clearInflightCheckout,
  readInflightCheckout,
  rememberInflightCheckout,
  submitCheckout,
} from "../../api/checkout";
import { centsFromWire } from "../../utils/money";
import { watchTables } from "../../api/live";
import type { AppStackParamList } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";
import { holdHasEnded, remainingLabel } from "./countdown";

export function CartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [notice, setNotice] = useState<string | null>(null);
  const [openPackIds, setOpenPackIds] = useState<string[]>([]);
  const [pendingLineId, setPendingLineId] = useState<string | null>(null);
  const [awaitingResult, setAwaitingResult] = useState(false);
  const [paying, setPaying] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const inflight = useRef<LineCartAction | null>(null);
  const payment = useRef<PaymentRequest | null>(null);
  const payingLock = useRef(false);
  const resumedPayment = useRef(false);
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
    const stop = watchTables(
      "cart-stock",
      [{ table: "pack_skus" }, { table: "cart_reservations" }, { table: "marketplace_listings" }],
      refreshCart,
    );
    return () => {
      appState.remove();
      stop();
    };
  }, [refreshCart]);

  useEffect(() => {
    const timer = setInterval(() => {
      const nextNow = Date.now();
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
    setNotice(action.action === "release" ? "Removing this item…" : "Confirming reservation…");
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

  function startLineAction(line: CartLine, action: "release" | "retry" | "acceptPrice" | "acceptListingPrice") {
    if (paying || awaitingPayment) {
      return;
    }
    void runLineAction({
      action,
      cartLineId: line.lineId,
      idempotencyKey: Crypto.randomUUID(),
    }, true);
  }

  async function runPayment(request: PaymentRequest, remember: boolean) {
    if (!online || (paying && remember)) {
      return;
    }
    if (remember) {
      payment.current = request;
      await rememberInflightCheckout(storedPayment(request));
    }
    setPaying(true);
    setNotice("Confirming purchase…");
    try {
      const receipt = await submitCheckout(request);
      payment.current = null;
      payingLock.current = false;
      setAwaitingPayment(false);
      await clearInflightCheckout();
      const parts: string[] = [];
      if (receipt.packCount > 0) {
        parts.push(receipt.packCount === 1 ? "1 pack is sealed." : `${receipt.packCount} packs are sealed.`);
      }
      if (receipt.listingCount > 0) {
        parts.push(receipt.listingCount === 1 ? "1 listing is now yours." : `${receipt.listingCount} listings are now yours.`);
      }
      setNotice(`Paid ${formatCents(receipt.totalCents)}.\nBalance ${formatCents(receipt.balanceCents)}.${parts.length ? `\n${parts.join(" ")}` : ""}`);
      setOpenPackIds(receipt.sealedPackIds);
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
      void queryClient.invalidateQueries({ queryKey: ["market"] });
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
      void queryClient.invalidateQueries({ queryKey: ["sealed-packs"] });
    } catch (error) {
      if (error instanceof CheckoutUnknown) {
        setAwaitingPayment(true);
        setNotice("Confirming purchase…\n\nYour order may have completed.\nWe're checking before retrying.");
        return;
      }
      payment.current = null;
      payingLock.current = false;
      setAwaitingPayment(false);
      setOpenPackIds([]);
      await clearInflightCheckout();
      setNotice(checkoutNotice(error));
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
    } finally {
      setPaying(false);
    }
  }

  function startPayment() {
    if (!online || payingLock.current) {
      return;
    }
    const snapshot = cart.data;
    const total = snapshot ? payableTotal(snapshot.lines) : null;
    if (!snapshot?.cartId || total === null) {
      return;
    }
    payingLock.current = true;
    const request = payment.current ?? {
      cartId: snapshot.cartId,
      idempotencyKey: Crypto.randomUUID(),
      expectedTotalCents: total,
      lines: snapshot.lines.map((line) => ({
        lineId: line.lineId,
        quantity: line.quantity,
        snapshotPriceCents: line.snapshotPriceCents,
      })),
    };
    void runPayment(request, payment.current === null);
  }

  useEffect(() => {
    if (!online || resumedPayment.current) {
      return;
    }
    resumedPayment.current = true;
    void readInflightCheckout().then((saved) => {
      if (!saved || payingLock.current) {
        return;
      }
      const request: PaymentRequest = {
        cartId: saved.cartId,
        idempotencyKey: saved.idempotencyKey,
        expectedTotalCents: centsFromWire(saved.expectedTotalCents),
        lines: saved.lines.map((line) => ({
          lineId: line.lineId,
          quantity: line.quantity,
          snapshotPriceCents: centsFromWire(line.snapshotPriceCents),
        })),
      };
      payment.current = request;
      payingLock.current = true;
      setAwaitingPayment(true);
      setNotice("Confirming purchase…\n\nYour order may have completed.\nWe're checking before retrying.");
      void runPayment(request, false);
    });
    // Resume a payment that was sent before the app closed, once the network is back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

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
      <View style={styles.headerLinks}>
        <Pressable onPress={() => navigation.navigate("Shelf")}>
          <Text style={styles.link}>Shelf</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate("Market")}>
          <Text style={styles.link}>Market</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Cart</Text>
      {!online ? (
        <Text style={styles.notice}>You're offline. This cart may be out of date. Reservations stay disabled until the connection returns.</Text>
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
        <Text style={styles.notice}>Your cart is empty.{"\n\n"}Browse the shelf or the market.</Text>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {openPackIds.length > 0 ? (
        <Pressable
          style={styles.primary}
          onPress={() => navigation.navigate("Reveal", { purchasedPackIds: openPackIds })}
        >
          <Text style={styles.primaryLabel}>
            {openPackIds.length === 1 ? "Open pack" : `Open ${openPackIds.length} packs`}
          </Text>
        </Pressable>
      ) : null}
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
      {awaitingPayment ? (
        <Pressable
          style={styles.primary}
          onPress={() => {
            const request = payment.current;
            if (request) {
              void runPayment(request, false);
            }
          }}
        >
          <Text style={styles.primaryLabel}>Check again</Text>
        </Pressable>
      ) : null}
      {cart.data && payableTotal(cart.data.lines) !== null ? (
        <Pressable
          disabled={!online || paying || pendingLineId !== null || awaitingPayment}
          style={[styles.primary, (!online || paying || pendingLineId !== null || awaitingPayment) && styles.disabled]}
          onPress={startPayment}
        >
          <Text style={styles.primaryLabel}>
            {paying ? "Confirming purchase…" : `Pay ${formatCents(payableTotal(cart.data.lines) ?? 0n)}`}
          </Text>
        </Pressable>
      ) : null}
      {cart.data?.lines.map((line) => (
        <CartLineCard
          key={line.lineId}
          line={line}
          snapshot={cart.data}
          busy={pendingLineId === line.lineId}
          disabled={!online || pendingLineId !== null || paying || awaitingPayment}
          onAccept={() => startLineAction(line, line.lineType === "PACK" ? "acceptPrice" : "acceptListingPrice")}
          onRemove={() => startLineAction(line, "release")}
          onRetry={() => startLineAction(line, "retry")}
          onBrowseMarket={() => navigation.navigate("Market")}
        />
      ))}
    </ScrollView>
  );
}

function HoldCountdown({
  expiresAt,
  serverNow,
  fetchedAtMs,
}: {
  expiresAt: string;
  serverNow: string;
  fetchedAtMs: number;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Text style={styles.hold}>{remainingLabel(expiresAt, serverNow, fetchedAtMs, nowMs)}</Text>;
}

function CartLineCard({
  line,
  snapshot,
  busy,
  disabled,
  onAccept,
  onRemove,
  onRetry,
  onBrowseMarket,
}: {
  line: CartLine;
  snapshot: CartSnapshot;
  busy: boolean;
  disabled: boolean;
  onAccept: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onBrowseMarket: () => void;
}) {
  if (line.lineType === "MARKETPLACE_LISTING") {
    return (
      <View style={styles.card}>
        <Text style={styles.category}>{categoryLabel(line.category)}</Text>
        <Text style={styles.name}>{line.name}</Text>
        <Text style={styles.meta}>Seller {line.sellerUsername}</Text>
        <Text style={styles.meta}>Shown price {formatCents(line.snapshotPriceCents)}</Text>
        <Text style={styles.meta}>Current price {formatCents(line.currentPriceCents)}</Text>
        <Text style={styles.meta}>{availabilityLabel(line.availability)}</Text>
        {line.state === "LISTING_PRICE_CHANGED" ? (
          <View>
            <Text style={styles.warning}>Seller changed the price.</Text>
            <Text style={styles.meta}>Previous price: {formatCents(line.snapshotPriceCents)}</Text>
            <Text style={styles.meta}>Current price: {formatCents(line.currentPriceCents)}</Text>
            <ActionButton disabled={disabled} label={busy ? "Confirming…" : "Accept New Price"} onPress={onAccept} />
          </View>
        ) : null}
        {line.state === "LISTING_SOLD" ? (
          <View>
            <Text style={styles.warning}>This listing has already sold.</Text>
            <Text style={styles.meta}>Browse similar listings or remove it from your cart.</Text>
            <ActionButton disabled={false} label="Browse Marketplace" onPress={onBrowseMarket} />
          </View>
        ) : null}
        {line.state === "LISTING_DELISTED" ? (
          <View>
            <Text style={styles.warning}>The seller removed this listing.</Text>
            <Text style={styles.meta}>Remove it from your cart, or browse what is still for sale.</Text>
            <ActionButton disabled={false} label="Browse Marketplace" onPress={onBrowseMarket} />
          </View>
        ) : null}
        <Pressable disabled={disabled} onPress={onRemove}>
          <Text style={[styles.remove, disabled && styles.disabled]}>{busy ? "Removing…" : "Remove"}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.category}>{categoryLabel(line.category)}</Text>
      <Text style={styles.name}>{line.name}</Text>
      <Text style={styles.meta}>{line.tier} · {line.quantity} packs</Text>
      <Text style={styles.meta}>Shown price {formatCents(line.snapshotPriceCents)}</Text>
      <Text style={styles.meta}>Current price {formatCents(line.currentPriceCents)}</Text>
      <Text style={styles.meta}>{line.availableQuantity.toString()} available</Text>
      {line.state === "VALID" && line.expiresAt ? (
        <HoldCountdown expiresAt={line.expiresAt} fetchedAtMs={snapshot.fetchedAtMs} serverNow={snapshot.serverNow} />
      ) : null}
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
          Only {line.availableQuantity.toString()} are available. This line is unchanged.{"\n\n"}Remove it, then reserve {line.availableQuantity.toString()} from the shelf.
        </Text>
      ) : null}
      {line.state === "SOLD_OUT" ? (
        <Text style={styles.warning}>That pack is sold out.{"\n\n"}Remove it from your cart.</Text>
      ) : null}
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

function availabilityLabel(availability: "AVAILABLE" | "SOLD" | "DELISTED"): string {
  if (availability === "AVAILABLE") {
    return "Available";
  }
  if (availability === "SOLD") {
    return "Sold";
  }
  return "Not available";
}

type LineCartAction = {
  action: "release" | "retry" | "acceptPrice" | "acceptListingPrice";
  cartLineId: string;
  idempotencyKey: string;
};

type PaymentRequest = {
  cartId: string;
  idempotencyKey: string;
  expectedTotalCents: bigint;
  lines: { lineId: string; quantity: number; snapshotPriceCents: bigint }[];
};

function payableTotal(lines: CartLine[]): bigint | null {
  if (lines.length === 0) {
    return null;
  }
  let total = 0n;
  for (const line of lines) {
    if (line.state !== "VALID" || line.snapshotPriceCents !== line.currentPriceCents) {
      return null;
    }
    total += line.snapshotPriceCents * BigInt(line.quantity);
  }
  return total;
}

function storedPayment(request: PaymentRequest): {
  cartId: string;
  idempotencyKey: string;
  expectedTotalCents: string;
  lines: { lineId: string; quantity: number; snapshotPriceCents: string }[];
} {
  return {
    cartId: request.cartId,
    idempotencyKey: request.idempotencyKey,
    expectedTotalCents: request.expectedTotalCents.toString(),
    lines: request.lines.map((line) => ({
      lineId: line.lineId,
      quantity: line.quantity,
      snapshotPriceCents: line.snapshotPriceCents.toString(),
    })),
  };
}

function checkoutNotice(error: unknown): string {
  if (!(error instanceof CheckoutRejected)) {
    return "The payment did not go through.\n\nReview your cart and try again.";
  }
  if (error.code === "LISTING_SOLD") {
    return "This listing has already sold.\n\nBrowse similar listings or remove it from your cart.";
  }
  if (error.code === "LISTING_DELISTED") {
    return "The seller removed this listing.\n\nRemove it from your cart.";
  }
  if (error.code === "LISTING_PRICE_CHANGED" || error.code === "CART_CHANGED" || error.code === "CHECKOUT_TOTAL_CHANGED") {
    return "Your cart changed\n\nSome items are no longer available or their price changed.\nReview your cart before paying.";
  }
  if (error.code === "SOLD_OUT") {
    return "That pack is sold out.\n\nRemove it from your cart.";
  }
  if (error.code === "RESERVATION_EXPIRED") {
    return "Reservation expired\n\nThese packs are no longer reserved.";
  }
  if (error.code === "INSUFFICIENT_BALANCE") {
    return "You do not have enough in your wallet.\n\nAdd funds, then pay again.";
  }
  if (error.code === "INSUFFICIENT_STOCK") {
    return "Not enough packs are available.\n\nRemove the line and reserve what remains.";
  }
  return error.message;
}

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
  headerLinks: { flexDirection: "row", gap: 16 },
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
