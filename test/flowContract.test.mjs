import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateConfigMutation, configLooksSaved, canonicalConfigKey } from "../src/shared/configKeys.mjs";
import { validateRunOptions } from "../src/shared/runOptions.mjs";
import {
  buildReviewArgs,
  buildScanArgs,
  parsePreview,
  parseJsonResult,
  normalizeScanPaths
} from "../src/shared/cliArgs.mjs";
import { createRunLock } from "../src/shared/runLock.mjs";
import { classifyRunError } from "../src/shared/runErrors.mjs";
import {
  parseSessionList,
  mapSessionToResult,
  planContinue,
  parseJsonl
} from "../src/shared/sessionResults.mjs";
import { describeResultState, filterAndSortComments } from "../src/shared/resultsModel.mjs";

/**
 * Simulated main loop: configure → preview → run → results → history continue.
 * This is a contract test on Linux. It does not spawn Electron, the CLI, or a model.
 */
describe("main flow contract (configure → review → results → history)", () => {
  it("saves canonical keys, previews without --resume, runs, opens history, and continues a range", () => {
    const key = canonicalConfigKey("providers.openai.apikey");
    assert.equal(key, "providers.openai.api_key");
    const lang = validateConfigMutation("language", "zh");
    assert.equal(lang.value, "Chinese");
    const cfg = { language: "Chinese", providers: { openai: { api_key: "****" } }, provider: "openai" };
    assert.equal(configLooksSaved(cfg, "providers.openai.api_key", "sk-not-compared").ok, true);
    assert.equal(configLooksSaved(cfg, "language", "Chinese").ok, true);

    const opts = {
      repoDir: "/repo",
      mode: "range",
      from: "main",
      to: "feature",
      resume: "sess-1",
      timeout: 12
    };
    assert.equal(validateRunOptions("review", opts).ok, true);
    assert.equal(validateRunOptions("review", { ...opts, mode: "workspace" }).ok, false);

    const previewArgs = buildReviewArgs(opts, { preview: true });
    assert.ok(previewArgs.includes("--preview"));
    assert.ok(!previewArgs.includes("--resume"));
    assert.equal(previewArgs[previewArgs.indexOf("--timeout") + 1], "12");

    const preview = parsePreview(`
Preview: 2 file(s)  +4 -1
Will review (1)
  [M] src/app.js  +4 -1
Excluded from review (1)
  [D] app.lock (binary)
`);
    assert.equal(preview.reviewable, 1);

    const runArgs = buildReviewArgs(opts, { json: true });
    assert.ok(runArgs.includes("--resume"));
    assert.ok(!runArgs.includes("--preview"));

    const lock = createRunLock();
    const first = lock.begin("run-1");
    assert.equal(first.ok, true);
    assert.equal(lock.begin("run-2").busy, true);
    lock.cancel("run-1");
    assert.equal(first.controller.signal.aborted, true);
    lock.end("run-1");
    lock.cancel("run-3");
    assert.equal(lock.begin("run-3").cancelled, true);

    const parsed = parseJsonResult(
      'log {ignored}\n{"comments":[{"path":"src/app.js","start_line":4,"severity":"high","category":"bug","content":"null deref"}],"summary":{"files_reviewed":1,"session_id":"sess-2"}}'
    );
    assert.equal(parsed.comments[0].path, "src/app.js");
    const state = describeResultState({ comments: parsed.comments, summary: parsed.summary });
    assert.equal(state.kind, "findings");
    assert.equal(filterAndSortComments(parsed.comments, { severities: ["high"] }).length, 1);

    const list = parseSessionList(
      JSON.stringify({
        sessions: [
          {
            session_id: "sess-2",
            review_mode: "range",
            diff_from: "main",
            diff_to: "feature"
          }
        ]
      })
    );
    const opened = mapSessionToResult(
      { summary: { session_id: "sess-2", files_reviewed: 1, review_mode: "range" }, comments: parsed.comments }
    );
    assert.equal(opened.comments.length, 1);
    const plan = planContinue(list[0]);
    assert.equal(plan.blocked, false);
    assert.equal(plan.mode, "range");
    assert.equal(plan.from, "main");
    assert.equal(plan.to, "feature");
    assert.equal(plan.resume, "sess-2");
  });

  it("covers scan path lists, missing CLI errors, and jsonl-backed history", () => {
    assert.equal(normalizeScanPaths(" src , cmd "), "src,cmd");
    const scanArgs = buildScanArgs({ paths: " src , cmd ", timeout: 10 }, { preview: true, json: false });
    assert.equal(scanArgs[scanArgs.indexOf("--path") + 1], "src,cmd");
    assert.ok(scanArgs.includes("--preview"));
    assert.ok(!scanArgs.includes("--resume"));
    assert.equal(validateRunOptions("scan", { repoDir: "/r", timeout: 0 }).ok, false);

    const missing = classifyRunError(new Error("spawn ocr ENOENT"));
    assert.equal(missing.kind, "missing-cli");

    const records = parseJsonl(
      '{"type":"review_item_done","filePath":"x.go","comments":[{"start_line":8,"content":"leaked fd","severity":"critical"}]}\n'
    );
    const fromHistory = mapSessionToResult({ summary: { completed_files: 1 }, items: [] }, records);
    assert.equal(fromHistory.comments[0].path, "x.go");
    assert.equal(planContinue({ review_mode: "scan", session_id: "s" }).blocked, true);
    assert.equal(describeResultState({ comments: [], summary: { files_reviewed: 2 }, _source: "session" }).kind, "counts-only");
  });
});
