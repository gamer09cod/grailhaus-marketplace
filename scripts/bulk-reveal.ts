import { strict as assert } from "node:assert";
import { openMode, packsOpenedLabel, sumCents, bestPull } from "../app/src/features/reveal/pacing.ts";
import { resultTiming } from "../app/src/features/reveal/resultTiming.ts";
for (const rarity of ["COMMON", "RARE", "EPIC", "LEGENDARY"]) {
  assert.equal(openMode(1, rarity, true), "full");
  assert.equal(openMode(2, rarity, true), "full");
  assert.equal(openMode(3, rarity, false), "full", "fast pacing requires opt-in");
}
for (let position = 3; position <= 10; position++) {
  assert.equal(openMode(position, "COMMON", true), "fast");
  assert.equal(openMode(position, "RARE", true), "fast");
  assert.equal(openMode(position, "EPIC", true), "premium");
  assert.equal(openMode(position, "LEGENDARY", true), "premium");
}
assert.equal(openMode(6, "LEGENDARY", true), "premium");
assert.equal(openMode(7, "COMMON", true), "fast", "premium interrupt must not disable fast choice");
assert.deepEqual(resultTiming(false, true), { pauseMs: 120, fadeMs: 140 });
assert.deepEqual(resultTiming(true, true), { pauseMs: 180, fadeMs: 180 });
assert.equal(packsOpenedLabel(10), "10 Packs Opened");
assert.equal(sumCents(Array.from({ length: 10 }, () => 10000n)), 100000n);
assert.equal(sumCents([9007199254740993n, 7n]), 9007199254741000n);
assert.equal(bestPull([{ name: "Best", rarity: "LEGENDARY", estimatedValueCents: 42000n }])?.estimatedValueCents, 42000n);
console.log("BULK_REVEAL_OK");
