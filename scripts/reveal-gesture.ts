import { bestPull, fanInOpenOrder, openMode, packsOpenedLabel, sumCents } from "../app/src/features/reveal/pacing.ts";
import { backgroundDuringTear, recoveryCursor, recoveryShowsCard } from "../app/src/features/reveal/recovery.ts";
import { anticipationMs, cardsInStoredOrder, decideTear, velocityPxPerMs } from "../app/src/features/reveal/tear.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(decideTear(0, 0) === "spring", "a tap with no movement opened the pack");
assert(decideTear(8, 2) === "spring", "a short tap opened the pack");
assert(decideTear(80, 0.2) === "spring", "a slow drag to the flick distance opened the pack");
assert(decideTear(70, 0.4) === "spring", "a slow drag at the flick position opened the pack");
assert(decideTear(47, 2) === "spring", "a fast twitch shorter than the flick distance opened the pack");
assert(decideTear(199, 0.2) === "spring", "a slow drag released early opened the pack");
assert(decideTear(70, 1.6) === "tear", "a fast flick did not tear");
assert(decideTear(48, 1.1) === "tear", "a flick at the threshold did not tear");
assert(decideTear(200, 0.05) === "tear", "a long pull did not tear");
assert(decideTear(260, 0) === "tear", "holding the tear open did not finish it");

assert(velocityPxPerMs([]) === 0, "empty samples had velocity");
assert(velocityPxPerMs([{ t: 0, y: 10 }, { t: 40, y: 70 }]) === 1.5, "velocity was not px per ms");

const stored = cardsInStoredOrder([
  { revealOrder: 2, rarity: "COMMON", name: "Late common" },
  { revealOrder: 1, rarity: "LEGENDARY", name: "First legendary" },
]);
assert(stored[0]?.name === "First legendary", "the client reordered cards by rarity");
assert(stored[1]?.name === "Late common", "the client dropped the later card");

const commonFirst = cardsInStoredOrder([
  { revealOrder: 1, rarity: "COMMON", name: "Harbor Fox" },
  { revealOrder: 2, rarity: "LEGENDARY", name: "Eclipse Wyrm" },
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
assert(decideTear(0, 0) === "spring", "a tap counted as Fast Open");

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

console.log("REVEAL_GESTURE_OK");
