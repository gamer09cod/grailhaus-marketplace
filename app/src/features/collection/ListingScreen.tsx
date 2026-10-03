import { useRef, useState } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ListingRejected, ListingUnknown, loadListingQuote, submitListing } from "../../api/listing";
import type { AppStackParamList } from "../../navigation/types";
import { dollarsToCents, formatCents } from "../../utils/money";
import { categoryLabel } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";
import { loadHoldings } from "./inventory";

export function ListingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Listing">>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [priceInput, setPriceInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const actionKey = useRef<string | null>(null);
  const pendingKind = useRef<"list" | "reprice" | "delist">("list");
  const holdings = useQuery({
    queryKey: ["holdings"],
    queryFn: loadHoldings,
  });
  const holding = holdings.data?.find((candidate) => candidate.ownedItemId === route.params.ownedItemId);
  const priceCents = dollarsToCents(priceInput);
  const quote = useQuery({
    queryKey: ["listing-quote", priceCents?.toString() ?? "none"],
    queryFn: () => loadListingQuote(priceCents as bigint),
    enabled: priceCents !== null,
  });

  function startAction(kind: "list" | "reprice" | "delist", remember: boolean) {
    if (!holding || !online || saving) {
      return;
    }
    if (kind !== "delist" && priceCents === null) {
      setNotice("Enter a price greater than zero.");
      return;
    }
    if ((kind === "reprice" || kind === "delist") && !holding.listingId) {
      setNotice("That listing is no longer active.");
      return;
    }
    pendingKind.current = kind;
    const idempotencyKey = remember || !actionKey.current ? Crypto.randomUUID() : actionKey.current;
    if (remember) {
      actionKey.current = idempotencyKey;
    }
    setSaving(true);
    setNotice(kind === "delist" ? "Removing the listing…" : "Saving the listing…");
    const action = kind === "delist"
      ? submitListing({ action: "delist", listingId: holding.listingId as string, idempotencyKey })
      : kind === "reprice"
        ? submitListing({
          action: "reprice",
          listingId: holding.listingId as string,
          priceCents: priceCents as bigint,
          idempotencyKey,
        })
        : submitListing({
          action: "list",
          ownedItemId: holding.ownedItemId,
          priceCents: priceCents as bigint,
          idempotencyKey,
        });

    void action.then(() => {
      actionKey.current = null;
      setUnknown(false);
      setNotice(null);
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
      navigation.navigate("Collection");
    }).catch((error: unknown) => {
      if (error instanceof ListingUnknown) {
        setUnknown(true);
        setNotice("Saving the listing…\n\nThis change may have completed.\nWe're checking before retrying.");
        return;
      }
      actionKey.current = null;
      setUnknown(false);
      setNotice(error instanceof ListingRejected ? error.message : "The listing was rejected.");
    }).finally(() => {
      setSaving(false);
    });
  }

  const listed = holding?.state === "LISTED" && holding.listingId;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      {!online ? (
        <Text style={styles.notice}>You're offline. Listing, price changes, and delist stay disabled until the connection returns.</Text>
      ) : null}
      {holdings.isLoading && !holding ? (
        <View>
          <ActivityIndicator color="#e4c07a" />
          <Text style={styles.notice}>Loading this item…</Text>
        </View>
      ) : null}
      {holdings.data && !holding ? (
        <Text style={styles.notice}>That item is not in your collection.</Text>
      ) : null}
      {holding ? (
        <View>
          <Text style={styles.category}>{categoryLabel(holding.category)}</Text>
          <Text style={styles.name}>{holding.name}</Text>
          <Text style={styles.label}>Current estimated value</Text>
          <Text style={styles.value}>{formatCents(holding.estimatedValueCents)}</Text>
          {listed && holding.listingPriceCents !== null ? (
            <Text style={styles.notice}>Listed at {formatCents(holding.listingPriceCents)}</Text>
          ) : null}
          <Text style={styles.label}>Listing price</Text>
          <TextInput
            keyboardType="decimal-pad"
            placeholder="450.00"
            placeholderTextColor="#8d8478"
            style={styles.input}
            value={priceInput}
            onChangeText={setPriceInput}
          />
          <Text style={styles.label}>Platform fee</Text>
          <Text style={styles.value}>
            {priceCents === null ? "—" : quote.isLoading ? "Calculating fee…" : quote.data ? formatCents(quote.data.feeCents) : "—"}
          </Text>
          <Text style={styles.label}>You receive</Text>
          <Text style={styles.value}>
            {priceCents === null ? "—" : quote.data ? formatCents(quote.data.sellerCents) : "—"}
          </Text>
          {quote.isError ? <Text style={styles.notice}>The fee preview didn't load.</Text> : null}
          {listed ? (
            <View>
              <Pressable
                disabled={!online || saving || unknown || priceCents === null}
                style={[styles.primary, (!online || saving || unknown || priceCents === null) && styles.disabled]}
                onPress={() => startAction("reprice", true)}
              >
                <Text style={styles.primaryLabel}>{saving ? "Saving…" : "Save price"}</Text>
              </Pressable>
              <Pressable
                disabled={!online || saving || unknown}
                style={[styles.secondary, (!online || saving || unknown) && styles.disabled]}
                onPress={() => startAction("delist", true)}
              >
                <Text style={styles.secondaryLabel}>Delist</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              disabled={!online || saving || unknown || priceCents === null}
              style={[styles.primary, (!online || saving || unknown || priceCents === null) && styles.disabled]}
              onPress={() => startAction("list", true)}
            >
              <Text style={styles.primaryLabel}>{saving ? "Saving…" : "List for sale"}</Text>
            </Pressable>
          )}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {unknown ? (
            <Pressable style={styles.primary} onPress={() => startAction(pendingKind.current, false)}>
              <Text style={styles.primaryLabel}>Check again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#12110f" },
  content: { padding: 24, paddingTop: 48, paddingBottom: 48 },
  link: { color: "#e4c07a", marginBottom: 20 },
  category: { color: "#a3988c", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  name: { color: "#f4efe6", fontSize: 28, fontWeight: "600", marginTop: 8 },
  label: { color: "#a3988c", marginTop: 24 },
  value: { color: "#f4efe6", fontSize: 22, fontWeight: "600", marginTop: 4 },
  input: {
    borderColor: "#2e2a26",
    borderRadius: 12,
    borderWidth: 1,
    color: "#f4efe6",
    fontSize: 22,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  notice: { color: "#c9bfb2", lineHeight: 20, marginTop: 12 },
  primary: {
    alignSelf: "flex-start",
    backgroundColor: "#e4c07a",
    borderRadius: 999,
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryLabel: { color: "#1a140c", fontWeight: "600" },
  secondary: {
    alignSelf: "flex-start",
    borderColor: "#e4c07a",
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryLabel: { color: "#e4c07a", fontWeight: "600" },
  disabled: { opacity: 0.35 },
});
