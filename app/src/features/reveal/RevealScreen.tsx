import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  AppState,
  PanResponder,
  Pressable,
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
import type { AppStackParamList } from "../../navigation/types";
import { formatCents } from "../../utils/money";
import { useOnline } from "../shelf/useOnline";
import { loadHapticsEnabled, playHaptic, playRarityHaptic, saveHapticsEnabled } from "./haptics";
import { bestPull, fanInOpenOrder, openMode, packsOpenedLabel, sumCents, type OpenMode } from "./pacing";
import { backgroundDuringTear, recoveryCursor, recoveryShowsCard } from "./recovery";
import { anticipationMs, decideTear, isHighRarity, velocityPxPerMs } from "./tear";

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
  const [offset, setOffset] = useState(0);
  const [settling, setSettling] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const phaseRef = useRef<RevealPhase>("SEALED");
  const offsetRef = useRef(0);
  const settlingRef = useRef(false);
  const hapticsRef = useRef(true);
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
  const springFrame = useRef<number | null>(null);

  const packs = session.data ?? [];
  const loaded = packs[cursor] ?? null;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    hapticsRef.current = hapticsOn;
  }, [hapticsOn]);
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

  const springShut = useCallback((from: number) => {
    if (springFrame.current !== null) {
      cancelAnimationFrame(springFrame.current);
    }
    settlingRef.current = true;
    setSettling(true);
    const started = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / 220);
      const eased = 1 - (1 - t) ** 3;
      const next = from * (1 - eased);
      offsetRef.current = next;
      setOffset(next);
      if (t < 1) {
        springFrame.current = requestAnimationFrame(tick);
        return;
      }
      springFrame.current = null;
      settlingRef.current = false;
      setSettling(false);
      offsetRef.current = 0;
      setOffset(0);
      setRevealPhase("SEALED");
    };
    springFrame.current = requestAnimationFrame(tick);
  }, [setRevealPhase]);

  const showStoredCard = useCallback(async (pack: RevealPack) => {
    const card = pack.cards[0];
    if (!card) {
      setNotice("This pack has no stored card.");
      return;
    }
    setRevealPhase("REVEALING_CARD");
    await submitReveal(pack.purchasedPackId, "REVEALING_CARD");
    await pause(anticipationMs(card.rarity));
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
    setRevealPhase("REVEALING_CARD");
    await submitReveal(pack.purchasedPackId, "REVEALING_CARD");
    await pause(140);
    playRarityHaptic(card.rarity, hapticsRef.current);
    await submitReveal(pack.purchasedPackId, "CARD_REVEALED");
    setRevealPhase("CARD_REVEALED");
  }, [setRevealPhase]);

  const presentCard = useCallback(async (pack: RevealPack) => {
    const card = pack.cards[0];
    const mode = openMode(cursorRef.current + 1, card?.rarity ?? "COMMON");
    setPresentation(mode);
    if (mode === "fast") {
      await showCompressed(pack);
      return;
    }
    await showStoredCard(pack);
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
    if (springFrame.current !== null) {
      cancelAnimationFrame(springFrame.current);
      springFrame.current = null;
    }
    settlingRef.current = false;
    setSettling(false);
    offsetRef.current = 0;
    setOffset(0);
    setRevealPhase("SEALED");
  }, [setRevealPhase]);

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

  const glide = useCallback((to: number, ms: number) => {
    return new Promise<void>((resolve) => {
      if (springFrame.current !== null) {
        cancelAnimationFrame(springFrame.current);
      }
      const from = offsetRef.current;
      const started = Date.now();
      const tick = () => {
        const t = Math.min(1, (Date.now() - started) / ms);
        const eased = 1 - (1 - t) ** 3;
        const next = from + (to - from) * eased;
        offsetRef.current = next;
        setOffset(next);
        if (t < 1) {
          springFrame.current = requestAnimationFrame(tick);
          return;
        }
        springFrame.current = null;
        resolve();
      };
      springFrame.current = requestAnimationFrame(tick);
    });
  }, []);

  const commitTear = useCallback(async (source: "gesture" | "fast") => {
    const pack = packRef.current;
    if (!pack || workingRef.current || phaseRef.current === "TEARING") {
      return;
    }
    if (source === "fast" && cursorRef.current < 2) {
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
      if (source === "fast") {
        await glide(280, 260);
      } else {
        offsetRef.current = 280;
        setOffset(280);
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
  }, [glide, presentCard, setRevealPhase, springShut]);

  const commitRef = useRef(commitTear);
  const springRef = useRef(springShut);
  useEffect(() => {
    commitRef.current = commitTear;
    springRef.current = springShut;
  }, [commitTear, springShut]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => phaseRef.current === "SEALED" && !settlingRef.current && !workingRef.current,
      onMoveShouldSetPanResponder: () =>
        (phaseRef.current === "SEALED" || phaseRef.current === "DRAGGING") && !settlingRef.current && !workingRef.current,
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
        offsetRef.current = distance;
        setOffset(Math.min(distance, 320));
        const now = Date.now();
        samples.current.push({ t: now, y: distance });
        const cutoff = now - 90;
        samples.current = samples.current.filter((sample) => sample.t >= cutoff);
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
          offsetRef.current = 0;
          setOffset(0);
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
    }),
  ).current;

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
      offsetRef.current = 0;
      setOffset(0);
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
  const anticipating = phase === "REVEALING_CARD" && card !== undefined && isHighRarity(card.rarity) && presentation !== "fast";
  const sleeveVisible = phase === "SEALED" || phase === "DRAGGING" || phase === "TEARING";
  const fastSlot = cursor >= 2 && phase === "SEALED" && !settling;
  const pulls = revealed && presentation === "fast" ? openedPulls(packs, cursor, true) : [];
  const spent = sumCents(packs.map((pack) => pack.spentCents));
  const estimated = sumCents(packs.flatMap((pack) => pack.cards.map((item) => item.estimatedValueCents)));
  const best = bestPull(packs.flatMap((pack) => pack.cards));

  return (
    <View style={styles.screen}>
      <Pressable onPress={() => navigation.navigate("Collection")}>
        <Text style={styles.link}>Collection</Text>
      </Pressable>
      {summary ? (
        <View>
          <Text style={styles.title}>{packsOpenedLabel(packs.length)}</Text>
          <Text style={styles.notice}>Total spent</Text>
          <Text style={styles.amount}>{formatCents(spent)}</Text>
          <Text style={styles.notice}>Estimated value</Text>
          <Text style={styles.amount}>{formatCents(estimated)}</Text>
          <Text style={styles.notice}>Best pull</Text>
          <Text style={styles.amount}>{best?.name ?? "None"}</Text>
          <Pressable style={styles.primary} onPress={() => navigation.navigate("Collection")}>
            <Text style={styles.primaryLabel}>View Portfolio</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <View style={styles.header}>
            <Text style={styles.title}>{loaded?.name ?? "Pack"}</Text>
            <Pressable onPress={() => void toggleHaptics()}>
              <Text style={styles.link}>{hapticsOn ? "Haptics on" : "Haptics off"}</Text>
            </Pressable>
          </View>
          {session.isLoading ? (
            <View>
              <ActivityIndicator color="#e4c07a" />
              <Text style={styles.notice}>Loading the sealed pack…</Text>
            </View>
          ) : null}
          {session.isError ? (
            <View>
              <Text style={styles.notice}>The pack didn't load. Check the connection and try again.</Text>
              <Pressable style={styles.primary} onPress={() => void session.refetch()}>
                <Text style={styles.primaryLabel}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
          {session.data && packs.length === 0 ? (
            <Text style={styles.notice}>That pack is not in your collection.</Text>
          ) : null}
          {loaded && loaded.category !== "TRADING_CARD" ? (
            <View>
              <Text style={styles.notice}>This pack is in your collection.</Text>
              <Pressable style={styles.primary} onPress={() => navigation.navigate("Collection")}>
                <Text style={styles.primaryLabel}>Collection</Text>
              </Pressable>
            </View>
          ) : null}
          {loaded && loaded.category === "TRADING_CARD" ? (
            <View>
              {!online ? (
                <Text style={styles.notice}>You're offline. The pack stays sealed until the connection returns.</Text>
              ) : null}
              {packs.length > 1 ? <Text style={styles.status}>{`Pack ${cursor + 1} of ${packs.length}`}</Text> : null}
              <Text style={styles.status}>{statusCopy(phase, settling)}</Text>
              <View style={styles.stage}>
                {sleeveVisible ? (
                  <View
                    accessibilityLabel="Sealed pack"
                    style={[styles.sleeve, { transform: [{ translateY: offset }] }]}
                    {...pan.panHandlers}
                  >
                    <Text style={styles.brand}>GRAILHAUS</Text>
                    <Text style={styles.tier}>{loaded.tier}</Text>
                    <Text style={styles.hint}>Drag down</Text>
                  </View>
                ) : (
                  <View style={[styles.face, anticipating ? styles.faceRare : null]}>
                    {anticipating ? <Text style={styles.hold}>Hold on.</Text> : null}
                    {revealed && card ? (
                      <View>
                        <Text style={styles.rarity}>{card.rarity}</Text>
                        <Text style={styles.cardName}>{card.name}</Text>
                        <Text style={styles.meta}>Estimated value {formatCents(card.estimatedValueCents)}</Text>
                      </View>
                    ) : (
                      <Text style={styles.hold}>{anticipating ? "" : "Opening."}</Text>
                    )}
                  </View>
                )}
              </View>
              {pulls.length > 0 ? <Fan pulls={pulls} /> : null}
              {fastSlot ? (
                <Pressable
                  accessibilityLabel="Fast Open"
                  disabled={working || !online}
                  style={[styles.primary, (working || !online) && styles.disabled]}
                  onPress={() => void commitTear("fast")}
                >
                  <Text style={styles.primaryLabel}>Fast Open</Text>
                </Pressable>
              ) : null}
              {phase === "CARD_REVEALED" ? (
                <Pressable
                  disabled={working || !online}
                  style={[styles.primary, (working || !online) && styles.disabled]}
                  onPress={() => void finishPack()}
                >
                  <Text style={styles.primaryLabel}>{working ? "Saving…" : cursor >= packs.length - 1 ? "Done" : "Next"}</Text>
                </Pressable>
              ) : null}
              {phase === "PACK_COMPLETE" && packs.length < 2 ? (
                <Text style={styles.notice}>This pack is open.</Text>
              ) : null}
            </View>
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {notice && (phase === "OPEN" || phase === "REVEALING_CARD") ? (
            <Pressable
              style={styles.primary}
              onPress={() => {
                const current = packRef.current;
                if (current) {
                  void resume(current, phase);
                }
              }}
            >
              <Text style={styles.primaryLabel}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function Fan({ pulls }: { pulls: RevealCard[] }) {
  const best = bestPull(pulls);
  return (
    <View style={styles.fan}>
      {pulls.map((pull, index) => {
        const chosen = pull === best;
        return (
          <View key={`${pull.catalogItemId}-${index}`} style={[styles.chip, chosen ? styles.chipBest : null]}>
            {chosen ? <Text style={styles.chipTag}>Best</Text> : null}
            <Text numberOfLines={2} style={styles.chipName}>{pull.name}</Text>
          </View>
        );
      })}
    </View>
  );
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

function statusCopy(phase: RevealPhase, settling: boolean): string {
  if (settling) {
    return "It springs shut.";
  }
  switch (phase) {
    case "SEALED":
      return "Sealed. Drag down to tear it open.";
    case "DRAGGING":
      return "Dragging.";
    case "TEARING":
    case "OPEN":
    case "REVEALING_CARD":
      return "Opening.";
    case "CARD_REVEALED":
    case "PACK_COMPLETE":
      return "Revealed.";
    default:
      return "Sealed. Drag down to tear it open.";
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#12110f", padding: 24, paddingTop: 48 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  link: { color: "#e4c07a" },
  title: { color: "#f4efe6", fontSize: 28, fontWeight: "600", marginTop: 16 },
  notice: { color: "#c9bfb2", lineHeight: 20, marginTop: 12 },
  amount: { color: "#f4efe6", fontSize: 26, fontWeight: "600", marginTop: 4 },
  status: { color: "#c9bfb2", marginTop: 16 },
  stage: {
    alignItems: "center",
    height: 320,
    justifyContent: "center",
    marginTop: 20,
  },
  sleeve: {
    alignItems: "center",
    backgroundColor: "#1c1916",
    borderColor: "#e4c07a",
    borderRadius: 18,
    borderWidth: 1,
    height: 280,
    justifyContent: "center",
    width: 200,
  },
  brand: { color: "#e4c07a", fontSize: 12, letterSpacing: 2 },
  tier: { color: "#f4efe6", fontSize: 22, fontWeight: "600", marginTop: 12 },
  hint: { color: "#8d8478", marginTop: 28 },
  face: {
    alignItems: "center",
    backgroundColor: "#1a1714",
    borderColor: "#3a342c",
    borderRadius: 18,
    borderWidth: 1,
    height: 280,
    justifyContent: "center",
    padding: 20,
    width: 200,
  },
  faceRare: {
    borderColor: "#e4c07a",
    boxShadow: "0 0 18px #e4c07a",
  },
  hold: { color: "#e4c07a", fontSize: 18, fontWeight: "600" },
  rarity: { color: "#e4c07a", fontSize: 12, letterSpacing: 1.2, textAlign: "center" },
  cardName: { color: "#f4efe6", fontSize: 26, fontWeight: "600", marginTop: 12, textAlign: "center" },
  meta: { color: "#c9bfb2", marginTop: 12, textAlign: "center" },
  fan: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
  },
  chip: {
    backgroundColor: "#1a1714",
    borderColor: "#3a342c",
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    width: 88,
  },
  chipBest: { borderColor: "#e4c07a" },
  chipTag: { color: "#e4c07a", fontSize: 10, letterSpacing: 0.6 },
  chipName: { color: "#f4efe6", fontSize: 12, marginTop: 4 },
  primary: {
    alignSelf: "flex-start",
    backgroundColor: "#e4c07a",
    borderRadius: 999,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryLabel: { color: "#1a140c", fontWeight: "600" },
  disabled: { opacity: 0.4 },
});
