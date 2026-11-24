import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterAndSortComments,
  describeResultState,
  buildFixPrompt,
  buildMasterPrompt,
  groupByFile
} from "../src/shared/resultsModel.mjs";

const comments = [
  { path: "b.js", start_line: 3, end_line: 3, severity: "low", category: "style", content: "whitespace" },
  { path: "a.js", start_line: 1, end_line: 2, severity: "critical", category: "security", content: "injection", existing_code: "eval(x)", suggestion_code: "safe(x)" },
  { path: "a.js", start_line: 9, end_line: 9, severity: "high", category: "bug", content: "null deref" }
];

describe("filterAndSortComments", () => {
  it("filters by severity/category and sorts by file or severity", () => {
    const high = filterAndSortComments(comments, { severities: ["critical", "high"] });
    assert.equal(high.length, 2);
    assert.equal(high[0].severity, "critical");
    const files = filterAndSortComments(comments, { sort: "file" });
    assert.equal(files[0].path, "a.js");
    assert.equal(files[0].start_line, 1);
    const sec = filterAndSortComments(comments, { categories: ["security"] });
    assert.equal(sec.length, 1);
    assert.equal(sec[0].content, "injection");
  });
});

describe("describeResultState", () => {
  it("distinguishes empty, clean, counts-only, and findings", () => {
    assert.equal(describeResultState(null).kind, "empty");
    assert.equal(describeResultState({ comments: [], summary: { files_reviewed: 0 } }).kind, "clean");
    const counts = describeResultState({ comments: [], summary: { files_reviewed: 4 }, _source: "session" });
    assert.equal(counts.kind, "counts-only");
    assert.match(counts.message, /no finding text/);
    assert.equal(describeResultState({ comments }).kind, "findings");
  });
});

describe("fix prompts", () => {
  it("builds a per-file prompt with code blocks and a master prompt of high/critical items", () => {
    const filePrompt = buildFixPrompt("a.js", groupByFile(comments)["a.js"]);
    assert.match(filePrompt, /a\.js/);
    assert.match(filePrompt, /eval\(x\)/);
    assert.match(filePrompt, /safe\(x\)/);
    const master = buildMasterPrompt(comments);
    assert.match(master, /CRITICAL\/HIGH/);
    assert.match(master, /injection/);
    assert.equal(master.includes("whitespace"), false);
  });
});
