import { strict as assert } from "node:assert";
import { resultCascadeDelays } from "../app/src/features/reveal/resultCascade.ts";
import { timingMode } from "../app/src/features/reveal/revealTiming.ts";

const full = resultCascadeDelays(timingMode({ quality: "balanced" }));
assert.equal(full.nameAt, 420);
assert.equal(full.rarityAt, 540);
assert.equal(full.valueAt, 660);
assert.equal(full.readyAt, 940);
assert.ok(full.nameAt < full.rarityAt && full.rarityAt < full.valueAt);

const reduced = resultCascadeDelays(timingMode({ quality: "reduced" }));
assert.equal(reduced.nameAt, 180);
assert.equal(reduced.rarityAt, 180);
assert.equal(reduced.valueAt, 180);
assert.equal(reduced.readyAt, 360);

const compressed = resultCascadeDelays(timingMode({ quality: "balanced", compressed: true }));
assert.equal(compressed.nameAt, 120);
assert.ok(compressed.readyAt < full.readyAt);

console.log("RESULT_PANEL_OK");
