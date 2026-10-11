import { strict as assert } from "node:assert";
import { CardEntranceCompletion } from "../app/src/features/reveal/cardEntrance.ts";
import { revealTransition, type RevealState } from "../app/src/features/reveal/revealMachine.ts";

async function main() {
  const gate = new CardEntranceCompletion();
  const first = gate.begin();
  let state: RevealState = "OPEN";
  state = revealTransition(state, { type: "BEGIN_CARD_ENTER" });
  let advanced = false;
  const continuation = first.completed.then(() => {
    state = revealTransition(state, { type: "BEGIN_SUSPENSE" });
    advanced = true;
  });
  await Promise.resolve();
  assert.equal(advanced, false, "card appeared without entrance completion");
  assert.equal(state, "CARD_ENTER");
  gate.finish(first.token);
  await continuation;
  assert.equal(state, "REVEALING_CARD");
  const old = gate.begin();
  const fresh = gate.begin();
  await old.completed;
  let freshFinished = false;
  void fresh.completed.then(() => { freshFinished = true; });
  gate.finish(old.token);
  await Promise.resolve();
  assert.equal(freshFinished, false, "stale callback settled a newer entrance");
  gate.cancel();
  await fresh.completed;
  assert.equal(freshFinished, true, "unmount cancellation left a pending entrance");
  gate.finish(fresh.token);
  console.log("CARD_ENTRANCE_OK");
}
void main();
