import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  DestructiveButton,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  TertiaryButton,
} from "../../components/buttons";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { CartLineSkeleton, PackCardSkeleton, SkeletonBone } from "../../components/Skeleton";
import { categoryLabel } from "../shelf/packs";
import { useConnectivity } from "../shelf/useOnline";
import {
  colors,
  duration,
  motionProfile,
  press,
  radius,
  revealMotion,
  spacing,
  typography,
  type Tone,
  type TypographyVariant,
} from "../../theme";

const typeSamples: { variant: TypographyVariant; sample: string }[] = [
  { variant: "displayXL", sample: "$18,420.50" },
  { variant: "display", sample: "Midnight Grail Drop" },
  { variant: "titleLarge", sample: "Review Purchase" },
  { variant: "title", sample: "Legendary Watch Vault" },
  { variant: "heading", sample: "What's inside" },
  { variant: "body", sample: "20 premium watch packs." },
  { variant: "bodySmall", sample: "Seller changed the price." },
  { variant: "caption", sample: "Pulled 4 min ago" },
  { variant: "label", sample: "Grail tier" },
  { variant: "money", sample: "$1,000.00" },
  { variant: "countdown", sample: "Reserved for 03:42" },
];

export function DesignGallery() {
  const connectivity = useConnectivity();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) {
      return;
    }
    const timer = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <View style={styles.panel}>
      <Text style={[typography.titleLarge, styles.primaryText]}>Design system</Text>
      <Text style={[typography.bodySmall, styles.secondaryText]}>
        Phase 1 tokens and buttons. Screens adopt them in later phases.
      </Text>

      <Section title="Surfaces">
        <Swatches
          items={[
            ["backgroundPrimary", colors.backgroundPrimary],
            ["backgroundSecondary", colors.backgroundSecondary],
            ["surfacePrimary", colors.surfacePrimary],
            ["surfaceSecondary", colors.surfaceSecondary],
            ["surfaceElevated", colors.surfaceElevated],
          ]}
        />
      </Section>

      <Section title="Text">
        <Text style={[typography.body, { color: colors.textPrimary }]}>textPrimary</Text>
        <Text style={[typography.body, { color: colors.textSecondary }]}>textSecondary</Text>
        <Text style={[typography.body, { color: colors.textTertiary }]}>textTertiary</Text>
        <Text style={[typography.body, { color: colors.accent.solid }]}>accent</Text>
      </Section>

      <Section title="Categories">
        <View style={styles.badgeRow}>
          <Badge label={categoryLabel("TRADING_CARD")} tone={colors.category.TRADING_CARD} />
          <Badge label={categoryLabel("SNEAKER")} tone={colors.category.SNEAKER} />
          <Badge label={categoryLabel("WATCH")} tone={colors.category.WATCH} />
        </View>
      </Section>

      <Section title="Rarity">
        <View style={styles.badgeRow}>
          <Badge label="Common" tone={colors.rarity.COMMON} />
          <Badge label="Uncommon" tone={colors.rarity.UNCOMMON} />
          <Badge label="Rare" tone={colors.rarity.RARE} />
          <Badge label="Epic" tone={colors.rarity.EPIC} />
          <Badge label="Legendary" tone={colors.rarity.LEGENDARY} />
        </View>
      </Section>

      <Section title="Status">
        <View style={styles.badgeRow}>
          <Badge glyph="✓" label="Listing available" tone={colors.status.success} />
          <Badge glyph="!" label="Expiring" tone={colors.status.warning} />
          <Badge glyph="×" label="Sold" tone={colors.status.error} />
          <Badge glyph="i" label="Price changed" tone={colors.status.info} />
        </View>
      </Section>

      <Section title="Typography">
        {typeSamples.map(({ variant, sample }) => (
          <View key={variant} style={styles.typeRow}>
            <Text style={[typography.caption, styles.tertiaryText]}>{variant}</Text>
            <Text style={[typography[variant], styles.primaryText]}>{sample}</Text>
          </View>
        ))}
      </Section>

      <Section title="Buttons">
        <View style={styles.buttonRow}>
          <PrimaryButton label="Enter Drop" onPress={() => undefined} />
          <SecondaryButton label="View Drop" onPress={() => undefined} />
          <TertiaryButton label="Activity" onPress={() => undefined} />
        </View>
        <View style={styles.buttonRow}>
          <DestructiveButton label="Remove" onPress={() => undefined} />
          <DestructiveButton emphasis="solid" label="Delist" onPress={() => undefined} />
        </View>
        <View style={styles.buttonRow}>
          <PrimaryButton disabled label="Disabled" onPress={() => undefined} />
          <SecondaryButton disabled label="Disabled" onPress={() => undefined} />
          <TertiaryButton disabled label="Disabled" onPress={() => undefined} />
        </View>
        <View style={styles.buttonRow}>
          <PrimaryButton label="Small" onPress={() => undefined} size="sm" />
          <PrimaryButton label="Medium" onPress={() => undefined} />
          <PrimaryButton label="Large" onPress={() => undefined} size="lg" />
        </View>
        <View style={styles.buttonRow}>
          <PrimaryButton icon={glyph("+")} label="Deposit" onPress={() => undefined} />
          <SecondaryButton icon={glyph("→")} iconPosition="trailing" label="Browse Market" onPress={() => undefined} />
        </View>
        <View style={styles.buttonRow}>
          <IconButton accessibilityLabel="Notifications" icon={glyph("○")} onPress={() => undefined} />
          <IconButton accessibilityLabel="Add one" icon={glyph("+")} onPress={() => undefined} variant="surface" />
          <IconButton accessibilityLabel="Add one" icon={glyph("+")} onPress={() => undefined} variant="accent" />
          <IconButton accessibilityLabel="Remove one" disabled icon={glyph("−")} onPress={() => undefined} variant="surface" />
          <IconButton accessibilityLabel="Close" icon={glyph("×")} onPress={() => undefined} size="sm" />
        </View>
        <PrimaryButton
          fullWidth
          label="Confirm Purchase · $820.00"
          loading={confirming}
          loadingLabel="Confirming purchase…"
          motion="financial"
          onPress={() => setConfirming(true)}
          size="lg"
        />
        <Text style={[typography.caption, styles.tertiaryText]}>
          Tap to preview the inline loading state. Nothing is charged.
        </Text>
      </Section>

      <Section title="Motion">
        <Text style={[typography.bodySmall, styles.secondaryText]}>
          Discovery may scale on press ({press.scale}). Financial and reduced keep layout still
          (opacity {press.pressedOpacity}). Checkout never waits on enter fades.
        </Text>
        <View style={styles.typeRow}>
          <Text style={[typography.caption, styles.tertiaryText]}>durations</Text>
          <Text style={[typography.bodySmall, styles.primaryText]}>
            fast {duration.fast} · base {duration.base} · slow {duration.slow} · emphasis {duration.emphasis}
          </Text>
        </View>
        <View style={styles.typeRow}>
          <Text style={[typography.caption, styles.tertiaryText]}>discovery</Text>
          <Text style={[typography.bodySmall, styles.primaryText]}>
            transition {motionProfile.discovery.transition} · pressScale {motionProfile.discovery.pressScale} · travel allowed
          </Text>
        </View>
        <View style={styles.typeRow}>
          <Text style={[typography.caption, styles.tertiaryText]}>financial</Text>
          <Text style={[typography.bodySmall, styles.primaryText]}>
            transition {motionProfile.financial.transition} · pressScale {motionProfile.financial.pressScale} · no travel
          </Text>
        </View>
        <View style={styles.typeRow}>
          <Text style={[typography.caption, styles.tertiaryText]}>reveal (documented)</Text>
          <Text style={[typography.bodySmall, styles.primaryText]}>
            fade {revealMotion.fadeMs} · sleeve {revealMotion.sleeveTravelPx}px · spring {revealMotion.springShutMs} · fast tear {revealMotion.fastTearMs}
          </Text>
        </View>
      </Section>

      <Section title="Skeletons">
        <Text style={[typography.bodySmall, styles.secondaryText]}>
          First-load placeholders match card layout. Discovery bones may pulse. Financial and reduced stay still.
        </Text>
        <SkeletonBone height={16} width="60%" />
        <PackCardSkeleton />
        <CartLineSkeleton count={1} />
      </Section>

      <Section title="Empty">
        <Text style={[typography.bodySmall, styles.secondaryText]}>
          Invitations use EmptyState with optional icon, body, and CTAs.
        </Text>
        <EmptyState
          body="Browse the shelf or the market."
          icon="cart-outline"
          primaryAction={{ label: "Browse Packs", onPress: () => undefined }}
          secondaryAction={{ label: "Browse Market", onPress: () => undefined }}
          title="Your cart is empty."
        />
        <EmptyState icon="storefront-outline" title="No listings match that search." />
      </Section>

      <Section title="Errors and recovery">
        <Text style={[typography.bodySmall, styles.secondaryText]}>
          ErrorState for load failures. InlineStatusCard for offline, unknown results, and line states. RecoveryAction for Try again / Check again.
        </Text>
        <ErrorState
          body="Check the connection and try again."
          title="Your cart didn't load."
          onRetry={() => undefined}
        />
        <InlineStatusCard
          action={{ label: "Check again", motion: "financial", variant: "secondary", onPress: () => undefined }}
          body="Your order may have completed. We're checking before retrying."
          icon="help-circle-outline"
          title="Confirming purchase…"
          tone="warning"
        />
      </Section>

      <Section title="Connectivity">
        <Text style={[typography.bodySmall, styles.secondaryText]}>
          Live status: {connectivity}. Banner shows for OFFLINE and RECONNECTING. Actions stay disabled unless ONLINE.
        </Text>
        <InlineStatusCard
          body="Showing the last snapshot. It may be out of date."
          icon="sync-outline"
          title="Reconnecting…"
          tone="info"
        />
        <InlineStatusCard
          body="This cart may be out of date. Reservations stay disabled until the connection returns."
          icon="cloud-offline-outline"
          title="You're offline."
          tone="warning"
        />
      </Section>

      <Section title="Accessibility">
        <Text style={[typography.bodySmall, styles.secondaryText]}>
          44pt minimum targets. Controls carry spoken labels (icons are decorative). Display text caps at 1.3×; body at 2×. Status always pairs icon + text — never color alone. Haptics are optional on Profile. Reveal keeps sealed / drag / Fast Open / card / summary announcements and a reduced-motion tap path.
        </Text>
        <Badge glyph="↑" label="Gain +$105.40" tone={colors.status.success} />
        <Badge glyph="!" label="Expiring" tone={colors.status.warning} />
        <PrimaryButton label="44 × full-width sample" onPress={() => undefined} />
      </Section>

      <Section title="Responsive">
        <Text style={[typography.bodySmall, styles.secondaryText]}>
          AppHeader and sticky CTAs use safe-area insets. Stack scrolls use useContentBottomPadding. Sheets use KeyboardAvoidingView. Auth scrolls and avoids the keyboard. Verify at 320 / 360 / 430 wide; OS font scale remains a device check.
        </Text>
      </Section>

      <Section title="Performance">
        <Text style={[typography.bodySmall, styles.secondaryText]}>
          Market, Portfolio, and Packs use FlatList with windowing. Pack / market / holding cards are memoized with stable onOpen handlers. DropCountdown keeps 1s ticks local. Home rails stay short ScrollViews (no nested VirtualizedList). FlashList and expo-image not added — no images seeded yet.
        </Text>
      </Section>

      <Section title="Final audit">
        <Text style={[typography.bodySmall, styles.secondaryText]}>
          Primary screens share screen padding 16, section gap 24, button radius 12, card radius 16, and cobalt accent. Loading → skeletons; empty → EmptyState; errors → ErrorState; offline → ConnectivityBanner; money surfaces stay calmer. QA and Admin use the same tokens — no leftover gold chrome.
        </Text>
        <PrimaryButton label="Primary" onPress={() => undefined} />
        <SecondaryButton label="Secondary" onPress={() => undefined} />
        <TertiaryButton label="Tertiary" onPress={() => undefined} />
      </Section>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[typography.label, styles.secondaryText]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Swatches({ items }: { items: [string, string][] }) {
  return (
    <View style={styles.swatchGrid}>
      {items.map(([name, value]) => (
        <View key={name} style={styles.swatchItem}>
          <View style={[styles.swatch, { backgroundColor: value }]} />
          <Text numberOfLines={1} style={[typography.caption, styles.secondaryText]}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

function Badge({ label, tone, glyph: mark }: { label: string; tone: Tone; glyph?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: tone.muted, borderColor: tone.border }]}>
      {mark ? <Text style={[typography.caption, { color: tone.solid }]}>{mark}</Text> : null}
      <Text style={[typography.caption, { color: tone.solid }]}>{label}</Text>
    </View>
  );
}

function glyph(mark: string) {
  return function GalleryGlyph(color: string) {
    return <Text style={[styles.glyph, { color }]}>{mark}</Text>;
  };
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.backgroundPrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.base,
  },
  primaryText: { color: colors.textPrimary },
  secondaryText: { color: colors.textSecondary },
  tertiaryText: { color: colors.textTertiary },
  section: { gap: spacing.md },
  sectionBody: { gap: spacing.md },
  swatchGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  swatchItem: { gap: spacing.xs, width: 96 },
  swatch: {
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 48,
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  badge: {
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  typeRow: { gap: spacing.xxs },
  buttonRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  glyph: { fontSize: 18, fontWeight: "600", lineHeight: 20 },
});
