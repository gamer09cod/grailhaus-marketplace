import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { AppStackParamList } from "../../navigation/types";

import {
  clearInflightDeposit,
  DepositRejected,
  DepositUnknown,
  readInflightDeposit,
  rememberInflightDeposit,
  submitDeposit,
} from "../../api/deposit";
import { loadCatalogSummary } from "../../api/catalog";
import { supabase } from "../../api/supabase";
import { dollarsToCents, formatCents } from "../../utils/money";
import { useAuth } from "../auth/AuthProvider";
import { loadBalanceCents } from "./wallet";

const presets = [
  { label: "$100", cents: 10_000n },
  { label: "$500", cents: 50_000n },
  { label: "$1,000", cents: 100_000n },
] as const;

export function WalletScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(true);
  const [customAmount, setCustomAmount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [awaitingResult, setAwaitingResult] = useState(false);

  const balance = useQuery({
    queryKey: ["wallet", userId],
    queryFn: () => loadBalanceCents(userId),
    enabled: userId.length > 0,
  });

  const catalog = useQuery({
    queryKey: ["catalog-summary", userId],
    queryFn: loadCatalogSummary,
    enabled: userId.length > 0,
  });

  useEffect(() => {
    const network = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    });
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void queryClient.invalidateQueries({ queryKey: ["wallet", userId] });
        void queryClient.invalidateQueries({ queryKey: ["catalog-summary", userId] });
      }
    });
    const channel = supabase
      .channel(`wallet-${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["wallet", userId] });
      })
      .subscribe();
    return () => {
      network();
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  useEffect(() => {
    let cancelled = false;
    void readInflightDeposit().then((inflight) => {
      if (!cancelled && inflight) {
        setConfirming(true);
        setNotice("Confirming deposit…\n\nThis deposit may have completed.\nWe're checking before retrying.");
        void runDeposit(inflight.amountCents, inflight.idempotencyKey, false);
      }
    });
    return () => {
      cancelled = true;
    };
    // Resume a deposit that was sent before the app closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function runDeposit(amountCents: string, idempotencyKey: string, remember: boolean) {
    if (!online) {
      setNotice("You're offline. Deposits stay disabled until the connection returns.");
      return;
    }

    setConfirming(true);
    if (remember) {
      await rememberInflightDeposit({ amountCents, idempotencyKey });
      setNotice("Confirming deposit…");
    }

    try {
      const receipt = await submitDeposit({ amountCents, idempotencyKey });
      await clearInflightDeposit();
      queryClient.setQueryData(["wallet", userId], receipt.balanceCents);
      setAwaitingResult(false);
      setNotice(`Deposited ${formatCents(receipt.amountCents)}.`);
    } catch (error) {
      if (error instanceof DepositUnknown) {
        setAwaitingResult(true);
        setNotice(
          "Confirming deposit…\n\nThis deposit may have completed.\nWe're checking before retrying.",
        );
        return;
      }
      await clearInflightDeposit();
      setAwaitingResult(false);
      setNotice(error instanceof DepositRejected ? error.message : "The deposit was rejected.");
    } finally {
      setConfirming(false);
    }
  }

  function startDeposit(cents: bigint) {
    if (confirming || awaitingResult || !online) {
      return;
    }
    void runDeposit(cents.toString(), Crypto.randomUUID(), true);
  }

  function checkDepositAgain() {
    void readInflightDeposit().then((inflight) => {
      if (inflight) {
        void runDeposit(inflight.amountCents, inflight.idempotencyKey, false);
      }
    });
  }

  function startCustomDeposit() {
    const cents = dollarsToCents(customAmount);
    if (!cents) {
      setNotice("Enter an amount from $0.01 to $1,000,000.");
      return;
    }
    startDeposit(cents);
  }

  const balanceLabel = balance.isLoading
    ? "Loading balance"
    : balance.isError
      ? "Balance unavailable"
      : balance.data !== undefined
        ? formatCents(balance.data)
        : "—";

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>GrailHaus</Text>
        <View style={styles.headerLinks}>
          <Pressable onPress={() => navigation.navigate("Shelf")}>
            <Text style={styles.signOut}>Shelf</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Admin")}>
            <Text style={styles.signOut}>Admin</Text>
          </Pressable>
          <Pressable onPress={() => void supabase.auth.signOut()}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.label}>Wallet</Text>
      <Text style={styles.balance}>{balanceLabel}</Text>
      {balance.isError ? (
        <Text style={styles.notice}>We couldn't read your balance. Pull the app forward to try again.</Text>
      ) : null}
      <Text style={styles.catalog}>
        {catalog.isLoading
          ? "Loading catalog…"
          : catalog.isError
            ? "Catalog unavailable. Check the connection and reopen the wallet."
            : `${catalog.data?.itemCount ?? 0} collectibles across ${catalog.data?.packCount ?? 0} packs`}
      </Text>
      <Pressable delayLongPress={3000} onLongPress={() => navigation.navigate("Qa")}>
        <Text style={styles.version}>Version 1.0.0</Text>
      </Pressable>
      {!online ? (
        <Text style={styles.notice}>You're offline. Balances and the catalog may be out of date.</Text>
      ) : null}
      <Text style={styles.section}>Add mock funds</Text>
      <View style={styles.row}>
        {presets.map((preset) => (
          <Pressable
            key={preset.label}
            disabled={!online || confirming || awaitingResult}
            style={[styles.preset, (!online || confirming || awaitingResult) && styles.disabled]}
            onPress={() => startDeposit(preset.cents)}
          >
            <Text style={styles.presetLabel}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.customRow}>
        <TextInput
          keyboardType="decimal-pad"
          placeholder="Custom amount"
          placeholderTextColor="#8d8478"
          style={styles.input}
          value={customAmount}
          onChangeText={setCustomAmount}
        />
        <Pressable
          disabled={!online || confirming || awaitingResult}
          style={[styles.primary, (!online || confirming || awaitingResult) && styles.disabled]}
          onPress={startCustomDeposit}
        >
          {confirming ? (
            <ActivityIndicator color="#1a140c" />
          ) : (
            <Text style={styles.primaryLabel}>Deposit</Text>
          )}
        </Pressable>
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {awaitingResult ? (
        <Pressable style={styles.primary} onPress={checkDepositAgain}>
          <Text style={styles.primaryLabel}>Check again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#12110f",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
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
  signOut: {
    color: "#e4c07a",
  },
  label: {
    color: "#c9bfb2",
    marginTop: 36,
  },
  balance: {
    color: "#f4efe6",
    fontSize: 42,
    fontWeight: "600",
    marginTop: 4,
  },
  catalog: {
    color: "#c9bfb2",
    marginTop: 12,
  },
  version: {
    color: "#8d8478",
    marginTop: 8,
  },
  section: {
    color: "#f4efe6",
    marginTop: 36,
    marginBottom: 12,
    fontSize: 18,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  preset: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e4c07a",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  presetLabel: {
    color: "#e4c07a",
    fontWeight: "600",
  },
  customRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#1d1b18",
    color: "#f4efe6",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  primary: {
    backgroundColor: "#e4c07a",
    borderRadius: 12,
    minWidth: 108,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: {
    color: "#1a140c",
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.4,
  },
  notice: {
    color: "#e4c07a",
    marginTop: 16,
    lineHeight: 22,
  },
});
