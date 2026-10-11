import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessibilityInfo, AppState } from "react-native";

import {
  loadRevealPack,
  loadRevealSession,
  RevealRejected,
  submitReveal,
  type RevealPack,
} from "../../api/reveal";
import { useOnline } from "../shelf/useOnline";
import { revealMotion } from "./access";
import { CardEntranceCompletion } from "./cardEntrance";
import { CheckpointUnavailable, clearCheckpoint, loadCheckpoint, saveCheckpoint } from "./checkpointStorage";
import { loadHapticsEnabled, playHaptic, playRarityHaptic, saveHapticsEnabled } from "./haptics";
import { cardPresentationKey, nextCardIndex } from "./multiCard";
import { openMode, type OpenMode } from "./pacing";
import { canReplayReveal, canResetReveal, canSkipReveal, cancelPresentation } from "./packRevealControls";
import { qualityCaps, resolveRevealQuality, type RevealQuality } from "./quality";
import { loadRevealQualityPreference, saveRevealQualityPreference } from "./qualityStorage";
import { backgroundDuringTear, recoveryCursor, recoveryShowsCard } from "./recovery";
import { resultIsReady } from "./resultTiming";
import { backHoldMs, timingMode } from "./revealTiming";
import { TearCompletion } from "./tearCompletion";
import { SuspenseCompletion } from "./suspenseTiming";
import { useRevealAudio } from "./useRevealAudio";
import { useRevealMachine } from "./useRevealMachine";
import { SKIA_INSTALLED } from "./skiaReady";

type Args = {
  purchasedPackIds: string[];
};

/**
 * Central reveal controller. Owns presentation machine, timing/quality, and
 * reset / replay / skip. Durable milestones still go through submitReveal.
 */
export function usePackReveal({ purchasedPackIds }: Args) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  useEffect(() => { focusedRef.current = focused; }, [focused]);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const packIdsKey = purchasedPackIds.join(",");
  const sessionKey = useMemo(() => ["reveal-session", packIdsKey] as const, [packIdsKey]);
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: () => loadRevealSession(purchasedPackIds),
  });

  const [cursor, setCursor] = useState(0);
  const [summary, setSummary] = useState(false);
  const [fastRequested, setFastRequested] = useState(false);
  const fastRequestedRef = useRef(false);
  const [presentation, setPresentation] = useState<OpenMode>("full");
  const { phase, phaseRef, send } = useRevealMachine();
  const [sealReset, setSealReset] = useState(0);
  const sealResetRef = useRef(0);
  const [hapticsOn, setHapticsOn] = useState(false);
  const hapticsPreferenceRevision = useRef(0);
  const [screenReader, setScreenReader] = useState(false);
  const screenReaderRef = useRef(false);
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [qualityPreference, setQualityPreference] = useState<RevealQuality | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [suspenseDurationMs, setSuspenseDurationMs] = useState(2000);
  const [cardIndex, setCardIndex] = useState(0);
  const cardIndexRef = useRef(0);
  const [readyPackId, setReadyPackId] = useState<string | null>(null);
  const [speedUp, setSpeedUp] = useState(false);
  const speedUpRef = useRef(false);

  const hapticsRef = useRef(false);
  const reducedRef = useRef(false);
  const finalBeat = useMemo(() => new SuspenseCompletion(), []);
  const suspense = useMemo(() => new SuspenseCompletion(), []);
  const finishFlip = useCallback((token: number) => finalBeat.finish(token), [finalBeat]);
  const finishSuspense = useCallback((token: number) => suspense.finish(token), [suspense]);
  const tearCompletion = useMemo(() => new TearCompletion(), []);
  const cardEntrance = useMemo(() => new CardEntranceCompletion(), []);
  const finishCardEntrance = useCallback((token: number) => cardEntrance.finish(token), [cardEntrance]);
  const finishTearPayoff = useCallback(() => {
    if (sealReset === sealResetRef.current) tearCompletion.finish();
  }, [tearCompletion, sealReset]);
  const { play: playRevealSound, stop: stopRevealSound, enabled: soundOn, toggle: toggleSound } = useRevealAudio(focused && foreground);
  const onlineRef = useRef(online);
  const workingRef = useRef(false);
  const cursorRef = useRef(0);
  const packsRef = useRef<RevealPack[]>([]);
  const placed = useRef(false);
  const packRef = useRef<RevealPack | null>(null);
  const mounted = useRef(true);
  const operationGeneration = useRef(0);
  const recoveryPending = useRef(false);

  const quality = resolveRevealQuality({ reducedMotion: reduced, preference: qualityPreference });
  const caps = qualityCaps(quality);

  const packs = useMemo(() => session.data ?? [], [session.data]);
  const loaded = packs[cursor] ?? null;

  const bumpGeneration = useCallback(() => {
    operationGeneration.current += 1;
  }, []);

  const cancelAllPresentation = useCallback(() => {
    cancelPresentation({
      bumpGeneration,
      cancelSuspense: () => suspense.cancel(),
      cancelFlip: () => finalBeat.cancel(),
      cancelEntrance: () => cardEntrance.cancel(),
      finishTear: () => tearCompletion.finish(),
    });
    stopRevealSound();
    speedUpRef.current = false;
    setSpeedUp(false);
  }, [bumpGeneration, suspense, finalBeat, cardEntrance, tearCompletion, stopRevealSound]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAllPresentation();
    };
  }, [cancelAllPresentation]);

  useEffect(() => { hapticsRef.current = hapticsOn; }, [hapticsOn]);
  useEffect(() => { reducedRef.current = reduced; }, [reduced]);
  useEffect(() => { onlineRef.current = online; }, [online]);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { packsRef.current = packs; }, [packs]);
  useEffect(() => { packRef.current = loaded; }, [loaded]);

  useEffect(() => {
    let alive = true;
    const revision = hapticsPreferenceRevision.current;
    void loadHapticsEnabled().then((enabled) => {
      if (alive && revision === hapticsPreferenceRevision.current) setHapticsOn(enabled);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    void loadRevealQualityPreference().then((preference) => {
      if (alive && preference) setQualityPreference(preference);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const applyQualityPreference = useCallback((next: RevealQuality) => {
    setQualityPreference(next);
    void saveRevealQualityPreference(next).catch(() => {
      setNotice("Visual quality changed for this session. Preference could not be saved.");
    });
  }, []);

  const setCursorAt = useCallback((index: number) => {
    cardIndexRef.current = 0;
    setCardIndex(0);
    setReadyPackId(null);
    setSkipAnimation(false);
    cursorRef.current = index;
    setCursor(index);
  }, []);

  const resetSeal = useCallback(() => {
    sealResetRef.current += 1;
    setSealReset(sealResetRef.current);
    send({ type: "RESET_TEAR" });
  }, [send]);

  const resetReveal = useCallback(() => {
    cancelAllPresentation();
    setSkipAnimation(false);
    setReadyPackId(null);
    if (canResetReveal(phaseRef.current)) {
      resetSeal();
    }
  }, [cancelAllPresentation, phaseRef, resetSeal]);

  const skipReveal = useCallback(() => {
    if (!canSkipReveal(phaseRef.current)) return;
    setSkipAnimation(true);
    if (phaseRef.current === "REVEALING_CARD") {
      speedUpRef.current = true;
      setSpeedUp(true);
    }
    // CardStage / AnimatedCardBack already shorten when skipAnimation is true.
  }, [phaseRef]);

  const suspenseCueRef = useRef({ token: -1, stage: 0 });
  const suspenseCue = useCallback((token: number, stage: number) => {
    if (token !== suspense.token || phaseRef.current !== "REVEALING_CARD" || !mounted.current || !focusedRef.current || AppState.currentState !== "active") return;
    const previous = suspenseCueRef.current;
    if (previous.token === token && stage <= previous.stage) return;
    suspenseCueRef.current = { token, stage };
    playRevealSound(stage === 2 ? "build" : "rotation", `suspense:${token}:${stage}`, packRef.current?.cards[cardIndexRef.current]?.rarity);
    playHaptic(stage === 2 ? "anticipation" : "transition", hapticsRef.current, () => mounted.current && focusedRef.current && AppState.currentState === "active" && hapticsRef.current && token === suspense.token);
  }, [suspense, phaseRef, playRevealSound]);

  const lastImpactToken = useRef(-1);
  const revealImpact = useCallback((token: number) => {
    if (token !== finalBeat.token || lastImpactToken.current === token || phaseRef.current !== "FINAL_REVEAL") return;
    lastImpactToken.current = token;
    const rarity = packRef.current?.cards[cardIndexRef.current]?.rarity ?? "COMMON";
    playRevealSound("impact", `final:${token}`, rarity);
    playRarityHaptic(rarity, hapticsRef.current, () => mounted.current && focusedRef.current && AppState.currentState === "active" && hapticsRef.current && token === finalBeat.token);
  }, [finalBeat, phaseRef, playRevealSound]);

  const resultReady = useCallback((packId: string) => {
    if (mounted.current && focusedRef.current && AppState.currentState === "active" && packRef.current && cardPresentationKey(packRef.current.purchasedPackId, cardIndexRef.current) === packId) {
      setReadyPackId(packId);
    }
  }, []);

  const showStoredCard = useCallback(async (pack: RevealPack, holdMs: number, opts?: { presentationOnly?: boolean }) => {
    const generation = operationGeneration.current;
    const card = pack.cards[cardIndexRef.current];
    if (!card) {
      setNotice("This pack has no stored card.");
      return;
    }
    speedUpRef.current = false;
    setSpeedUp(false);
    if (!opts?.presentationOnly && cardIndexRef.current === 0) {
      await submitReveal(pack.purchasedPackId, "REVEALING_CARD");
    }
    if (!mounted.current || generation !== operationGeneration.current) return;
    const animation = suspense.begin();
    setSuspenseDurationMs(holdMs);
    send({ type: "BEGIN_SUSPENSE" });
    if (!await animation.completed || !mounted.current || generation !== operationGeneration.current) return;
    if (!opts?.presentationOnly && cardIndexRef.current === 0) {
      await submitReveal(pack.purchasedPackId, "CARD_REVEALED");
    }
    if (!mounted.current || generation !== operationGeneration.current) return;
    if (!opts?.presentationOnly) {
      await saveCheckpoint(pack, cardIndexRef.current, fastRequestedRef.current);
    }
    if (!mounted.current || generation !== operationGeneration.current) return;
    const flip = finalBeat.begin();
    send({ type: "BEGIN_FINAL_REVEAL" });
    if (!await flip.completed || !mounted.current || generation !== operationGeneration.current) return;
    send({ type: "COMPLETE_REVEAL" });
  }, [send, suspense, finalBeat]);

  const speedUpSuspense = useCallback(() => {
    if (phaseRef.current !== "REVEALING_CARD" || reducedRef.current || speedUpRef.current) return;
    speedUpRef.current = true;
    setSpeedUp(true);
  }, [phaseRef]);

  const presentCard = useCallback(async (pack: RevealPack, opts?: { presentationOnly?: boolean }) => {
    const card = pack.cards[cardIndexRef.current];
    const mode = openMode(cursorRef.current + 1, card?.rarity ?? "COMMON", fastRequestedRef.current);
    setPresentation(mode);
    const modeTiming = timingMode({ quality, compressed: mode === "fast" });
    if (revealMotion(reducedRef.current).travelPx === 0) {
      await showStoredCard(pack, revealMotion(true).fadeMs, opts);
      return;
    }
    if (mode === "fast") {
      await showStoredCard(pack, backHoldMs(card?.rarity ?? "COMMON", "compressed"), opts);
      return;
    }
    await showStoredCard(pack, backHoldMs(card?.rarity ?? "COMMON", modeTiming), opts);
  }, [showStoredCard, quality]);

  const replayReveal = useCallback(() => {
    if (!canReplayReveal(phaseRef.current)) return;
    const pack = packRef.current;
    if (!pack || workingRef.current) return;
    cancelAllPresentation();
    setSkipAnimation(false);
    setReadyPackId(null);
    void (async () => {
      const generation = operationGeneration.current;
      send({ type: "RECOVER", state: "OPEN" });
      const entrance = cardEntrance.begin();
      playRevealSound("rise", `replay:${pack.purchasedPackId}:${entrance.token}`);
      send({ type: "BEGIN_CARD_ENTER" });
      await entrance.completed;
      if (!mounted.current || generation !== operationGeneration.current) return;
      await presentCard(pack, { presentationOnly: true });
    })();
  }, [phaseRef, cancelAllPresentation, send, cardEntrance, playRevealSound, presentCard]);

  const continueReveal = useCallback(async (pack: RevealPack, stored: string) => {
    const generation = operationGeneration.current;
    const checkpoint = await loadCheckpoint({ ...pack, revealState: stored });
    if (!mounted.current || generation !== operationGeneration.current) return;
    cardIndexRef.current = checkpoint.cardIndex;
    setCardIndex(checkpoint.cardIndex);
    setReadyPackId(null);
    fastRequestedRef.current = checkpoint.fast;
    setFastRequested(checkpoint.fast);
    const card = pack.cards[cardIndexRef.current];
    setPresentation(openMode(cursorRef.current + 1, card?.rarity ?? "COMMON", fastRequestedRef.current));
    if (!recoveryShowsCard(stored)) {
      send({ type: "RESET_TEAR" });
      return;
    }
    if (stored === "CARD_REVEALED" || stored === "PACK_COMPLETE") {
      send({ type: "RECOVER", state: stored });
      return;
    }
    if (!card) {
      setNotice("This pack has no stored card.");
      return;
    }
    send({ type: "RECOVER", state: stored === "OPEN" ? "OPEN" : "REVEALING_CARD" });
    if (stored === "OPEN") {
      await submitReveal(pack.purchasedPackId, "REVEALING_CARD");
    }
    await submitReveal(pack.purchasedPackId, "CARD_REVEALED");
    if (!mounted.current || generation !== operationGeneration.current) return;
    send({ type: "RECOVER", state: "CARD_REVEALED" });
  }, [send]);

  const resume = useCallback(async (pack: RevealPack) => {
    const generation = operationGeneration.current;
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    try {
      const fresh = await loadRevealPack(pack.purchasedPackId);
      if (!mounted.current || generation !== operationGeneration.current) return;
      if (!fresh) throw new RevealRejected("PACK_NOT_FOUND", "That pack is not in your collection.");
      packRef.current = fresh;
      await continueReveal(fresh, fresh.revealState);
    } catch (error) {
      setNotice(error instanceof RevealRejected || error instanceof CheckpointUnavailable ? error.message : "Opening progress could not be confirmed. Try again.");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }, [continueReveal]);

  useEffect(() => {
    const loadedPacks = session.data;
    if (!loadedPacks || placed.current) return;
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
      send({ type: "RESET_TEAR" });
      return;
    }
    if (pack.revealState === "PACK_COMPLETE") {
      send({ type: "RECOVER", state: "PACK_COMPLETE" });
      return;
    }
    void resume(pack);
  }, [resume, session.data, setCursorAt, send]);

  const refetchSession = session.refetch;
  const reconcileProgress = useCallback(() => {
    void refetchSession().then((result) => {
      if (!placed.current) return;
      const freshPacks = result.data;
      const current = freshPacks?.[cursorRef.current];
      if (!current || !freshPacks || workingRef.current || !mounted.current || !focusedRef.current || AppState.currentState !== "active") return;
      if (current.revealState === "PACK_COMPLETE") {
        const first = recoveryCursor(freshPacks.map((pack) => pack.revealState));
        if (first === "summary") { setSummary(true); return; }
        if (first !== cursorRef.current) {
          setCursorAt(first);
          const next = freshPacks[first];
          if (next) { packRef.current = next; void resume(next); }
          return;
        }
        send({ type: "RECOVER", state: "PACK_COMPLETE" });
        return;
      }
      if (current.revealState === "SEALED") { resetSeal(); return; }
      if (phaseRef.current !== "CARD_REVEALED" || current.revealState !== "CARD_REVEALED") {
        packRef.current = current;
        void resume(current);
      }
    });
  }, [refetchSession, resume, phaseRef, setCursorAt, send, resetSeal]);

  useFocusEffect(
    useCallback(() => {
      recoveryPending.current = workingRef.current;
      reconcileProgress();
      return () => {
        cancelAllPresentation();
      };
    }, [reconcileProgress, cancelAllPresentation]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setForeground(next === "active");
      if (next !== "active") {
        cancelAllPresentation();
        if (backgroundDuringTear(phaseRef.current) === "reset") {
          resetSeal();
        }
        return;
      }
      recoveryPending.current = workingRef.current;
      reconcileProgress();
    });
    return () => subscription.remove();
  }, [reconcileProgress, resetSeal, phaseRef, cancelAllPresentation]);

  useEffect(() => {
    if (foreground && focused && !working && recoveryPending.current) {
      recoveryPending.current = false;
      reconcileProgress();
    }
  }, [foreground, focused, working, reconcileProgress]);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!alive) return;
      reducedRef.current = enabled;
      setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      reducedRef.current = enabled;
      setReduced(enabled);
      if (enabled && (phaseRef.current === "SEALED" || phaseRef.current === "DRAGGING")) {
        resetSeal();
      }
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [resetSeal, phaseRef]);

  useEffect(() => {
    let alive = true;
    const update = (enabled: boolean) => {
      if (!alive) return;
      screenReaderRef.current = enabled;
      setScreenReader(enabled);
    };
    void AccessibilityInfo.isScreenReaderEnabled().then(update);
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", update);
    return () => { alive = false; subscription.remove(); };
  }, []);

  const commitTear = useCallback(async (source: "gesture" | "fast" | "reduced") => {
    const generation = operationGeneration.current;
    const pack = packRef.current;
    if (!pack || workingRef.current || (phaseRef.current !== "SEALED" && phaseRef.current !== "DRAGGING")) {
      return;
    }
    if (source === "fast" && (cursorRef.current < 2 || reducedRef.current)) return;
    if (source === "reduced" && !reducedRef.current && !screenReaderRef.current) return;
    if (!onlineRef.current) {
      setNotice("You're offline. The pack stays sealed until the connection returns.");
      if (source === "gesture") resetSeal();
      return;
    }
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    if (source === "fast") {
      fastRequestedRef.current = true;
      setFastRequested(true);
    }
    setPresentation(openMode(cursorRef.current + 1, pack.cards[cardIndexRef.current]?.rarity ?? "COMMON", fastRequestedRef.current));
    const payoffFinished = tearCompletion.begin();
    send({ type: "COMMIT_TEAR" });
    try {
      playRevealSound("tear", `seal:${pack.purchasedPackId}:${sealResetRef.current}`);
      playHaptic("tear", hapticsRef.current);
      await submitReveal(pack.purchasedPackId, "OPEN");
      await payoffFinished;
      if (!mounted.current || generation !== operationGeneration.current) return;
      send({ type: "PACK_OPENED" });
      const entrance = cardEntrance.begin();
      playRevealSound("rise", `entrance:${pack.purchasedPackId}:${entrance.token}`);
      send({ type: "BEGIN_CARD_ENTER" });
      await entrance.completed;
      if (!mounted.current || generation !== operationGeneration.current) return;
      await presentCard(pack);
    } catch (error) {
      setNotice(error instanceof RevealRejected || error instanceof CheckpointUnavailable ? error.message : "Opening progress could not be confirmed. Try again.");
      const fresh = await loadRevealPack(pack.purchasedPackId).catch(() => null);
      if (!fresh || fresh.revealState === "SEALED") {
        resetSeal();
        return;
      }
      packRef.current = fresh;
      const card = fresh.cards[0];
      setPresentation(openMode(cursorRef.current + 1, card?.rarity ?? "COMMON", fastRequestedRef.current));
      if (fresh.revealState === "CARD_REVEALED" || fresh.revealState === "PACK_COMPLETE") {
        send({ type: "RECOVER", state: fresh.revealState });
        return;
      }
      send({ type: "RECOVER", state: fresh.revealState === "REVEALING_CARD" ? "REVEALING_CARD" : "OPEN" });
    } finally {
      tearCompletion.finish();
      workingRef.current = false;
      setWorking(false);
    }
  }, [presentCard, send, resetSeal, phaseRef, playRevealSound, tearCompletion, cardEntrance]);

  const beginSeal = useCallback(() => {
    if (sealReset !== sealResetRef.current) return;
    if (!mounted.current || !focusedRef.current || AppState.currentState !== "active") return;
    playRevealSound("friction", `seal:${packRef.current?.purchasedPackId}:${sealReset}`);
    send({ type: "BEGIN_TEAR" });
  }, [send, sealReset, playRevealSound]);

  const completeSeal = useCallback(() => {
    if (sealReset !== sealResetRef.current || loaded?.purchasedPackId !== packRef.current?.purchasedPackId) return;
    if (!mounted.current || !focusedRef.current || AppState.currentState !== "active") return;
    void commitTear("gesture");
  }, [commitTear, loaded?.purchasedPackId, sealReset]);

  const cancelSeal = useCallback(() => {
    if (sealReset !== sealResetRef.current || !mounted.current) return;
    stopRevealSound();
    resetSeal();
  }, [resetSeal, sealReset, stopRevealSound]);

  const sealTick = useCallback((stage: number) => {
    if (mounted.current && focusedRef.current && AppState.currentState === "active") {
      playHaptic(stage >= 3 ? "RARE" : "touch", hapticsRef.current);
    }
  }, []);

  const finishPack = useCallback(async () => {
    const current = packRef.current;
    if (!current || workingRef.current || phaseRef.current !== "CARD_REVEALED" || !resultIsReady(readyPackId, cardPresentationKey(current.purchasedPackId, cardIndexRef.current), true)) {
      return;
    }
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    try {
      const nextCard = nextCardIndex(cardIndexRef.current, current.cards.length);
      if (nextCard !== null) {
        const generation = operationGeneration.current;
        await saveCheckpoint(current, nextCard, fastRequestedRef.current);
        if (!mounted.current || generation !== operationGeneration.current) return;
        cardIndexRef.current = nextCard;
        setCardIndex(nextCard);
        setReadyPackId(null);
        setSkipAnimation(false);
        setPresentation(openMode(cursorRef.current + 1, current.cards[nextCard]?.rarity ?? "COMMON", fastRequestedRef.current));
        const entrance = cardEntrance.begin();
        send({ type: "NEXT_CARD" });
        playRevealSound("rise", `entrance:${current.purchasedPackId}:${nextCard}:${entrance.token}`);
        await entrance.completed;
        if (!mounted.current || generation !== operationGeneration.current) return;
        await presentCard(current);
        return;
      }
      await submitReveal(current.purchasedPackId, "PACK_COMPLETE");
      await clearCheckpoint(current.purchasedPackId);
      if (!mounted.current) return;
      const all = packsRef.current.map((pack, index) =>
        index === cursorRef.current ? { ...pack, revealState: "PACK_COMPLETE" } : pack,
      );
      packsRef.current = all;
      queryClient.setQueryData(sessionKey, all);
      void queryClient.invalidateQueries({ queryKey: ["holdings"] });
      void queryClient.invalidateQueries({ queryKey: ["sealed-packs"] });
      send({ type: "COMPLETE_PACK" });
      const next = cursorRef.current + 1;
      if (next >= all.length) {
        if (all.length > 1) setSummary(true);
        return;
      }
      const upcoming = all[next];
      if (!upcoming) return;
      setCursorAt(next);
      send({ type: "ENTER_PACK" });
      sealResetRef.current += 1;
      setSealReset(sealResetRef.current);
      setPresentation("full");
      if (upcoming.revealState === "SEALED" || upcoming.category !== "TRADING_CARD") {
        send({ type: "RESET_TEAR" });
        return;
      }
      await continueReveal(upcoming, upcoming.revealState);
    } catch (error) {
      recoveryPending.current = true;
      setNotice(error instanceof RevealRejected || error instanceof CheckpointUnavailable ? error.message : "Opening progress could not be confirmed. Try again.");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }, [readyPackId, phaseRef, cardEntrance, send, playRevealSound, presentCard, queryClient, sessionKey, setCursorAt, continueReveal]);

  const toggleHaptics = useCallback(async () => {
    hapticsPreferenceRevision.current += 1;
    const next = !hapticsRef.current;
    hapticsRef.current = next;
    setHapticsOn(next);
    await saveHapticsEnabled(next).catch(() => setNotice("Haptics changed for this session. Device preference could not be saved."));
  }, []);

  const clearFastOpen = useCallback(() => {
    fastRequestedRef.current = false;
    setFastRequested(false);
  }, []);

  return {
    skiaInstalled: SKIA_INSTALLED,
    quality,
    caps,
    setQualityPreference: applyQualityPreference,
    session,
    packs,
    loaded,
    cursor,
    summary,
    phase,
    phaseRef,
    sealReset,
    presentation,
    fastRequested,
    hapticsOn,
    soundOn,
    screenReader,
    skipAnimation,
    reduced,
    notice,
    working,
    suspenseDurationMs,
    cardIndex,
    readyPackId,
    speedUp,
    focused,
    foreground,
    online,
    suspense,
    finalBeat,
    cardEntrance,
    tearCompletion,
    finishFlip,
    finishSuspense,
    finishCardEntrance,
    finishTearPayoff,
    suspenseCue,
    revealImpact,
    resultReady,
    speedUpSuspense,
    beginSeal,
    completeSeal,
    cancelSeal,
    sealTick,
    commitTear,
    finishPack,
    resume,
    toggleHaptics,
    toggleSound,
    clearFastOpen,
    setFastRequested,
    resetReveal,
    replayReveal,
    skipReveal,
    packRef,
  };
}
