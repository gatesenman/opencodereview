import { isGoZeroTime } from "./sessionResults.mjs";
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, "": 4 };
const SEVERITIES = ["critical", "high", "medium", "low"];

function groupByFile(comments) {
  const out = {};
  for (const c of comments || []) {
    const key = c.path || "(unknown file)";
    (out[key] ||= []).push(c);
  }
  for (const k of Object.keys(out)) {
    out[k].sort(
      (a, b) => (SEVERITY_ORDER[a.severity || ""] ?? 9) - (SEVERITY_ORDER[b.severity || ""] ?? 9)
    );
  }
  return out;
}

function filterAndSortComments(comments, { severities, categories, sort = "severity" } = {}) {
  let list = Array.isArray(comments) ? comments.slice() : [];
  const sev = severities instanceof Set ? severities : new Set(severities || []);
  const cat = categories instanceof Set ? categories : new Set(categories || []);
  if (sev.size) list = list.filter((x) => sev.has(String(x.severity || "").toLowerCase()));
  if (cat.size) list = list.filter((x) => cat.has(String(x.category || "other").toLowerCase()));
  if (sort === "file") {
    list.sort(
      (a, b) =>
        String(a.path || "").localeCompare(String(b.path || "")) ||
        (Number(a.start_line) || 0) - (Number(b.start_line) || 0)
    );
  } else {
    list.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity || ""] ?? 9) - (SEVERITY_ORDER[b.severity || ""] ?? 9) ||
        String(a.path || "").localeCompare(String(b.path || ""))
    );
  }
  return list;
}

function describeResultState(result) {
  if (!result) {
    return {
      kind: "empty",
      message: "No results yet. Run a review or scan, or open one from History."
    };
  }
  const comments = result.comments || [];
  const files = result.summary?.files_reviewed ?? 0;
  if (comments.length) return { kind: "findings", count: comments.length, message: "" };
  const status = result.session_status || "";
  if (result.aborted || result.cancelled || status === "aborted") {
    return {
      kind: "aborted",
      message:
        "This session was aborted or cancelled before it finished. It is not a completed review, and it does not mean your code is clean."
    };
  }
  if (status === "incomplete" || (result._source === "session" && isGoZeroTime(result.start_time) && files === 0)) {
    return {
      kind: "incomplete",
      message:
        "This session never completed (for example a preview or an interrupted run). There are no review results to show."
    };
  }
  if (result._source === "session" && files > 0) {
    return {
      kind: "counts-only",
      message:
        "This saved session recorded files but no finding text was stored. Summary counts are shown above; try opening a newer session after a fresh run."
    };
  }
  return { kind: "clean", message: "No findings — your code looks clean." };
}

function buildFixPrompt(file, comments) {
  const lines = [];
  lines.push(`Please fix the following ${comments.length} code review finding(s) in \`${file}\`.`);
  lines.push("For each item, apply a minimal, correct fix and keep existing behavior unless it is the bug.");
  lines.push("");
  comments.forEach((c, i) => {
    lines.push(`### Finding ${i + 1} — ${(c.severity || "n/a").toUpperCase()} / ${c.category || "other"}`);
    lines.push(`Location: ${file}:${c.start_line}-${c.end_line}`);
    lines.push(`Issue: ${String(c.content || "").trim()}`);
    if (c.existing_code?.trim()) {
      lines.push("Current code:", "```", c.existing_code.trim(), "```");
    }
    if (c.suggestion_code?.trim()) {
      lines.push("Suggested change:", "```", c.suggestion_code.trim(), "```");
    }
    lines.push("");
  });
  return lines.join("\n");
}

function buildMasterPrompt(comments) {
  const priority = (comments || []).filter((c) =>
    ["critical", "high"].includes(String(c.severity || "").toLowerCase())
  );
  const target = priority.length > 0 ? priority : comments || [];
  const byFile = groupByFile(target);
  const lines = [];
  lines.push(
    `You are my coding agent. Fix the ${target.length} code review finding(s) below` +
      (priority.length > 0 ? " (all CRITICAL/HIGH severity)" : "") +
      ", grouped by file. Make minimal, correct edits and run the project tests/linters afterward."
  );
  lines.push("");
  for (const [file, cs] of Object.entries(byFile)) {
    lines.push(`## ${file}`);
    cs.forEach((c) => {
      lines.push(
        `- [${(c.severity || "n/a").toUpperCase()}/${c.category || "other"}] lines ${c.start_line}-${c.end_line}: ${String(c.content || "").trim().replace(/\n+/g, " ")}`
      );
    });
    lines.push("");
  }
  return lines.join("\n");
}

export {
  SEVERITY_ORDER,
  SEVERITIES,
  groupByFile,
  filterAndSortComments,
  describeResultState,
  buildFixPrompt,
  buildMasterPrompt
};
