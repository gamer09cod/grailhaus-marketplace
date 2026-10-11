import { strict as assert } from "node:assert";
import { suspensePalette, suspenseStops } from "../app/src/features/reveal/suspense.ts";

const rarities = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
const neutral = suspensePalette("COMMON");
for (const rarity of rarities) {
 const palette = suspensePalette(rarity);
 assert.deepEqual(palette.stops.slice(0, 2), neutral.stops.slice(0, 2), "rarity leaked during the shared opening");
 assert.equal(palette.stops.length, suspenseStops.length);
 assert(palette.intensity >= 0 && palette.intensity <= 0.2, "glow intensity exceeded restrained budget");
}
const rare = suspensePalette("RARE");
const epic = suspensePalette("EPIC");
const legendary = suspensePalette("LEGENDARY");
assert.equal(rare.stops[2], epic.stops[2]);
assert.equal(epic.stops[2], legendary.stops[2]);
assert.equal(epic.stops[3], legendary.stops[3]);
assert.notEqual(legendary.stops[4], epic.stops[4]);
assert.deepEqual(suspensePalette("INVALID"), neutral, "unknown rarity must remain neutral");
assert.deepEqual(suspensePalette("COMMON").stops, neutral.stops, "mapping must remain deterministic");
console.log("RARITY_SUSPENSE_OK");
