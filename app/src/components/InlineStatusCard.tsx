import { useEffect, useMemo, type ReactNode } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import {
  colors,
  easing,
  enterDuration,
  maxFontScale,
  radius,
  spacing,
  typography,
  useReducedMotion,
  type StatusKey,
  type Tone,
} from "../theme";
import { Icon, type IconName } from "./Icon";
import { RecoveryAction, type RecoveryActionProps } from "./RecoveryAction";

export type InlineStatusCardProps = {
  icon: IconName;
  title: string;
  body?: string;
  tone?: Tone | StatusKey;
  children?: ReactNode;
  action?: RecoveryActionProps;
  /** Cart line banners fade in with the financial enter duration. */
  enterFade?: boolean;
};

function resolveTone(tone: Tone | StatusKey | undefined): Tone {
  if (!tone) {
    return colors.status.info;
  }
  if (typeof tone === "string") {
    return colors.status[tone];
  }
  return tone;
}

/** Toned status surface for warnings, unknown results, offline, and cart line states. */
export function InlineStatusCard({
  icon,
  title,
  body,
  tone,
  children,
  action,
  enterFade = false,
}: InlineStatusCardProps) {
  const resolved = resolveTone(tone);
  const reduced = useReducedMotion();
  const fadeMs = enterDuration("financial", reduced);
  const opacity = useMemo(() => new Animated.Value(enterFade ? 0 : 1), [enterFade]);

  useEffect(() => {
    if (!enterFade) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: fadeMs,
      easing: easing.enter,
      useNativeDriver: true,
    }).start();
  }, [enterFade, fadeMs, opacity, title]);

  return (
    <Animated.View
      accessibilityRole="summary"
      style={[
        styles.card,
        { backgroundColor: resolved.muted, borderColor: resolved.border, opacity },
      ]}
    >
      <View style={styles.head}>
        <Icon color={resolved.solid} name={icon} size={18} />
        <Text
          maxFontSizeMultiplier={maxFontScale.body}
          style={[styles.title, { color: resolved.solid }]}
        >
          {title}
        </Text>
      </View>
      {body ? (
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.body}>
          {body}
        </Text>
      ) : null}
      {children}
      {action ? <RecoveryAction {...action} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  head: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  title: {
    ...typography.bodyMedium,
    flex: 1,
  },
  body: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
