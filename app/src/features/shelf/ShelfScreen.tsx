import { useCallback, useEffect } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
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

import { supabase } from "../../api/supabase";
import type { AppStackParamList, PackCategory } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { PackCard } from "./PackCard";
import { categoryLabel, featuredPacks, loadShelfPacks, shelfCategories } from "./packs";
import { useOnline } from "./useOnline";

export function ShelfScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const packs = useQuery({
    queryKey: ["shelf-packs"],
    queryFn: loadShelfPacks,
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
    }, [queryClient]),
  );

  useEffect(() => {
    const channel = supabase
      .channel(`shelf-stock-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pack_skus" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["shelf-packs"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const featured = packs.data ? featuredPacks(packs.data) : [];

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
      <View style={styles.header}>
        <Text style={styles.brand}>GrailHaus</Text>
        <View style={styles.headerLinks}>
          <Pressable onPress={() => navigation.navigate("Market")}>
            <Text style={styles.link}>Market</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Collection")}>
            <Text style={styles.link}>Collection</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Cart")}>
            <Text style={styles.link}>Cart</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Wallet")}>
            <Text style={styles.link}>Wallet</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.kicker}>The shelf</Text>
      {!online ? (
        <Text style={styles.notice}>You're offline. This shelf may be out of date.</Text>
      ) : null}

      {packs.isLoading ? (
        <View style={styles.status}>
          <ActivityIndicator color="#e4c07a" />
          <Text style={styles.notice}>Loading the shelf…</Text>
        </View>
      ) : null}

      {packs.isError ? (
        <View style={styles.status}>
          <Text style={styles.notice}>The shelf didn't load. Check the connection and try again.</Text>
          <Pressable style={styles.retry} onPress={() => void packs.refetch()}>
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {packs.data && packs.data.length === 0 ? (
        <Text style={styles.notice}>Nothing is on the shelf right now.</Text>
      ) : null}

      {featured.length > 0 ? (
        <View>
          <Text style={styles.section}>Featured</Text>
          {featured.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              onPress={() => navigation.navigate("PackDetail", { packId: pack.id })}
            />
          ))}
        </View>
      ) : null}

      {packs.data && packs.data.length > 0
        ? shelfCategories.map((category) => (
            <CategoryLink
              key={category}
              category={category}
              packs={packs.data.filter((pack) => pack.category === category)}
              onPress={() => navigation.navigate("Category", { category })}
            />
          ))
        : null}

      <Pressable onPress={() => navigation.navigate("Drops")} style={styles.categoryLink}>
        <Text style={styles.categoryName}>Drops</Text>
        <Text style={styles.categoryMeta}>Limited packs. The countdown uses server time.</Text>
      </Pressable>
    </ScrollView>
  );
}

function CategoryLink({
  category,
  packs,
  onPress,
}: {
  category: PackCategory;
  packs: { priceCents: bigint }[];
  onPress: () => void;
}) {
  const lowest = packs.reduce<bigint | null>(
    (best, pack) => (best === null || pack.priceCents < best ? pack.priceCents : best),
    null,
  );

  return (
    <Pressable onPress={onPress} style={styles.categoryLink}>
      <Text style={styles.categoryName}>{categoryLabel(category)}</Text>
      <Text style={styles.categoryMeta}>
        {packs.length === 0 || lowest === null
          ? "No packs right now"
          : `From ${formatCents(lowest)} · ${packs.length} packs`}
      </Text>
    </Pressable>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLinks: {
    flexDirection: "row",
    gap: 16,
  },
  brand: {
    color: "#f4efe6",
    fontSize: 22,
    fontWeight: "600",
  },
  link: {
    color: "#e4c07a",
  },
  kicker: {
    color: "#c9bfb2",
    marginTop: 28,
    marginBottom: 8,
  },
  section: {
    color: "#f4efe6",
    fontSize: 20,
    fontWeight: "600",
    marginTop: 28,
    marginBottom: 12,
  },
  notice: {
    color: "#c9bfb2",
    marginTop: 12,
    lineHeight: 20,
  },
  status: {
    marginTop: 24,
  },
  retry: {
    alignSelf: "flex-start",
    backgroundColor: "#e4c07a",
    borderRadius: 999,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryLabel: {
    color: "#1a140c",
    fontWeight: "600",
  },
  categoryLink: {
    borderColor: "#2e2a26",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  categoryName: {
    color: "#f4efe6",
    fontSize: 18,
    fontWeight: "600",
  },
  categoryMeta: {
    color: "#c9bfb2",
    marginTop: 4,
  },
  placeholder: {
    color: "#8d8478",
    marginTop: 28,
  },
});
