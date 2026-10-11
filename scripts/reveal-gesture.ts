import { completesSeal, sealProgress, SEAL_WIDTH } from "../app/src/features/reveal/seal.ts";
import { bestPull, fanInOpenOrder, openMode, packsOpenedLabel, sumCents } from "../app/src/features/reveal/pacing.ts";
import { cardAnnouncement, nextCardLabel, revealMotion, sealedDirection, spokenCents } from "../app/src/features/reveal/access.ts";
import { backgroundDuringTear, recoveryCursor, recoveryShowsCard } from "../app/src/features/reveal/recovery.ts";
import { anticipationMs, cardsInStoredOrder } from "../app/src/features/reveal/tear.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(!completesSeal(0, 0), "a tap opened the pack");
assert(!completesSeal(8, 2000), "a twitch opened the pack");
assert(!completesSeal(70, 200), "a slow partial drag opened the pack");
assert(completesSeal(70, 1600), "a fast meaningful flick did not open");
assert(!completesSeal(SEAL_WIDTH * 0.35 - 1, 1600), "a short flick opened");
assert(!completesSeal(SEAL_WIDTH - 1, 100), "early slow release opened");
assert(completesSeal(SEAL_WIDTH, 0), "full seal traversal did not open");
assert(!completesSeal(70, -1600), "reverse velocity completed a flick");
assert(!completesSeal(-100, 2000), "reverse distance opened");
assert(sealProgress(-10) === 0 && sealProgress(10000) === 1, "progress was not clamped");
assert(sealProgress(SEAL_WIDTH / 2) === 0.5, "progress did not track distance");

const stored = cardsInStoredOrder([
  { revealOrder: 2, rarity: "COMMON", name: "Late common" },
  { revealOrder: 1, rarity: "LEGENDARY", name: "First legendary" },
]);
assert(stored[0]?.name === "First legendary", "the client reordered cards by rarity");
assert(stored[1]?.name === "Late common", "the client dropped the later card");

const commonFirst = cardsInStoredOrder([
  { revealOrder: 1, rarity: "COMMON", name: "Emberkin" },
  { revealOrder: 2, rarity: "LEGENDARY", name: "Ember Drake" },
]);
assert(commonFirst[0]?.rarity === "COMMON" && commonFirst[1]?.rarity === "LEGENDARY", "stored order was not kept");

assert(anticipationMs("LEGENDARY") > anticipationMs("EPIC"), "legendary anticipation was not longer");
assert(anticipationMs("EPIC") > anticipationMs("RARE"), "epic anticipation was not longer");
assert(anticipationMs("RARE") > anticipationMs("COMMON"), "rare anticipation was not longer");
assert(anticipationMs("COMMON") === anticipationMs("UNCOMMON"), "common pacing changed");

assert(openMode(1, "LEGENDARY") === "full", "pack 1 left the full gesture");
assert(openMode(2, "EPIC") === "full", "pack 2 left the full gesture");
assert(openMode(3, "COMMON") === "fast", "pack 3 did not allow a fast open");
assert(openMode(3, "RARE") === "fast", "a rare card interrupted the fast open");
assert(openMode(3, "EPIC") === "premium", "an epic card stayed on the fast path");
assert(openMode(9, "LEGENDARY") === "premium", "a legendary card stayed on the fast path");
assert(openMode(10, "COMMON") === "fast", "the last pack skipped the fast open");
assert(openMode(10, "LEGENDARY") === "premium", "the last legendary card stayed on the fast path");
assert(!completesSeal(0, 0), "a tap counted as Fast Open");

const opened = fanInOpenOrder([
  { name: "First", rarity: "COMMON", estimatedValueCents: 100n },
  { name: "Second", rarity: "LEGENDARY", estimatedValueCents: 50n },
]);
assert(opened[0]?.name === "First" && opened[1]?.name === "Second", "the fan reordered cards by rarity");
assert(bestPull(opened)?.name === "Second", "the best pull ignored the higher rarity");

const sameRank = [
  { name: "Low", rarity: "RARE", estimatedValueCents: 200n },
  { name: "High", rarity: "RARE", estimatedValueCents: 900n },
];
assert(bestPull(sameRank)?.name === "High", "the best pull ignored the higher value");
assert(
  bestPull([
    { name: "Rich rare", rarity: "RARE", estimatedValueCents: 50000n },
    { name: "Small epic", rarity: "EPIC", estimatedValueCents: 10n },
  ])?.name === "Small epic",
  "value outranked rarity",
);
assert(sumCents([1000n, 1000n, 1000n, 1000n, 1000n, 1000n, 1000n, 1000n, 1000n, 1000n]) === 10000n, "ten starter packs were not 10000 cents");
assert(sumCents([199n, 1n]) === 200n, "cents were not added as integers");
assert(packsOpenedLabel(10) === "10 Packs Opened", "the summary count was wrong");
assert(packsOpenedLabel(1) === "1 Pack Opened", "a single pack used the plural label");

assert(backgroundDuringTear("DRAGGING") === "reset", "a background during the drag committed the tear");
assert(backgroundDuringTear("SEALED") === "reset", "a background left the sleeve pulled open");
assert(backgroundDuringTear("TEARING") === "keep", "a background dropped a tear the server was already storing");
assert(backgroundDuringTear("OPEN") === "keep", "a background hid a card the tear had stored");
assert(backgroundDuringTear("REVEALING_CARD") === "keep", "a background hid the card mid-reveal");
assert(backgroundDuringTear("CARD_REVEALED") === "keep", "a background hid a revealed card");

const fresh = Array.from({ length: 10 }, () => "SEALED");
assert(recoveryCursor(fresh) === 0, "a new purchase did not start on pack 1");
assert(recoveryShowsCard("SEALED") === false, "a sealed pack showed its card after reopen");
assert(openMode(1, "COMMON") === "full", "pack 1 of a fresh purchase used Fast Open");

const killedAtSix = [
  "PACK_COMPLETE",
  "PACK_COMPLETE",
  "PACK_COMPLETE",
  "PACK_COMPLETE",
  "PACK_COMPLETE",
  "OPEN",
  "SEALED",
  "SEALED",
  "SEALED",
  "SEALED",
];
assert(recoveryCursor(killedAtSix) === 5, "pack 6 was not the interrupted pack");
assert(recoveryShowsCard("OPEN") === true, "an opened pack tore again after a kill");
assert(recoveryShowsCard("REVEALING_CARD") === true, "a mid-reveal pack tore again");
assert(recoveryShowsCard("CARD_REVEALED") === true, "a revealed pack tore again");
assert(openMode(6, "COMMON") === "fast", "pack 6 left the fast path");
assert(killedAtSix.slice(6).every((state) => state === "SEALED"), "packs after the interrupted one were opened");

assert(recoveryCursor(Array.from({ length: 10 }, () => "PACK_COMPLETE")) === "summary", "a finished 10-pack did not summarize");
assert(recoveryCursor(["PACK_COMPLETE"]) === 0, "one finished pack opened the 10-pack summary");

const fullMotion = revealMotion(false);
const quietMotion = revealMotion(true);
assert(fullMotion.travelPx === 280 && fullMotion.scaleFrom === 1, "full motion dropped the tear");
assert(quietMotion.travelPx === 0 && quietMotion.scaleFrom === 0.96 && quietMotion.fadeMs > 0, "reduce motion kept the large tear");
assert(sealedDirection(false) === "Sealed. Swipe the seal.", "full motion hid the drag");
assert(sealedDirection(true) === "Sealed. Reveal next card.", "reduce motion still asked for a drag");
assert(nextCardLabel(true) === "Reveal next card", "another pack lost the next-card action");
assert(nextCardLabel(false) === "View Collection", "the last pack offered another card");
assert(
  cardAnnouncement({ rarity: "RARE", name: "Eclipse Sovereign", estimatedValueCents: 12000n })
    === "Rare card revealed. Eclipse Sovereign. Estimated value 120 dollars.",
  "the revealed card was not announced from the stored name and cents",
);
assert(spokenCents(100n) === "1 dollar", "one dollar was spoken as cents");
assert(spokenCents(350n) === "3 dollars and 50 cents", "a remainder was spoken with a float");
assert(spokenCents(1n) === "1 cent", "one cent was spoken as a dollar");
assert(spokenCents(101n) === "1 dollar and 1 cent", "a leftover cent was dropped");
assert(
  cardAnnouncement({ rarity: "COMMON", name: "Gust Finch", estimatedValueCents: 350n })
    === "Common card revealed. Gust Finch. Estimated value 3 dollars and 50 cents.",
  "haptics being off changed the spoken card",
);

console.log("REVEAL_GESTURE_OK");
