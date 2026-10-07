import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { loadListingQuote } from "../../api/listing";
import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { CollectibleArt } from "../../components/CollectibleArt";
import { Icon } from "../../components/Icon";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { ErrorState } from "../../components/ErrorState";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { RecoveryAction } from "../../components/RecoveryAction";
import { DetailSkeleton } from "../../components/Skeleton";
import { PrimaryButton, SecondaryButton } from "../../components/buttons";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, maxFontScale, radius, spacing, typography } from "../../theme";
import { formatCents } from "../../utils/money";
import { categoryLabel, rarityLabel } from "../shelf/packs";
import { timeAgo } from "../shelf/timeAgo";
import { loadMarket, type MarketListing } from "./board";
import { listingRarity, marketGap } from "./select";
import { useAddListing } from "./useAddListing";

export function MarketDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "MarketDetail">>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const add = useAddListing();
  const [lastListing, setLastListing] = useState<MarketListing | null>(null);
  const [frozenPrice, setFrozenPrice] = useState<{ id: string; price: bigint } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const market = useQuery({
    queryKey: ["market"],
    queryFn: loadMarket,
  });
  const listing = market.data?.find((candidate) => candidate.listingId === route.params.listingId);
  if (listing && lastListing?.listingId !== listing.listingId) {
    setLastListing(listing);
  }
  if (listing && frozenPrice?.id !== listing.listingId) {
    setFrozenPrice({ id: listing.listingId, price: listing.priceCents });
  }
  const seen = listing ?? lastListing;
  const viewedPrice = frozenPrice?.price ?? listing?.priceCents ?? null;
  const quote = useQuery({
    queryKey: ["listing-quote", viewedPrice?.toString() ?? "none"],
    queryFn: () => loadListingQuote(viewedPrice as bigint),
    enabled: viewedPrice !== null && listing !== undefined && !listing.isOwn,
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
    const stop = watchTables("market-detail", [{ table: "marketplace_listings" }], refresh);
    const clock = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => {
      stop();
      clearInterval(clock);
    };
  }, [refresh]);

  const gone = Boolean(market.data) && !listing;
  const priceChanged = Boolean(
    listing
    && viewedPrice !== null
    && listing.priceCents !== viewedPrice,
  );
  const rarity = listing ? listingRarity(listing) : null;
  const gap = listing && viewedPrice !== null ? marketGap(viewedPrice, listing.currentValueCents) : null;
  const listedLabel = listing?.listedAt ? timeAgo(listing.listedAt, nowMs) : null;
  const canBuy = add.online && listing !== undefined && !listing.isOwn && !priceChanged && !add.unknown && !add.pending;

  function browseSimilar() {
    const category = listing?.category ?? seen?.category;
    navigation.navigate("Tabs", {
      screen: "Market",
      params: category ? { category } : undefined,
    });
  }

  return (
    <View style={styles.screen}>
      <AppHeader back cart />
      <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
        <ConnectivityBanner offlineDetail="These listings may be out of date. Adding a listing stays disabled until the connection returns." />
        {market.isLoading && !listing ? <DetailSkeleton accessibilityLabel="Loading this listing" /> : null}
        {market.isError && !listing ? (
          <ErrorState
            body="Check the connection and try again."
            title="This listing didn't load."
            onRetry={() => void market.refetch()}
          />
        ) : null}

        {gone ? (
          <GoneBanner />
        ) : null}

        {listing ? (
          <View style={styles.body}>
            <CollectibleArt
              category={listing.category}
              height={220}
              imageUrl={listing.imageUrl}
              title={listing.name}
            />
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>
              {categoryLabel(listing.category)}
            </Text>
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.name}>{listing.name}</Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.rarity}>
              {rarity ? rarityLabel(rarity) : listing.rarity}
            </Text>

            {priceChanged && viewedPrice !== null ? (
              <PriceChangeBanner
                fromCents={viewedPrice}
                toCents={listing.priceCents}
                onReview={() => {
                  setFrozenPrice({ id: listing.listingId, price: listing.priceCents });
                }}
              />
            ) : null}

            <View style={styles.card}>
              <Fact label="Listing price" value={viewedPrice !== null ? formatCents(viewedPrice) : "—"} emphasis />
              {listing.currentValueCents !== null ? (
                <Fact label="Estimated value" value={formatCents(listing.currentValueCents)} />
              ) : null}
              {gap ? <Fact label={gap.headline} value={gap.detail} /> : null}
            </View>

            <View style={styles.card}>
              <Fact label="Seller" value={listing.sellerUsername} />
              {listedLabel ? <Fact label="Listed" value={listedLabel} /> : null}
              {listing.isOwn ? <Fact label="Ownership" value="Your listing" /> : null}
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.note}>
                Listings are not reserved. The seller can still change or remove one.
              </Text>
            </View>

            {listing.isOwn ? null : (
              <View style={styles.card}>
                <Fact label="You pay" value={viewedPrice !== null ? formatCents(viewedPrice) : "—"} emphasis />
                <Fact
                  label="Platform fee"
                  value={quote.data ? formatCents(quote.data.feeCents) : quote.isLoading ? "Calculating fee…" : "—"}
                />
                <Fact
                  label="Seller receives"
                  value={quote.data ? formatCents(quote.data.sellerCents) : "—"}
                />
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.note}>
                  You pay the listing price. The 8% fee is taken from the seller.
                </Text>
                {quote.isError ? (
                  <InlineStatusCard icon="alert-circle-outline" title="The fee preview didn't load." tone="warning" />
                ) : null}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {gone ? (
        <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <PrimaryButton fullWidth label="Browse Similar" onPress={browseSimilar} />
        </View>
      ) : listing ? (
        <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {add.notice ? (
            <InlineStatusCard
              icon={add.unknown ? "help-circle-outline" : "alert-circle-outline"}
              title={add.notice}
              tone={add.unknown ? "warning" : "info"}
            />
          ) : null}
          {listing.isOwn ? (
            listing.ownedItemId ? (
              <SecondaryButton
                fullWidth
                label="Edit listing"
                motion="financial"
                onPress={() => navigation.navigate("Listing", { ownedItemId: listing.ownedItemId as string })}
              />
            ) : (
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.ctaNotice}>Your listing</Text>
            )
          ) : add.unknown ? (
            <RecoveryAction
              fullWidth
              label="Check again"
              motion="financial"
              variant="secondary"
              onPress={() => add.checkAgain(listing, "stay")}
            />
          ) : (
            <>
              <PrimaryButton
                disabled={!canBuy}
                fullWidth
                label="Add to Cart"
                loading={add.pending}
                loadingLabel="Adding to cart…"
                motion="financial"
                onPress={() => add.addListing(listing, true, "stay")}
              />
              <SecondaryButton
                disabled={!canBuy}
                fullWidth
                label="Buy Now"
                motion="financial"
                onPress={() => add.addListing(listing, true, "review")}
              />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={emphasis ? styles.factLabelStrong : styles.factLabel}>
        {label}
      </Text>
      <View style={styles.factValueWrap}>
        <Text
          ellipsizeMode="tail"
          maxFontSizeMultiplier={maxFontScale.display}
          numberOfLines={1}
          style={emphasis ? styles.factValueStrong : styles.factValue}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function PriceChangeBanner({
  fromCents,
  toCents,
  onReview,
}: {
  fromCents: bigint;
  toCents: bigint;
  onReview: () => void;
}) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerHead}>
        <Icon color={colors.status.warning.solid} name="alert-circle-outline" size={18} />
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.bannerTitle}>Seller updated the price</Text>
      </View>
      <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.bannerPrice}>
        {formatCents(fromCents)} → {formatCents(toCents)}
      </Text>
      <SecondaryButton label="Review New Price" motion="financial" onPress={onReview} />
    </View>
  );
}

function GoneBanner() {
  return (
    <View style={[styles.banner, styles.bannerSold]}>
      <View style={styles.bannerHead}>
        <Icon color={colors.status.error.solid} name="close-circle-outline" size={18} />
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.bannerSoldTitle}>This item has sold</Text>
      </View>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.bannerBody}>
        Another collector purchased this listing.
      </Text>
    </View>
  );
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
  body: {
    gap: spacing.md,
  },
  kicker: {
    ...typography.label,
    color: colors.textTertiary,
  },
  name: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  rarity: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  fact: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  factLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  factLabelStrong: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flexShrink: 0,
  },
  factValueWrap: {
    flex: 1,
    minWidth: 0,
  },
  factValue: {
    ...typography.moneySmall,
    color: colors.textSecondary,
    textAlign: "right",
  },
  factValueStrong: {
    ...typography.money,
    color: colors.textPrimary,
    textAlign: "right",
  },
  note: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  block: {
    gap: spacing.sm,
  },
  banner: {
    backgroundColor: colors.status.warning.muted,
    borderColor: colors.status.warning.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: layout.cardPadding,
  },
  bannerSold: {
    backgroundColor: colors.status.error.muted,
    borderColor: colors.status.error.border,
  },
  bannerHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  bannerTitle: {
    ...typography.bodyMedium,
    color: colors.status.warning.solid,
    flex: 1,
  },
  bannerSoldTitle: {
    ...typography.bodyMedium,
    color: colors.status.error.solid,
    flex: 1,
  },
  bannerBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  bannerPrice: {
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
