import { useRef, useState } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ListingRejected, ListingUnknown, loadListingQuote, submitListing } from "../../api/listing";
import { AppHeader } from "../../components/AppHeader";
import { AppBottomSheet } from "../../components/AppBottomSheet";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { RecoveryAction } from "../../components/RecoveryAction";
import { DetailSkeleton } from "../../components/Skeleton";
import { DestructiveButton, PrimaryButton, SecondaryButton, TertiaryButton } from "../../components/buttons";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, maxFontScale, radius, spacing, typography, useContentBottomPadding } from "../../theme";
import { dollarsToCents, formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";
import { loadHoldings } from "./inventory";
import { formatSignedCents, profitCents } from "./portfolio";

export function ListingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Listing">>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const contentBottom = useContentBottomPadding();
  const [priceInput, setPriceInput] = useState("");
  const [priceOpen, setPriceOpen] = useState(false);
  const [delistOpen, setDelistOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [pendingKind, setPendingKind] = useState<"list" | "reprice" | "delist">("list");
  const actionKey = useRef<string | null>(null);
  const holdings = useQuery({
    queryKey: ["holdings"],
    queryFn: loadHoldings,
  });
  const holding = holdings.data?.find((candidate) => candidate.ownedItemId === route.params.ownedItemId);
  const priceCents = dollarsToCents(priceInput);
  const quote = useQuery({
    queryKey: ["listing-quote", priceCents?.toString() ?? "none"],
    queryFn: () => loadListingQuote(priceCents as bigint),
    enabled: priceCents !== null,
  });

  function startAction(kind: "list" | "reprice" | "delist", remember: boolean) {
    if (!holding || !online || saving) {
      return;
    }
    if (kind !== "delist" && priceCents === null) {
      setNotice("Enter a price greater than zero.");
      return;
    }
    if ((kind === "reprice" || kind === "delist") && !holding.listingId) {
      setNotice("That listing is no longer active.");
      return;
    }
    setPendingKind(kind);
    const idempotencyKey = remember || !actionKey.current ? Crypto.randomUUID() : actionKey.current;
    if (remember) {
      actionKey.current = idempotencyKey;
    }
    setSaving(true);
    setNotice(kind === "delist" ? "Removing the listing…" : "Saving the listing…");
    const action = kind === "delist"
      ? submitListing({ action: "delist", listingId: holding.listingId as string, idempotencyKey })
      : kind === "reprice"
        ? submitListing({
          action: "reprice",
          listingId: holding.listingId as string,
          priceCents: priceCents as bigint,
          idempotencyKey,
        })
        : submitListing({
          action: "list",
          ownedItemId: holding.ownedItemId,
          priceCents: priceCents as bigint,
          idempotencyKey,
        });

    void action.then(() => {
      actionKey.current = null;
      setUnknown(false);
      setNotice(null);
      setPriceOpen(false);
      setDelistOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
      navigation.navigate("Tabs", { screen: "Portfolio" });
    }).catch((error: unknown) => {
      if (error instanceof ListingUnknown) {
        setUnknown(true);
        setNotice("Saving the listing…\n\nThis change may have completed.\nWe're checking before retrying.");
        return;
      }
      actionKey.current = null;
      setUnknown(false);
      setNotice(error instanceof ListingRejected ? error.message : "That listing change did not go through. Check the price and try again.");
    }).finally(() => {
      setSaving(false);
    });
  }

  const listed = holding?.state === "LISTED" && holding.listingId;

  return (
    <View style={styles.screen}>
      <AppHeader back title={listed ? "Edit listing" : "List for sale"} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
        keyboardShouldPersistTaps="handled"
        style={styles.screen}
      >
        <ConnectivityBanner offlineDetail="This item may be out of date. Listing, price changes, and delist stay disabled until the connection returns." />
        {holdings.isLoading && !holding ? (
          <DetailSkeleton accessibilityLabel="Loading this item" artHeight={160} />
        ) : null}
        {holdings.data && !holding ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
            That item is not in your collection.
          </Text>
        ) : null}
        {holding ? (
          <View style={styles.detail}>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.category}>
              {categoryLabel(holding.category)}
            </Text>
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={maxFontScale.display}
              style={styles.name}
            >
              {holding.name}
            </Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.label}>
              Current estimated value
            </Text>
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.value}>
              {formatCents(holding.estimatedValueCents)}
            </Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.label}>Paid</Text>
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.value}>
              {formatCents(holding.acquisitionPriceCents)}
            </Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.label}>P&L</Text>
            <Text
              accessibilityLabel={`P and L ${formatSignedCents(profitCents(holding.estimatedValueCents, holding.acquisitionPriceCents))}`}
              maxFontSizeMultiplier={maxFontScale.display}
              style={styles.value}
            >
              {formatSignedCents(profitCents(holding.estimatedValueCents, holding.acquisitionPriceCents))}
            </Text>
            {listed && holding.listingPriceCents !== null ? (
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
                Listed at {formatCents(holding.listingPriceCents)}
              </Text>
            ) : null}
            {priceCents !== null ? (
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
                Draft price {formatCents(priceCents)}
              </Text>
            ) : null}
            {listed ? (
              <View style={styles.actions}>
                <PrimaryButton
                  disabled={!online || saving || unknown}
                  fullWidth
                  label="Change price"
                  motion="financial"
                  onPress={() => setPriceOpen(true)}
                />
                <SecondaryButton
                  disabled={!online || saving || unknown}
                  fullWidth
                  label="Delist"
                  motion="financial"
                  onPress={() => setDelistOpen(true)}
                />
              </View>
            ) : (
              <View style={styles.actions}>
                <PrimaryButton
                  disabled={!online || saving || unknown}
                  fullWidth
                  label="List for sale"
                  motion="financial"
                  onPress={() => setPriceOpen(true)}
                />
              </View>
            )}
            {notice ? (
              <InlineStatusCard
                action={
                  unknown
                    ? {
                        label: "Check again",
                        motion: "financial",
                        variant: "secondary",
                        onPress: () => startAction(pendingKind, false),
                      }
                    : undefined
                }
                icon={unknown ? "help-circle-outline" : "alert-circle-outline"}
                title={notice}
                tone={unknown ? "warning" : "info"}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {holding ? (
        <AppBottomSheet
          motion="financial"
          title={listed ? "Save price" : "List for sale"}
          visible={priceOpen}
          footer={
            unknown && pendingKind !== "delist" ? (
              <RecoveryAction
                fullWidth
                label="Check again"
                motion="financial"
                variant="secondary"
                onPress={() => startAction(pendingKind, false)}
              />
            ) : (
              <PrimaryButton
                disabled={!online || saving || unknown || priceCents === null}
                fullWidth
                label={saving ? "Saving…" : listed ? "Save price" : "List for sale"}
                loading={saving && pendingKind !== "delist"}
                loadingLabel="Saving the listing…"
                motion="financial"
                onPress={() => startAction(listed ? "reprice" : "list", true)}
              />
            )
          }
          onClose={() => {
            if (!saving) {
              setPriceOpen(false);
            }
          }}
        >
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetLead}>
            Buyers pay this price. The 8% fee is taken from the seller.
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetLabel}>Listing price</Text>
          <TextInput
            accessibilityLabel="Listing price"
            keyboardType="decimal-pad"
            placeholder="450.00"
            placeholderTextColor={colors.textTertiary}
            style={styles.sheetInput}
            value={priceInput}
            onChangeText={setPriceInput}
          />
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetLabel}>Platform fee</Text>
          <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.sheetValue}>
            {priceCents === null ? "—" : quote.isLoading ? "Calculating fee…" : quote.data ? formatCents(quote.data.feeCents) : "—"}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetLabel}>You receive</Text>
          <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.sheetValue}>
            {priceCents === null ? "—" : quote.data ? formatCents(quote.data.sellerCents) : "—"}
          </Text>
          {quote.isError ? (
            <InlineStatusCard icon="alert-circle-outline" title="The fee preview didn't load." tone="warning" />
          ) : null}
          {notice ? <InlineStatusCard icon="alert-circle-outline" title={notice} tone="info" /> : null}
        </AppBottomSheet>
      ) : null}
      {holding ? (
        <AppBottomSheet
          motion="financial"
          title="Delist"
          visible={delistOpen}
          footer={
            unknown && pendingKind === "delist" ? (
              <RecoveryAction
                fullWidth
                label="Check again"
                motion="financial"
                variant="secondary"
                onPress={() => startAction("delist", false)}
              />
            ) : (
              <>
                <DestructiveButton
                  disabled={!online || saving || unknown}
                  emphasis="soft"
                  fullWidth
                  label={saving ? "Removing the listing…" : "Remove listing"}
                  loading={saving && pendingKind === "delist"}
                  loadingLabel="Removing the listing…"
                  motion="financial"
                  onPress={() => startAction("delist", true)}
                />
                <TertiaryButton
                  disabled={saving}
                  label="Keep listing"
                  onPress={() => setDelistOpen(false)}
                />
              </>
            )
          }
          onClose={() => {
            if (!saving) {
              setDelistOpen(false);
            }
          }}
        >
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetLead}>
            Remove this listing? The item stays in your portfolio.
          </Text>
          {notice ? (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetLead}>{notice}</Text>
          ) : null}
        </AppBottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.backgroundPrimary,
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  detail: {
    gap: spacing.xs,
  },
  category: {
    ...typography.label,
    color: colors.textTertiary,
  },
  name: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textTertiary,
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    textTransform: "uppercase",
  },
  value: {
    ...typography.money,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  sheetLead: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  sheetLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    letterSpacing: 0.6,
    marginTop: spacing.md,
    textTransform: "uppercase",
  },
  sheetValue: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  sheetInput: {
    ...typography.money,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    borderWidth: 1,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
