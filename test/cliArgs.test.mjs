import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReviewArgs, buildScanArgs, parsePreview, parseJsonResult } from "../src/shared/cliArgs.mjs";

describe("buildReviewArgs", () => {
  it("builds a workspace review with json format", () => {
    const args = buildReviewArgs({ repoDir: "/tmp/r", timeout: 10, model: "m" }, { json: true });
    assert.deepEqual(args, ["review", "--model", "m", "--timeout", "10", "--format", "json"]);
  });

  it("adds from/to in range mode and commit in commit mode", () => {
    assert.ok(buildReviewArgs({ mode: "range", from: "main", to: "dev" }).includes("--from"));
    assert.deepEqual(
      buildReviewArgs({ mode: "commit", commit: "abc" }).slice(0, 3),
      ["review", "--commit", "abc"]
    );
  });

  it("omits --resume when previewing even if resume is set", () => {
    const args = buildReviewArgs(
      { mode: "range", from: "main", to: "dev", resume: "sess-1" },
      { preview: true }
    );
    assert.ok(args.includes("--preview"));
    assert.ok(!args.includes("--resume"));
    assert.ok(args.includes("--from"));
  });

  it("includes --resume on a real run", () => {
    const args = buildReviewArgs(
      { mode: "range", from: "main", to: "dev", resume: "sess-1" },
      { json: true }
    );
    assert.ok(args.includes("--resume"));
    assert.ok(!args.includes("--preview"));
    const i = args.indexOf("--resume");
    assert.equal(args[i + 1], "sess-1");
  });

  it("passes timeout minutes unchanged (no unit conversion)", () => {
    const args = buildReviewArgs({ timeout: 30 }, { json: true });
    assert.equal(args[args.indexOf("--timeout") + 1], "30");
  });
});

describe("buildScanArgs", () => {
  it("passes comma-separated --path and scan flags", () => {
    const args = buildScanArgs(
      { paths: "a,b", noPlan: true, batch: "by-language", maxTokensBudget: 1000 },
      { preview: true }
    );
    assert.ok(args.includes("--path"));
    assert.equal(args[args.indexOf("--path") + 1], "a,b");
    assert.ok(args.includes("--no-plan"));
    assert.ok(args.includes("--preview"));
  });
});

describe("parsePreview", () => {
  it("parses a typical preview listing", () => {
    const text = `
Preview: 2 file(s)  +10 -3
Will review (1)
  [M] src/app.js  +10 -3
Excluded from review (1)
  [D] lock.json (binary)
`;
    const p = parsePreview(text);
    assert.equal(p.total_files, 2);
    assert.equal(p.reviewable, 1);
    assert.equal(p.excluded, 1);
    assert.equal(p.insertions, 10);
    assert.equal(p.entries[0].path, "src/app.js");
    assert.equal(p.entries[0].will_review, true);
    assert.equal(p.entries[1].exclude_reason, "binary");
  });
});

describe("parseJsonResult", () => {
  it("extracts the JSON object from mixed stdout", () => {
    const parsed = parseJsonResult('log...\n{"comments":[],"summary":{"files_reviewed":1}}\n');
    assert.equal(parsed.summary.files_reviewed, 1);
  });

  it("returns null for empty or invalid output", () => {
    assert.equal(parseJsonResult(""), null);
    assert.equal(parseJsonResult("no json here"), null);
  });
});

import { normalizeScanPaths, previewLooksEmpty } from "../src/shared/cliArgs.mjs";

describe("normalizeScanPaths", () => {
  it("trims comma, semicolon, and newline lists", () => {
    assert.equal(normalizeScanPaths(" a, b ,c"), "a,b,c");
    assert.equal(normalizeScanPaths("src/\ncmd/;internal"), "src/,cmd/,internal");
    assert.equal(normalizeScanPaths("  "), "");
  });

  it("feeds the normalized list to --path", () => {
    const args = buildScanArgs({ paths: " src , cmd " });
    assert.equal(args[args.indexOf("--path") + 1], "src,cmd");
  });
});

describe("parsePreview robustness", () => {
  it("parses a scan-style listing without diff counts", () => {
    const text = `
Preview: 2 file(s)
Will scan (2)
  [S] src/a.go
  [S] src/b.go
`;
    const p = parsePreview(text);
    assert.equal(p.total_files, 2);
    assert.equal(p.reviewable, 2);
    assert.equal(p.entries.length, 2);
    assert.equal(p.entries[0].status, "scan");
    assert.equal(p.entries[0].path, "src/a.go");
    assert.equal(p.entries[0].will_review, true);
  });

  it("counts badge rows even if section headers are missing", () => {
    const p = parsePreview("  [M] only.js  +1 -0\n  [D] skip.bin (binary)\n");
    // second row is still in default review section; without Excluded header it is reviewable
    assert.equal(p.entries.length, 2);
    assert.ok(p.total_files >= 2);
  });

  it("previewLooksEmpty is false when Will scan or badge rows exist", () => {
    assert.equal(previewLooksEmpty(""), true);
    assert.equal(previewLooksEmpty("error: boom"), true);
    assert.equal(previewLooksEmpty("Will scan (1)\n  [S] a.go"), false);
  });
});

describe("parseJsonResult robustness", () => {
  it("ignores earlier brace-filled log lines and keeps the last review object", () => {
    const stdout = [
      'started {ok:true}',
      'debug {"msg":"hi"}',
      '{"comments":[{"path":"a.js","content":"one"}],"summary":{"files_reviewed":1}}',
      'trailing } noise {not json}',
      '{"comments":[{"path":"b.js","content":"two"}],"summary":{"files_reviewed":2}}'
    ].join("\\n");
    const parsed = parseJsonResult(stdout);
    assert.equal(parsed.summary.files_reviewed, 2);
    assert.equal(parsed.comments[0].path, "b.js");
  });

  it("parses an object that only has a project_summary", () => {
    const parsed = parseJsonResult('prefix {"project_summary":"all good","warnings":[]}');
    assert.equal(parsed.project_summary, "all good");
  });
});
