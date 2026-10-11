import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useWindowDimensions,
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
import { IconButton, PrimaryButton, TertiaryButton } from "../../components/buttons";
import { Icon, iconSlot } from "../../components/Icon";
import type { AppStackParamList } from "../../navigation/types";
import { colors, imageAspect, layout, maxFontScale, radius, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";
import type { TimedDrop } from "../drops/board";
import { useClockLabel } from "../drops/DropCountdown";
import { dropClosedCopy, dropCtaLabel } from "../drops/dropCopy";
import { browsePacks, browseSimilar } from "../drops/dropNav";
import { DropStatus } from "../drops/DropStatus";
import { useDropBoard } from "../drops/useDropBoard";
import { useWalletBalance } from "../wallet/useWalletBalance";
import {
  categoryLabel,
  clampQuantity,
  formatBasisPoints,
  loadPackOdds,
  loadShelfPacks,
  packTierClass,
  rarityLabel,
  rarityOrder,
  stockLabel,
  type PackOdds,
} from "./packs";
import { useOnline } from "./useOnline";

const quantityPresets = [1, 3, 5, 10] as const;

export function PackDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "PackDetail">>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const online = useOnline();
  const balance = useWalletBalance();
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
  const shelfPack = packs.data?.find((candidate) => candidate.id === route.params.packId);
  const odds = useQuery({
    queryKey: ["pack-odds", route.params.packId],
    queryFn: () => loadPackOdds(route.params.packId),
    enabled: !shelfPack?.fixedProduct,
  });
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
          fixedProduct: false,
          rarity: null,
          imageUrl: null as string | null,
          maxPerUser: drop.maxPerUser,
          drop,
        }
      : undefined;
  const isProduct = Boolean(pack?.fixedProduct);
  const selectionCap = pack ? reserveCap(pack.reservable, pack.maxPerUser) : 0n;
  const quantity = pack ? clampQuantity(requested, selectionCap) : 0;
  const dropOpen = !pack?.drop || pack.drop.status === "LIVE";
  const loading = (packs.isLoading || drops.isLoading) && !pack;
  const failed = !pack && packs.isError && drops.isError;
  const total = pack ? pack.priceCents * BigInt(quantity) : 0n;
  const cap = selectionCap > 100n ? 100 : Number(selectionCap);
  const heroWidth = Math.min(windowWidth - layout.screenPadding * 2, 360);
  const heroHeight = Math.round(heroWidth / imageAspect.tradingCard);
  const tierClass = pack ? packTierClass(pack.priceCents) : "entry";
  const oddsRows = useMemo(() => completeOdds(odds.data), [odds.data]);
  const oddsTotalPoints = useMemo(
    () => oddsRows.reduce((sum, row) => sum + row.basisPoints, 0),
    [oddsRows],
  );

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
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

  const unitWord = isProduct
    ? (quantity === 1 ? "item" : "items")
    : (quantity === 1 ? "pack" : "packs");
  const ctaLabel = quantity < 1
    ? "Sold out"
    : pack?.drop && pack.drop.status === "LIVE"
      ? `Reserve ${quantity} · ${formatCents(total)}`
      : `Add ${quantity} to Cart · ${formatCents(total)}`;
  const canReserve = online && dropOpen && quantity >= 1 && !reserveUnknown;

  const walletLabel = balance.data !== undefined
    ? formatCents(balance.data)
    : balance.isError
      ? "Unavailable"
      : "—";
  const canCover = balance.data !== undefined && pack ? balance.data >= total : null;
  const shortfall = balance.data !== undefined && pack && balance.data < total
    ? total - balance.data
    : null;

  return (
    <View style={styles.screen}>
      <AppHeader back cart wallet />
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <ConnectivityBanner offlineDetail="Price and availability may be out of date. Reservations stay disabled until the connection returns." />

        {loading ? (
          <DetailSkeleton accessibilityLabel={isProduct ? "Loading this item" : "Loading this pack"} />
        ) : null}

        {failed ? (
          <ErrorState
            body="Check the connection and try again."
            title={isProduct ? "This item didn't load." : "This pack didn't load."}
            onRetry={() => {
              void packs.refetch();
              void drops.refetch();
            }}
          />
        ) : null}

        {packs.data && drops.data && !pack ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
            This is not on the shelf.
          </Text>
        ) : null}

        {pack ? (
          <View style={styles.body}>
            <View
              style={[
                styles.heroFrame,
                tierClass === "grail" ? styles.heroFrameGrail : tierClass === "premium" ? styles.heroFramePremium : null,
                { width: heroWidth, alignSelf: "center" },
              ]}
            >
              <View style={styles.heroGlow} />
              <CollectibleArt
                category={pack.category}
                fit="contain"
                height={heroHeight}
                imageUrl={pack.imageUrl}
                style={styles.heroArt}
                title={pack.name}
              />
              {pack.drop ? (
                <View style={styles.heroBadge}>
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.heroBadgeLabel}>
                    {pack.drop.status === "LIVE" ? "Live drop" : pack.drop.status === "UPCOMING" ? "Timed drop" : "Drop"}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.identity}>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>
                {categoryLabel(pack.category)}
                {" · "}
                {isProduct && pack.rarity ? rarityLabel(pack.rarity) : pack.tier}
              </Text>
              <Text
                accessibilityRole="header"
                maxFontSizeMultiplier={maxFontScale.display}
                style={styles.name}
              >
                {pack.name}
              </Text>
              <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.price}>
                {formatCents(pack.priceCents)}
              </Text>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.unitHint}>
                {isProduct ? "Per item" : "Per pack"}
              </Text>
            </View>

            <View style={styles.contextCard}>
              <View style={styles.contextRow}>
                <Icon color={colors.accent.solid} name="wallet-outline" size={18} />
                <View style={styles.contextCopy}>
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.contextLabel}>Wallet</Text>
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.contextValue}>{walletLabel}</Text>
                </View>
                <TertiaryButton label="Deposit" onPress={() => navigation.navigate("Wallet")} size="sm" />
              </View>
              {quantity >= 1 && shortfall !== null ? (
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.contextWarn}>
                  Need {formatCents(shortfall)} more for this quantity. You can still reserve; checkout checks balance.
                </Text>
              ) : null}
              {quantity >= 1 && canCover === true ? (
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.contextOk}>
                  Balance covers {formatCents(total)} for {quantity} {unitWord}.
                </Text>
              ) : null}
            </View>

            <View style={styles.availabilityCard}>
              {pack.drop && drops.data ? (
                <DropStatus board={drops.data} drop={pack.drop} />
              ) : (
                <View style={styles.stockRow}>
                  <Icon
                    color={pack.reservable > 0n ? colors.status.success.solid : colors.status.error.solid}
                    name={pack.reservable > 0n ? "checkmark-circle-outline" : "close-circle-outline"}
                    size={18}
                  />
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.availability}>
                    {stockLabel(pack.reservable)}
                  </Text>
                </View>
              )}
              {pack.maxPerUser ? (
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
                  Maximum {pack.maxPerUser} packs per user for this drop.
                </Text>
              ) : null}
            </View>

            {!isProduct ? (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>
                    What&apos;s inside
                  </Text>
                  {oddsTotalPoints > 0 ? (
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionMeta}>
                      {formatBasisPoints(oddsTotalPoints)} published
                    </Text>
                  ) : null}
                </View>
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionLead}>
                  Published pull rates for this pack. Exact contents are assigned when you open it.
                </Text>
                <View style={styles.oddsCard}>
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
                  {oddsRows.map((row) => (
                    <OddsRow key={row.rarity} row={row} />
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.section}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>
                  What you get
                </Text>
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionLead}>
                  You receive this exact item. It goes straight to your collection after payment.
                </Text>
              </View>
            )}

            {pack.drop && pack.drop.status !== "LIVE" ? (
              <InlineStatusCard
                icon="time-outline"
                title={dropClosedCopy(pack.drop.status)}
                tone="info"
              />
            ) : quantity === 0 ? (
              <InlineStatusCard
                icon="close-circle-outline"
                title={
                  isProduct
                    ? "Sold out. None of these items are left to reserve."
                    : "Sold out. None of these packs are left to reserve."
                }
                tone="warning"
              />
            ) : (
              <View style={styles.qtyCard}>
                <View style={styles.qtyHeader}>
                  <View style={styles.qtyCopy}>
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>Quantity</Text>
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.summaryLine}>
                      {quantity} × {formatCents(pack.priceCents)} = {formatCents(total)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Open quantity presets"
                    accessibilityRole="button"
                    onPress={() => setQuantityOpen(true)}
                    style={({ pressed }) => [styles.qtyChip, pressed ? styles.qtyPressed : null]}
                  >
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.qtyChipLabel}>Presets</Text>
                  </Pressable>
                </View>
                <View style={styles.stepper}>
                  <IconButton
                    accessibilityLabel="Decrease quantity"
                    disabled={quantity <= 1 || reserving}
                    icon={iconSlot("remove", 20)}
                    variant="surface"
                    onPress={() => setRequested(Math.max(1, quantity - 1))}
                  />
                  <Text
                    accessibilityLabel={`Quantity ${quantity}`}
                    maxFontSizeMultiplier={maxFontScale.display}
                    style={styles.quantity}
                  >
                    {quantity}
                  </Text>
                  <IconButton
                    accessibilityLabel="Increase quantity"
                    disabled={quantity >= cap || reserving}
                    icon={iconSlot("add", 20)}
                    variant="surface"
                    onPress={() => setRequested(Math.min(cap, quantity + 1))}
                  />
                </View>
              </View>
            )}

            <View style={styles.trustCard}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.sectionTitle}>
                Before you buy
              </Text>
              <TrustLine icon="lock-closed-outline" text="Checkout holds stock for a few minutes, then charges your wallet." />
              {isProduct ? (
                <>
                  <TrustLine icon="checkmark-circle-outline" text="You get this exact item — no random pull." />
                  <TrustLine icon="albums-outline" text="Paid items go to your collection. You can list them on the market." />
                </>
              ) : (
                <>
                  <TrustLine icon="shuffle-outline" text="Pack contents are assigned on open. Odds above are the published rates." />
                  <TrustLine icon="albums-outline" text="Opened cards go to your collection. Listing and sales stay there." />
                </>
              )}
            </View>
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
          {!online ? (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.ctaNotice}>
              Offline — reservations stay disabled until the connection returns.
            </Text>
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
              accessibilityHint={
                canReserve
                  ? (isProduct ? "Reserves this item and opens your cart" : "Reserves this pack and opens your cart")
                  : undefined
              }
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
            {quantity} × {formatCents(pack.priceCents)} = {formatCents(total)}
          </Text>
        </AppBottomSheet>
      ) : null}
    </View>
  );
}

function OddsRow({ row }: { row: PackOdds }) {
  const tone = colors.rarity[row.rarity];
  const width = Math.max(4, Math.min(100, Math.round(row.basisPoints / 100)));
  return (
    <View style={styles.oddsRow} accessibilityLabel={`${rarityLabel(row.rarity)}. ${formatBasisPoints(row.basisPoints)}`}>
      <View style={styles.oddsTop}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={[styles.oddsRarity, { color: tone.solid }]}>
          {rarityLabel(row.rarity)}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.oddsValue}>
          {formatBasisPoints(row.basisPoints)}
        </Text>
      </View>
      <View style={styles.oddsTrack}>
        <View style={[styles.oddsFill, { width: `${width}%`, backgroundColor: tone.solid }]} />
      </View>
    </View>
  );
}

function TrustLine({
  icon,
  text,
}: {
  icon: "lock-closed-outline" | "shuffle-outline" | "albums-outline" | "checkmark-circle-outline";
  text: string;
}) {
  return (
    <View style={styles.trustLine}>
      <Icon color={colors.premium.gold} name={icon} size={18} />
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.trustText}>{text}</Text>
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

/** Keep rarity order complete when the API returns a full set; otherwise show what published. */
function completeOdds(rows: PackOdds[] | undefined): PackOdds[] {
  if (!rows || rows.length === 0) {
    return [];
  }
  const byRarity = new Map(rows.map((row) => [row.rarity, row]));
  const ordered = rarityOrder
    .map((rarity) => byRarity.get(rarity))
    .filter((row): row is PackOdds => row !== undefined);
  return ordered.length > 0 ? ordered : rows;
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
    paddingBottom: layout.stickyCtaClearance + spacing.xl,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  body: {
    gap: spacing.md,
  },
  heroFrame: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: "hidden",
    padding: spacing.md,
  },
  heroFramePremium: {
    borderColor: colors.accent.border,
  },
  heroFrameGrail: {
    borderColor: colors.premium.goldBorder,
  },
  heroGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.premium.goldMuted,
    opacity: 0.35,
  },
  heroArt: {
    backgroundColor: "transparent",
    width: "100%",
  },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  heroBadgeLabel: {
    ...typography.label,
    color: colors.accent.solid,
    fontSize: 10,
  },
  identity: {
    gap: spacing.xxs,
  },
  kicker: {
    ...typography.label,
    color: colors.textTertiary,
  },
  name: {
    ...typography.display,
    color: colors.textPrimary,
  },
  price: {
    ...typography.moneyLarge,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  unitHint: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  contextCard: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.base,
  },
  contextRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  contextCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  contextLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  contextValue: {
    ...typography.moneySmall,
    color: colors.textPrimary,
  },
  contextWarn: {
    ...typography.bodySmall,
    color: colors.status.warning.solid,
  },
  contextOk: {
    ...typography.bodySmall,
    color: colors.status.success.solid,
  },
  availabilityCard: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.base,
  },
  stockRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  availability: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHead: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  sectionMeta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  sectionLead: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  oddsCard: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.base,
  },
  oddsRow: {
    gap: spacing.xs,
  },
  oddsTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  oddsRarity: {
    ...typography.bodyMedium,
  },
  oddsValue: {
    ...typography.moneySmall,
    color: colors.textPrimary,
  },
  oddsTrack: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    height: 6,
    overflow: "hidden",
  },
  oddsFill: {
    borderRadius: radius.full,
    height: "100%",
    opacity: 0.85,
  },
  qtyCard: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.base,
  },
  qtyHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  qtyCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  qtyChip: {
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: layout.minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  qtyChipLabel: {
    ...typography.buttonSmall,
    color: colors.accent.solid,
  },
  qtyPressed: {
    backgroundColor: colors.surfacePressed,
  },
  stepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "center",
  },
  quantity: {
    ...typography.title,
    color: colors.textPrimary,
    minWidth: 48,
    textAlign: "center",
  },
  summaryLine: {
    ...typography.body,
    color: colors.textSecondary,
  },
  trustCard: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.premium.goldBorder,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.base,
  },
  trustLine: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
  },
  trustText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  ctaBar: {
    backgroundColor: colors.backgroundSecondary,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  ctaNotice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
