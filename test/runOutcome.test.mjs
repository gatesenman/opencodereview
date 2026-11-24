import test from "node:test";
import assert from "node:assert/strict";
import { isCancelledExit, shouldCommitRunResult } from "../src/shared/runOutcome.mjs";

test("isCancelledExit prefers abort over a zero exit", () => {
  assert.equal(isCancelledExit({ ok: true, cancelled: false }, { aborted: true }), true);
  assert.equal(isCancelledExit({ ok: true, cancelled: true }, { aborted: false }), true);
  assert.equal(isCancelledExit({ ok: true, cancelled: false }, { aborted: false }), false);
  assert.equal(isCancelledExit({ ok: true }, undefined), false);
});

test("shouldCommitRunResult blocks cancelled runs even if IPC returned findings", () => {
  const cancelledIds = new Set(["run-1"]);
  assert.equal(
    shouldCommitRunResult({
      runId: "run-1",
      activeRunId: "run-1",
      cancelled: false,
      cancelledIds
    }),
    false
  );
  assert.equal(
    shouldCommitRunResult({
      runId: "run-1",
      activeRunId: "run-1",
      cancelled: true,
      cancelledIds: new Set()
    }),
    false
  );
  assert.equal(
    shouldCommitRunResult({
      runId: "run-1",
      activeRunId: "run-2",
      cancelled: false,
      cancelledIds: new Set()
    }),
    false
  );
  assert.equal(
    shouldCommitRunResult({
      runId: "run-1",
      activeRunId: "run-1",
      cancelled: false,
      cancelledIds: new Set()
    }),
    true
  );
});
