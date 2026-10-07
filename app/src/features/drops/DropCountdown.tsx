import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, maxFontScale, typography } from "../../theme";
import { clockLabel, secondsUntil } from "../cart/countdown";

export function useClockLabel(
  targetIso: string,
  serverNow: string,
  fetchedAtMs: number,
  enabled = true,
): string {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return clockLabel(secondsUntil(targetIso, serverNow, fetchedAtMs, nowMs));
}

type DropCountdownProps = {
  label: "Starts in" | "Ends in";
  targetIso: string;
  serverNow: string;
  fetchedAtMs: number;
  size?: "hero" | "block" | "compact";
};

export function DropCountdown({
  label,
  targetIso,
  serverNow,
  fetchedAtMs,
  size = "block",
}: DropCountdownProps) {
  const time = useClockLabel(targetIso, serverNow, fetchedAtMs);
  const spoken = `${label} ${time}`;
  if (size === "compact") {
    return (
      <Text
        accessibilityLabel={spoken}
        maxFontSizeMultiplier={maxFontScale.body}
        style={styles.compact}
      >
        {spoken}
      </Text>
    );
  }
  return (
    <View accessibilityLabel={spoken}>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>{label}</Text>
      <Text
        maxFontSizeMultiplier={maxFontScale.display}
        style={size === "hero" ? styles.heroTime : styles.time}
      >
        {time}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    ...typography.label,
    color: colors.textSecondary,
  },
  time: {
    ...typography.countdown,
    color: colors.textPrimary,
    fontSize: 20,
    lineHeight: 28,
  },
  heroTime: {
    ...typography.display,
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  compact: {
    ...typography.countdown,
    color: colors.textSecondary,
  },
});
