import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartRejected, CartUnknown, submitCart } from "../../api/cart";
import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { AppBottomSheet } from "../../components/AppBottomSheet";
import { Chip, ChipGroup } from "../../components/Chip";
import { CollectibleArt } from "../../components/CollectibleArt";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { ErrorState } from "../../components/ErrorState";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { RecoveryAction } from "../../components/RecoveryAction";
import { DetailSkeleton } from "../../components/Skeleton";
import { IconButton, PrimaryButton } from "../../components/buttons";
import { iconSlot } from "../../components/Icon";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, maxFontScale, radius, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";
import type { TimedDrop } from "../drops/board";
import { useClockLabel } from "../drops/DropCountdown";
import { dropClosedCopy, dropCtaLabel } from "../drops/dropCopy";
import { browsePacks, browseSimilar } from "../drops/dropNav";
import { DropStatus } from "../drops/DropStatus";
import { useDropBoard } from "../drops/useDropBoard";
import {
  categoryLabel,
  clampQuantity,
  formatBasisPoints,
  loadPackOdds,
  loadShelfPacks,
  rarityLabel,
  stockLabel,
  type Rarity,
} from "./packs";
import { useOnline } from "./useOnline";

const quantityPresets = [1, 3, 5, 10] as const;

export function PackDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "PackDetail">>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const [requested, setRequested] = useState(1);
  const [quantityOpen, setQuantityOpen] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [reserveNotice, setReserveNotice] = useState<string | null>(null);
  const [reserveUnknown, setReserveUnknown] = useState(false);
  const reserveKey = useRef<string | null>(null);
  const packs = useQuery({
    queryKey: ["shelf-packs"],
    queryFn: loadShelfPacks,
  });
  const drops = useDropBoard();
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
  const dropOpen = !pack?.drop || pack.drop.status === "LIVE";
  const loading = (packs.isLoading || drops.isLoading) && !pack;
  const failed = !pack && packs.isError && drops.isError;
  const total = pack ? pack.priceCents * BigInt(quantity) : 0n;
  const cap = selectionCap > 100n ? 100 : Number(selectionCap);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
    }, [queryClient]),
  );

  useEffect(() => {
    return watchTables("pack-detail-stock", [{ table: "pack_skus" }], () => {
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
    });
  }, [queryClient, route.params.packId]);

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

  const ctaLabel = quantity < 1
    ? "Sold out"
    : `Add ${quantity} to Cart · ${formatCents(total)}`;
  const canReserve = online && dropOpen && quantity >= 1 && !reserveUnknown;

  return (
    <View style={styles.screen}>
      <AppHeader back cart />
      <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
        <ConnectivityBanner offlineDetail="Price and availability may be out of date. Reservations stay disabled until the connection returns." />

        {loading ? <DetailSkeleton accessibilityLabel="Loading this pack" /> : null}

        {failed ? (
          <ErrorState
            body="Check the connection and try again."
            title="This pack didn't load."
            onRetry={() => {
              void packs.refetch();
              void drops.refetch();
            }}
          />
        ) : null}

        {packs.data && drops.data && !pack ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
            This pack is not on the shelf.
          </Text>
        ) : null}

        {pack ? (
          <View style={styles.body}>
            <CollectibleArt category={pack.category} height={220} title={pack.name} />
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>
              {categoryLabel(pack.category)}
            </Text>
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.name}>{pack.name}</Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.tier}>{pack.tier}</Text>
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>{formatCents(pack.priceCents)}</Text>
            {pack.drop && drops.data ? (
              <DropStatus board={drops.data} drop={pack.drop} />
            ) : (
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.availability}>
                {stockLabel(pack.reservable)}
              </Text>
            )}
            {pack.maxPerUser ? (
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
                Maximum {pack.maxPerUser} packs per user
              </Text>
            ) : null}

            <View style={styles.section}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>
                What&apos;s inside
              </Text>
              {odds.isLoading ? (
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>Loading odds…</Text>
              ) : null}
              {odds.isError ? (
                <ErrorState title="Odds didn't load. Try again." onRetry={() => void odds.refetch()} />
              ) : null}
              {odds.data && odds.data.length === 0 ? (
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
                  Odds are not published for this pack.
                </Text>
              ) : null}
              {odds.data?.map((row) => (
                <View key={row.rarity} style={styles.oddsRow}>
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={[styles.oddsRarity, { color: rarityColor(row.rarity) }]}>
                    {rarityLabel(row.rarity)}
                  </Text>
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.oddsValue}>
                    {formatBasisPoints(row.basisPoints)}
                  </Text>
                </View>
              ))}
            </View>

            {pack.drop && pack.drop.status !== "LIVE" ? (
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
                {dropClosedCopy(pack.drop.status)}
              </Text>
            ) : quantity === 0 ? (
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
                Sold out. None of these packs are left to reserve.
              </Text>
            ) : (
              <Pressable
                accessibilityLabel={`Quantity ${quantity}. Change`}
                accessibilityRole="button"
                onPress={() => setQuantityOpen(true)}
                style={({ pressed }) => [styles.qtyRow, pressed ? styles.qtyPressed : null]}
              >
                <View style={styles.qtyCopy}>
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>Quantity</Text>
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.summaryLine}>
                    {quantity} × {formatCents(pack.priceCents)}
                  </Text>
                </View>
                <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.quantity}>{quantity}</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>

      {pack ? (
        <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {reserveNotice ? (
            <InlineStatusCard
              icon={reserveUnknown ? "help-circle-outline" : "alert-circle-outline"}
              title={reserveNotice}
              tone={reserveUnknown ? "warning" : "info"}
            />
          ) : null}
          {pack.drop && pack.drop.status !== "LIVE" && drops.data ? (
            <ClosedDropCta
              drop={pack.drop}
              fetchedAtMs={drops.data.fetchedAtMs}
              serverNow={drops.data.serverNow}
              onBrowsePacks={() => browsePacks(navigation)}
              onBrowseSimilar={() => browseSimilar(navigation, pack.category)}
            />
          ) : reserveUnknown ? (
            <RecoveryAction
              fullWidth
              label="Check again"
              motion="financial"
              variant="secondary"
              onPress={() => startReserve(false)}
            />
          ) : (
            <PrimaryButton
              disabled={!canReserve}
              fullWidth
              label={ctaLabel}
              loading={reserving}
              loadingLabel="Confirming reservation…"
              motion="financial"
              onPress={() => startReserve(true)}
            />
          )}
        </View>
      ) : null}

      {pack && quantity > 0 ? (
        <AppBottomSheet
          title="Quantity"
          visible={quantityOpen}
          onClose={() => setQuantityOpen(false)}
          footer={
            <PrimaryButton
              fullWidth
              label={`Done · ${formatCents(total)}`}
              onPress={() => setQuantityOpen(false)}
            />
          }
        >
          <ChipGroup accessibilityLabel="Quantity presets">
            {quantityPresets.map((preset) => (
              <Chip
                key={preset}
                disabled={preset > cap}
                label={String(preset)}
                selected={quantity === preset}
                onPress={() => setRequested(preset)}
              />
            ))}
          </ChipGroup>
          <View style={styles.stepper}>
            <IconButton
              accessibilityLabel="Decrease quantity"
              disabled={quantity <= 1}
              icon={iconSlot("remove", 20)}
              variant="surface"
              onPress={() => setRequested(quantity - 1)}
            />
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.quantity}>{quantity}</Text>
            <IconButton
              accessibilityLabel="Increase quantity"
              disabled={quantity >= cap}
              icon={iconSlot("add", 20)}
              variant="surface"
              onPress={() => setRequested(quantity + 1)}
            />
          </View>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.summaryLine}>
            {quantity} × {formatCents(pack.priceCents)}
          </Text>
        </AppBottomSheet>
      ) : null}
    </View>
  );
}

function ClosedDropCta({
  drop,
  serverNow,
  fetchedAtMs,
  onBrowsePacks,
  onBrowseSimilar,
}: {
  drop: TimedDrop;
  serverNow: string;
  fetchedAtMs: number;
  onBrowsePacks: () => void;
  onBrowseSimilar: () => void;
}) {
  const startsIn = useClockLabel(drop.startsAt, serverNow, fetchedAtMs, drop.status === "UPCOMING");
  if (drop.status === "SOLD_OUT") {
    return <PrimaryButton fullWidth label={dropCtaLabel("SOLD_OUT")} onPress={onBrowseSimilar} />;
  }
  if (drop.status === "ENDED") {
    return <PrimaryButton fullWidth label={dropCtaLabel("ENDED")} onPress={onBrowsePacks} />;
  }
  return <PrimaryButton disabled fullWidth label={`Starts in ${startsIn}`} onPress={() => undefined} />;
}

function reserveCap(reservable: bigint, maxPerUser: number | null): bigint {
  if (maxPerUser === null) {
    return reservable;
  }
  const limit = BigInt(maxPerUser);
  return reservable < limit ? reservable : limit;
}

function rarityColor(rarity: Rarity): string {
  return colors.rarity[rarity].solid;
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
    gap: spacing.md,
    paddingBottom: layout.stickyCtaClearance,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  body: {
    gap: spacing.sm,
  },
  block: {
    gap: spacing.sm,
  },
  kicker: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  name: {
    ...typography.display,
    color: colors.textPrimary,
  },
  tier: {
    ...typography.body,
    color: colors.textSecondary,
  },
  price: {
    ...typography.moneyLarge,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  availability: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.sm,
    marginTop: layout.sectionGap,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  oddsRow: {
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
    paddingVertical: spacing.md,
  },
  oddsRarity: {
    ...typography.bodyMedium,
  },
  oddsValue: {
    ...typography.moneySmall,
    color: colors.textPrimary,
  },
  stepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  qtyRow: {
    alignItems: "center",
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    marginTop: layout.sectionGap,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  qtyPressed: {
    backgroundColor: colors.surfacePressed,
  },
  qtyCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  quantity: {
    ...typography.title,
    color: colors.textPrimary,
    minWidth: 40,
    textAlign: "center",
  },
  summaryLine: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  total: {
    ...typography.money,
    color: colors.textPrimary,
  },
  ctaBar: {
    backgroundColor: colors.backgroundSecondary,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  ctaNotice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
