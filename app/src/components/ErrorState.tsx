import { StyleSheet, Text, View } from "react-native";

import { colors, layout, maxFontScale, radius, spacing, typography, type MotionProfile } from "../theme";
import { Icon, type IconName } from "./Icon";
import { RecoveryAction } from "./RecoveryAction";
import { splitEmptyCopy } from "./EmptyState";

export type ErrorStateProps = {
  title: string;
  body?: string;
  icon?: IconName;
  /** Convenience: builds a tertiary Try again recovery action. */
  onRetry?: () => void;
  retryLabel?: string;
  motion?: MotionProfile;
  retryVariant?: "primary" | "secondary" | "tertiary";
};

/** Load-failure surface. Distinct from EmptyState invitations. */
export function ErrorState({
  title,
  body,
  icon = "alert-circle-outline",
  onRetry,
  retryLabel = "Try again",
  motion,
  retryVariant = "tertiary",
}: ErrorStateProps) {
  return (
    <View style={styles.panel}>
      <Icon color={colors.status.error.solid} name={icon} size={28} />
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={maxFontScale.display}
        style={styles.title}
      >
        {title}
      </Text>
      {body ? (
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.body}>
          {body}
        </Text>
      ) : null}
      {onRetry ? (
        <RecoveryAction
          label={retryLabel}
          motion={motion}
          variant={retryVariant}
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}

/** Split a single notice string into title/body for ErrorState or InlineStatusCard. */
export function splitStatusCopy(copy: string): { title: string; body?: string } {
  return splitEmptyCopy(copy);
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.status.error.muted,
    borderColor: colors.status.error.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
