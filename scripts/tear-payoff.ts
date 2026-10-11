import { strict as assert } from "node:assert";
import { TearCompletion } from "../app/src/features/reveal/tearCompletion.ts";

async function main() {
  const gate = new TearCompletion();
  let advanced = false;
  const animation = gate.begin();
  const server = Promise.resolve();
  const transition = Promise.all([server, animation]).then(() => { advanced = true; });
  await server;
  await Promise.resolve();
  assert.equal(advanced, false, "a fast server response cut off payoff");
  gate.finish();
  await transition;
  assert.equal(advanced, true);
  const cancelled = gate.begin();
  gate.finish();
  await cancelled;
  gate.finish(); // Late duplicate callback is harmless.
  const replaced = gate.begin();
  const replacement = gate.begin();
  await replaced;
  gate.finish();
  await replacement;
  console.log("TEAR_PAYOFF_OK");
}
void main();
