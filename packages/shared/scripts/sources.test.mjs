import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRegistry, checkRegistry, serializeRegistry } from "./sources.mjs";

function runGit(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
}
function commit(cwd, date) {
  runGit(cwd, "add", ".");
  execFileSync("git", ["-C", cwd, "-c", "user.name=Source Test", "-c", "user.email=source-test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Fixture"], {
    stdio: "pipe", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "psy-source-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runGit(root, "init", "-q");
  return root;
}
function definition(overrides = {}) {
  return {
    id: "fixture", name: "Fixture", kind: "local", role: "Test data",
    description: "Source provenance test", url: "https://example.org/data",
    inputs: [{ path: "data.json" }], fields: [], limitations: [], ...overrides,
  };
}

test("code-only repository changes do not advance the imported-data date", (t) => {
  const root = fixture(t);
  const upstream = path.join(root, "drugs");
  fs.mkdirSync(upstream);
  runGit(upstream, "init", "-q");
  fs.writeFileSync(path.join(upstream, "data.json"), '{"value":"original"}\n');
  commit(upstream, "2025-01-01T00:00:00Z");
  const dataRevision = runGit(upstream, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(upstream, "script.mjs"), "// code-only update\n");
  commit(upstream, "2026-08-18T13:17:49Z");
  const definitions = [definition({ repository: "drugs", inputs: [{ path: "drugs/data.json" }] })];
  const result = buildRegistry({ root, definitions });
  const source = result.providers[0];
  assert.equal(source.repositoryRevision.date, "2026-08-18T13:17:49.000Z");
  assert.equal(source.dataRevisionAt, "2025-01-01T00:00:00.000Z");
  assert.equal(source.imports[0].lastChangedRevision, dataRevision);
  assert.match(source.imports[0].url, new RegExp(`/blob/${dataRevision}/data.json$`));
  assert.match(source.imports[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(source.retrievedAt, null);
  assert.equal(source.scientificReviewedAt, null);
  assert.equal(serializeRegistry(result), serializeRegistry(buildRegistry({ root, definitions })));
});

test("Wikipedia revision, retrieval and local file dates remain separate", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "data.json"), JSON.stringify({ source: { revisionId: 42, revisionTimestamp: "2025-02-03T04:05:06Z", retrievedAt: "2025-06-07T08:09:10Z" } }));
  commit(root, "2026-01-01T00:00:00Z");
  const source = buildRegistry({ root, definitions: [definition({ metadata: "wikipedia" })] }).providers[0];
  assert.equal(source.dataRevisionAt, "2025-02-03T04:05:06.000Z");
  assert.equal(source.retrievedAt, "2025-06-07T08:09:10.000Z");
  assert.equal(source.imports[0].lastChangedAt, "2026-01-01T00:00:00.000Z");
  assert.match(source.sourceRevision.url, /oldid=42$/);
});

test("missing Wikipedia metadata stays unknown, not the file or current date", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "data.json"), "{}");
  commit(root, "2026-01-01T00:00:00Z");
  const source = buildRegistry({ root, definitions: [definition({ metadata: "wikipedia" })] }).providers[0];
  assert.equal(source.sourceRevision, null);
  assert.equal(source.dataRevisionAt, null);
  assert.equal(source.retrievedAt, null);
  assert.equal(source.scientificReviewedAt, null);
});

test("missing inputs, empty input directories and uncommitted inputs fail", (t) => {
  const root = fixture(t);
  const definitions = [definition()];
  assert.throws(() => buildRegistry({ root, definitions }), /Missing source input/);
  fs.mkdirSync(path.join(root, "empty"));
  assert.throws(() => buildRegistry({ root, definitions: [definition({ inputs: [{ path: "empty", extension: ".json" }] })] }), /No .json inputs/);
  fs.writeFileSync(path.join(root, "data.json"), "{}");
  assert.throws(() => buildRegistry({ root, definitions }), /Uncommitted source input/);
  commit(root, "2026-01-01T00:00:00Z");
  fs.writeFileSync(path.join(root, "data.json"), '{"changed":true}');
  assert.throws(() => buildRegistry({ root, definitions }), /Uncommitted source input/);
});

test("malformed source dates and revision IDs fail instead of being published", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "data.json"), JSON.stringify({ source: { revisionId: 42, revisionTimestamp: "not-a-date" } }));
  commit(root, "2026-01-01T00:00:00Z");
  const definitions = [definition({ metadata: "wikipedia" })];
  assert.throws(() => buildRegistry({ root, definitions }), /Invalid Wikipedia revision timestamp/);
  fs.writeFileSync(path.join(root, "data.json"), JSON.stringify({ source: { revisionId: -1 } }));
  commit(root, "2026-01-02T00:00:00Z");
  assert.throws(() => buildRegistry({ root, definitions }), /Invalid Wikipedia revision ID/);
});

test("shallow history fails rather than assigning the checkout date to old data", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "data.json"), "{}");
  commit(root, "2025-01-01T00:00:00Z");
  fs.writeFileSync(path.join(root, "script.mjs"), "// unrelated change\n");
  commit(root, "2026-01-01T00:00:00Z");
  fs.writeFileSync(path.join(root, ".git/shallow"), `${runGit(root, "rev-parse", "HEAD")}\n`);
  assert.throws(() => buildRegistry({ root, definitions: [definition()] }), /Shallow Git history/);
});

test("checks reject missing or stale registries and detect committed data changes", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "data.json"), "{}");
  commit(root, "2026-01-01T00:00:00Z");
  const definitions = [definition()];
  const before = buildRegistry({ root, definitions });
  const output = path.join(root, "registry.json");
  assert.throws(() => checkRegistry(before, output), /registry is missing/);
  fs.writeFileSync(output, serializeRegistry(before));
  checkRegistry(before, output);
  fs.writeFileSync(path.join(root, "data.json"), '{"value":"updated"}');
  commit(root, "2026-01-02T00:00:00Z");
  const after = buildRegistry({ root, definitions });
  assert.notEqual(after.providers[0].imports[0].sha256, before.providers[0].imports[0].sha256);
  assert.throws(() => checkRegistry(after, output), /registry differs/);
});

test("references do not invent data imports or dates, and invalid inheritance fails", (t) => {
  const root = fixture(t);
  const result = buildRegistry({ root, definitions: [definition({ inputs: [], kind: "reference" })] });
  assert.deepEqual(result.providers[0].imports, []);
  assert.equal(result.providers[0].dataRevisionAt, null);
  assert.equal(result.providers[0].repositoryRevision, null);
  assert.throws(() => buildRegistry({ root, definitions: [definition({ inputs: [], inheritedFrom: "missing" })] }), /Unknown inherited provider/);
});
