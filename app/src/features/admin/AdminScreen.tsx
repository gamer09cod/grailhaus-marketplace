import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { AdminForbidden, loadAdminSnapshot } from "../../api/admin";
import { AppHeader } from "../../components/AppHeader";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { ErrorState } from "../../components/ErrorState";
import { AdminSkeleton } from "../../components/Skeleton";
import { colors, layout, maxFontScale, spacing, typography, useContentBottomPadding } from "../../theme";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";

export function AdminScreen() {
  const queryClient = useQueryClient();
  const contentBottom = useContentBottomPadding();
  const snapshot = useQuery({
    queryKey: ["admin-snapshot"],
    queryFn: loadAdminSnapshot,
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["admin-snapshot"] });
    }, [queryClient]),
  );

  const numbers = snapshot.data;

  return (
    <View style={styles.screen}>
      <AppHeader back title="Admin" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={snapshot.isRefetching && !snapshot.isLoading}
            tintColor={colors.accent.solid}
            onRefresh={() => void snapshot.refetch()}
          />
        }
        style={styles.screen}
      >
        <ConnectivityBanner offlineDetail="These numbers may be out of date." />
        {snapshot.isLoading ? <AdminSkeleton /> : null}
        {snapshot.isError ? (
          snapshot.error instanceof AdminForbidden ? (
            <ErrorState title={snapshot.error.message} />
          ) : (
            <ErrorState
              title="The admin numbers did not load."
              onRetry={() => void snapshot.refetch()}
            />
          )
        ) : null}
        {numbers ? (
          <View>
            <Row label="Packs sold" value={String(numbers.packsSold)} />
            <Row label="Pack revenue" value={formatCents(numbers.packRevenueCents)} />
            <Row label="Contents estimated payout" value={formatCents(numbers.contentsPayoutCents)} />
            <Row label="Gross pack margin" value={formatCents(numbers.grossPackMarginCents)} />
            <Row label="Marketplace fees collected" value={formatCents(numbers.marketplaceFeesCents)} />
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.section}>Margin per category</Text>
            {numbers.categories.map((category) => (
              <Row
                key={category.category}
                label={categoryLabel(category.category)}
                value={formatCents(category.marginCents)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.label}>{label}</Text>
      <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.backgroundPrimary,
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  section: {
    ...typography.heading,
    color: colors.textPrimary,
    marginTop: spacing.xl,
  },
  row: {
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    marginTop: spacing.base,
    paddingBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  value: {
    ...typography.money,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
});
