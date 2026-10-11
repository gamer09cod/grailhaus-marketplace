import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton, TertiaryButton } from "../../components/buttons";
import { colors, maxFontScale, radius, spacing, typography } from "../../theme";
import type { RevealState } from "./revealMachine";

type Props = {
  phase: RevealState;
  resultReady: boolean;
  working: boolean;
  online: boolean;
  continueLabel: string;
  packsLeftLabel: string;
  fastSlot: boolean;
  fastRequested: boolean;
  reducedOpen: boolean;
  showSkip: boolean;
  showReplay: boolean;
  showReset: boolean;
  showPackComplete: boolean;
  onContinue: () => void;
  onCollection: () => void;
  onReplay: () => void;
  onSkip: () => void;
  onReset: () => void;
  onFastOpen: () => void;
  onClearFast: () => void;
  onReducedOpen: () => void;
};

/** Continue / Collection / Replay / Fast Open — presentation chrome only. */
export function RevealActions({
  phase,
  resultReady,
  working,
  online,
  continueLabel,
  packsLeftLabel,
  fastSlot,
  fastRequested,
  reducedOpen,
  showSkip,
  showReplay,
  showReset,
  showPackComplete,
  onContinue,
  onCollection,
  onReplay,
  onSkip,
  onReset,
  onFastOpen,
  onClearFast,
  onReducedOpen,
}: Props) {
  const showResultActions = phase === "CARD_REVEALED" && resultReady;
  const showChrome = showResultActions || showPackComplete || showReset || reducedOpen;

  if (!showChrome && !fastSlot && !showSkip) {
    return null;
  }

  return (
    <View style={styles.actions}>
      {fastSlot ? (
        <View style={styles.speedUp}>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.speedUpTitle}>
            {fastRequested ? "Fast Open is on" : "Speed up remaining packs?"}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.speedUpBody}>
            {packsLeftLabel} Quick tear, then a fan of cards already opened.
            Epic and legendary pulls still pause.
          </Text>
          <PrimaryButton
            disabled={working || !online}
            fullWidth
            label={fastRequested ? "Fast Open next pack" : "Fast Open"}
            loading={working}
            onPress={onFastOpen}
          />
          {fastRequested ? <TertiaryButton label="Use full reveals" onPress={onClearFast} /> : null}
        </View>
      ) : null}

      {reducedOpen ? (
        <PrimaryButton
          disabled={working || !online}
          fullWidth
          label="Reveal next card"
          loading={working}
          onPress={onReducedOpen}
        />
      ) : null}

      {showSkip ? (
        <TertiaryButton
          label="Skip animation"
          accessibilityHint="Jumps presentation to your stored card. Server progress is unchanged."
          onPress={onSkip}
        />
      ) : null}

      {showResultActions ? (
        <>
          <PrimaryButton
            disabled={working || !online}
            fullWidth
            accessibilityHint="Tap to continue to the next pack or finish this opening."
            label={working ? "Saving…" : continueLabel}
            loading={working}
            loadingLabel="Saving…"
            onPress={onContinue}
          />
          {showReplay ? (
            <TertiaryButton
              label="Replay reveal"
              accessibilityHint="Replays the animation for this card without changing server progress."
              onPress={onReplay}
            />
          ) : null}
          {continueLabel !== "View Collection" ? (
            <TertiaryButton
              label="View Collection"
              accessibilityHint="Opens your collection. Listing and sales stay on that screen."
              onPress={onCollection}
            />
          ) : null}
        </>
      ) : null}

      {showPackComplete ? (
        <>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
            Cards added to your collection.
          </Text>
          {showReplay ? <TertiaryButton label="Replay reveal" onPress={onReplay} /> : null}
          <PrimaryButton fullWidth label="View Collection" onPress={onCollection} />
        </>
      ) : null}

      {showReset ? (
        <TertiaryButton label="Reset seal" accessibilityHint="Cancels an incomplete swipe." onPress={onReset} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.sm,
    width: "100%",
  },
  speedUp: {
    backgroundColor: colors.surfacePrimary,
    borderRadius: radius.card,
    gap: spacing.sm,
    padding: spacing.base,
  },
  speedUpTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  speedUpBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
