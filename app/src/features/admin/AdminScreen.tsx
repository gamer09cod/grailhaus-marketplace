import { useCallback } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { AdminForbidden, loadAdminSnapshot } from "../../api/admin";
import type { AppStackParamList } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";

export function AdminScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const online = useOnline();
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
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={snapshot.isRefetching && !snapshot.isLoading}
          tintColor="#e4c07a"
          onRefresh={() => void snapshot.refetch()}
        />
      }
      style={styles.screen}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>Admin</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </View>
      {!online ? <Text style={styles.notice}>You're offline. These numbers may be out of date.</Text> : null}
      {snapshot.isLoading ? <ActivityIndicator color="#e4c07a" style={styles.spinner} /> : null}
      {snapshot.isError ? (
        <Text style={styles.notice}>
          {snapshot.error instanceof AdminForbidden
            ? snapshot.error.message
            : "The admin numbers did not load."}
        </Text>
      ) : null}
      {numbers ? (
        <View>
          <Row label="Packs sold" value={String(numbers.packsSold)} />
          <Row label="Pack revenue" value={formatCents(numbers.packRevenueCents)} />
          <Row label="Contents estimated payout" value={formatCents(numbers.contentsPayoutCents)} />
          <Row label="Gross pack margin" value={formatCents(numbers.grossPackMarginCents)} />
          <Row label="Marketplace fees collected" value={formatCents(numbers.marketplaceFeesCents)} />
          <Text style={styles.section}>Margin per category</Text>
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
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#12110f",
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
  },
  brand: {
    color: "#f4efe6",
    fontSize: 22,
    fontWeight: "600",
  },
  link: {
    color: "#e4c07a",
  },
  notice: {
    color: "#e4c07a",
    marginTop: 16,
  },
  spinner: {
    marginTop: 24,
  },
  section: {
    color: "#f4efe6",
    fontSize: 18,
    marginTop: 28,
  },
  row: {
    borderBottomColor: "#2a2723",
    borderBottomWidth: 1,
    marginTop: 16,
    paddingBottom: 12,
  },
  label: {
    color: "#c9bfb2",
  },
  value: {
    color: "#f4efe6",
    fontSize: 22,
    marginTop: 4,
  },
});
