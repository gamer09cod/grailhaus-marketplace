import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  loadRevealPack,
  loadRevealSession,
  RevealRejected,
  submitReveal,
  type RevealCard,
  type RevealPack,
} from "../../api/reveal";
import { AppHeader } from "../../components/AppHeader";
import { CollectibleArt } from "../../components/CollectibleArt";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { ErrorState } from "../../components/ErrorState";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { RevealLoadSkeleton } from "../../components/Skeleton";
import { PrimaryButton, TertiaryButton } from "../../components/buttons";
import type { AppStackParamList } from "../../navigation/types";
import { colors, glow, layout, maxFontScale, radius, shadows, spacing, typography, type RarityKey } from "../../theme";
import { formatCents } from "../../utils/money";
import { useOnline } from "../shelf/useOnline";
import {
  cardAnnouncement,
  nextCardLabel,
  revealMotion,
  sealedDirection,
  spokenRarity,
  summaryAnnouncement,
} from "./access";
import { loadHapticsEnabled, playHaptic, playRarityHaptic, saveHapticsEnabled } from "./haptics";
import { bestPull, fanInOpenOrder, openMode, packsOpenedLabel, sumCents, type OpenMode } from "./pacing";
import { backgroundDuringTear, recoveryCursor, recoveryShowsCard } from "./recovery";
import { anticipationMs, decideTear, isHighRarity, velocityPxPerMs } from "./tear";

const rareDots: { top?: number; bottom?: number; left?: number; right?: number; size: number }[] = [
  { top: 28, left: 36, size: 4 },
  { top: 64, right: 42, size: 3 },
  { top: 120, left: 28, size: 5 },
  { bottom: 88, right: 30, size: 3 },
  { bottom: 48, left: 48, size: 4 },
];

type RevealPhase = "SEALED" | "DRAGGING" | "TEARING" | "OPEN" | "REVEALING_CARD" | "CARD_REVEALED" | "PACK_COMPLETE";

export function RevealScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Reveal">>();
  const packIds = route.params.purchasedPackIds;
  const queryClient = useQueryClient();
  const online = useOnline();
  const sessionKey = ["reveal-session", packIds.join(",")] as const;
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: () => loadRevealSession(packIds),
  });

  const [cursor, setCursor] = useState(0);
  const [summary, setSummary] = useState(false);
  const [presentation, setPresentation] = useState<OpenMode>("full");
  const [phase, setPhase] = useState<RevealPhase>("SEALED");
  const [settling, setSettling] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const dragY = useMemo(() => new Animated.Value(0), []);
  const cardFade = useMemo(() => new Animated.Value(1), []);
  const cardScale = useMemo(
    () => cardFade.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }),
    [cardFade],
  );
  const ambientOpacity = useMemo(
    () => dragY.interpolate({ inputRange: [0, 48, 200], outputRange: [0.14, 0.22, 0.34], extrapolate: "clamp" }),
    [dragY],
  );
  const phaseRef = useRef<RevealPhase>("SEALED");
  const offsetRef = useRef(0);
  const settlingRef = useRef(false);
  const hapticsRef = useRef(true);
  const reducedRef = useRef(false);
  const skipHold = useRef(false);
  const onlineRef = useRef(online);
  const workingRef = useRef(false);
  const cursorRef = useRef(0);
  const packsRef = useRef<RevealPack[]>([]);
  const touched = useRef(false);
  const gestureEpoch = useRef(0);
  const grantEpoch = useRef(0);
  const samples = useRef<{ t: number; y: number }[]>([]);
  const placed = useRef(false);
  const packRef = useRef<RevealPack | null>(null);
  const mounted = useRef(true);

  const packs = useMemo(() => session.data ?? [], [session.data]);
  const loaded = packs[cursor] ?? null;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    return () => {
      mounted.current = false;
      dragY.stopAnimation();
      cardFade.stopAnimation();
    };
  }, [cardFade, dragY]);
  useEffect(() => {
    hapticsRef.current = hapticsOn;
  }, [hapticsOn]);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  useEffect(() => {
    packsRef.current = packs;
  }, [packs]);
  useEffect(() => {
    packRef.current = loaded;
  }, [loaded]);

  useEffect(() => {
    void loadHapticsEnabled().then(setHapticsOn);
  }, []);

  const setRevealPhase = useCallback((next: RevealPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const setCursorAt = useCallback((index: number) => {
    cursorRef.current = index;
    setCursor(index);
  }, []);

  const placeSleeve = useCallback((distance: number) => {
    const next = Math.min(Math.max(0, distance), 320);
    offsetRef.current = next;
    dragY.setValue(next);
  }, [dragY]);

  const springShut = useCallback((from: number) => {
    dragY.stopAnimation();
    settlingRef.current = true;
    setSettling(true);
    placeSleeve(from);
    Animated.timing(dragY, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!mounted.current || !finished) {
        return;
      }
      offsetRef.current = 0;
      settlingRef.current = false;
      setSettling(false);
      setRevealPhase("SEALED");
    });
  }, [dragY, placeSleeve, setRevealPhase]);

  const showStoredCard = useCallback(async (pack: RevealPack, holdMs: number) => {
    const card = pack.cards[0];
    if (!card) {
      setNotice("This pack has no stored card.");
      return;
    }
    skipHold.current = false;
    setRevealPhase("REVEALING_CARD");
    await submitReveal(pack.purchasedPackId, "REVEALING_CARD");
    await waitWhile(() => !skipHold.current, holdMs);
    playRarityHaptic(card.rarity, hapticsRef.current);
    await submitReveal(pack.purchasedPackId, "CARD_REVEALED");
    setRevealPhase("CARD_REVEALED");
  }, [setRevealPhase]);

  const showCompressed = useCallback(async (pack: RevealPack) => {
    const card = pack.cards[0];
    if (!card) {
      setNotice("This pack has no stored card.");
      return;
    }
    skipHold.current = false;
    setRevealPhase("REVEALING_CARD");
    await submitReveal(pack.purchasedPackId, "REVEALING_CARD");
    await waitWhile(() => !skipHold.current, 140);
    playRarityHaptic(card.rarity, hapticsRef.current);
    await submitReveal(pack.purchasedPackId, "CARD_REVEALED");
    setRevealPhase("CARD_REVEALED");
  }, [setRevealPhase]);

  const presentCard = useCallback(async (pack: RevealPack) => {
    const card = pack.cards[0];
    const mode = openMode(cursorRef.current + 1, card?.rarity ?? "COMMON");
    setPresentation(mode);
    if (revealMotion(reducedRef.current).travelPx === 0) {
      await showStoredCard(pack, revealMotion(true).fadeMs);
      return;
    }
    if (mode === "fast") {
      await showCompressed(pack);
      return;
    }
    await showStoredCard(pack, anticipationMs(card?.rarity ?? "COMMON"));
  }, [showCompressed, showStoredCard]);

  const continueReveal = useCallback(async (pack: RevealPack, stored: string) => {
    const card = pack.cards[0];
    setPresentation(openMode(cursorRef.current + 1, card?.rarity ?? "COMMON"));
    if (!recoveryShowsCard(stored)) {
      setRevealPhase("SEALED");
      return;
    }
    if (stored === "CARD_REVEALED" || stored === "PACK_COMPLETE") {
      setRevealPhase(stored);
      return;
    }
    if (!card) {
      setNotice("This pack has no stored card.");
      return;
    }
    if (stored === "OPEN") {
      await submitReveal(pack.purchasedPackId, "REVEALING_CARD");
    }
    await submitReveal(pack.purchasedPackId, "CARD_REVEALED");
    setRevealPhase("CARD_REVEALED");
  }, [setRevealPhase]);

  const resume = useCallback(async (pack: RevealPack, stored: string) => {
    if (workingRef.current) {
      return;
    }
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    try {
      await continueReveal(pack, stored);
    } catch (error) {
      setNotice(error instanceof RevealRejected ? error.message : "The pack did not open.");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }, [continueReveal]);

  useEffect(() => {
    const loadedPacks = session.data;
    if (!loadedPacks || placed.current) {
      return;
    }
    placed.current = true;
    packsRef.current = loadedPacks;
    const first = recoveryCursor(loadedPacks.map((pack) => pack.revealState));
    if (first === "summary") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time recovery when session loads
      setSummary(true);
      return;
    }
    setCursorAt(first);
    const pack = loadedPacks[first];
    if (!pack || pack.category !== "TRADING_CARD" || !recoveryShowsCard(pack.revealState)) {
      setRevealPhase("SEALED");
      return;
    }
    if (pack.revealState === "PACK_COMPLETE") {
      setRevealPhase("PACK_COMPLETE");
      return;
    }
    void resume(pack, pack.revealState);
  }, [resume, session.data, setCursorAt, setRevealPhase]);

  const refetchSession = session.refetch;
  const reconcileSealed = useCallback(() => {
    void refetchSession().then((result) => {
      if (!placed.current) {
        return;
      }
      const current = result.data?.[cursorRef.current];
      if (!current || phaseRef.current !== "SEALED" || settlingRef.current || workingRef.current) {
        return;
      }
      if (recoveryShowsCard(current.revealState) && current.category === "TRADING_CARD") {
        void resume(current, current.revealState);
      }
    });
  }, [refetchSession, resume]);

  useFocusEffect(
    useCallback(() => {
      reconcileSealed();
    }, [reconcileSealed]),
  );

  const resetUncommitted = useCallback(() => {
    dragY.stopAnimation();
    settlingRef.current = false;
    setSettling(false);
    placeSleeve(0);
    setRevealPhase("SEALED");
  }, [dragY, placeSleeve, setRevealPhase]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        if (backgroundDuringTear(phaseRef.current) === "reset") {
          gestureEpoch.current += 1;
          resetUncommitted();
        }
        return;
      }
      if (next === "active") {
        reconcileSealed();
      }
    });
    return () => subscription.remove();
  }, [reconcileSealed, resetUncommitted]);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!alive) {
        return;
      }
      reducedRef.current = enabled;
      setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      reducedRef.current = enabled;
      setReduced(enabled);
      if (enabled && (phaseRef.current === "SEALED" || phaseRef.current === "DRAGGING")) {
        gestureEpoch.current += 1;
        resetUncommitted();
      }
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [resetUncommitted]);

  const glide = useCallback((to: number, ms: number) => {
    dragY.stopAnimation();
    return new Promise<void>((resolve) => {
      Animated.timing(dragY, {
        toValue: to,
        duration: ms,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        offsetRef.current = to;
        if (finished) {
          resolve();
        }
      });
    });
  }, [dragY]);

  const commitTear = useCallback(async (source: "gesture" | "fast" | "reduced") => {
    const pack = packRef.current;
    if (!pack || workingRef.current || phaseRef.current === "TEARING") {
      return;
    }
    if (source === "fast" && (cursorRef.current < 2 || reducedRef.current)) {
      return;
    }
    if (source === "reduced" && !reducedRef.current) {
      return;
    }
    if (!onlineRef.current) {
      setNotice("You're offline. The pack stays sealed until the connection returns.");
      if (source === "gesture") {
        springShut(offsetRef.current);
      }
      return;
    }
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    setRevealPhase("TEARING");
    try {
      const travel = revealMotion(source === "reduced" || reducedRef.current).travelPx;
      if (travel === 0) {
        placeSleeve(0);
      } else if (source === "fast") {
        await glide(travel, 260);
      } else {
        placeSleeve(travel);
      }
      playHaptic("tear", hapticsRef.current);
      await submitReveal(pack.purchasedPackId, "OPEN");
      setRevealPhase("OPEN");
      await presentCard(pack);
    } catch (error) {
      setNotice(error instanceof RevealRejected ? error.message : "The pack did not open.");
      const fresh = await loadRevealPack(pack.purchasedPackId).catch(() => null);
      if (!fresh || fresh.revealState === "SEALED") {
        springShut(offsetRef.current);
        return;
      }
      packRef.current = fresh;
      const card = fresh.cards[0];
      setPresentation(openMode(cursorRef.current + 1, card?.rarity ?? "COMMON"));
      if (fresh.revealState === "CARD_REVEALED" || fresh.revealState === "PACK_COMPLETE") {
        setRevealPhase(fresh.revealState);
        return;
      }
      setRevealPhase(fresh.revealState === "REVEALING_CARD" ? "REVEALING_CARD" : "OPEN");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }, [glide, placeSleeve, presentCard, setRevealPhase, springShut]);

  const commitRef = useRef(commitTear);
  const springRef = useRef(springShut);
  useEffect(() => {
    commitRef.current = commitTear;
    springRef.current = springShut;
  }, [commitTear, springShut]);

  /* Gesture handlers close over refs and sample Date.now only on touch events. */
  /* eslint-disable react-hooks/refs, react-hooks/purity -- PanResponder event callbacks */
  const panHandlers = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () =>
        !reducedRef.current && phaseRef.current === "SEALED" && !settlingRef.current && !workingRef.current,
      onMoveShouldSetPanResponder: () =>
        !reducedRef.current
        && (phaseRef.current === "SEALED" || phaseRef.current === "DRAGGING")
        && !settlingRef.current
        && !workingRef.current,
      onPanResponderGrant: () => {
        grantEpoch.current = gestureEpoch.current;
        samples.current = [{ t: Date.now(), y: 0 }];
        touched.current = false;
      },
      onPanResponderMove: (_event, gesture) => {
        if (grantEpoch.current !== gestureEpoch.current) {
          return;
        }
        if (phaseRef.current !== "SEALED" && phaseRef.current !== "DRAGGING") {
          return;
        }
        const distance = Math.max(0, gesture.dy);
        placeSleeve(distance);
        const now = Date.now();
        samples.current.push({ t: now, y: distance });
        const cutoff = now - 90;
        while (samples.current[0] && samples.current[0].t < cutoff) {
          samples.current.shift();
        }
        if (distance >= 8 && phaseRef.current === "SEALED") {
          phaseRef.current = "DRAGGING";
          setPhase("DRAGGING");
          if (!touched.current) {
            touched.current = true;
            playHaptic("touch", hapticsRef.current);
          }
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        if (grantEpoch.current !== gestureEpoch.current) {
          return;
        }
        if (phaseRef.current !== "SEALED" && phaseRef.current !== "DRAGGING") {
          return;
        }
        const distance = Math.max(0, gesture.dy);
        const decision = decideTear(distance, velocityPxPerMs(samples.current));
        if (decision === "tear") {
          void commitRef.current("gesture");
          return;
        }
        if (distance < 12) {
          phaseRef.current = "SEALED";
          setPhase("SEALED");
          placeSleeve(0);
          return;
        }
        springRef.current(distance);
      },
      onPanResponderTerminate: () => {
        if (grantEpoch.current !== gestureEpoch.current) {
          return;
        }
        if (phaseRef.current === "DRAGGING") {
          springRef.current(offsetRef.current);
        }
      },
    }).panHandlers,
    [placeSleeve],
  );
  /* eslint-enable react-hooks/refs, react-hooks/purity */

  async function finishPack() {
    const current = packRef.current;
    if (!current || workingRef.current) {
      return;
    }
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    try {
      await submitReveal(current.purchasedPackId, "PACK_COMPLETE");
      const all = packsRef.current.map((pack, index) =>
        index === cursorRef.current ? { ...pack, revealState: "PACK_COMPLETE" } : pack,
      );
      packsRef.current = all;
      queryClient.setQueryData(sessionKey, all);
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
      void queryClient.invalidateQueries({ queryKey: ["sealed-packs"] });
      const next = cursorRef.current + 1;
      if (next >= all.length) {
        setRevealPhase("PACK_COMPLETE");
        if (all.length > 1) {
          setSummary(true);
        }
        return;
      }
      const upcoming = all[next];
      if (!upcoming) {
        return;
      }
      setCursorAt(next);
      placeSleeve(0);
      setPresentation("full");
      if (upcoming.revealState === "SEALED" || upcoming.category !== "TRADING_CARD") {
        setRevealPhase("SEALED");
        return;
      }
      await continueReveal(upcoming, upcoming.revealState);
    } catch (error) {
      setNotice(error instanceof RevealRejected ? error.message : "The pack did not open.");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }

  async function toggleHaptics() {
    const next = !hapticsRef.current;
    hapticsRef.current = next;
    setHapticsOn(next);
    await saveHapticsEnabled(next);
  }

  const card = loaded?.cards[0];
  const revealed = phase === "CARD_REVEALED" || phase === "PACK_COMPLETE";
  const anticipating = phase === "REVEALING_CARD" && card !== undefined && isHighRarity(card.rarity) && presentation !== "fast" && !reduced;
  const sleeveVisible = phase === "SEALED" || phase === "DRAGGING" || phase === "TEARING";
  const fastSlot = !reduced && cursor >= 2 && phase === "SEALED" && !settling;
  const reducedOpen = reduced && phase === "SEALED" && !settling;
  const spokenCard = revealed && card ? cardAnnouncement(card) : null;

  useEffect(() => {
    if (!reduced || sleeveVisible) {
      cardFade.setValue(1);
      return;
    }
    cardFade.setValue(0);
    const fade = Animated.timing(cardFade, {
      toValue: 1,
      duration: revealMotion(true).fadeMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    fade.start();
    return () => fade.stop();
  }, [cardFade, reduced, sleeveVisible, phase, cursor]);

  useEffect(() => {
    if (!spokenCard) {
      return;
    }
    AccessibilityInfo.announceForAccessibility(spokenCard);
  }, [spokenCard]);
  const pulls = revealed && presentation === "fast" ? openedPulls(packs, cursor, true) : [];
  const spent = sumCents(packs.map((pack) => pack.spentCents));
  const estimated = sumCents(packs.flatMap((pack) => pack.cards.map((item) => item.estimatedValueCents)));
  const best = bestPull(packs.flatMap((pack) => pack.cards));

  const toPortfolio = () => navigation.navigate("Tabs", { screen: "Portfolio" });

  const categoryTone = colors.category.TRADING_CARD;
  const rarityTone = rarityColor(card?.rarity);

  return (
    <RevealFrame onClose={toPortfolio}>
      {summary ? (
        <View
          accessibilityLabel={summaryAnnouncement(packs.length, spent, estimated, best?.name ?? "None")}
          style={styles.summary}
        >
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>Session</Text>
          <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.title}>{packsOpenedLabel(packs.length)}</Text>
          <View style={styles.summaryRow}>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.summaryLabel}>Total spent</Text>
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.summaryValue}>{formatCents(spent)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.summaryLabel}>Collection value</Text>
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.summaryValue}>{formatCents(estimated)}</Text>
          </View>
          <View style={styles.summaryBest}>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>Best pull</Text>
            <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.bestName}>{best?.name ?? "None"}</Text>
            {best ? (
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.bestValue}>
                {spokenRarity(best.rarity)} · {formatCents(best.estimatedValueCents)}
              </Text>
            ) : null}
          </View>
          <PrimaryButton fullWidth label="View Portfolio" onPress={toPortfolio} />
        </View>
      ) : (
        <View style={styles.column}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>Reveal</Text>
              <Text maxFontSizeMultiplier={maxFontScale.display} numberOfLines={1} style={styles.title}>
                {loaded?.name ?? "Pack"}
              </Text>
            </View>
            <TertiaryButton
              accessibilityHint="The card name, rarity, and value stay on screen."
              accessibilityLabel={hapticsOn ? "Haptics on" : "Haptics off"}
              label={hapticsOn ? "Haptics on" : "Haptics off"}
              onPress={() => void toggleHaptics()}
            />
          </View>
          {session.isLoading ? <RevealLoadSkeleton /> : null}
          {session.isError ? (
            <ErrorState
              body="Check the connection and try again."
              retryVariant="primary"
              title="The pack didn't load."
              onRetry={() => void session.refetch()}
            />
          ) : null}
          {session.data && packs.length === 0 ? (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>That pack is not in your collection.</Text>
          ) : null}
          {loaded && loaded.category !== "TRADING_CARD" ? (
            <View style={styles.statusBlock}>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>This pack is in your collection.</Text>
              <PrimaryButton label="View Portfolio" onPress={toPortfolio} />
            </View>
          ) : null}
          {loaded && loaded.category === "TRADING_CARD" ? (
            <View style={styles.column}>
              <ConnectivityBanner offlineDetail="The pack stays sealed until the connection returns." />
              {packs.length > 1 ? (
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.progress}>
                  {`Pack ${cursor + 1} of ${packs.length}`}
                </Text>
              ) : null}
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.status}>
                {statusCopy(phase, settling, reduced, presentation)}
              </Text>
              <View style={styles.stage}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.ambient,
                    {
                      backgroundColor: anticipating ? rarityTone.solid : categoryTone.solid,
                      opacity: anticipating ? 0.28 : ambientOpacity,
                      ...glow(anticipating ? rarityTone.solid : categoryTone.solid, anticipating ? 42 : 28),
                    },
                  ]}
                />
                {anticipating ? <RareSparkle color={rarityTone.solid} /> : null}
                {sleeveVisible ? (
                  <Animated.View
                    accessibilityLabel={reduced ? "Sealed pack. Reveal next card." : "Sealed pack. Drag down to tear it open."}
                    style={[styles.sleeve, reduced ? null : { transform: [{ translateY: dragY }] }]}
                    {...(reduced ? {} : panHandlers)}
                  >
                    <View style={[styles.sleeveEdge, { borderColor: categoryTone.border }]} />
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.brand}>GRAILHAUS</Text>
                    <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.tier}>{loaded.tier}</Text>
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.hint}>
                      {reduced ? "Reveal next card" : "Drag down"}
                    </Text>
                  </Animated.View>
                ) : (
                  <Animated.View
                    accessibilityLabel={spokenCard ?? undefined}
                    accessibilityLiveRegion={spokenCard ? "polite" : "none"}
                    style={[
                      styles.face,
                      anticipating
                        ? [styles.faceRare, { borderColor: rarityTone.solid }, glow(rarityTone.solid, 32)]
                        : null,
                      reduced ? { opacity: cardFade, transform: [{ scale: cardScale }] } : null,
                    ]}
                  >
                    {anticipating ? (
                      <Text maxFontSizeMultiplier={maxFontScale.body} style={[styles.hold, { color: rarityTone.solid }]}>
                        Hold on.
                      </Text>
                    ) : null}
                    {revealed && card ? (
                      <View style={styles.cardBody}>
                        <CollectibleArt
                          category="TRADING_CARD"
                          height={120}
                          style={styles.cardArt}
                          title={card.name}
                        />
                        <Text
                          maxFontSizeMultiplier={maxFontScale.body}
                          style={[styles.rarity, { color: rarityTone.solid }]}
                        >
                          {spokenRarity(card.rarity)}
                        </Text>
                        <Text maxFontSizeMultiplier={maxFontScale.display} style={styles.cardName}>{card.name}</Text>
                        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.meta}>
                          Estimated value {formatCents(card.estimatedValueCents)}
                        </Text>
                      </View>
                    ) : (
                      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.hold}>
                        {anticipating ? "" : "Opening."}
                      </Text>
                    )}
                  </Animated.View>
                )}
              </View>
              {pulls.length > 0 ? <Fan pulls={pulls} /> : null}
              <View style={styles.actions}>
                {fastSlot ? (
                  <View style={styles.speedUp}>
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.speedUpTitle}>
                      Speed up remaining packs?
                    </Text>
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.speedUpBody}>
                      {remainingPacksLabel(packs.length - cursor)} Quick tear, then a fan of cards already opened.
                      Epic and legendary pulls still pause.
                    </Text>
                    <PrimaryButton
                      disabled={working || !online}
                      fullWidth
                      label="Fast Open"
                      loading={working}
                      onPress={() => void commitTear("fast")}
                    />
                  </View>
                ) : null}
                {reducedOpen ? (
                  <PrimaryButton
                    disabled={working || !online}
                    fullWidth
                    label="Reveal next card"
                    loading={working}
                    onPress={() => void commitTear("reduced")}
                  />
                ) : null}
                {phase === "REVEALING_CARD" ? (
                  <TertiaryButton
                    label="Skip animation"
                    onPress={() => {
                      skipHold.current = true;
                    }}
                  />
                ) : null}
                {phase === "CARD_REVEALED" ? (
                  <PrimaryButton
                    disabled={working || !online}
                    fullWidth
                    label={working ? "Saving…" : nextCardLabel(cursor < packs.length - 1)}
                    loading={working}
                    loadingLabel="Saving…"
                    onPress={() => void finishPack()}
                  />
                ) : null}
              </View>
              {phase === "PACK_COMPLETE" && packs.length < 2 ? (
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>This pack is open.</Text>
              ) : null}
            </View>
          ) : null}
          {notice ? (
            <InlineStatusCard
              action={
                phase === "OPEN" || phase === "REVEALING_CARD"
                  ? {
                      label: "Try again",
                      variant: "primary",
                      onPress: () => {
                        const current = packRef.current;
                        if (current) {
                          void resume(current, phase);
                        }
                      },
                    }
                  : undefined
              }
              icon="alert-circle-outline"
              title={notice}
              tone="warning"
            />
          ) : null}
        </View>
      )}
    </RevealFrame>
  );
}

function RevealFrame({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.vignette} />
      <AppHeader back={onClose} backKind="close" backLabel="Close and go to Portfolio" />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function RareSparkle({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={styles.sparkleLayer}>
      {rareDots.map((dot, index) => (
        <View
          key={index}
          style={[
            styles.sparkle,
            {
              backgroundColor: color,
              width: dot.size,
              height: dot.size,
              borderRadius: dot.size,
              top: dot.top,
              bottom: dot.bottom,
              left: dot.left,
              right: dot.right,
              opacity: 0.45 + (index % 3) * 0.12,
            },
          ]}
        />
      ))}
    </View>
  );
}

function Fan({ pulls }: { pulls: RevealCard[] }) {
  const best = bestPull(pulls);
  return (
    <View style={styles.fanBlock}>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.fanKicker}>Opened this session</Text>
      <View style={styles.fan}>
        {pulls.map((pull, index) => {
          const chosen = pull === best;
          const tone = rarityColor(pull.rarity);
          return (
            <View
              accessibilityLabel={
                chosen
                  ? `Best. ${pull.name}. ${spokenRarity(pull.rarity)}. ${formatCents(pull.estimatedValueCents)}`
                  : `${pull.name}. ${spokenRarity(pull.rarity)}. ${formatCents(pull.estimatedValueCents)}`
              }
              key={`${pull.catalogItemId}-${index}`}
              style={[styles.chip, chosen ? [styles.chipBest, { borderColor: tone.solid }] : null]}
            >
              {chosen ? (
                <Text maxFontSizeMultiplier={maxFontScale.body} style={[styles.chipTag, { color: tone.solid }]}>Best</Text>
              ) : (
                <Text maxFontSizeMultiplier={maxFontScale.body} style={[styles.chipTag, { color: tone.solid }]}>
                  {spokenRarity(pull.rarity)}
                </Text>
              )}
              <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={2} style={styles.chipName}>{pull.name}</Text>
              <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.chipValue}>
                {formatCents(pull.estimatedValueCents)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function remainingPacksLabel(remaining: number): string {
  if (remaining <= 1) {
    return "1 pack left.";
  }
  return `${remaining} packs left.`;
}

function rarityColor(rarity: string | undefined) {
  if (rarity && rarity in colors.rarity) {
    return colors.rarity[rarity as RarityKey];
  }
  return colors.rarity.COMMON;
}

function openedPulls(packs: RevealPack[], cursor: number, currentRevealed: boolean): RevealCard[] {
  const pulls: RevealCard[] = [];
  for (let index = 0; index < packs.length; index += 1) {
    const pack = packs[index];
    if (!pack) {
      continue;
    }
    const opened = index < cursor || (index === cursor && currentRevealed);
    if (!opened) {
      continue;
    }
    for (const card of pack.cards) {
      pulls.push(card);
    }
  }
  return fanInOpenOrder(pulls);
}

function statusCopy(
  phase: RevealPhase,
  settling: boolean,
  reduced: boolean,
  presentation: OpenMode,
): string {
  if (settling) {
    return "It springs shut.";
  }
  switch (phase) {
    case "SEALED":
      return sealedDirection(reduced);
    case "DRAGGING":
      return "Dragging.";
    case "TEARING":
    case "OPEN":
      return "Opening.";
    case "REVEALING_CARD":
      if (presentation === "premium") {
        return "Premium pull. Hold on.";
      }
      return "Opening.";
    case "CARD_REVEALED":
    case "PACK_COMPLETE":
      return "Revealed.";
    default:
      return "Sealed. Drag down to tear it open.";
  }
}

function waitWhile(keepWaiting: () => boolean, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (!keepWaiting() || Date.now() - started >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, 40);
    };
    setTimeout(tick, 40);
  });
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.backgroundPrimary,
    flex: 1,
  },
  vignette: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.backgroundSecondary,
    opacity: 0.35,
  },
  body: {
    flex: 1,
    paddingBottom: spacing.xxl,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  column: {
    gap: spacing.sm,
  },
  summary: {
    gap: spacing.md,
  },
  summaryRow: {
    alignItems: "baseline",
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  summaryLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.money,
    color: colors.textPrimary,
  },
  summaryBest: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.base,
  },
  bestName: {
    ...typography.title,
    color: colors.textPrimary,
  },
  bestValue: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  speedUp: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.base,
  },
  speedUpTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  speedUpBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  kicker: {
    ...typography.label,
    color: colors.textTertiary,
  },
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  statusBlock: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  progress: {
    ...typography.caption,
    color: colors.textTertiary,
    letterSpacing: 0.4,
    marginTop: spacing.sm,
  },
  status: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  stage: {
    alignItems: "center",
    height: 340,
    justifyContent: "center",
    marginTop: spacing.md,
  },
  ambient: {
    borderRadius: radius.full,
    height: 220,
    position: "absolute",
    width: 220,
  },
  sparkleLayer: {
    ...StyleSheet.absoluteFill,
  },
  sparkle: {
    position: "absolute",
  },
  sleeve: {
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderRadius: radius.modal,
    borderWidth: 1,
    height: 300,
    justifyContent: "center",
    overflow: "hidden",
    width: 214,
    ...shadows.medium,
  },
  sleeveEdge: {
    borderRadius: radius.modal,
    borderWidth: 1,
    bottom: 10,
    left: 10,
    position: "absolute",
    right: 10,
    top: 10,
  },
  brand: {
    ...typography.label,
    color: colors.category.TRADING_CARD.solid,
    letterSpacing: 2.4,
  },
  tier: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.xl,
  },
  face: {
    alignItems: "center",
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.modal,
    borderWidth: 1,
    height: 300,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    width: 214,
    ...shadows.medium,
  },
  faceRare: {
    backgroundColor: colors.surfaceElevated,
  },
  hold: {
    ...typography.heading,
    color: colors.accent.solid,
    textAlign: "center",
  },
  cardBody: {
    alignItems: "center",
    gap: spacing.sm,
    width: "100%",
  },
  cardArt: {
    borderRadius: radius.card,
    width: "100%",
  },
  rarity: {
    ...typography.label,
    letterSpacing: 1.2,
    textAlign: "center",
  },
  cardName: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center",
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  fanBlock: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  fanKicker: {
    ...typography.label,
    color: colors.textTertiary,
  },
  fan: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "flex-start",
  },
  chip: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.sm,
    width: 96,
  },
  chipBest: {
    backgroundColor: colors.surfaceElevated,
  },
  chipTag: {
    ...typography.caption,
    letterSpacing: 0.6,
  },
  chipName: {
    ...typography.caption,
    color: colors.textPrimary,
    marginTop: spacing.xxs,
  },
  chipValue: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
});
