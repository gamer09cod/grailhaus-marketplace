import { strict as assert } from "node:assert";
import { contentsIdentity, makeCheckpoint, readCheckpoint } from "../app/src/features/reveal/checkpoint.ts";
import { recoveryCursor } from "../app/src/features/reveal/recovery.ts";
const pack = { purchasedPackId: "pack", revealState: "CARD_REVEALED", cards: [{ catalogItemId: "a", revealOrder: 1 }, { catalogItemId: "b", revealOrder: 2 }] };
const raw = makeCheckpoint(pack, 1, true);
assert.deepEqual(readCheckpoint(raw, pack), { cardIndex: 1, fast: true });
for (const bad of [null, "bad-json", "null", "[]", makeCheckpoint(pack, -1, true), makeCheckpoint(pack, 2, true), makeCheckpoint(pack, 0.5, true)]) {
  assert.deepEqual(readCheckpoint(bad, pack), { cardIndex: 0, fast: false });
}
assert.deepEqual(readCheckpoint(raw, { ...pack, purchasedPackId: "other" }), { cardIndex: 0, fast: false });
assert.deepEqual(readCheckpoint(raw, { ...pack, cards: [...pack.cards].reverse() }), { cardIndex: 0, fast: false });
for (const revealState of ["SEALED", "OPEN", "REVEALING_CARD", "PACK_COMPLETE"]) {
  assert.deepEqual(readCheckpoint(raw, { ...pack, revealState }), { cardIndex: 0, fast: false }, "server milestone must override incompatible local hint");
}
assert.equal(contentsIdentity(pack), contentsIdentity({ ...pack, revealState: "OPEN" }));
assert.equal(recoveryCursor(["PACK_COMPLETE", "PACK_COMPLETE", "OPEN", "SEALED"]), 2);
assert.equal(recoveryCursor(Array.from({ length: 10 }, () => "PACK_COMPLETE")), "summary");
assert.equal(recoveryCursor(["SEALED", "SEALED"]), 0);
console.log("REVEAL_CHECKPOINT_OK");
