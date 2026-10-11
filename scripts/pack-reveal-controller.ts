import { strict as assert } from "node:assert";
import {
  canReplayReveal,
  canResetReveal,
  canSkipReveal,
  cancelPresentation,
} from "../app/src/features/reveal/packRevealControls.ts";
import { qualityCaps, resolveRevealQuality } from "../app/src/features/reveal/quality.ts";
import { resultCascadeDelays } from "../app/src/features/reveal/resultCascade.ts";
import { backHoldMs, resultPauseMs, resultStaggerMs, timingMode } from "../app/src/features/reveal/revealTiming.ts";
import { anticipationMs } from "../app/src/features/reveal/tear.ts";
import { SKIA_INSTALLED } from "../app/src/features/reveal/skiaReady.ts";

assert.equal(SKIA_INSTALLED, true, "Skia must be installed for Phase A");

assert.equal(resolveRevealQuality({ reducedMotion: true }), "reduced");
assert.equal(resolveRevealQuality({ reducedMotion: false }), "balanced");
assert.equal(resolveRevealQuality({ reducedMotion: false, preference: "high" }), "high");
assert.equal(qualityCaps("reduced").particles, 0);
assert.equal(qualityCaps("reduced").foil, 0);
assert(qualityCaps("high").particles > qualityCaps("balanced").particles);

assert.equal(timingMode({ quality: "reduced" }), "reduced");
assert.equal(timingMode({ quality: "balanced", compressed: true }), "compressed");
assert.equal(backHoldMs("COMMON"), anticipationMs("COMMON"));
assert(backHoldMs("LEGENDARY") > backHoldMs("EPIC"));
assert.equal(resultPauseMs("full"), 420);
assert.equal(resultPauseMs("reduced"), 180);
assert.equal(resultStaggerMs("full"), 120);
assert.equal(resultStaggerMs("reduced"), 0);
const cascade = resultCascadeDelays("full");
assert.equal(cascade.nameAt, resultPauseMs("full"));
assert.equal(cascade.rarityAt, cascade.nameAt + resultStaggerMs("full"));
assert.equal(cascade.valueAt, cascade.rarityAt + resultStaggerMs("full"));

assert.equal(canResetReveal("SEALED"), true);
assert.equal(canResetReveal("DRAGGING"), true);
assert.equal(canResetReveal("CARD_REVEALED"), false);
assert.equal(canReplayReveal("CARD_REVEALED"), true);
assert.equal(canReplayReveal("PACK_COMPLETE"), true);
assert.equal(canReplayReveal("SEALED"), false);
assert.equal(canSkipReveal("REVEALING_CARD"), true);
assert.equal(canSkipReveal("FINAL_REVEAL"), true);
assert.equal(canSkipReveal("CARD_REVEALED"), false);

let generation = 0;
let suspense = 0;
let flip = 0;
let entrance = 0;
let tear = 0;
cancelPresentation({
  bumpGeneration: () => { generation += 1; },
  cancelSuspense: () => { suspense += 1; },
  cancelFlip: () => { flip += 1; },
  cancelEntrance: () => { entrance += 1; },
  finishTear: () => { tear += 1; },
});
assert.equal(generation, 1);
assert.equal(suspense + flip + entrance + tear, 4);

console.log("PACK_REVEAL_CONTROLLER_OK");
