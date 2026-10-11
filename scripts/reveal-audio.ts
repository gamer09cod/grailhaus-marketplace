import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { RevealAudioGate, revealSoundVolume, type RevealSoundCue } from "../app/src/features/reveal/revealAudio.ts";

const gate = new RevealAudioGate();
assert.equal(gate.request("muted"), null);
gate.configure(true, true);
const first = gate.request("tear:1");
assert.notEqual(first, null);
assert.equal(gate.request("tear:1"), null);
assert(gate.accepts(first!));
const second = gate.request("rise:1");
assert.notEqual(second, null);
assert.equal(gate.accepts(first!), false, "old seek must not restart playback");
assert(gate.accepts(second!));
gate.stop();
assert.equal(gate.accepts(second!), false);
const third = gate.request("impact:1");
gate.configure(false, true);
assert.equal(gate.accepts(third!), false);
assert.equal(gate.request("background"), null);
gate.configure(true, false);
assert.equal(gate.request("sound-off"), null);
for (const cue of ["friction", "tear", "rise", "rotation", "build", "impact"] satisfies RevealSoundCue[]) {
  for (const rarity of ["COMMON", "RARE", "EPIC", "LEGENDARY", "unknown"]) {
    assert(revealSoundVolume(cue, rarity) > 0 && revealSoundVolume(cue, rarity) <= 0.55);
  }
}
assert(revealSoundVolume("impact", "LEGENDARY") > revealSoundVolume("impact", "COMMON"));
for (const name of ["seal-friction", "seal-tear", "card-rise", "card-rotation", "rarity-build", "reveal-impact"]) {
  const wav = readFileSync(`app/src/features/reveal/assets/${name}.wav`);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 22050);
  assert.equal(wav.readUInt16LE(34), 16);
  for (let i = 44; i + 1 < wav.length; i += 2) assert(Math.abs(wav.readInt16LE(i)) < 32767);
}
console.log("REVEAL_AUDIO_OK");
