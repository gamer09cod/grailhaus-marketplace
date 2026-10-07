import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { AppState, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CartRejected,
  CartUnknown,
  loadCart,
  submitCart,
  type CartLine,
} from "../../api/cart";
import {
  CheckoutRejected,
  CheckoutUnknown,
  clearInflightCheckout,
  readInflightCheckout,
  rememberInflightCheckout,
  submitCheckout,
} from "../../api/checkout";
import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { RecoveryAction } from "../../components/RecoveryAction";
import { CartLineSkeleton } from "../../components/Skeleton";
import { PrimaryButton } from "../../components/buttons";
import type { IconName } from "../../components/Icon";
import type { StatusKey } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, spacing, typography } from "../../theme";
import { centsFromWire, formatCents } from "../../utils/money";
import { useOnline } from "../shelf/useOnline";
import { useWalletBalance } from "../wallet/useWalletBalance";
import { CartLineItem } from "./CartLineItem";
import { CartSummary } from "./CartSummary";
import { ReviewPurchaseView } from "./ReviewPurchaseView";
import { cartBreakdown, payableTotal } from "./cartTotals";
import { holdHasEnded } from "./countdown";
import { captureReview, reviewChanges, reviewFromPayment, type ReviewSnapshot } from "./reviewSnapshot";

export function CartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Cart">>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const wallet = useWalletBalance();
  const [notice, setNotice] = useState<string | null>(null);
  const [openPackIds, setOpenPackIds] = useState<string[]>([]);
  const [pendingLineId, setPendingLineId] = useState<string | null>(null);
  const [awaitingResult, setAwaitingResult] = useState(false);
  const [paying, setPaying] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewed, setReviewed] = useState<ReviewSnapshot | null>(null);
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
    if (reviewing && route.params?.startReview) {
      navigation.setParams({ startReview: false });
    }
  }, [navigation, reviewing, route.params?.startReview]);

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
    setReviewing(true);
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
    if (!online || payingLock.current || !reviewed) {
      return;
    }
    const snapshot = cart.data;
    if (!snapshot?.cartId || reviewChanges(reviewed, snapshot.lines).length > 0) {
      return;
    }
    payingLock.current = true;
    const request = payment.current ?? {
      cartId: snapshot.cartId,
      idempotencyKey: Crypto.randomUUID(),
      expectedTotalCents: reviewed.totalCents,
      lines: reviewed.lines.map((line) => ({
        lineId: line.lineId,
        quantity: line.quantity,
        snapshotPriceCents: line.priceCents,
      })),
    };
    void runPayment(request, payment.current === null);
  }

  function enterReview() {
    const captured = cart.data ? captureReview(cart.data.lines) : null;
    if (!captured) {
      return;
    }
    setReviewed(captured);
    setReviewing(true);
  }

  function leaveReview() {
    if (paying || awaitingPayment) {
      return;
    }
    setReviewing(false);
    setReviewed(null);
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
      setReviewing(true);
      setReviewed(cart.data ? captureReview(cart.data.lines) ?? reviewFromPayment(request, cart.data.lines) : reviewFromPayment(request, []));
      setNotice("Confirming purchase…\n\nYour order may have completed.\nWe're checking before retrying.");
      void runPayment(request, false);
    });
    // Resume a payment that was sent before the app closed, once the network is back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const snapshot = cart.data;
  const wantsReview = route.params?.startReview === true;
  if (wantsReview && snapshot && !reviewing && !paying && !awaitingPayment) {
    const captured = captureReview(snapshot.lines);
    if (captured) {
      setReviewed(captured);
      setReviewing(true);
    }
  }
  const lines = snapshot?.lines ?? [];
  const breakdown = cartBreakdown(lines);
  const liveTotal = payableTotal(lines);
  const reviewedTotal = reviewed?.totalCents ?? liveTotal;
  const balance = wallet.data;
  const after = balance !== undefined && reviewedTotal !== null ? balance - reviewedTotal : null;
  const short = after !== null && after < 0n;
  const changes = reviewed ? reviewChanges(reviewed, lines) : [];
  const canEnterReview = online && liveTotal !== null && !paying && pendingLineId === null && !awaitingPayment && !short;
  const canConfirm = online && reviewed !== null && changes.length === 0 && !paying && !awaitingPayment && !short;
  const cartBusy = !online || pendingLineId !== null || paying || awaitingPayment;

  return (
    <View style={styles.screen}>
      <AppHeader
        back={reviewing ? leaveReview : true}
        title={reviewing ? "Review Purchase" : "Cart"}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={cart.isRefetching && !cart.isLoading}
            tintColor={colors.accent.solid}
            onRefresh={() => void cart.refetch()}
          />
        }
        style={styles.scroll}
      >
        <ConnectivityBanner offlineDetail="This cart may be out of date. Reservations stay disabled until the connection returns." />
        {cart.isLoading ? <CartLineSkeleton /> : null}
        {cart.isError ? (
          <ErrorState
            body="Check the connection and try again."
            motion="financial"
            title="Your cart didn't load."
            onRetry={() => void cart.refetch()}
          />
        ) : null}
        {snapshot && snapshot.lines.length === 0 && openPackIds.length === 0 ? (
          <EmptyState
            body="Browse the shelf or the market."
            icon="cart-outline"
            primaryAction={{
              label: "Browse Packs",
              motion: "financial",
              onPress: () => navigation.navigate("Tabs", { screen: "Packs" }),
            }}
            secondaryAction={{
              label: "Browse Market",
              motion: "financial",
              onPress: () => navigation.navigate("Tabs", { screen: "Market" }),
            }}
            title="Your cart is empty."
          />
        ) : null}
        {notice ? (
          <InlineStatusCard
            {...noticeParts(notice)}
            action={
              awaitingResult
                ? {
                    label: "Check again",
                    motion: "financial",
                    variant: "secondary",
                    onPress: () => {
                      const action = inflight.current;
                      if (action) {
                        void runLineAction(action, false);
                      }
                    },
                  }
                : undefined
            }
            icon={noticeIcon(notice, awaitingResult)}
            tone={noticeTone(notice, awaitingResult)}
          />
        ) : null}
        {openPackIds.length > 0 ? (
          <PrimaryButton
            label={openPackIds.length === 1 ? "Open pack" : `Open ${openPackIds.length} packs`}
            motion="financial"
            onPress={() => navigation.navigate("Reveal", { purchasedPackIds: openPackIds })}
          />
        ) : null}
        {reviewing && reviewed ? (
          <ReviewPurchaseView
            after={after}
            balance={balance}
            changes={changes}
            reviewed={reviewed}
            short={short}
            onReviewCart={leaveReview}
          />
        ) : (
          <>
            {snapshot ? (
              <View style={styles.list}>
                {snapshot.lines.map((line) => (
                  <CartLineItem
                    key={line.lineId}
                    busy={pendingLineId === line.lineId}
                    disabled={cartBusy}
                    line={line}
                    snapshot={snapshot}
                    onAccept={() => startLineAction(line, line.lineType === "PACK" ? "acceptPrice" : "acceptListingPrice")}
                    onBrowseMarket={() => navigation.navigate("Tabs", { screen: "Market" })}
                    onRemove={() => startLineAction(line, "release")}
                    onRetry={() => startLineAction(line, "retry")}
                  />
                ))}
              </View>
            ) : null}
            {lines.length > 0 ? (
              <CartSummary
                after={after}
                balance={balance}
                marketCents={breakdown.marketCents}
                packCents={breakdown.packCents}
                short={short}
                totalCents={breakdown.totalCents}
              />
            ) : null}
          </>
        )}
      </ScrollView>
      {lines.length > 0 && openPackIds.length === 0 ? (
        <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {awaitingPayment ? (
            <RecoveryAction
              fullWidth
              label="Check again"
              motion="financial"
              variant="secondary"
              onPress={() => {
                const request = payment.current;
                if (request) {
                  void runPayment(request, false);
                }
              }}
            />
          ) : reviewing ? (
            <PrimaryButton
              disabled={!canConfirm}
              fullWidth
              label={`Confirm Purchase · ${formatCents(reviewed?.totalCents ?? 0n)}`}
              loading={paying}
              loadingLabel="Confirming purchase…"
              motion="financial"
              onPress={startPayment}
            />
          ) : (
            <PrimaryButton
              disabled={!canEnterReview}
              fullWidth
              label="Review Purchase"
              motion="financial"
              onPress={enterReview}
            />
          )}
        </View>
      ) : null}
    </View>
  );
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
  if (error.code === "CART_CHANGED" || error.code === "LISTING_PRICE_CHANGED") {
    return "Your cart changed\n\nOne or more items changed since you reviewed your order.";
  }
  if (error.code === "CHECKOUT_TOTAL_CHANGED") {
    return "The total changed. Review your cart before paying.";
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

function noticeParts(notice: string): { title: string; body?: string } {
  const blank = notice.split("\n\n");
  const head = blank[0]?.trim() ?? notice;
  if (blank.length > 1) {
    return { title: head, body: blank.slice(1).join("\n\n").trim() };
  }
  const lines = notice.split("\n").map((line) => line.trim()).filter(Boolean);
  const first = lines[0] ?? notice;
  if (lines.length <= 1) {
    return { title: first };
  }
  return { title: first, body: lines.slice(1).join("\n") };
}

function noticeTone(notice: string, awaiting: boolean): StatusKey {
  if (awaiting) {
    return "warning";
  }
  if (notice.startsWith("Paid ")) {
    return "success";
  }
  if (notice.startsWith("Confirming")) {
    return "info";
  }
  return "warning";
}

function noticeIcon(notice: string, awaiting: boolean): IconName {
  if (awaiting) {
    return "help-circle-outline";
  }
  if (notice.startsWith("Paid ")) {
    return "checkmark-circle-outline";
  }
  if (notice.startsWith("Confirming")) {
    return "time-outline";
  }
  return "alert-circle-outline";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.base,
    paddingBottom: layout.stickyCtaClearance,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  block: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.base,
  },
  ctaBar: {
    backgroundColor: colors.backgroundSecondary,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
});
