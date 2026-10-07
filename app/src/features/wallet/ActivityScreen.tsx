import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { watchTables } from "../../api/live";
import { AppBottomSheet } from "../../components/AppBottomSheet";
import { AppHeader } from "../../components/AppHeader";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { EmptyState, splitEmptyCopy } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ListRowSkeleton } from "../../components/Skeleton";
import { colors, layout, maxFontScale, spacing, typography, useContentBottomPadding } from "../../theme";
import { formatCents } from "../../utils/money";
import { timeAgo } from "../shelf/timeAgo";
import { useAuth } from "../auth/AuthProvider";
import { activityLabel, emptyActivityCopy, loadActivity, type ActivityEntry } from "./activity";

export function ActivityScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const queryClient = useQueryClient();
  const activity = useQuery({
    queryKey: ["activity", userId],
    queryFn: loadActivity,
    enabled: userId.length > 0,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["activity", userId] });
  }, [queryClient, userId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    return watchTables(
      "activity",
      [{ table: "ledger_entries", filter: `user_id=eq.${userId}` }],
      refresh,
    );
  }, [refresh, userId]);

  const [nowMs] = useState(() => Date.now());
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const rows = activity.data ?? [];
  const contentBottom = useContentBottomPadding();

  return (
    <View style={styles.screen}>
      <AppHeader back title="Activity" />
      <FlatList
        ListHeaderComponent={
          <View style={styles.header}>
            <ConnectivityBanner offlineDetail="This activity may be out of date." />
            {activity.isError ? (
              <ErrorState
                body="Check the connection and try again."
                motion="financial"
                title="Your activity didn't load."
                onRetry={() => void activity.refetch()}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          activity.isLoading ? (
            <ListRowSkeleton accessibilityLabel="Loading activity" />
          ) : activity.isError ? null : (
            <EmptyState icon="time-outline" {...splitEmptyCopy(emptyActivityCopy())} />
          )
        }
        contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
        data={rows}
        initialNumToRender={12}
        keyExtractor={(entry) => entry.id}
        maxToRenderPerBatch={12}
        refreshControl={
          <RefreshControl
            refreshing={activity.isRefetching && !activity.isLoading}
            tintColor={colors.accent.solid}
            onRefresh={() => void activity.refetch()}
          />
        }
        removeClippedSubviews={Platform.OS !== "web"}
        renderItem={({ item }) => (
          <ActivityRow
            entry={item}
            now={nowMs}
            onPress={() => setSelected(item)}
          />
        )}
        windowSize={7}
      />
      <AppBottomSheet
        title="Transaction"
        visible={selected !== null}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.detailLabel}>Type</Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.detailValue}>{activityLabel(selected.type)}</Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.detailLabel}>Amount</Text>
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.detailAmount}>
              {formatCents(selected.amountCents)}
            </Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.detailLabel}>When</Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.detailValue}>{timeAgo(selected.createdAt, nowMs)}</Text>
          </>
        ) : null}
      </AppBottomSheet>
    </View>
  );
}

function ActivityRow({
  entry,
  now,
  onPress,
}: {
  entry: ActivityEntry;
  now: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${activityLabel(entry.type)}, ${formatCents(entry.amountCents)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.label}>{activityLabel(entry.type)}</Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.time}>{timeAgo(entry.createdAt, now)}</Text>
      </View>
      <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.amount}>
        {formatCents(entry.amountCents)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  status: {
    gap: spacing.sm,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: spacing.xxs,
  },
  label: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  time: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  amount: {
    ...typography.moneySmall,
    color: colors.textPrimary,
  },
  rowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    letterSpacing: 0.6,
    marginTop: spacing.md,
    textTransform: "uppercase",
  },
  detailValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  detailAmount: {
    ...typography.money,
    color: colors.textPrimary,
  },
});
