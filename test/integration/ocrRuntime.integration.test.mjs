import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { createOcrRuntime } from "../../src/main/ocrService.mjs";
import { isCancelError } from "../../src/shared/runErrors.mjs";
import { buildReviewArgs } from "../../src/shared/cliArgs.mjs";

const fixtureCli = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/ocr-fixture-cli.mjs");
const evidenceRoot = process.env.OCR_E2E_EVIDENCE || "/workspace/opencodereview-e2e";
const argvLog = join(evidenceRoot, "argv-log", "integration-argv.jsonl");

function makeHarness() {
  const home = mkdtempSync(join(tmpdir(), "ocr-int-home-"));
  const repoDir = process.env.OCR_E2E_REPO || "/workspace/opencodereview-e2e/fixture-repo";
  mkdirSync(join(evidenceRoot, "argv-log"), { recursive: true });
  const env = {
    HOME: home,
    PATH: process.env.PATH || "/usr/bin:/bin",
    OCR_NO_UPDATE: "1",
    OCR_FIXTURE_ARGV_LOG: argvLog,
    LANG: "C.UTF-8",
    TERM: "xterm"
  };
  const runtime = createOcrRuntime({
    resolveBinary: () => fixtureCli,
    homedir: () => home,
    env,
    progressIntervalMs: 80
  });
  return { home, repoDir, runtime, env, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test("integration: version() spawns fixture CLI and returns fixture version, not official", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  const v = await h.runtime.version();
  assert.match(v, /v1\.7\.9-fixture/);
  assert.doesNotMatch(v, /a32f852/);
});

test("integration: reviewPreview spawns CLI, parses official-like preview, does not use --resume", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  const before = existsSync(argvLog) ? readFileSync(argvLog, "utf8") : "";
  const preview = await h.runtime.reviewPreview({
    repoDir: h.repoDir,
    timeoutMinutes: 10
  });
  assert.equal(preview.reviewable, 2);
  assert.equal(preview.entries[0].path, "app.js");
  const added = (existsSync(argvLog) ? readFileSync(argvLog, "utf8") : "").slice(before.length);
  assert.match(added, /"--preview"/);
  assert.doesNotMatch(added, /"--resume"/);
  const expected = buildReviewArgs({ repoDir: h.repoDir, timeoutMinutes: 10 }, { preview: true });
  assert.ok(expected.includes("--preview"));
  assert.ok(!expected.includes("--resume"));
  // official v1.7.9 and this fixture persist an aborted preview session
  const sessions = await h.runtime.listSessions(h.repoDir);
  assert.ok(sessions.length >= 1);
  assert.equal(sessions[0].aborted, true);
});

test("integration: scanPreview works and --path is forwarded", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  const before = existsSync(argvLog) ? readFileSync(argvLog, "utf8") : "";
  const preview = await h.runtime.scanPreview({
    repoDir: h.repoDir,
    paths: "app.js,extra.js",
    timeoutMinutes: 5
  });
  assert.equal(preview.reviewable, 2);
  const added = (existsSync(argvLog) ? readFileSync(argvLog, "utf8") : "").slice(before.length);
  assert.match(added, /"--path"/);
  assert.match(added, /app\.js,extra\.js/);
});

test("integration: GUI preview omits --resume, but raw official-like argv is rejected", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  const expected = buildReviewArgs({ repoDir: h.repoDir, resume: "deadbeef", timeoutMinutes: 10 }, { preview: true });
  assert.ok(expected.includes("--preview"));
  assert.ok(!expected.includes("--resume"), "desktop must not send --preview and --resume together");
  const preview = await h.runtime.reviewPreview({ repoDir: h.repoDir, resume: "deadbeef", timeoutMinutes: 10 });
  assert.equal(preview.reviewable, 2);
  const raw = await h.runtime.run(["review", "--preview", "--resume", "deadbeef"], { cwd: h.repoDir });
  assert.equal(raw.ok, false);
  assert.match(raw.stderr, /--preview and --resume cannot be used together/);
});

test("integration: config set/read-back writes isolated HOME only; typo keys rejected", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  await h.runtime.setConfig("language", "English");
  await h.runtime.setConfig("providers.openai.api_key", "TEST_FAKE_KEY_NOT_SECRET");
  // Desktop remaps typo aliases (0.2.x fix) before spawning; official CLI would reject the typo keys.
  await h.runtime.setConfig("providers.openai.apikey", "TEST_FAKE_KEY_NOT_SECRET");
  await h.runtime.setConfig("customproviders.demo.url", "https://example.invalid/v1");
  const cfg = h.runtime.readConfig();
  assert.equal(cfg.language, "English");
  assert.equal(cfg.providers.openai.api_key, "TEST_FAKE_KEY_NOT_SECRET");
  assert.equal(cfg.custom_providers.demo.url, "https://example.invalid/v1");
  assert.ok(!("apikey" in (cfg.providers.openai || {})));
  assert.ok(!("customproviders" in cfg));
  const typo = await h.runtime.run(["config", "set", "providers.openai.apikey", "TEST_FAKE_KEY_NOT_SECRET"], { cwd: h.repoDir });
  assert.equal(typo.ok, false);
  assert.match(typo.stderr, /unknown provider field "apikey"/);
  const typo2 = await h.runtime.run(["config", "set", "customproviders.demo.url", "https://example.invalid/v1"], { cwd: h.repoDir });
  assert.equal(typo2.ok, false);
  assert.match(typo2.stderr, /unknown config key: customproviders/);
  // isolated: nothing written to the real box home
  assert.equal(existsSync("/home/box/.opencodereview/config.json"), false);
  assert.ok(h.runtime.configPath().startsWith(h.home));
});

test("integration: startKind review writes session jsonl, emits progress, returns findings", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  // Small delay so the 80ms session-jsonl poll can observe review_item_done
  // (a real official review is far slower than the fixture's default instant finish).
  const runtime = createOcrRuntime({
    resolveBinary: () => fixtureCli,
    homedir: () => h.home,
    env: { ...h.env, OCR_FIXTURE_DELAY_MS: "400" },
    progressIntervalMs: 80
  });
  const events = [];
  const result = await runtime.startKind(
    "review",
    { repoDir: h.repoDir, timeoutMinutes: 10, runId: "run-int-1" },
    2,
    { onProgress: (ev) => events.push(ev) }
  );
  assert.equal(result.session_id && result.session_id.length > 0, true);
  assert.equal(result.comments.length, 2);
  assert.equal(result.comments[0].path, "app.js");
  assert.equal(result.comments[0].severity, "warning");
  assert.match(result.message, /OCR-FIXTURE-CLI/);
  const phases = events.map((e) => e.phase);
  assert.ok(phases.includes("starting"));
  assert.ok(phases.includes("done"));
  assert.ok(events.some((e) => e.phase === "reviewing" && e.completed >= 1));
  const jsonl = runtime.findSessionJsonl(h.repoDir, result.session_id);
  assert.ok(jsonl && existsSync(jsonl));
  const raw = readFileSync(jsonl, "utf8");
  assert.match(raw, /review_item_done/);
  const opened = await runtime.openSession(h.repoDir, result.session_id);
  assert.equal(opened.result.comments.length, 2);
  assert.equal(opened.sourceFile, jsonl);
});

test("integration: delayed cancel kills the child and surfaces OCR_CANCELLED", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  // 18s window matches the isolated GUI fixture delay used for cancel acceptance.
  const env = {
    ...h.env,
    OCR_FIXTURE_DELAY_MS: "18000"
  };
  const runtime = createOcrRuntime({
    resolveBinary: () => fixtureCli,
    homedir: () => h.home,
    env,
    progressIntervalMs: 80
  });
  const runId = "run-cancel-1";
  const events = [];
  const started = Date.now();
  const pending = runtime.startKind("review", { repoDir: h.repoDir, timeoutMinutes: 10, runId }, 2, {
    onProgress: (ev) => events.push(ev)
  });
  await new Promise((r) => setTimeout(r, 1500));
  runtime.cancel(runId);
  await assert.rejects(pending, (err) => isCancelError(err) || err?.code === "OCR_CANCELLED");
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 12000, `cancel should not wait out the 18s fixture (elapsed ${elapsed}ms)`);
  assert.ok(events.some((e) => e.phase === "cancelled"));
  assert.ok(!events.some((e) => e.phase === "done"), "cancelled runs must not emit done");
  const sessions = await runtime.listSessions(h.repoDir);
  assert.ok(
    sessions.every((s) => !s.total_comments || s.aborted),
    "a cancelled run must not be stored as a completed findings session"
  );
});

test("integration: startKind does not return findings if cancel races a fast finish", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  const env = { ...h.env, OCR_FIXTURE_DELAY_MS: "400" };
  const runtime = createOcrRuntime({
    resolveBinary: () => fixtureCli,
    homedir: () => h.home,
    env,
    progressIntervalMs: 50
  });
  const runId = "run-cancel-race";
  // Pending cancel before begin: startKind must refuse to run / throw cancel,
  // never return fixture findings as a successful review.
  runtime.cancel(runId);
  await assert.rejects(
    () => runtime.startKind("review", { repoDir: h.repoDir, timeoutMinutes: 10, runId }, 2, { onProgress() {} }),
    (err) => isCancelError(err) || err?.code === "OCR_CANCELLED"
  );
});

test("integration: startKind error branch when fixture fails with empty stdout", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  const runtime = createOcrRuntime({
    resolveBinary: () => fixtureCli,
    homedir: () => h.home,
    env: { ...h.env, OCR_FIXTURE_FAIL: "boom-fixture" },
    progressIntervalMs: 80
  });
  await assert.rejects(
    () => runtime.startKind("review", { repoDir: h.repoDir, timeoutMinutes: 10, runId: "run-fail-1" }, 2, { onProgress() {} }),
    /boom-fixture|fixture failure/
  );
});

test("integration: llm providers and fixture llm test never require a real key", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  const providers = await h.runtime.listProviders();
  assert.ok(providers.some((p) => p.name === "openai"));
  const testResult = await h.runtime.testLlm();
  assert.equal(testResult.ok, true);
  assert.equal(testResult.source, "fixture");
  assert.match(testResult.content, /No network request was made/);
});

test("integration: rules check and config unset go through real spawn", async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  await h.runtime.setConfig("mcp_servers.demo.command", "echo");
  await h.runtime.unsetConfig("mcp_servers.demo");
  const cfg = h.runtime.readConfig();
  assert.ok(!cfg.mcp_servers?.demo);
  const detail = await h.runtime.checkRules(h.repoDir, "app.js");
  assert.equal(detail.file, "app.js");
  assert.equal(detail.source, "fixture");
  assert.match(detail.rule, /Fixture rule only/);
});
