import { strict as assert } from "node:assert";
import { hapticPattern, runHapticTrack, suspenseHapticStage, type MotorCue } from "../app/src/features/reveal/hapticTrack.ts";

async function main() {
  assert.deepEqual(hapticPattern("transition"), ["light"]);
  assert.deepEqual(hapticPattern("anticipation"), ["medium"]);
  assert.deepEqual(hapticPattern("tear"), ["heavy"]);
  assert.deepEqual(hapticPattern("LEGENDARY"), ["heavy", "rigid", "success"]);
  for (const rarity of ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"]) {
    assert.equal(suspenseHapticStage(0.44, rarity), 0);
    assert.equal(suspenseHapticStage(0.45, rarity), 1);
  }
  assert.equal(suspenseHapticStage(0.85, "RARE"), 2);
  assert.equal(suspenseHapticStage(1, "COMMON"), 1);
  assert.equal(suspenseHapticStage(1, "unknown"), 1);
  const cues: MotorCue[] = [];
  const delays: number[] = [];
  await runHapticTrack("LEGENDARY", () => true, async (cue) => { cues.push(cue); }, async (ms) => { delays.push(ms); });
  assert.deepEqual(cues, ["heavy", "rigid", "success"]);
  assert.deepEqual(delays, [70, 70]);
  cues.length = 0;
  let active = true;
  await runHapticTrack("LEGENDARY", () => active, async (cue) => { cues.push(cue); }, async () => { active = false; });
  assert.deepEqual(cues, ["heavy"], "interruption must suppress delayed follow-ups");
  cues.length = 0;
  await runHapticTrack("RARE", () => false, async (cue) => { cues.push(cue); }, async () => {});
  assert.deepEqual(cues, []);
  await runHapticTrack("LEGENDARY", () => true, async () => { throw Error("unsupported device"); }, async () => {});
  console.log("HAPTIC_TRACK_OK");
}
void main();
