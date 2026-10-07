import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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
import { watchTables } from "../../api/live";
import { AppHeader } from "../../components/AppHeader";
import { AppBottomSheet } from "../../components/AppBottomSheet";
import { Chip, ChipGroup } from "../../components/Chip";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { RecoveryAction } from "../../components/RecoveryAction";
import { PrimaryButton } from "../../components/buttons";
import { colors, layout, maxFontScale, radius, spacing, typography, useContentBottomPadding } from "../../theme";
import { dollarsToCents, formatCents } from "../../utils/money";
import { useAuth } from "../auth/AuthProvider";
import { useOnline } from "../shelf/useOnline";
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
  const online = useOnline();
  const contentBottom = useContentBottomPadding();
  const [customAmount, setCustomAmount] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
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
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void queryClient.invalidateQueries({ queryKey: ["wallet", userId] });
        void queryClient.invalidateQueries({ queryKey: ["catalog-summary", userId] });
      }
    });
    const stop = watchTables(
      "wallet",
      [{ table: "wallets", event: "UPDATE", filter: `user_id=eq.${userId}` }],
      () => {
        void queryClient.invalidateQueries({ queryKey: ["wallet", userId] });
      },
    );
    return () => {
      appState.remove();
      stop();
    };
  }, [queryClient, userId]);

  useEffect(() => {
    let cancelled = false;
    void readInflightDeposit().then((inflight) => {
      if (!cancelled && inflight) {
        setDepositOpen(true);
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
      setDepositOpen(false);
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
      setNotice(error instanceof DepositRejected ? error.message : "The deposit did not go through. Check the amount and try again.");
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

  const depositCents = dollarsToCents(customAmount);
  const depositBusy = !online || confirming || awaitingResult;
  const depositLabel = depositCents ? `Deposit · ${formatCents(depositCents)}` : "Deposit";
  const balanceLabel = balance.isLoading
    ? "Loading balance"
    : balance.isError
      ? "Balance unavailable"
      : balance.data !== undefined
        ? formatCents(balance.data)
        : "—";

  return (
    <View style={styles.screen}>
      <AppHeader back title="Wallet" />
      <View style={[styles.body, { paddingBottom: contentBottom }]}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.label}>Balance</Text>
        <Text
          accessibilityLabel={
            balance.isLoading
              ? "Loading balance"
              : balance.isError
                ? "Balance unavailable"
                : balance.data !== undefined
                  ? `Balance ${formatCents(balance.data)}`
                  : "Balance"
          }
          maxFontSizeMultiplier={maxFontScale.display}
          style={styles.balance}
        >
          {balanceLabel}
        </Text>
        {balance.isError ? (
          <InlineStatusCard
            body="Pull the app forward to try again."
            icon="alert-circle-outline"
            title="We couldn't read your balance."
            tone="warning"
          />
        ) : null}
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.catalog}>
          {catalog.isLoading
            ? "Loading catalog…"
            : catalog.isError
              ? "Catalog unavailable. Check the connection and reopen the wallet."
              : `${catalog.data?.itemCount ?? 0} collectibles across ${catalog.data?.packCount ?? 0} packs`}
        </Text>
        <Pressable
          accessibilityLabel="App version"
          delayLongPress={3000}
          onLongPress={() => navigation.navigate("Qa")}
        >
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.version}>Version 1.0.0</Text>
        </Pressable>
        <ConnectivityBanner offlineDetail="Balances and the catalog may be out of date. Deposits stay disabled until the connection returns." />
        <View style={styles.depositLaunch}>
          <PrimaryButton
            disabled={!online || confirming}
            fullWidth
            label="Deposit"
            motion="financial"
            onPress={() => {
              setDepositOpen(true);
            }}
          />
        </View>
        {notice ? (
          <InlineStatusCard
            action={
              awaitingResult
                ? {
                    label: "Check again",
                    motion: "financial",
                    variant: "secondary",
                    fullWidth: true,
                    onPress: checkDepositAgain,
                  }
                : undefined
            }
            icon={awaitingResult ? "help-circle-outline" : notice.startsWith("Deposited") ? "checkmark-circle-outline" : "alert-circle-outline"}
            title={notice}
            tone={awaitingResult ? "warning" : notice.startsWith("Deposited") ? "success" : "info"}
          />
        ) : null}
      </View>
      <AppBottomSheet
        motion="financial"
        title="Deposit"
        visible={depositOpen}
        footer={
          awaitingResult ? (
            <RecoveryAction
              fullWidth
              label="Check again"
              motion="financial"
              variant="secondary"
              onPress={checkDepositAgain}
            />
          ) : (
            <PrimaryButton
              disabled={depositBusy || depositCents === null}
              fullWidth
              label={confirming ? "Confirming deposit…" : depositLabel}
              loading={confirming}
              loadingLabel="Confirming deposit…"
              motion="financial"
              onPress={startCustomDeposit}
            />
          )
        }
        onClose={() => {
          if (!confirming) {
            setDepositOpen(false);
          }
        }}
      >
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetLead}>
          Mock deposits credit this trial wallet. Amounts are integer cents.
        </Text>
        <ChipGroup accessibilityLabel="Deposit presets">
          {presets.map((preset) => (
            <Chip
              key={preset.label}
              disabled={depositBusy}
              label={preset.label}
              selected={depositCents === preset.cents}
              onPress={() => setCustomAmount((preset.cents / 100n).toString())}
            />
          ))}
        </ChipGroup>
        <TextInput
          accessibilityLabel="Deposit amount"
          keyboardType="decimal-pad"
          placeholder="Custom amount"
          placeholderTextColor={colors.textTertiary}
          style={styles.sheetInput}
          value={customAmount}
          onChangeText={setCustomAmount}
        />
        {notice ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.sheetNotice}>{notice}</Text>
        ) : null}
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.backgroundPrimary,
    flex: 1,
  },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  balance: {
    ...typography.moneyLarge,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  catalog: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  version: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.md,
  },
  depositLaunch: {
    marginTop: spacing.lg,
  },
  sheetLead: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  sheetInput: {
    ...typography.money,
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    borderWidth: 1,
    color: colors.textPrimary,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.base,
  },
  sheetNotice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
