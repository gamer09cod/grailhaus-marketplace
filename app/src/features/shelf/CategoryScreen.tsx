import { useCallback } from "react";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { AppStackParamList } from "../../navigation/types";
import { PackCard } from "./PackCard";
import { categoryLabel, loadShelfPacks } from "./packs";
import { useOnline } from "./useOnline";

export function CategoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Category">>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const packs = useQuery({
    queryKey: ["shelf-packs"],
    queryFn: loadShelfPacks,
  });
  const visible = (packs.data ?? []).filter((pack) => pack.category === route.params.category);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
    }, [queryClient]),
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={packs.isRefetching && !packs.isLoading}
          tintColor="#e4c07a"
          onRefresh={() => void packs.refetch()}
        />
      }
      style={styles.screen}
    >
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Shelf</Text>
      </Pressable>
      <Text style={styles.title}>{categoryLabel(route.params.category)}</Text>
      {!online ? (
        <Text style={styles.notice}>You're offline. This shelf may be out of date.</Text>
      ) : null}
      {packs.isLoading ? (
        <View style={styles.status}>
          <ActivityIndicator color="#e4c07a" />
          <Text style={styles.notice}>Loading packs…</Text>
        </View>
      ) : null}
      {packs.isError ? (
        <View style={styles.status}>
          <Text style={styles.notice}>These packs didn't load. Check the connection and try again.</Text>
          <Pressable style={styles.retry} onPress={() => void packs.refetch()}>
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {packs.data && visible.length === 0 ? (
        <Text style={styles.notice}>Nothing in {categoryLabel(route.params.category)} is on the shelf.</Text>
      ) : null}
      {visible.map((pack) => (
        <PackCard
          key={pack.id}
          pack={pack}
          onPress={() => navigation.navigate("PackDetail", { packId: pack.id })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#12110f",
  },
  content: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },
  link: {
    color: "#e4c07a",
  },
  title: {
    color: "#f4efe6",
    fontSize: 28,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 16,
  },
  notice: {
    color: "#c9bfb2",
    lineHeight: 20,
    marginBottom: 16,
  },
  status: {
    marginBottom: 8,
  },
  retry: {
    alignSelf: "flex-start",
    backgroundColor: "#e4c07a",
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryLabel: {
    color: "#1a140c",
    fontWeight: "600",
  },
});
