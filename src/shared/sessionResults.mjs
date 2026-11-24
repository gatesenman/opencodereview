function lower(s) {
  return String(s || "").toLowerCase();
}

function isScanMode(mode) {
  return /\bscan\b/.test(lower(mode));
}

function isWorkspaceMode(mode) {
  return lower(mode) === "workspace";
}

function isCommitMode(mode, session = {}) {
  return lower(mode) === "commit" || Boolean(session.diff_commit || session.diffCommit);
}

function isRangeMode(mode, session = {}) {
  if (lower(mode) === "range") return true;
  return Boolean((session.diff_from || session.diffFrom) && (session.diff_to || session.diffTo));
}

function inferReviewMode(session = {}) {
  const mode = session.review_mode || session.reviewMode || "";
  if (mode) return mode;
  if (isScanMode(mode)) return "scan";
  if (session.diff_commit || session.diffCommit) return "commit";
  if ((session.diff_from || session.diffFrom) && (session.diff_to || session.diffTo)) return "range";
  return mode || "workspace";
}

/**
 * Decide what History "Continue" should do.
 * Scan sessions cannot use `ocr review --resume` (scan has no --resume flag in CLI help).
 * Workspace resume is rejected by the CLI.
 */
function planContinue(session = {}) {
  const mode = inferReviewMode(session);
  const id = session.session_id || session.sessionId || session.summary?.session_id;
  if (isWorkspaceMode(mode)) {
    return {
      blocked: true,
      reason: "Workspace sessions cannot be resumed — re-run a fresh review."
    };
  }
  if (isScanMode(mode)) {
    return {
      blocked: true,
      reason: "Scan sessions cannot be resumed with --resume. Open the results instead, or start a new scan."
    };
  }
  if (!id) {
    return {
      blocked: true,
      reason: "This session has no id, so it cannot be resumed."
    };
  }
  if (isCommitMode(mode, session)) {
    const commit = session.diff_commit || session.diffCommit || "";
    if (!String(commit).trim()) {
      return {
        blocked: true,
        reason: "This commit session is missing --commit, so it cannot be resumed automatically."
      };
    }
    return {
      blocked: false,
      view: "review",
      resume: id,
      mode: "commit",
      from: "",
      to: "",
      commit
    };
  }
  const from = session.diff_from || session.diffFrom || "";
  const to = session.diff_to || session.diffTo || "";
  if (!String(from).trim() || !String(to).trim()) {
    return {
      blocked: true,
      reason: "This range session is missing --from/--to, so it cannot be resumed automatically."
    };
  }
  return {
    blocked: false,
    view: "review",
    resume: id,
    mode: "range",
    from,
    to,
    commit: ""
  };
}

function commentPath(c = {}, fallback = "") {
  return c.path || c.file_path || c.filePath || c.new_path || c.newPath || fallback || "";
}

function normalizeComment(c = {}, fallbackPath = "") {
  if (!c || typeof c !== "object") return null;
  const start = c.start_line ?? c.startLine ?? c.line ?? 0;
  const end = c.end_line ?? c.endLine ?? start;
  const content = c.content || c.message || c.body || c.comment || "";
  return {
    path: commentPath(c, fallbackPath),
    start_line: Number(start) || 0,
    end_line: Number(end) || 0,
    severity: c.severity || "",
    category: c.category || "other",
    content: String(content),
    existing_code: c.existing_code || c.existingCode || "",
    suggestion_code: c.suggestion_code || c.suggestionCode || "",
    thinking: c.thinking || ""
  };
}

function itemPath(it = {}) {
  return it.new_path || it.newPath || it.file_path || it.filePath || it.path || "";
}

function commentsFromItems(items = []) {
  const out = [];
  for (const it of items) {
    const comments = it?.comments;
    if (Array.isArray(comments)) {
      for (const c of comments) {
        const n = normalizeComment(c, itemPath(it));
        if (n && (n.content || n.path)) out.push(n);
      }
    }
  }
  return out;
}

function commentsFromJsonlRecords(records = []) {
  const out = [];
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    const typ = rec.type || "";
    if (typ && typ !== "review_item_done" && typ !== "review_item_reused" && typ !== "comment" && typ !== "finding") {
      if (!Array.isArray(rec.comments) && !rec.content && !rec.message) continue;
    }
    const fallback = rec.filePath || rec.newPath || rec.file_path || rec.new_path || rec.path || "";
    if (Array.isArray(rec.comments)) {
      for (const c of rec.comments) {
        const n = normalizeComment(c, fallback);
        if (n && (n.content || n.path)) out.push(n);
      }
    } else if (rec.content || rec.message || rec.severity) {
      const n = normalizeComment(rec, fallback);
      if (n && (n.content || n.path)) out.push(n);
    }
  }
  return out;
}

function pickComments(detail = {}, records = []) {
  let comments = [];
  if (Array.isArray(detail.comments) && detail.comments.length) {
    comments = detail.comments.map((c) => normalizeComment(c)).filter(Boolean);
  } else if (Array.isArray(detail.summary?.comments) && detail.summary.comments.length) {
    comments = detail.summary.comments.map((c) => normalizeComment(c)).filter(Boolean);
  } else {
    const fromItems = commentsFromItems(detail.items || []);
    comments = fromItems.length ? fromItems : commentsFromJsonlRecords(records);
  }
  return dedupeComments(comments);
}

function normalizeWarnings(list) {
  if (!list) return [];
  if (!Array.isArray(list)) return [{ file: "", message: String(list) }];
  return list.map((w) => {
    if (w == null) return { file: "", message: "" };
    if (typeof w === "string") return { file: "", message: w };
    return { file: w.file || w.path || "", message: w.message || w.error || String(w) };
  });
}

function mapSessionToResult(detail = {}, records = []) {
  if (typeof detail === "string") {
    try {
      detail = JSON.parse(detail);
    } catch {
      detail = {};
    }
  }
  if (!detail || typeof detail !== "object") detail = {};
  const summary = detail.summary || {};
  const comments = pickComments(detail, records);
  const projectSummary = detail.project_summary || detail.projectSummary || summary.project_summary || summary.projectSummary || "";
  const elapsed =
    summary.elapsed ||
    (summary.duration_ns ? formatNs(summary.duration_ns) : "") ||
    (summary.durationNs ? formatNs(summary.durationNs) : "") ||
    (summary.duration_seconds != null ? `${summary.duration_seconds}s` : "") ||
    (summary.durationSeconds != null ? `${summary.durationSeconds}s` : "");
  return {
    comments,
    project_summary: projectSummary,
    warnings: normalizeWarnings(detail.warnings || summary.warnings || []),
    summary: {
      files_reviewed: summary.files_reviewed ?? summary.filesReviewed ?? summary.completed_files ?? summary.completedFiles ?? comments.length ?? 0,
      total_tokens: summary.total_tokens ?? summary.totalTokens ?? 0,
      elapsed
    },
    session_id: summary.session_id || summary.sessionId || detail.session_id || detail.sessionId || "",
    review_mode: summary.review_mode || summary.reviewMode || detail.review_mode || detail.reviewMode || "",
    _source: "session"
  };
}

function formatNs(ns) {
  const s = Number(ns) / 1e9;
  if (!Number.isFinite(s) || s <= 0) return "";
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function parseJsonl(text) {
  const records = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // skip
    }
  }
  return records;
}

function resultTitleFromSession(detail = {}) {
  const mode = inferReviewMode(detail.summary || detail);
  if (isScanMode(mode)) return "Scan (history)";
  return "Review (history)";
}

function commentKey(c) {
  return [c.path, c.start_line, c.end_line, c.severity, c.content].join("\0");
}

function dedupeComments(list) {
  const seen = new Set();
  const out = [];
  for (const c of list || []) {
    if (!c) continue;
    const k = commentKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function normalizeSessionArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed.sessions)) return parsed.sessions;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.results)) return parsed.results;
  return [];
}

function parseSessionList(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return [];
  const tryParse = (slice) => {
    try {
      return normalizeSessionArray(JSON.parse(slice));
    } catch {
      return null;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const bracketStart = text.indexOf("[");
  const bracketEnd = text.lastIndexOf("]");
  if (bracketStart >= 0 && bracketEnd > bracketStart) {
    const arr = tryParse(text.slice(bracketStart, bracketEnd + 1));
    if (arr) return arr;
  }
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    const obj = tryParse(text.slice(braceStart, braceEnd + 1));
    if (obj) return obj;
  }
  return [];
}

export {
  isScanMode,
  isWorkspaceMode,
  isCommitMode,
  isRangeMode,
  inferReviewMode,
  planContinue,
  normalizeComment,
  commentsFromItems,
  commentsFromJsonlRecords,
  pickComments,
  mapSessionToResult,
  normalizeWarnings,
  parseJsonl,
  resultTitleFromSession,
  formatNs,
  parseSessionList,
  normalizeSessionArray,
  dedupeComments
};
