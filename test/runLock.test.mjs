import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRunLock } from "../src/shared/runLock.mjs";

describe("createRunLock", () => {
  it("allows only one active run", () => {
    const lock = createRunLock();
    const a = lock.begin("r1");
    assert.equal(a.ok, true);
    const b = lock.begin("r2");
    assert.equal(b.ok, false);
    assert.equal(b.busy, true);
    assert.equal(b.activeRunId, "r1");
    lock.end("r1");
    const c = lock.begin("r2");
    assert.equal(c.ok, true);
  });

  it("remembers cancel that arrives before begin and rejects that run", () => {
    const lock = createRunLock();
    lock.cancel("late");
    const started = lock.begin("late");
    assert.equal(started.ok, false);
    assert.equal(started.cancelled, true);
    const next = lock.begin("other");
    assert.equal(next.ok, true);
  });

  it("aborts an in-flight controller on cancel", () => {
    const lock = createRunLock();
    const started = lock.begin("r1");
    assert.equal(started.controller.signal.aborted, false);
    lock.cancel("r1");
    assert.equal(started.controller.signal.aborted, true);
  });
});
