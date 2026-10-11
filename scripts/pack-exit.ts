import { strict as assert } from "node:assert";
import { packExitMs, tearBurstMs, timingMode } from "../app/src/features/reveal/revealTiming.ts";

assert.equal(packExitMs("full"), 380);
assert.equal(packExitMs("compressed"), 220);
assert.equal(packExitMs("reduced"), 140);
assert.ok(packExitMs("full") < tearBurstMs("full") + 50 || packExitMs("full") > 0);
assert.ok(packExitMs(timingMode({ quality: "balanced", compressed: true })) < packExitMs("full"));
assert.ok(packExitMs(timingMode({ quality: "reduced" })) <= packExitMs("compressed"));

console.log("PACK_EXIT_OK");
