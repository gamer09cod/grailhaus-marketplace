import { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { QaRejected, submitQa, type QaAction } from "../../api/qa";
import type { AppStackParamList } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { loadDropBoard } from "../drops/board";
import { loadMarket } from "../market/board";
import { loadShelfPacks } from "../shelf/packs";
import { useOnline } from "../shelf/useOnline";

export function QaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [quantityText, setQuantityText] = useState("1");
  const [priceText, setPriceText] = useState("");
  const [balanceText, setBalanceText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const packs = useQuery({ queryKey: ["shelf-packs"], queryFn: loadShelfPacks });
  const drops = useQuery({ queryKey: ["drop-board"], queryFn: loadDropBoard });
  const market = useQuery({ queryKey: ["market"], queryFn: loadMarket });

  async function run(key: string, action: QaAction, payload: Record<string, string | number>) {
    if (!online || pending) {
      return;
    }
    setPending(key);
    setNotice(null);
    try {
      await submitQa(action, payload);
      await queryClient.invalidateQueries();
      setNotice("The server applied that change. Open the shelf, cart, drops, or wallet to see it.");
    } catch (error) {
      setNotice(error instanceof QaRejected ? error.message : "The QA action was rejected.");
    } finally {
      setPending(null);
    }
  }

  const quantity = Number(quantityText);
  const quantityOk = Number.isInteger(quantity) && quantity >= 1 && quantity <= 100;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>QA</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </View>
      <Text style={styles.kicker}>These actions use the server. Nothing here edits the screen by itself.</Text>
      {!online ? <Text style={styles.notice}>You're offline. QA actions stay disabled.</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Text style={styles.section}>Another user buys</Text>
      <TextInput
        keyboardType="number-pad"
        placeholder="Quantity"
        placeholderTextColor="#8d8478"
        style={styles.input}
        value={quantityText}
        onChangeText={setQuantityText}
      />
      {packs.data?.map((pack) => (
        <View key={pack.id} style={styles.row}>
          <Text style={styles.rowLabel}>{pack.name}</Text>
          <Text style={styles.meta}>{pack.reservable.toString()} available</Text>
          <Action
            disabled={!online || !quantityOk || pending !== null}
            label={pending === pack.id ? "Buying…" : `Buy ${quantityOk ? quantity : ""}`}
            onPress={() => void run(pack.id, "buyPack", { packSkuId: pack.id, quantity })}
          />
        </View>
      ))}

      <Text style={styles.section}>Drop window</Text>
      {drops.data?.drops.map((drop) => (
        <View key={drop.dropId} style={styles.row}>
          <Text style={styles.rowLabel}>{drop.name}</Text>
          <Text style={styles.meta}>{drop.status}</Text>
          <View style={styles.actions}>
            <Action
              disabled={!online || pending !== null}
              label="Start now"
              onPress={() => void run(`start-${drop.packSkuId}`, "startDrop", { packSkuId: drop.packSkuId })}
            />
            <Action
              disabled={!online || pending !== null}
              label="End now"
              onPress={() => void run(`end-${drop.packSkuId}`, "endDrop", { packSkuId: drop.packSkuId })}
            />
          </View>
        </View>
      ))}

      <Text style={styles.section}>Listings</Text>
      <TextInput
        keyboardType="decimal-pad"
        placeholder="New price in dollars"
        placeholderTextColor="#8d8478"
        style={styles.input}
        value={priceText}
        onChangeText={setPriceText}
      />
      {market.data?.map((listing) => (
        <View key={listing.listingId} style={styles.row}>
          <Text style={styles.rowLabel}>{listing.name}</Text>
          <Text style={styles.meta}>{formatCents(listing.priceCents)} · {listing.sellerUsername}</Text>
          <View style={styles.actions}>
            <Action
              disabled={!online || pending !== null}
              label="Reprice"
              onPress={() => {
                const typed = priceText.trim();
                const priceCents = typed.length > 0 ? dollarsToWire(typed) : (listing.priceCents + 100n).toString();
                if (!priceCents) {
                  setNotice("Enter a price greater than zero.");
                  return;
                }
                void run(`price-${listing.listingId}`, "repriceListing", {
                  listingId: listing.listingId,
                  priceCents,
                });
              }}
            />
            <Action
              disabled={!online || pending !== null}
              label="Delist"
              onPress={() => void run(`delist-${listing.listingId}`, "delistListing", { listingId: listing.listingId })}
            />
            <Action
              disabled={!online || pending !== null}
              label="Sells elsewhere"
              onPress={() => void run(`sell-${listing.listingId}`, "sellListing", { listingId: listing.listingId })}
            />
          </View>
        </View>
      ))}
      {market.data && market.data.length === 0 ? (
        <Text style={styles.meta}>No active listings.</Text>
      ) : null}

      <Text style={styles.section}>Wallet</Text>
      <TextInput
        keyboardType="decimal-pad"
        placeholder="Balance in dollars"
        placeholderTextColor="#8d8478"
        style={styles.input}
        value={balanceText}
        onChangeText={setBalanceText}
      />
      <Action
        disabled={!online || pending !== null}
        label="Set my balance"
        onPress={() => {
          const balanceCents = dollarsToWire(balanceText, true);
          if (!balanceCents) {
            setNotice("Enter a balance from $0.00 to $1,000,000.");
            return;
          }
          void run("balance", "setBalance", { balanceCents });
        }}
      />

      <Text style={styles.section}>Reservation</Text>
      <Action
        disabled={!online || pending !== null}
        label="Expire my reservation"
        onPress={() => void run("expire", "expireReservation", {})}
      />
    </ScrollView>
  );
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
      {label.endsWith("…") ? <ActivityIndicator color="#1a140c" /> : <Text style={styles.buttonLabel}>{label}</Text>}
    </Pressable>
  );
}

function dollarsToWire(input: string, allowZero = false): string | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(input.trim());
  if (!match) {
    return null;
  }
  const dollars = BigInt(match[1] ?? "0");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const cents = dollars * 100n + BigInt(fraction || "0");
  if (cents < 0n || cents > 100_000_000n || (!allowZero && cents === 0n)) {
    return null;
  }
  return cents.toString();
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
  kicker: {
    color: "#c9bfb2",
    marginTop: 16,
  },
  section: {
    color: "#f4efe6",
    fontSize: 18,
    marginTop: 28,
    marginBottom: 8,
  },
  notice: {
    color: "#e4c07a",
    marginTop: 12,
  },
  input: {
    borderColor: "#2a2723",
    borderWidth: 1,
    color: "#f4efe6",
    marginBottom: 12,
    padding: 12,
  },
  row: {
    borderColor: "#2a2723",
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  rowLabel: {
    color: "#f4efe6",
  },
  meta: {
    color: "#8d8478",
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#e4c07a",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonLabel: {
    color: "#1a140c",
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
});
