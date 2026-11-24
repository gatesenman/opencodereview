function pushIf(args, flag, value) {
  if (value === undefined || value === null || value === "") return;
  args.push(flag, String(value));
}

function pushFlag(args, flag, enabled) {
  if (enabled) args.push(flag);
}

/** Collapse "a, b , c" (or newline/semicolon lists) to the CLI comma-separated --path form. */
function normalizeScanPaths(paths) {
  if (paths == null) return "";
  const parts = String(paths)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.join(",");
}

/**
 * Build `ocr review` argv.
 * `extra.preview` adds --preview and MUST omit --resume (CLI rejects both).
 * `extra.json` adds --format json.
 */
function buildReviewArgs(o = {}, extra = {}) {
  const args = ["review"];
  if (o.mode === "range") {
    pushIf(args, "--from", o.from);
    pushIf(args, "--to", o.to);
  } else if (o.mode === "commit") {
    pushIf(args, "--commit", o.commit);
  }
  if (!extra.preview && o.resume) pushIf(args, "--resume", o.resume);
  pushIf(args, "--background", o.background);
  pushIf(args, "--background-file", o.backgroundFile);
  pushIf(args, "--model", o.model);
  pushIf(args, "--exclude", o.exclude);
  pushIf(args, "--concurrency", o.concurrency);
  pushIf(args, "--timeout", o.timeout);
  pushIf(args, "--max-tools", o.maxTools);
  pushIf(args, "--max-git-procs", o.maxGitProcs);
  pushIf(args, "--rule", o.rule);
  pushIf(args, "--tools", o.tools);
  if (extra.preview) args.push("--preview");
  if (extra.json) args.push("--format", "json");
  return args;
}

function buildScanArgs(o = {}, extra = {}) {
  const args = ["scan"];
  pushIf(args, "--path", normalizeScanPaths(o.paths));
  pushIf(args, "--exclude", o.exclude);
  pushIf(args, "--background", o.background);
  pushIf(args, "--model", o.model);
  pushIf(args, "--concurrency", o.concurrency);
  pushIf(args, "--timeout", o.timeout);
  pushIf(args, "--max-tools", o.maxTools);
  pushIf(args, "--max-git-procs", o.maxGitProcs);
  pushIf(args, "--max-tokens-budget", o.maxTokensBudget);
  pushIf(args, "--batch", o.batch);
  pushIf(args, "--rule", o.rule);
  pushIf(args, "--tools", o.tools);
  pushFlag(args, "--no-plan", o.noPlan);
  pushFlag(args, "--no-dedup", o.noDedup);
  pushFlag(args, "--no-summary", o.noSummary);
  if (extra.preview) args.push("--preview");
  if (extra.json) args.push("--format", "json");
  return args;
}

function looksLikeReviewResult(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return (
    Array.isArray(obj.comments) ||
    Array.isArray(obj.items) ||
    Array.isArray(obj.warnings) ||
    Boolean(obj.summary) ||
    Boolean(obj.project_summary) ||
    Boolean(obj.projectSummary) ||
    Boolean(obj.session_id)
  );
}

function extractJsonObjects(text) {
  const out = [];
  const s = String(text || "");
  const len = s.length;
  let i = 0;
  while (i < len) {
    if (s[i] !== "{" && s[i] !== "[") {
      i += 1;
      continue;
    }
    const open = s[i];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let j = i; j < len; j++) {
      const ch = s[j];
      if (inStr) {
        if (escape) escape = false;
        else if (ch === "\\\\") escape = true;
        else if (ch === "\"") inStr = false;
        continue;
      }
      if (ch === "\"") {
        inStr = true;
        continue;
      }
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          const slice = s.slice(i, j + 1);
          try {
            out.push(JSON.parse(slice));
          } catch {
            /* ignore invalid slice */
          }
          i = j;
          break;
        }
      }
    }
    i += 1;
  }
  return out;
}

function parseJsonResult(stdout) {
  if (!stdout) return null;
  const objects = extractJsonObjects(stdout).filter((o) => o && typeof o === "object" && !Array.isArray(o));
  if (!objects.length) return null;
  const results = objects.filter(looksLikeReviewResult);
  return (results.length ? results : objects).at(-1);
}

const statusFromBadge = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  B: "binary",
  S: "scan"
};

function parsePreview(text) {
  const clean = String(text || "").replace(/\x1b\[[0-9;]*m/g, "");
  const lines = clean.split(/\r?\n/);
  const preview = {
    total_files: 0,
    reviewable: 0,
    excluded: 0,
    insertions: 0,
    deletions: 0,
    entries: []
  };
  let section = null;
  for (const line of lines) {
    const headCounts = /Preview:\s*(\d+)\s*file\(s\).*?\+(\d+)\s*-(\d+)/.exec(line);
    const headPlain = /Preview:\s*(\d+)\s*file\(s\)/.exec(line);
    if (headCounts) {
      preview.total_files = Number(headCounts[1]);
      preview.insertions = Number(headCounts[2]);
      preview.deletions = Number(headCounts[3]);
      continue;
    }
    if (headPlain) {
      preview.total_files = Number(headPlain[1]);
      continue;
    }
    const willReview = /Will (?:review|scan) \((\d+)\)/i.exec(line);
    if (willReview) {
      preview.reviewable = Number(willReview[1]);
      section = "review";
      continue;
    }
    const excluded = /Excluded from (?:review|scan) \((\d+)\)/i.exec(line);
    if (excluded) {
      preview.excluded = Number(excluded[1]);
      section = "excluded";
      continue;
    }
    const row = /^\s*\[([AMDRBS?])\]\s+(.*)$/.exec(line);
    if (row) {
      if (!section) section = "review";
      const entry = {
        path: "",
        status: statusFromBadge[row[1]] ?? "unknown",
        insertions: 0,
        deletions: 0,
        will_review: section === "review"
      };
      let rest = row[2].trim();
      const counts = /\+(\d+)\s+-(\d+)\s*$/.exec(rest);
      if (counts) {
        entry.insertions = Number(counts[1]);
        entry.deletions = Number(counts[2]);
        rest = rest.slice(0, counts.index).trim();
      }
      const reason = /\(([^)]+)\)\s*$/.exec(rest);
      if (reason) {
        if (section === "excluded") entry.exclude_reason = reason[1];
        rest = rest.slice(0, reason.index).trim();
      }
      entry.path = rest;
      preview.entries.push(entry);
    }
  }
  const countedReviewable = preview.entries.filter((e) => e.will_review).length;
  const countedExcluded = preview.entries.filter((e) => !e.will_review).length;
  if (!preview.reviewable && countedReviewable) preview.reviewable = countedReviewable;
  if (!preview.excluded && countedExcluded) preview.excluded = countedExcluded;
  if (!preview.total_files) preview.total_files = preview.entries.length;
  return preview;
}

function previewLooksEmpty(stdout) {
  if (!stdout) return true;
  if (/Preview:/i.test(stdout) || /Will (?:review|scan)/i.test(stdout)) return false;
  if (/^\s*\[[AMDRBS?]\]/m.test(stdout)) return false;
  return true;
}

export {
  buildReviewArgs,
  buildScanArgs,
  parseJsonResult,
  extractJsonObjects,
  looksLikeReviewResult,
  parsePreview,
  previewLooksEmpty,
  statusFromBadge,
  normalizeScanPaths
};
