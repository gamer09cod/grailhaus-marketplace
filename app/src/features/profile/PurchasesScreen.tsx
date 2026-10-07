import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Platform, RefreshControl, StyleSheet, Text, View } from "react-native";

import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { EmptyState, splitEmptyCopy } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ListRowSkeleton } from "../../components/Skeleton";
import { colors, layout, maxFontScale, spacing, typography, useContentBottomPadding } from "../../theme";
import { timeAgo } from "../shelf/timeAgo";
import { useAuth } from "../auth/AuthProvider";
import {
  emptyPurchasesCopy,
  loadPurchases,
  purchaseDetail,
  purchaseTitle,
  type PurchaseRecord,
} from "./purchases";

export function PurchasesScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const queryClient = useQueryClient();
  const purchases = useQuery({
    queryKey: ["purchases", userId],
    queryFn: loadPurchases,
    enabled: userId.length > 0,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["purchases", userId] });
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
      "purchases",
      [{ table: "purchases", filter: `user_id=eq.${userId}` }],
      refresh,
    );
  }, [refresh, userId]);

  const [nowMs] = useState(() => Date.now());
  const rows = purchases.data ?? [];
  const contentBottom = useContentBottomPadding();

  return (
    <View style={styles.screen}>
      <AppHeader back title="Purchases" />
      <FlatList
        ListHeaderComponent={
          <View style={styles.header}>
            <ConnectivityBanner offlineDetail="These purchases may be out of date." />
            {purchases.isError ? (
              <ErrorState
                body="Check the connection and try again."
                motion="financial"
                title="Your purchases didn't load."
                onRetry={() => void purchases.refetch()}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          purchases.isLoading ? (
            <ListRowSkeleton accessibilityLabel="Loading purchases" />
          ) : purchases.isError ? null : (
            <EmptyState icon="receipt-outline" {...splitEmptyCopy(emptyPurchasesCopy())} />
          )
        }
        contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
        data={rows}
        initialNumToRender={12}
        keyExtractor={(purchase) => purchase.id}
        maxToRenderPerBatch={12}
        refreshControl={
          <RefreshControl
            refreshing={purchases.isRefetching && !purchases.isLoading}
            tintColor={colors.accent.solid}
            onRefresh={() => void purchases.refetch()}
          />
        }
        removeClippedSubviews={Platform.OS !== "web"}
        renderItem={({ item }) => <PurchaseRow now={nowMs} purchase={item} />}
        windowSize={7}
      />
    </View>
  );
}

function PurchaseRow({ purchase, now }: { purchase: PurchaseRecord; now: number }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.label}>
          {purchaseTitle(purchase)}
        </Text>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.time}>{timeAgo(purchase.createdAt, now)}</Text>
      </View>
      <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.amount}>
        {purchaseDetail(purchase)}
      </Text>
    </View>
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
    minWidth: 0,
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
    flexShrink: 0,
    textAlign: "right",
  },
});
