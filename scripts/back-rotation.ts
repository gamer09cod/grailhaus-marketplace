import { strict as assert } from "node:assert";
import { backPaletteProgress, backRotation, shouldRotateBack } from "../app/src/features/reveal/backRotation.ts";

function close(actual: number, expected: number) { assert(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`); }
close(backRotation(-1), 0);
close(backRotation(0.25), 0);
close(backRotation(0.45), 90);
close(backRotation(0.65), 180);
close(backRotation(0.75), 270);
close(backRotation(0.85), 360);
close(backRotation(0.925), 450);
close(backRotation(1), 540);
close(backRotation(2), 540);
for (let step = 1; step <= 1000; step++) {
 assert(backRotation(step / 1000) >= backRotation((step - 1) / 1000), "rotation moved backwards");
}
const nearFaceSpeed = backRotation(0.26) - backRotation(0.25);
const nearEdgeSpeed = backRotation(0.46) - backRotation(0.45);
assert(nearEdgeSpeed > nearFaceSpeed * 5, "rotation used constant speed");
for (const [angle, before, after] of [[90, 0, 0.65], [270, 0.65, 0.85], [450, 0.85, 1]]) {
 assert.equal(backPaletteProgress(angle - 0.01), before);
 assert.equal(backPaletteProgress(angle), after);
 assert.equal(backPaletteProgress(angle + 0.01), after);
}
assert.equal(backPaletteProgress(backRotation(0.44)), 0, "tier appeared before the shared neutral opening ended");
assert.equal(shouldRotateBack(1100, true), false);
assert.equal(shouldRotateBack(140, false), false);
assert.equal(shouldRotateBack(700, false), true);
console.log("BACK_ROTATION_OK");
