import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import type { RevealCard, RevealPack } from "../../api/reveal";
import { AppHeader } from "../../components/AppHeader";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { ErrorState } from "../../components/ErrorState";
import { InlineStatusCard } from "../../components/InlineStatusCard";
import { RevealLoadSkeleton } from "../../components/Skeleton";
import { PrimaryButton } from "../../components/buttons";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, maxFontScale, radius, revealCardFrame, spacing, typography, type RarityKey } from "../../theme";
import { formatCents } from "../../utils/money";
import {
  cardAnnouncement,
  gestureFreeOpening,
  nextCardLabel,
  spokenRarity,
  summaryAnnouncement,
} from "./access";
import { bestPull, fanInOpenOrder, packsOpenedLabel, sumCents } from "./pacing";
import { RevealActions } from "./RevealActions";
import { RevealResult, RevealFaceArtwork } from "./RevealResult";
import { resultIsReady } from "./resultTiming";
import { cardPresentationKey, nextCardIndex } from "./multiCard";
import { PreviousCards } from "./PreviousCards";
import { CardContinueGesture } from "./CardContinueGesture";
import { CardStage } from "./CardStage";
import { PackArtwork } from "./PackArtwork";
import { PackStage } from "./PackStage";
import { SliceGesture } from "./SliceGesture";
import { TearPayoff } from "./TearPayoff";
import { RevealBackground } from "./RevealBackground";
import { SealedControls } from "./SealedControls";
import { phaseBand } from "./revealPhases";
import { canReplayReveal, canSkipReveal } from "./packRevealControls";
import { revealStageLayout } from "./revealStageLayout";
import { timingMode } from "./revealTiming";
import { usePackReveal } from "./usePackReveal";

/** Thin navigation shell — presentation + milestones live in usePackReveal. */
export function RevealScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Reveal">>();
  const { height: windowHeight } = useWindowDimensions();
  const stageLayout = useMemo(() => revealStageLayout(windowHeight), [windowHeight]);
  const reveal = usePackReveal({ purchasedPackIds: route.params.purchasedPackIds });
  const {
    session, packs, loaded, cursor, summary, phase, sealReset, presentation, fastRequested,
    screenReader, skipAnimation, reduced, notice, working, suspenseDurationMs,
    cardIndex, readyPackId, speedUp, focused, foreground, online, suspense, finalBeat, cardEntrance,
    finishFlip, finishSuspense, finishCardEntrance, finishTearPayoff, suspenseCue, revealImpact,
    resultReady, speedUpSuspense, beginSeal, completeSeal, cancelSeal, sealTick, commitTear,
    finishPack, resume, clearFastOpen, packRef,
    resetReveal, replayReveal, skipReveal, quality, caps,
  } = reveal;

  const card = loaded?.cards[cardIndex];
  const revealed = phase === "CARD_REVEALED" || phase === "PACK_COMPLETE";
  const sleeveVisible = phase === "SEALED" || phase === "DRAGGING" || phase === "TEARING";
  const animationPlaying = phase === "SEALED"
    || phase === "DRAGGING"
    || phase === "TEARING"
    || phase === "OPEN"
    || phase === "CARD_ENTER"
    || phase === "REVEALING_CARD"
    || phase === "FINAL_REVEAL";
  const fastSlot = !reduced && !screenReader && cursor >= 2 && phase === "SEALED";
  const reducedOpen = gestureFreeOpening(reduced, screenReader) && phase === "SEALED";
  const currentCardKey = loaded ? cardPresentationKey(loaded.purchasedPackId, cardIndex) : undefined;
  const resultReadyForPack = resultIsReady(readyPackId, currentCardKey, revealed);
  const spokenCard = resultReadyForPack && card ? cardAnnouncement(card) : null;

  const announcedCard = useRef<string | null>(null);
  useEffect(() => {
    if (!spokenCard || !currentCardKey || !focused || !foreground || announcedCard.current === currentCardKey) return;
    announcedCard.current = currentCardKey;
    AccessibilityInfo.announceForAccessibility(spokenCard);
  }, [spokenCard, currentCardKey, focused, foreground]);

  const pulls = resultReadyForPack && presentation === "fast" ? openedPulls(packs, cursor, true, cardIndex + 1) : [];
  const spent = useMemo(() => sumCents(packs.map((pack) => pack.spentCents)), [packs]);
  const estimated = useMemo(() => sumCents(packs.flatMap((pack) => pack.cards.map((item) => item.estimatedValueCents))), [packs]);
  const best = useMemo(() => bestPull(packs.flatMap((pack) => pack.cards)), [packs]);
  const toPortfolio = () => navigation.navigate("Tabs", { screen: "Portfolio" });
  const rarityTone = rarityColor(card?.rarity);
  const cinematicBand = phaseBand(phase, {
    reduced,
    skipping: skipAnimation,
    error: notice !== null && (phase === "OPEN" || phase === "REVEALING_CARD"),
  });

  return (
    <RevealFrame band={cinematicBand} reduced={reduced} starCount={caps.stars} onClose={toPortfolio}>
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
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.summaryLabel}>Estimated Collection Value</Text>
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
          <PrimaryButton fullWidth label="View Collection" onPress={toPortfolio} />
        </View>
      ) : (
        <View style={[styles.column, styles.columnFill]}>
          {!animationPlaying && loaded && loaded.category !== "TRADING_CARD" ? (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.kicker}>Reveal</Text>
                <Text maxFontSizeMultiplier={maxFontScale.display} numberOfLines={1} style={styles.title}>
                  {loaded.name}
                </Text>
              </View>
            </View>
          ) : null}
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
              <PrimaryButton label="View Collection" onPress={toPortfolio} />
            </View>
          ) : null}
          {loaded && loaded.category === "TRADING_CARD" ? (
            <View style={[styles.column, styles.revealColumn]}>
              {!animationPlaying ? (
                <ConnectivityBanner offlineDetail="The pack stays sealed until the connection returns." />
              ) : null}
              <View style={styles.stageFlex}>
              <CardContinueGesture
                enabled={phase === "CARD_REVEALED" && resultReadyForPack && !working && online}
                onContinue={() => void finishPack()}
              >
                <Pressable
                  style={[styles.stage, sleeveVisible ? styles.stageSealed : styles.stageCentered]}
                  onPress={() => {
                    if (phase === "CARD_REVEALED" && resultReadyForPack && !working && online) {
                      void finishPack();
                      return;
                    }
                    speedUpSuspense();
                  }}
                  accessible={false}
                >
                  {sleeveVisible ? (
                    <PackStage
                      key={loaded.purchasedPackId}
                      active={focused && foreground}
                      idle={phase === "SEALED"}
                      idleFloat={caps.idleFloat}
                      exiting={phase === "TEARING"}
                      exitMode={timingMode({ quality, compressed: fastRequested })}
                      exitTravelY={stageLayout.packExitTravel}
                      reduced={reduced}
                    >
                      <TearPayoff
                        compressed={fastRequested}
                        tearing={phase === "TEARING"}
                        active={focused && foreground}
                        reduced={reduced}
                        quality={quality}
                        onFinished={finishTearPayoff}
                      >
                        <SliceGesture
                          tearing={phase === "TEARING"}
                          enabled={focused && foreground && online && !reduced && !screenReader && !working && (phase === "SEALED" || phase === "DRAGGING")}
                          resetToken={sealReset}
                          onBegin={beginSeal}
                          onComplete={completeSeal}
                          onReset={cancelSeal}
                          onTick={sealTick}
                        >
                          <View accessibilityLabel={gestureFreeOpening(reduced, screenReader) ? "Sealed pack. Double tap to reveal." : "Sealed pack. Slice the seal to open."}>
                            <PackArtwork
                              labels={false}
                              name={loaded.name}
                              opened={phase === "TEARING"}
                              sealIdle={phase === "SEALED" && caps.idleFloat}
                              tier={loaded.tier}
                            />
                          </View>
                        </SliceGesture>
                      </TearPayoff>
                    </PackStage>
                  ) : (
                    <CardStage
                      compressed={presentation === "fast"}
                      key={currentCardKey}
                      previous={<PreviousCards cards={loaded.cards} index={cardIndex} reduced={reduced} />}
                      tier={loaded.tier}
                      rarity={card?.rarity ?? "COMMON"}
                      suspense={phase === "REVEALING_CARD"}
                      suspenseDurationMs={suspenseDurationMs}
                      speedUp={speedUp}
                      suspenseToken={suspense.token}
                      onSuspenseCue={suspenseCue}
                      onSuspenseFinished={finishSuspense}
                      flipping={phase === "FINAL_REVEAL"}
                      flipToken={finalBeat.token}
                      onImpact={revealImpact}
                      onFlipFinished={finishFlip}
                      front={(
                        <View style={styles.face}>
                          <RevealFaceArtwork imageUrl={card?.imageUrl} name={card?.name ?? "Collectible"} reduced={reduced || skipAnimation} />
                        </View>
                      )}
                      cardCount={loaded.cards.length - cardIndex}
                      entering={phase === "CARD_ENTER"}
                      revealed={revealed}
                      active={focused && foreground}
                      reduced={reduced || skipAnimation}
                      token={cardEntrance.token}
                      onFinished={finishCardEntrance}
                      foil={caps.foil}
                      idleFloat={caps.idleFloat}
                      riseFromY={stageLayout.cardRiseStart}
                      launchScale={stageLayout.cardLaunchScale}
                    >
                      <View
                        accessibilityLabel={spokenCard ?? undefined}
                        accessible={resultReadyForPack}
                        accessibilityElementsHidden={!resultReadyForPack}
                        importantForAccessibility={resultReadyForPack ? "yes" : "no-hide-descendants"}
                        style={styles.face}
                      >
                        {card ? (
                          <RevealResult
                            compressed={presentation === "fast"}
                            card={card}
                            packId={currentCardKey ?? loaded.purchasedPackId}
                            active={focused && foreground}
                            reduced={reduced || skipAnimation}
                            ready={resultReadyForPack}
                            quality={quality}
                            onReady={resultReady}
                            rarityColor={rarityTone.solid}
                            foilIntensity={caps.foil}
                          />
                        ) : null}
                      </View>
                    </CardStage>
                  )}
                </Pressable>
              </CardContinueGesture>
              </View>
              <View style={styles.resultFooter}>
                {!animationPlaying && phase === "CARD_REVEALED" && resultReadyForPack ? (
                  <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.notice}>
                    Tap or swipe to continue{loaded.cards.length > 1 ? ` · Card ${cardIndex + 1} of ${loaded.cards.length}` : ""}
                  </Text>
                ) : null}
                {!animationPlaying && pulls.length > 0 ? <Fan pulls={pulls} /> : null}
                {animationPlaying && sleeveVisible ? (
                  <>
                    {reducedOpen ? (
                      <PrimaryButton
                        disabled={working || !online}
                        fullWidth
                        label="Reveal next card"
                        loading={working}
                        onPress={() => void commitTear("reduced")}
                      />
                    ) : null}
                    <SealedControls visible={!reducedOpen && (phase === "SEALED" || phase === "DRAGGING")} />
                  </>
                ) : (
                  <RevealActions
                    continueLabel={
                      nextCardIndex(cardIndex, loaded.cards.length) !== null
                        ? "Reveal next card"
                        : nextCardLabel(cursor < packs.length - 1)
                    }
                    fastRequested={fastRequested}
                    fastSlot={fastSlot && !animationPlaying}
                    online={online}
                    packsLeftLabel={remainingPacksLabel(packs.length - cursor)}
                    phase={phase}
                    reducedOpen={false}
                    resultReady={resultReadyForPack}
                    showPackComplete={phase === "PACK_COMPLETE" && packs.length < 2}
                    showReplay={canReplayReveal(phase)}
                    showReset={false}
                    showSkip={canSkipReveal(phase) && !skipAnimation && !animationPlaying}
                    working={working}
                    onClearFast={clearFastOpen}
                    onCollection={toPortfolio}
                    onContinue={() => void finishPack()}
                    onFastOpen={() => void commitTear("fast")}
                    onReducedOpen={() => void commitTear("reduced")}
                    onReplay={replayReveal}
                    onReset={resetReveal}
                    onSkip={skipReveal}
                  />
                )}
              </View>
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
                        if (current) void resume(current);
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

function RevealFrame({
  children,
  onClose,
  band,
  reduced,
  starCount,
}: {
  children: ReactNode;
  onClose: () => void;
  band: ReturnType<typeof phaseBand>;
  reduced: boolean;
  starCount: number;
}) {
  return (
    <View style={styles.screen}>
      <RevealBackground band={band} reduced={reduced} starCount={starCount} />
      <View style={styles.closeChrome}>
        <AppHeader back={onClose} backKind="close" backLabel="Close and go to Collection" />
      </View>
      <View style={styles.body}>{children}</View>
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
  if (remaining <= 1) return "1 pack left.";
  return `${remaining} packs left.`;
}

function rarityColor(rarity: string | undefined) {
  if (rarity && rarity in colors.rarity) {
    return colors.rarity[rarity as RarityKey];
  }
  return colors.rarity.COMMON;
}

function openedPulls(packs: RevealPack[], cursor: number, currentRevealed: boolean, currentCardCount: number): RevealCard[] {
  const pulls: RevealCard[] = [];
  for (let index = 0; index < packs.length; index += 1) {
    const pack = packs[index];
    if (!pack) continue;
    const opened = index < cursor || (index === cursor && currentRevealed);
    if (!opened) continue;
    for (const card of index === cursor ? pack.cards.slice(0, currentCardCount) : pack.cards) {
      pulls.push(card);
    }
  }
  return fanInOpenOrder(pulls);
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.backgroundPrimary,
    flex: 1,
  },
  closeChrome: {
    opacity: 0.72,
  },
  body: {
    flex: 1,
    paddingBottom: spacing.lg,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xs,
  },
  column: {
    gap: spacing.sm,
  },
  columnFill: {
    flex: 1,
  },
  revealColumn: {
    flex: 1,
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
  stage: {
    alignItems: "center",
    width: "100%",
  },
  stageFlex: {
    flex: 1,
    minHeight: 0,
  },
  /** Sealed pack rests bottom-center above the slice hint. */
  stageSealed: {
    flex: 1,
    justifyContent: "flex-end",
    minHeight: 0,
    paddingBottom: spacing.sm,
  },
  /** Card / result stages stay optically centered. */
  stageCentered: {
    flex: 1,
    justifyContent: "center",
    minHeight: 0,
  },
  resultFooter: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: spacing.md,
  },
  face: {
    alignItems: "center",
    backgroundColor: "#0A0B0F",
    borderColor: "rgba(217, 189, 133, 0.32)",
    borderRadius: radius.modal,
    borderWidth: 1,
    elevation: 20,
    height: revealCardFrame.height,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    width: revealCardFrame.width,
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
