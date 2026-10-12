import { strict as assert } from "node:assert";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const seed = readFileSync("supabase/seed.sql", "utf8");
const registry = readFileSync("app/src/components/catalogArtwork.ts", "utf8");
const hashes = new Set<string>();
let assetBytes = 0;
const paths = [...registry.matchAll(/require\("\.\.\/\.\.\/(assets\/catalog\/[^"\n]+)"\)/g)].map((match) => match[1]);
assert.equal(paths.length, 45, "27 cards, ten shoe/watch illustrations and eight pack designs");
for (const path of paths) {
  const file = `app/${path}`;
  const bytes = readFileSync(file);
  assert.equal(bytes.readUInt16BE(0), 0xffd8, `Invalid JPEG: ${file}`);
  assert(bytes.length > 5_000, `JPEG too small after compress: ${file}`);
  hashes.add(createHash("sha256").update(bytes).digest("hex"));
  assetBytes += statSync(file).size;
}
assert.equal(hashes.size, 45, "Every original asset must be distinct");
assert(assetBytes < 8 * 1024 * 1024, "Bundled art exceeds mobile asset budget (8 MiB)");

const items = new Map<string, { category: string; rarity: string; value: bigint }>();
for (const match of seed.matchAll(/\('(TRADING_CARD|SNEAKER|WATCH)', '([^']+)', '(COMMON|UNCOMMON|RARE|EPIC|LEGENDARY)', (\d+), \d+\)/g)) {
  items.set(match[2]!, { category: match[1]!, rarity: match[3]!, value: BigInt(match[4]!) });
  if (match[1] !== "TRADING_CARD") {
    assert(registry.includes(`"${match[2]}": require(`), `Missing ${match[1]} artwork: ${match[2]}`);
  }
}

assert.equal([...items.values()].filter((item) => item.category === "SNEAKER").length, 5, "Expected five seeded sneakers");
assert.equal([...items.values()].filter((item) => item.category === "WATCH").length, 5, "Expected five seeded watches");
assert(
  seed.includes("fixed_catalog_item_id"),
  "Seed must create fixed sneaker/watch product SKUs",
);

// Evergreen trading-card packs only (sneaker/watch are fixed retail products).
const cardSkus = [...seed.matchAll(/\('(TRADING_CARD)', '([^']+)', '([^']+)', (\d+), \d+, \d+, 0, (true|false), true\)/g)];
assert.equal(cardSkus.filter((sku) => sku[5] === "false").length, 5, "Expected five evergreen card packs");

const rarities = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
for (const row of seed.matchAll(/^    array\['(TRADING_CARD)', '([^']+)', ([^\n]+)\]/gm)) {
  const tier = row[2]!;
  const names = [...row[3]!.matchAll(/'([^']*)'/g)].map((name) => name[1]!).filter((name) => name.length > 0);
  const pool = names.map((name) => {
    const item = items.get(name);
    assert(item && item.category === "TRADING_CARD", `Invalid pool item ${name}`);
    return item;
  });
  const odds = ["Starter", "Midnight", "Scout"].includes(tier)
    ? [7200n, 2000n, 600n, 180n, 20n]
    : ["Collector", "Elite"].includes(tier)
      ? [5000n, 2800n, 1500n, 600n, 100n]
      : [2500n, 3000n, 2800n, 1400n, 300n];
  let weighted = 0n;
  for (const [index, rarity] of rarities.entries()) {
    const group = pool.filter((item) => item.rarity === rarity);
    assert(group.length > 0, `Missing ${rarity} in ${tier}`);
    weighted += (group.reduce((total, item) => total + item.value, 0n) / BigInt(group.length)) * odds[index]!;
  }
  const sku = cardSkus.find((candidate) => candidate[3] === tier);
  assert(sku, `Missing card SKU for tier ${tier}`);
  assert(weighted / 10000n < BigInt(sku[4]!), `EV exceeds price for ${tier}`);
}

console.log(
  `CATALOG_ARTWORK_OK: 5 card packs + fixed sneaker/watch products, 45 assets, ${assetBytes} bytes, valid card pools/EV`,
);
