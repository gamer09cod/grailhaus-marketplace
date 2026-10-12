import { strict as assert } from "node:assert";
import { finalFlipPose, FLIP_TOTAL_MS } from "../app/src/features/reveal/finalFlip.ts";
assert.equal(FLIP_TOTAL_MS, 650);
assert.equal(finalFlipPose(0).angle, 0);
assert.equal(finalFlipPose(0).scale, 1);
assert.equal(finalFlipPose(199 / 650).frontVisible, false);
assert.equal(finalFlipPose(201 / 650).frontVisible, true);
assert.equal(finalFlipPose(400 / 650).angle, 180);
assert.equal(finalFlipPose(400 / 650).scale, 1.05);
assert.equal(finalFlipPose(500 / 650).scale, 1);
assert.deepEqual(finalFlipPose(1), finalFlipPose(2));
assert.deepEqual(finalFlipPose(0), finalFlipPose(-1));
for (let i = 1; i <= 100; i++) {
  assert(finalFlipPose(i / 100).angle >= finalFlipPose((i - 1) / 100).angle);
  assert(finalFlipPose(i / 100).scale >= 1);
}
console.log("FINAL_FLIP_OK");
