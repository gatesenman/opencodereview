function asPositiveInt(name, value, min = 1) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: undefined };
  }
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min) {
    return { ok: false, error: `${name} must be an integer ≥ ${min}.` };
  }
  return { ok: true, value: n };
}

/**
 * Validate Review/Scan options before preview or run.
 * Timeout is minutes (CLI default 10 if omitted). Empty optional fields are fine.
 */
function validateRunOptions(kind, o = {}) {
  const errors = [];
  if (!o.repoDir) errors.push("Choose a repository folder first (bottom-left).");
  if (kind === "review") {
    if (o.mode === "range" && (!String(o.from || "").trim() || !String(o.to || "").trim())) {
      errors.push("Range mode needs both --from and --to.");
    }
    if (o.mode === "commit" && !String(o.commit || "").trim()) {
      errors.push("Commit mode needs a commit hash.");
    }
    if (o.resume && (o.mode === "workspace" || !o.mode)) {
      errors.push(
        "A resumed review cannot use workspace mode. Use the original range or commit, or cancel resume."
      );
    }
  }
  const fields = [
    ["timeout", o.timeout, 1],
    ["concurrency", o.concurrency, 1],
    ["max-tools", o.maxTools, 1],
    ["max-git-procs", o.maxGitProcs, 1],
    ["max-tokens-budget", o.maxTokensBudget, 1]
  ];
  const numbers = {};
  for (const [name, val, min] of fields) {
    const r = asPositiveInt(name, val, min);
    if (!r.ok) errors.push(r.error);
    else if (r.value !== undefined) numbers[name] = r.value;
  }
  return { ok: errors.length === 0, errors, numbers };
}

export { asPositiveInt, validateRunOptions };
