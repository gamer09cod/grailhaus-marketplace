import { strict as assert } from "node:assert";
import { revealPolicies, revealTransition, type RevealState } from "../app/src/features/reveal/revealMachine.ts";

function main() {
  let state: RevealState = "SEALED";
  assert.equal(revealTransition(state, { type: "COMPLETE_PACK" }), "SEALED");
  assert.equal(revealTransition(state, { type: "COMPLETE_REVEAL" }), "SEALED");
  state = revealTransition(state, { type: "BEGIN_TEAR" });
  assert.equal(state, "DRAGGING");
  assert.equal(revealTransition(state, { type: "RESET_TEAR" }), "SEALED");
  state = revealTransition(state, { type: "COMMIT_TEAR" });
  assert.equal(state, "TEARING");
  assert.equal(revealTransition(state, { type: "BEGIN_TEAR" }), "TEARING", "duplicate input cannot restart tear");
  state = revealTransition(state, { type: "PACK_OPENED" });
  assert.equal(revealTransition(state, { type: "RESET_TEAR" }), "OPEN", "a committed pack cannot be resealed by a stale reset");
  assert.equal(revealTransition(state, { type: "ENTER_PACK" }), "OPEN");
  assert.equal(revealTransition(state, { type: "BEGIN_SUSPENSE" }), "OPEN", "suspense must wait for entrance");
  state = revealTransition(state, { type: "BEGIN_CARD_ENTER" });
  assert.equal(state, "CARD_ENTER");
  assert.equal(revealTransition(state, { type: "COMPLETE_REVEAL" }), "CARD_ENTER");
  state = revealTransition(state, { type: "BEGIN_SUSPENSE" });
  assert.equal(revealTransition(state, { type: "COMPLETE_REVEAL" }), "REVEALING_CARD", "suspense cannot bypass the final beat");
  state = revealTransition(state, { type: "BEGIN_FINAL_REVEAL" });
  assert.equal(revealPolicies.FINAL_REVEAL.inputs.length, 0);
  state = revealTransition(state, { type: "COMPLETE_REVEAL" });
  state = revealTransition(state, { type: "COMPLETE_PACK" });
  assert.equal(state, "PACK_COMPLETE");
  assert.equal(revealTransition(state, { type: "ENTER_PACK" }), "SEALED");
  for (const stored of ["OPEN", "REVEALING_CARD", "CARD_REVEALED", "PACK_COMPLETE"] as const) {
    assert.equal(revealTransition("SEALED", { type: "RECOVER", state: stored }), stored);
  }
  assert.equal(revealPolicies.REVEALING_CARD.inputs.includes("SPEED_UP"), true);
  console.log("REVEAL_MACHINE_OK");
}
main();
