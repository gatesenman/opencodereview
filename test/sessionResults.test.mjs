import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPlaceholderSessionTime,
  formatSessionTime,
  describeSessionRecord,
  planContinue,
  mapSessionToResult,
  parseJsonl,
  commentsFromJsonlRecords,
  inferReviewMode
} from "../src/shared/sessionResults.mjs";

describe("planContinue", () => {
  it("blocks workspace resume", () => {
    const p = planContinue({ review_mode: "workspace", session_id: "abc" });
    assert.equal(p.blocked, true);
    assert.match(p.reason, /Workspace/);
  });

  it("blocks scan resume and does not send the user to Review", () => {
    const p = planContinue({ review_mode: "scan", session_id: "abc" });
    assert.equal(p.blocked, true);
    assert.match(p.reason, /Scan/);
    assert.notEqual(p.view, "review");
  });

  it("continues a range review with from/to filled in", () => {
    const p = planContinue({
      review_mode: "range",
      session_id: "sess-range",
      diff_from: "main",
      diff_to: "feature"
    });
    assert.equal(p.blocked, false);
    assert.equal(p.view, "review");
    assert.equal(p.mode, "range");
    assert.equal(p.from, "main");
    assert.equal(p.to, "feature");
    assert.equal(p.resume, "sess-range");
  });

  it("continues a commit review", () => {
    const p = planContinue({
      review_mode: "commit",
      session_id: "s1",
      diff_commit: "abc123"
    });
    assert.equal(p.mode, "commit");
    assert.equal(p.commit, "abc123");
  });

  it("infers range from diff refs when mode is missing", () => {
    assert.equal(inferReviewMode({ diff_from: "a", diff_to: "b" }), "range");
  });
});

describe("mapSessionToResult", () => {
  it("uses comments already present on the show payload", () => {
    const result = mapSessionToResult({
      summary: { session_id: "s", completed_files: 2, files_reviewed: 2, total_tokens: 9, elapsed: "3s" },
      comments: [
        { path: "a.js", start_line: 1, end_line: 2, severity: "high", category: "bug", content: "oops" }
      ]
    });
    assert.equal(result.comments.length, 1);
    assert.equal(result.comments[0].path, "a.js");
    assert.equal(result.summary.files_reviewed, 2);
  });

  it("flattens comments nested on items", () => {
    const result = mapSessionToResult({
      summary: { completed_files: 1 },
      items: [
        {
          type: "review_item_done",
          new_path: "b.go",
          comments: [{ start_line: 4, content: "nil deref", severity: "critical" }]
        }
      ]
    });
    assert.equal(result.comments[0].path, "b.go");
    assert.equal(result.comments[0].start_line, 4);
  });

  it("rebuilds comments from jsonl records when show has only counts", () => {
    const jsonl = [
      '{"type":"review_item_done","filePath":"c.ts","comments":[{"start_line":10,"end_line":12,"content":"x","severity":"medium","category":"style"}]}',
      '{"type":"review_item_failed","filePath":"d.ts","error":"timeout"}'
    ].join("\n");
    const records = parseJsonl(jsonl);
    assert.equal(commentsFromJsonlRecords(records).length, 1);
    const result = mapSessionToResult(
      { summary: { completed_files: 1 }, items: [{ type: "review_item_done", new_path: "c.ts", comments: 1 }] },
      records
    );
    assert.equal(result.comments.length, 1);
    assert.equal(result.comments[0].path, "c.ts");
    assert.equal(result.comments[0].content, "x");
  });
});

import { parseSessionList, dedupeComments, normalizeComment } from "../src/shared/sessionResults.mjs";

describe("planContinue constraints", () => {
  it("blocks a range session that is missing from/to", () => {
    const p = planContinue({ review_mode: "range", session_id: "s" });
    assert.equal(p.blocked, true);
    assert.match(p.reason, /from\/--to/);
  });

  it("blocks a commit session that is missing the hash", () => {
    const p = planContinue({ review_mode: "commit", session_id: "s" });
    assert.equal(p.blocked, true);
    assert.match(p.reason, /commit/);
  });

  it("blocks when the session id is missing", () => {
    const p = planContinue({ review_mode: "range", diff_from: "a", diff_to: "b" });
    assert.equal(p.blocked, true);
    assert.match(p.reason, /id/);
  });
});

describe("parseSessionList", () => {
  it("accepts a raw array, a wrapped object, and log-prefixed JSON", () => {
    const one = [{ session_id: "a", review_mode: "range" }];
    assert.equal(parseSessionList(JSON.stringify(one))[0].session_id, "a");
    assert.equal(parseSessionList(JSON.stringify({ sessions: one }))[0].session_id, "a");
    assert.equal(parseSessionList("listing...\\n" + JSON.stringify({ data: one }))[0].session_id, "a");
    assert.deepEqual(parseSessionList(""), []);
    assert.deepEqual(parseSessionList("not json"), []);
    assert.deepEqual(parseSessionList(JSON.stringify({ ok: true })), []);
  });
});

describe("dedupeComments", () => {
  it("drops identical findings when show and jsonl overlap", () => {
    const c = { path: "a.js", start_line: 1, end_line: 1, severity: "high", content: "x" };
    const result = mapSessionToResult({ comments: [c, { ...c }, { ...c, start_line: 2, content: "y" }] });
    assert.equal(result.comments.length, 2);
    assert.equal(dedupeComments([normalizeComment(c), normalizeComment(c)]).length, 1);
  });
});

describe("mapSessionToResult edge cases", () => {
  it("accepts a JSON string, camelCase duration, and string warnings", () => {
    const result = mapSessionToResult({
      sessionId: "sid",
      reviewMode: "range",
      summary: { durationNs: 2500000000, totalTokens: 11, completedFiles: 3 },
      warnings: ["watch this", { path: "a.js", error: "needs review" }]
    });
    assert.equal(result.session_id, "sid");
    assert.equal(result.summary.total_tokens, 11);
    assert.equal(result.summary.files_reviewed, 3);
    assert.equal(result.summary.elapsed, "2.5s");
    assert.equal(result.warnings[0].message, "watch this");
    assert.equal(result.warnings[1].file, "a.js");
  });
});

describe("placeholder session times and aborted history rows", () => {
  it("does not format Go zero-time as 1/1/1", () => {
    assert.equal(isPlaceholderSessionTime("0001-01-01T00:00:00Z"), true);
    assert.equal(isPlaceholderSessionTime(""), true);
    assert.equal(formatSessionTime("0001-01-01T00:00:00Z"), "—");
    assert.equal(formatSessionTime("0001-01-01T00:00:00.000Z"), "—");
    assert.notEqual(formatSessionTime("2026-11-24T04:00:41Z"), "—");
  });

  it("labels official preview sessions as aborted", () => {
    const st = describeSessionRecord({
      start_time: "0001-01-01T00:00:00Z",
      aborted: true,
      completed_files: 0,
      total_comments: 0
    });
    assert.equal(st.kind, "aborted");
    assert.equal(st.dateLabel, "—");
    assert.equal(st.label, "Aborted");
  });

  it("marks mapSessionToResult with aborted status for zero-date sessions", () => {
    const mapped = mapSessionToResult({
      summary: {
        session_id: "abc",
        start_time: "0001-01-01T00:00:00Z",
        aborted: true,
        completed_files: 0,
        total_comments: 0
      },
      items: null
    });
    assert.equal(mapped.aborted, true);
    assert.equal(mapped.session_status, "aborted");
    assert.equal(mapped.comments.length, 0);
  });
});
