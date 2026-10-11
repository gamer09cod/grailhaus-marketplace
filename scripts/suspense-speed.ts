import { strict as assert } from "node:assert";
import { FINAL_REVEAL_BEAT_MS, remainingSuspenseMs, SuspenseCompletion } from "../app/src/features/reveal/suspenseTiming.ts";
import { anticipationMs } from "../app/src/features/reveal/tear.ts";

async function main() {
 assert.equal(remainingSuspenseMs(4000, 0), 1400);
 assert.equal(remainingSuspenseMs(4000, 0.5), 700);
 assert.equal(remainingSuspenseMs(4000, 1), 1);
 assert.equal(remainingSuspenseMs(4000, -1), 1400);
 assert.equal(remainingSuspenseMs(4000, 2), 1);
 assert(FINAL_REVEAL_BEAT_MS >= 600 && FINAL_REVEAL_BEAT_MS <= 800);
 for (const rarity of ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]) {
  assert(anticipationMs(rarity) >= 3000 && anticipationMs(rarity) <= 4000);
 }
 const gate = new SuspenseCompletion();
 const first = gate.begin();
 let advanced = false;
 void first.completed.then((completed) => { advanced = completed; });
 await Promise.resolve();
 assert.equal(advanced, false, "suspense advanced before animation completion");
 gate.finish(first.token);
 assert.equal(await first.completed, true);
 const old = gate.begin();
 const current = gate.begin();
 assert.equal(await old.completed, false);
 let currentFinished = false;
 void current.completed.then(() => { currentFinished = true; });
 gate.finish(old.token);
 await Promise.resolve();
 assert.equal(currentFinished, false, "old animation completed a new suspense");
 gate.cancel();
 assert.equal(await current.completed, false, "cancellation masqueraded as completion");
 const last = gate.begin();
 gate.finish(last.token);
 gate.finish(last.token);
 assert.equal(await last.completed, true);
 console.log("SUSPENSE_SPEED_OK");
}
void main();
