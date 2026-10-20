/**
 * Shape checks for the per-country card data (data/legality/<CC>.json and
 * data/organisations.json). A wrong phone number or a missing substance on
 * an emergency card is worse than no data, so these run on every change.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const dataDir = new URL("../data/", import.meta.url);
const legalDir = new URL("legality/", dataDir);
const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));

const SUBSTANCES = [
  "lsd", "mushrooms", "dmt", "mescaline", "dox", "nbomes", "2c-x", "2c-t-x", "5-meo-xxt", "cannabis",
  "ketamine", "mxe", "dxm", "nitrous", "amphetamines", "mdma", "cocaine", "caffeine", "alcohol", "ghb/gbl",
  "opioids", "tramadol", "benzodiazepines", "maois", "ssris",
];
const STATUSES = ["legal", "medical", "decriminalised", "grey", "illegal", "unknown"];
const CONFIDENCE = ["high", "medium", "low"];
const SERVICES = [
  "drug-checking", "counselling", "helpline", "nightlife", "peer-support", "naloxone", "needle-exchange",
  "consumption-room", "online-counselling", "info", "treatment", "poison-centre",
];
// Same rule as web data/local-info.ts and build-datapack.mjs.
const dialable = (value) => value?.match(/\+?\d[\d\s-]*\d|\d/)?.[0].trim();

const files = readdirSync(legalDir).filter((name) => name.endsWith(".json"));

test("every country file is named after its ISO code", () => {
  assert.ok(files.length > 0, "no legality files");
  for (const name of files) {
    assert.match(name, /^[A-Z]{2}\.json$/);
    assert.equal(readJson(new URL(name, legalDir)).country, name.slice(0, 2));
  }
});

for (const name of files) {
  test(`${name}: emergency numbers, all substances, valid statuses and sources`, () => {
    const file = readJson(new URL(name, legalDir));
    assert.ok(file.name && file.asOf, "name and asOf");
    const number = dialable(file.emergency?.ambulance) ?? dialable(file.emergency?.general);
    assert.match(number ?? "", /^\+?[\d\s-]{2,}$/, "a dialable ambulance or general number");
    if (file.emergency.poisonControl) {
      assert.ok(dialable(file.emergency.poisonControl.phone), "poison centre number is dialable");
    }
    assert.deepEqual(Object.keys(file.substances).sort(), [...SUBSTANCES].sort(), "all 25 substances");
    for (const [key, entry] of Object.entries(file.substances)) {
      assert.ok(STATUSES.includes(entry.status), `${key}: status ${entry.status}`);
      assert.ok(!entry.confidence || CONFIDENCE.includes(entry.confidence), `${key}: confidence ${entry.confidence}`);
      assert.ok(entry.sources?.length > 0, `${key}: cites a source`);
      for (const id of entry.sources) assert.ok(file.sources[id], `${key}: source "${id}" is defined`);
    }
  });
}

test("organisations use the shared vocabularies", () => {
  const { organisations } = readJson(new URL("organisations.json", dataDir));
  const ids = new Set();
  for (const org of organisations) {
    assert.ok(!ids.has(org.id), `duplicate id ${org.id}`);
    ids.add(org.id);
    assert.match(org.country, /^[A-Z]{2}$/);
    for (const service of org.services) assert.ok(SERVICES.includes(service), `${org.id}: service ${service}`);
    for (const key of org.substances) assert.ok(key === "all" || SUBSTANCES.includes(key), `${org.id}: substance ${key}`);
    assert.ok(org.description?.en, `${org.id}: English description`);
    if (org.phone) assert.ok(dialable(org.phone), `${org.id}: dialable phone`);
  }
});
