import { StyleSheet, Text, View } from "react-native";

import { colors, maxFontScale, radius, spacing, typography } from "../../theme";
import type { DropBoard, TimedDrop } from "./board";
import { DropCountdown } from "./DropCountdown";
import { dropStatusTitle } from "./dropCopy";

type DropStatusProps = {
  board: DropBoard;
  drop: TimedDrop;
  size?: "block" | "compact";
};

export function DropStatus({ board, drop, size = "block" }: DropStatusProps) {
  if (size === "compact") {
    return <CompactStatus board={board} drop={drop} />;
  }
  if (drop.status === "UPCOMING") {
    return (
      <DropCountdown
        fetchedAtMs={board.fetchedAtMs}
        label="Starts in"
        serverNow={board.serverNow}
        targetIso={drop.startsAt}
      />
    );
  }
  if (drop.status === "LIVE") {
    return (
      <View style={styles.block}>
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.live}>LIVE</Text>
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.remaining}>
            {drop.reservable.toString()} remaining
          </Text>
        </View>
        <DropCountdown
          fetchedAtMs={board.fetchedAtMs}
          label="Ends in"
          serverNow={board.serverNow}
          targetIso={drop.endsAt}
        />
      </View>
    );
  }
  return (
    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.closed}>
      {dropStatusTitle(drop.status)}
    </Text>
  );
}

function CompactStatus({ board, drop }: { board: DropBoard; drop: TimedDrop }) {
  if (drop.status === "UPCOMING") {
    return (
      <DropCountdown
        fetchedAtMs={board.fetchedAtMs}
        label="Starts in"
        serverNow={board.serverNow}
        size="compact"
        targetIso={drop.startsAt}
      />
    );
  }
  if (drop.status === "LIVE") {
    return (
      <View style={styles.compactLive}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.compactLiveLabel}>
          LIVE · {drop.reservable.toString()} remaining
        </Text>
        <DropCountdown
          fetchedAtMs={board.fetchedAtMs}
          label="Ends in"
          serverNow={board.serverNow}
          size="compact"
          targetIso={drop.endsAt}
        />
      </View>
    );
  }
  return (
    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.compactClosed}>
      {dropStatusTitle(drop.status)}
    </Text>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  liveRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  liveDot: {
    backgroundColor: colors.status.success.solid,
    borderRadius: radius.full,
    height: 8,
    width: 8,
  },
  live: {
    ...typography.label,
    color: colors.textPrimary,
  },
  remaining: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  closed: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  compactLive: {
    gap: spacing.xxs,
  },
  compactLiveLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  compactClosed: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
