import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePreview, previewLooksEmpty } from "../src/shared/cliArgs.mjs";
import { parseSessionList } from "../src/shared/sessionResults.mjs";
import { createOcrRuntime } from "../src/main/ocrService.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "official-v1.7.9");

function load(name) {
  return readFileSync(join(dir, name), "utf8");
}

test("parsePreview matches official v1.7.9 review --preview stdout", () => {
  const p = parsePreview(load("review-preview.stdout"));
  assert.equal(p.total_files, 2);
  assert.equal(p.reviewable, 2);
  assert.equal(p.excluded, 0);
  assert.equal(p.insertions, 4);
  assert.equal(p.deletions, 0);
  assert.deepEqual(
    p.entries.map((e) => [e.path, e.status, e.will_review]),
    [
      ["app.js", "modified", true],
      ["extra.js", "added", true]
    ]
  );
});

test("parsePreview matches official v1.7.9 scan --preview (heading still says Will review)", () => {
  const p = parsePreview(load("scan-preview.stdout"));
  assert.equal(p.total_files, 2);
  assert.equal(p.reviewable, 2);
  assert.equal(p.entries[0].status, "scan");
  assert.equal(p.entries[1].status, "scan");
});

test("parsePreview matches official v1.7.9 review --preview --exclude", () => {
  const p = parsePreview(load("review-preview-exclude.stdout"));
  assert.equal(p.reviewable, 1);
  assert.equal(p.excluded, 1);
  assert.equal(p.entries[1].will_review, false);
  assert.equal(p.entries[1].exclude_reason, "user_exclude");
});

test("previewLooksEmpty is true for official 'No files changed.'", () => {
  const text = load("review-preview-empty.stdout");
  assert.equal(previewLooksEmpty(text), true);
  assert.equal(parsePreview(text).total_files, 0);
});

test("parseProvidersTable matches official v1.7.9 llm providers", () => {
  const runtime = createOcrRuntime({ resolveBinary: () => "unused" });
  const rows = runtime.parseProvidersTable(load("llm-providers.stdout"));
  assert.ok(rows.length >= 10);
  const openai = rows.find((r) => r.name === "openai");
  assert.equal(openai.protocol, "openai");
  assert.equal(openai.base_url, "https://api.openai.com/v1");
  const anthropic = rows.find((r) => r.name === "anthropic");
  assert.equal(anthropic.protocol, "anthropic");
});

test("parseSessionList accepts official v1.7.9 aborted preview sessions", () => {
  const list = parseSessionList(load("session-list.stdout"));
  assert.ok(list.length >= 1);
  assert.equal(list[0].aborted, true);
  assert.equal(list[0].start_time, "0001-01-01T00:00:00Z");
  assert.match(list[0].file_path, /workspace-opencodereview-e2e-fixture-repo/);
});
