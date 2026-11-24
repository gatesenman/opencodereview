import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateRunOptions } from "../src/shared/runOptions.mjs";
import { buildReviewArgs, buildScanArgs } from "../src/shared/cliArgs.mjs";

describe("validateRunOptions", () => {
  it("requires a repo and range/commit fields", () => {
    const a = validateRunOptions("review", {});
    assert.equal(a.ok, false);
    assert.match(a.errors[0], /repository/);
    const b = validateRunOptions("review", { repoDir: "/r", mode: "range", from: "main" });
    assert.equal(b.ok, false);
    assert.match(b.errors.join(" "), /from/i);
    const c = validateRunOptions("review", { repoDir: "/r", mode: "commit" });
    assert.match(c.errors.join(" "), /commit/i);
  });

  it("blocks resume combined with workspace mode", () => {
    const r = validateRunOptions("review", { repoDir: "/r", mode: "workspace", resume: "sess" });
    assert.equal(r.ok, false);
    assert.match(r.errors.join(" "), /workspace/i);
  });

  it("rejects timeout 0 / NaN and accepts a positive minute value", () => {
    const bad = validateRunOptions("scan", { repoDir: "/r", timeout: 0 });
    assert.equal(bad.ok, false);
    assert.match(bad.errors.join(" "), /timeout/);
    const nan = validateRunOptions("review", { repoDir: "/r", concurrency: "nope" });
    assert.equal(nan.ok, false);
    const ok = validateRunOptions("review", { repoDir: "/r", timeout: "15", concurrency: 2 });
    assert.equal(ok.ok, true);
    assert.equal(ok.numbers.timeout, 15);
    assert.equal(ok.numbers.concurrency, 2);
  });
});

describe("rule and tools flags", () => {
  it("passes --rule and --tools on review and scan", () => {
    const review = buildReviewArgs({ rule: "/rules.json", tools: "grep,read" }, { json: true });
    assert.equal(review[review.indexOf("--rule") + 1], "/rules.json");
    assert.equal(review[review.indexOf("--tools") + 1], "grep,read");
    const scan = buildScanArgs({ rule: "r.json", tools: "bash" });
    assert.ok(scan.includes("--rule"));
    assert.ok(scan.includes("--tools"));
  });
});
