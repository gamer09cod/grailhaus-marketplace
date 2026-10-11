import { strict as assert } from "node:assert";
import { resultCascadeDelays } from "../app/src/features/reveal/resultCascade.ts";
import { resultIsReady, resultTiming, resultTimingForQuality } from "../app/src/features/reveal/resultTiming.ts";
import { timingMode } from "../app/src/features/reveal/revealTiming.ts";

assert.deepEqual(resultTiming(false), { pauseMs: 420, fadeMs: 280 });
assert.deepEqual(resultTiming(true), { pauseMs: 180, fadeMs: 180 });
assert.deepEqual(resultTimingForQuality("high"), { pauseMs: 420, fadeMs: 280 });
assert.deepEqual(resultTimingForQuality("reduced"), { pauseMs: 180, fadeMs: 180 });
assert.equal(resultIsReady(null, "pack", true), false);
assert.equal(resultIsReady("old", "new", true), false);
assert.equal(resultIsReady("pack", "pack", false), false);
assert.equal(resultIsReady("pack", undefined, true), false);
assert.equal(resultIsReady("pack", "pack", true), true);

const cascade = resultCascadeDelays(timingMode({ quality: "balanced" }));
assert.ok(cascade.nameAt < cascade.rarityAt);
assert.ok(cascade.rarityAt < cascade.valueAt);

console.log("REVEAL_RESULT_OK");
