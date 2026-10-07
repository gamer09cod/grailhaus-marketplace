import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, layout, maxFontScale, radius, spacing, typography, type MotionProfile } from "../theme";
import { PrimaryButton, SecondaryButton } from "./buttons";
import { Icon, type IconName } from "./Icon";

export type EmptyAction = {
  label: string;
  onPress: () => void;
  motion?: MotionProfile;
};

export type EmptyStateProps = {
  title: string;
  body?: string;
  /** Shown when there is no illustration. Decorative; title carries meaning. */
  icon?: IconName;
  illustration?: ReactNode;
  primaryAction?: EmptyAction;
  secondaryAction?: EmptyAction;
};

/** Invitation or filter-empty surface. Errors use a separate component later. */
export function EmptyState({
  title,
  body,
  icon,
  illustration,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  const panel = Boolean(illustration || primaryAction || secondaryAction);

  return (
    <View style={[styles.root, panel ? styles.panel : null]}>
      {illustration ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {illustration}
        </View>
      ) : icon ? (
        <Icon color={colors.textTertiary} name={icon} size={28} />
      ) : null}
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
      {primaryAction ? (
        <PrimaryButton
          fullWidth
          label={primaryAction.label}
          motion={primaryAction.motion}
          onPress={primaryAction.onPress}
        />
      ) : null}
      {secondaryAction ? (
        <SecondaryButton
          fullWidth
          label={secondaryAction.label}
          motion={secondaryAction.motion}
          onPress={secondaryAction.onPress}
        />
      ) : null}
    </View>
  );
}

/** Split domain copy that uses a blank line between title and body. */
export function splitEmptyCopy(copy: string): { title: string; body?: string } {
  const parts = copy.split("\n\n");
  const title = (parts[0] ?? copy).trim();
  const body = parts.slice(1).join("\n\n").trim();
  return body.length > 0 ? { title, body } : { title };
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  panel: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
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
