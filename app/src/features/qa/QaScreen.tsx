import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { QaRejected, submitQa, type QaAction } from "../../api/qa";
import { AppHeader } from "../../components/AppHeader";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { PrimaryButton, SecondaryButton, TertiaryButton } from "../../components/buttons";
import {
  colors,
  layout,
  maxFontScale,
  radius,
  spacing,
  typography,
  useContentBottomPadding,
} from "../../theme";
import { formatCents } from "../../utils/money";
import { loadDropBoard } from "../drops/board";
import { loadMarket } from "../market/board";
import { loadShelfPacks } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";
import { DesignGallery } from "./DesignGallery";

export function QaScreen() {
  const queryClient = useQueryClient();
  const online = useOnline();
  const [quantityText, setQuantityText] = useState("1");
  const [priceText, setPriceText] = useState("");
  const [balanceText, setBalanceText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const packs = useQuery({ queryKey: ["shelf-packs"], queryFn: loadShelfPacks });
  const drops = useQuery({ queryKey: ["drop-board"], queryFn: loadDropBoard });
  const market = useQuery({ queryKey: ["market"], queryFn: loadMarket });

  async function run(key: string, action: QaAction, payload: Record<string, string | number>) {
    if (!online || pending) {
      return;
    }
    setPending(key);
    setNotice(null);
    try {
      await submitQa(action, payload);
      await queryClient.invalidateQueries();
      setNotice("The server applied that change. Open the shelf, cart, drops, or wallet to see it.");
    } catch (error) {
      setNotice(error instanceof QaRejected ? error.message : "The QA action was rejected.");
    } finally {
      setPending(null);
    }
  }

  const quantity = Number(quantityText);
  const quantityOk = Number.isInteger(quantity) && quantity >= 1 && quantity <= 100;
  const busy = !online || pending !== null;

  return (
    <QaFrame>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>
        These actions use the server. Nothing here edits the screen by itself.
      </Text>
      <ConnectivityBanner offlineDetail="QA actions stay disabled." />
      {notice ? (
        <InlineStatusCard
          icon={notice.startsWith("The server applied") ? "checkmark-circle-outline" : "alert-circle-outline"}
          title={notice}
          tone={notice.startsWith("The server applied") ? "success" : "warning"}
        />
      ) : null}

      <TertiaryButton
        accessibilityLabel={galleryOpen ? "Hide design system" : "Show design system"}
        label={galleryOpen ? "Hide design system" : "Show design system"}
        onPress={() => setGalleryOpen((open) => !open)}
      />
      {galleryOpen ? <DesignGallery /> : null}

      <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.section}>
        Another user buys
      </Text>
      <TextInput
        accessibilityLabel="Quantity"
        keyboardType="number-pad"
        placeholder="Quantity"
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        value={quantityText}
        onChangeText={setQuantityText}
      />
      {packs.data?.map((pack) => (
        <View key={pack.id} style={styles.row}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.rowLabel}>{pack.name}</Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.meta}>
            {pack.reservable.toString()} available
          </Text>
          <PrimaryButton
            disabled={busy || !quantityOk}
            label={pending === pack.id ? "Buying…" : `Buy ${quantityOk ? quantity : ""}`}
            loading={pending === pack.id}
            loadingLabel="Buying…"
            size="sm"
            onPress={() => void run(pack.id, "buyPack", { packSkuId: pack.id, quantity })}
          />
        </View>
      ))}

      <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.section}>
        Drop window
      </Text>
      {drops.data?.drops.map((drop) => (
        <View key={drop.dropId} style={styles.row}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.rowLabel}>{drop.name}</Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.meta}>{drop.status}</Text>
          <View style={styles.actions}>
            <SecondaryButton
              disabled={busy}
              label="Start now"
              loading={pending === `start-${drop.packSkuId}`}
              size="sm"
              onPress={() => void run(`start-${drop.packSkuId}`, "startDrop", { packSkuId: drop.packSkuId })}
            />
            <SecondaryButton
              disabled={busy}
              label="End now"
              loading={pending === `end-${drop.packSkuId}`}
              size="sm"
              onPress={() => void run(`end-${drop.packSkuId}`, "endDrop", { packSkuId: drop.packSkuId })}
            />
          </View>
        </View>
      ))}

      <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.section}>
        Listings
      </Text>
      <TextInput
        accessibilityLabel="New price in dollars"
        keyboardType="decimal-pad"
        placeholder="New price in dollars"
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        value={priceText}
        onChangeText={setPriceText}
      />
      {market.data?.map((listing) => (
        <View key={listing.listingId} style={styles.row}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.rowLabel}>{listing.name}</Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.meta}>
            {formatCents(listing.priceCents)} · {listing.sellerUsername}
          </Text>
          <View style={styles.actions}>
            <SecondaryButton
              disabled={busy}
              label="Reprice"
              loading={pending === `price-${listing.listingId}`}
              size="sm"
              onPress={() => {
                const typed = priceText.trim();
                const priceCents = typed.length > 0 ? dollarsToWire(typed) : (listing.priceCents + 100n).toString();
                if (!priceCents) {
                  setNotice("Enter a price greater than zero.");
                  return;
                }
                void run(`price-${listing.listingId}`, "repriceListing", {
                  listingId: listing.listingId,
                  priceCents,
                });
              }}
            />
            <SecondaryButton
              disabled={busy}
              label="Delist"
              loading={pending === `delist-${listing.listingId}`}
              size="sm"
              onPress={() => void run(`delist-${listing.listingId}`, "delistListing", { listingId: listing.listingId })}
            />
            <SecondaryButton
              disabled={busy}
              label="Sells elsewhere"
              loading={pending === `sell-${listing.listingId}`}
              size="sm"
              onPress={() => void run(`sell-${listing.listingId}`, "sellListing", { listingId: listing.listingId })}
            />
          </View>
        </View>
      ))}
      {market.data && market.data.length === 0 ? (
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.meta}>No active listings.</Text>
      ) : null}

      <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.section}>
        Wallet
      </Text>
      <TextInput
        accessibilityLabel="Balance in dollars"
        keyboardType="decimal-pad"
        placeholder="Balance in dollars"
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        value={balanceText}
        onChangeText={setBalanceText}
      />
      <PrimaryButton
        disabled={busy}
        label="Set my balance"
        loading={pending === "balance"}
        loadingLabel="Setting…"
        size="sm"
        onPress={() => {
          const balanceCents = dollarsToWire(balanceText, true);
          if (!balanceCents) {
            setNotice("Enter a balance from $0.00 to $1,000,000.");
            return;
          }
          void run("balance", "setBalance", { balanceCents });
        }}
      />

      <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.section}>
        Reservation
      </Text>
      <SecondaryButton
        disabled={busy}
        label="Expire my reservation"
        loading={pending === "expire"}
        loadingLabel="Expiring…"
        size="sm"
        onPress={() => void run("expire", "expireReservation", {})}
      />
    </QaFrame>
  );
}

function QaFrame({ children }: { children: ReactNode }) {
  const contentBottom = useContentBottomPadding();
  return (
    <View style={styles.screen}>
      <AppHeader back title="QA tools" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
        keyboardShouldPersistTaps="handled"
        style={styles.screen}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function dollarsToWire(input: string, allowZero = false): string | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(input.trim());
  if (!match) {
    return null;
  }
  const dollars = BigInt(match[1] ?? "0");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const cents = dollars * 100n + BigInt(fraction || "0");
  if (cents < 0n || cents > 100_000_000n || (!allowZero && cents === 0n)) {
    return null;
  }
  return cents.toString();
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.backgroundPrimary,
    flex: 1,
  },
  content: {
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  kicker: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  section: {
    ...typography.heading,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    borderWidth: 1,
    color: colors.textPrimary,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  row: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
