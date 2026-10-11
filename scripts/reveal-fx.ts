import { strict as assert } from "node:assert";
import { revealFx, revealFxEnvelope } from "../app/src/features/reveal/revealFx.ts";
const common = revealFx("COMMON");
assert.equal(common.particles, 0);
assert.equal(common.radial, false);
assert.deepEqual(revealFx("unknown"), common);
assert.equal(revealFx("RARE").particles, 6);
assert(revealFx("EPIC").pauseMs > common.pauseMs);
assert(revealFx("LEGENDARY").anticipationMs > 0);
assert(revealFx("LEGENDARY").darkening > 0);
const tiers = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
for (let i = 0; i < tiers.length; i++) {
  const fx = revealFx(tiers[i]);
  assert(fx.particles <= 10);
  assert(fx.anticipationMs + 500 + fx.pauseMs <= 800);
  if (i) assert(fx.glow > revealFx(tiers[i - 1]).glow);
}
assert.equal(revealFxEnvelope(0), 0);
assert.equal(revealFxEnvelope(350), 0);
assert.equal(revealFxEnvelope(400), 1);
assert.equal(revealFxEnvelope(750), 0);
console.log("REVEAL_FX_OK");
