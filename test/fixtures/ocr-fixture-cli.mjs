#!/usr/bin/env node
/**
 * OpenCodeReview Desktop — FIXTURE / MOCK CLI
 * =====================================================================
 * THIS IS NOT the official `ocr` / `opencodereview` binary.
 * THIS IS NOT a model reviewer and NEVER contacts an LLM or paid API.
 * It exists only so the desktop app's main process can be integration-tested
 * and so a computer-use agent can exercise the production GUI safely.
 *
 * Official CLI differences that this fixture deliberately mirrors:
 *   - `ocr help`, `ocr config --help`, `ocr llm --help` exit 1 (v1.7.9)
 *   - typo config keys (`apikey`, `customproviders`, `otlpendpoint`) are rejected
 *   - `--preview` and `--resume` cannot be combined
 *   - `review --preview` may persist an aborted empty session (v1.7.9 behavior)
 *   - scan preview headings say "Will review", not "Will scan"
 *   - `session list --json --limit 0` emits a JSON array
 *
 * Env (all optional):
 *   OCR_FIXTURE_ARGV_LOG   append one JSON line per invocation
 *   OCR_FIXTURE_DELAY_MS   delay before finishing review/scan --format json
 *   OCR_FIXTURE_FAIL       if set, review/scan json exits 1 after delay
 *   OCR_FIXTURE_SESSION_ID fixed session id (otherwise random UUID)
 *   OCR_FIXTURE_NO_PREVIEW_SESSION  if "1", preview does not write a session
 *   HOME                   config and sessions live under $HOME/.opencodereview
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const BANNER_STDERR =
  "[OCR-FIXTURE-CLI] Mock only — not the official OpenCodeReview CLI and not a model review.\n";

const VERSION = "open-code-review v1.7.9-fixture (not-official) linux/amd64";

const SUPPORTED_TOP =
  "provider, model, providers.<name>.<field>, custom_providers.<name>.<field>, mcp_servers.<name>.<field>, llm.url, llm.auth_token, llm.auth_header, llm.model, llm.use_anthropic, llm.extra_body, llm.extra_headers, language, telemetry.enabled, telemetry.exporter, telemetry.otlp_endpoint, telemetry.content_logging";
const PROVIDER_FIELDS = new Set([
  "api_key",
  "url",
  "protocol",
  "model",
  "models",
  "auth_header",
  "extra_body",
  "extra_headers"
]);
const MCP_FIELDS = new Set(["command", "args", "env", "tools", "setup"]);
const LLM_FIELDS = new Set([
  "url",
  "auth_token",
  "auth_header",
  "model",
  "use_anthropic",
  "extra_body",
  "extra_headers"
]);
const TELEMETRY_FIELDS = new Set(["enabled", "exporter", "otlp_endpoint", "content_logging"]);
const TOP_SIMPLE = new Set(["provider", "model", "language"]);

const argv = process.argv.slice(2);
const cwd = process.cwd();

function appendArgvLog() {
  const dest = process.env.OCR_FIXTURE_ARGV_LOG;
  if (!dest) return;
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const rec = {
      ts: new Date().toISOString(),
      cwd,
      argv,
      home: process.env.HOME || "",
      delay_ms: process.env.OCR_FIXTURE_DELAY_MS || "",
      fail: process.env.OCR_FIXTURE_FAIL || ""
    };
    fs.appendFileSync(dest, JSON.stringify(rec) + "\n", "utf8");
  } catch {
    /* never fail the command because of logging */
  }
}

function flagValue(name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}
function hasFlag(name) {
  return argv.includes(name);
}

function ocrHome() {
  return path.join(os.homedir(), ".opencodereview");
}
function configPath() {
  return path.join(ocrHome(), "config.json");
}
function encodeRepoPath(p) {
  if (!p) return "empty";
  let vol = "";
  const m = /^([A-Za-z]:)/.exec(p);
  if (m) {
    vol = m[1];
    p = p.slice(vol.length);
  }
  p = p.replace(/^[/\\]+/, "");
  p = p.replace(/[/\\]/g, "-");
  vol = vol.replace(/:/g, "_");
  const result = vol + p;
  return result === "" ? "empty" : result;
}
function sessionsDir(repoDir) {
  return path.join(ocrHome(), "sessions", encodeRepoPath(repoDir || cwd));
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}
function writeConfig(obj) {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 4) + "\n", "utf8");
}

function setDeep(obj, parts, value) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}
function unsetDeep(obj, parts) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") return;
    cur = cur[parts[i]];
  }
  delete cur[parts[parts.length - 1]];
}

function validateKey(key, { unset = false } = {}) {
  if (TOP_SIMPLE.has(key)) return { ok: true };
  const parts = key.split(".");
  if (parts[0] === "providers" && parts.length === 3) {
    if (!PROVIDER_FIELDS.has(parts[2])) {
      return {
        ok: false,
        error: `Error: unknown provider field "${parts[2]}": supported fields are api_key, url, protocol, model, models, auth_header, extra_body, extra_headers\n`
      };
    }
    return { ok: true };
  }
  if (parts[0] === "custom_providers" && parts.length >= 2) {
    if (unset && parts.length === 2) return { ok: true };
    if (parts.length === 3 && PROVIDER_FIELDS.has(parts[2])) return { ok: true };
  }
  if (parts[0] === "mcp_servers" && parts.length >= 2) {
    if (unset && parts.length === 2) return { ok: true };
    if (parts.length === 3 && MCP_FIELDS.has(parts[2])) return { ok: true };
  }
  if (parts[0] === "llm" && parts.length === 2 && LLM_FIELDS.has(parts[1])) return { ok: true };
  if (parts[0] === "telemetry" && parts.length === 2 && TELEMETRY_FIELDS.has(parts[1])) return { ok: true };
  return {
    ok: false,
    error: `Error: unknown config key: ${key}\nSupported keys: ${SUPPORTED_TOP}\nProvider fields: api_key, url, protocol, model, models, auth_header, extra_body, extra_headers\nMCP server fields: command, args, env, tools, setup\n`
  };
}

function redact(key, value) {
  if (/(api_key|auth_token|token)/i.test(key) && String(value).length > 8) {
    const s = String(value);
    return s.slice(0, 4) + "***" + s.slice(-4);
  }
  return value;
}

function previewEntries({ kind, exclude, pathFilter }) {
  const all = [
    { path: "app.js", status: kind === "scan" ? "S" : "M", insertions: kind === "scan" ? 7 : 3, deletions: 0 },
    { path: "extra.js", status: kind === "scan" ? "S" : "A", insertions: 1, deletions: 0 }
  ];
  const filters = String(pathFilter || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const excludes = String(exclude || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return all
    .filter((e) => !filters.length || filters.includes(e.path))
    .map((e) => ({
      ...e,
      excluded: excludes.includes(e.path),
      reason: excludes.includes(e.path) ? "user_exclude" : ""
    }));
}

function renderPreview(kind) {
  const entries = previewEntries({
    kind,
    exclude: flagValue("--exclude"),
    pathFilter: flagValue("--path")
  });
  const reviewable = entries.filter((e) => !e.excluded);
  const excluded = entries.filter((e) => e.excluded);
  const ins = entries.reduce((n, e) => n + e.insertions, 0);
  const del = entries.reduce((n, e) => n + e.deletions, 0);
  if (!entries.length) return "No files changed.\n";
  const lines = [
    "",
    `Preview: ${entries.length} file(s) changed  |  \x1b[32m+${ins}\x1b[0m  \x1b[31m-${del}\x1b[0m`,
    "",
    `\x1b[1mWill review (${reviewable.length}):\x1b[0m`
  ];
  for (const e of reviewable) {
    const badge = e.status === "M" ? "\x1b[33m[M]\x1b[0m" : e.status === "A" ? "\x1b[32m[A]\x1b[0m" : "\x1b[34m[S]\x1b[0m";
    lines.push(`  ${badge}  ${e.path.padEnd(20)} \x1b[32m+${String(e.insertions).padEnd(4)}\x1b[0m \x1b[31m-${String(e.deletions).padEnd(4)}\x1b[0m`);
  }
  if (excluded.length) {
    lines.push("", `\x1b[1mExcluded from review (${excluded.length}):\x1b[0m`);
    for (const e of excluded) {
      const badge = e.status === "A" ? "\x1b[32m[A]\x1b[0m" : e.status === "M" ? "\x1b[33m[M]\x1b[0m" : "\x1b[34m[S]\x1b[0m";
      lines.push(`  ${badge}  ${e.path.padEnd(20)} \x1b[2m(${e.reason})\x1b[0m`);
    }
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

function writeAbortedPreviewSession(repoDir) {
  if (process.env.OCR_FIXTURE_NO_PREVIEW_SESSION === "1") return null;
  const id = process.env.OCR_FIXTURE_SESSION_ID || crypto.randomUUID();
  const dir = sessionsDir(repoDir);
  fs.mkdirSync(dir, { recursive: true });
  const file_path = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file_path, "", "utf8");
  return id;
}

function sessionSummary(id, repoDir, extra = {}) {
  const file_path = path.join(sessionsDir(repoDir), `${id}.jsonl`);
  return {
    session_id: id,
    file_path,
    repo_dir: path.resolve(repoDir || cwd),
    start_time: extra.start_time || new Date().toISOString(),
    end_time: extra.end_time || new Date().toISOString(),
    completed_files: extra.completed_files ?? 0,
    failed_files: extra.failed_files ?? 0,
    reused_files: extra.reused_files ?? 0,
    total_comments: extra.total_comments ?? 0,
    llm_failures: 0,
    aborted: extra.aborted ?? false,
    review_mode: extra.review_mode || "workspace"
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fixtureComments() {
  return [
    {
      path: "app.js",
      start_line: 1,
      end_line: 3,
      severity: "warning",
      category: "other",
      content:
        "[OCR-FIXTURE-CLI] Fixture finding only. This is not a real model review. The desktop Results view should render this card.",
      existing_code: "console.log('hello');\n",
      suggestion_code: "console.log('hello');\n// fixture suggestion — not from a model\n"
    },
    {
      path: "extra.js",
      start_line: 1,
      end_line: 1,
      severity: "info",
      category: "style",
      content: "[OCR-FIXTURE-CLI] Second fixture finding. Not a model review."
    }
  ];
}

async function runJsonReview(kind) {
  if (hasFlag("--preview") && hasFlag("--resume")) {
    process.stderr.write("Error: --preview and --resume cannot be used together\n");
    return 1;
  }
  const delay = Number(process.env.OCR_FIXTURE_DELAY_MS || 0);
  const repoDir = flagValue("--repo") || cwd;
  const id = process.env.OCR_FIXTURE_SESSION_ID || crypto.randomUUID();
  const dir = sessionsDir(repoDir);
  fs.mkdirSync(dir, { recursive: true });
  const file_path = path.join(dir, `${id}.jsonl`);
  const start = new Date().toISOString();
  const comments = fixtureComments();
  const files = ["app.js", "extra.js"];
  const slice = Math.max(0, delay);
  fs.writeFileSync(file_path, "", "utf8");
  for (let i = 0; i < files.length; i++) {
    if (slice) await sleep(Math.floor(slice / (files.length + 1)));
    const rec = {
      type: "review_item_done",
      filePath: files[i],
      comments: [comments[i]],
      ts: new Date().toISOString()
    };
    fs.appendFileSync(file_path, JSON.stringify(rec) + "\n", "utf8");
    process.stderr.write(`[OCR-FIXTURE-CLI] progress ${i + 1}/${files.length} ${files[i]}\n`);
  }
  if (slice) await sleep(Math.floor(slice / (files.length + 1)));
  if (process.env.OCR_FIXTURE_FAIL) {
    const failRec = { type: "review_item_failed", filePath: "app.js", error: String(process.env.OCR_FIXTURE_FAIL) };
    fs.appendFileSync(file_path, JSON.stringify(failRec) + "\n", "utf8");
    process.stderr.write(`Error: fixture failure: ${process.env.OCR_FIXTURE_FAIL}\n`);
    return 1;
  }
  const result = {
    session_id: id,
    review_mode: kind === "scan" ? "scan" : "workspace",
    comments,
    summary: {
      files_reviewed: files.length,
      total_tokens: 0,
      elapsed: `${Math.max(0.1, delay / 1000).toFixed(1)}s`,
      completed_files: files.length
    },
    message: "[OCR-FIXTURE-CLI] Mock review complete. Not a real model review."
  };
  fs.appendFileSync(
    file_path,
    JSON.stringify({ type: "session_summary", ...sessionSummary(id, repoDir, { start_time: start, completed_files: 2, total_comments: comments.length, review_mode: result.review_mode }) }) +
      "\n",
    "utf8"
  );
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}

function listSessions(repoDir) {
  const dir = sessionsDir(repoDir);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
  } catch {
    names = [];
  }
  const items = names.map((n) => {
    const id = n.replace(/\.jsonl$/, "");
    const file_path = path.join(dir, n);
    const st = fs.statSync(file_path);
    const raw = fs.readFileSync(file_path, "utf8");
    const aborted = raw.trim() === "";
    let extra = { aborted, start_time: aborted ? "0001-01-01T00:00:00Z" : new Date(st.mtimeMs).toISOString(), end_time: aborted ? "0001-01-01T00:00:00Z" : new Date(st.mtimeMs).toISOString() };
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.type === "session_summary") {
          extra = rec;
        }
      } catch {
        /* skip */
      }
    }
    return sessionSummary(id, repoDir, extra);
  });
  items.sort((a, b) => String(b.session_id).localeCompare(String(a.session_id)));
  return items;
}

function showSession(repoDir, id) {
  const file_path = path.join(sessionsDir(repoDir), `${id}.jsonl`);
  if (!fs.existsSync(file_path)) {
    process.stderr.write(`Error: session not found: ${id}\n`);
    return null;
  }
  const raw = fs.readFileSync(file_path, "utf8");
  const aborted = raw.trim() === "";
  let summary = sessionSummary(id, repoDir, {
    aborted,
    start_time: aborted ? "0001-01-01T00:00:00Z" : undefined,
    end_time: aborted ? "0001-01-01T00:00:00Z" : undefined
  });
  const items = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.type === "session_summary") summary = sessionSummary(id, repoDir, rec);
      else if (rec.type === "review_item_done") items.push({ file_path: rec.filePath, comments: rec.comments || [] });
    } catch {
      /* skip */
    }
  }
  return { summary, items: items.length ? items : aborted ? null : items };
}

function usage() {
  return `OpenCodeReview - AI-Powered Code Review CLI (FIXTURE MOCK — not official, not a model)

Usage:
  ocr [command]

Commands:
  review, r    Start a diff-based code review
  scan, s      Scan entire files (no diff required)
  rules        Inspect and debug review rules
  config       Manage configuration settings
  llm          LLM utility commands
  session, sessions  List and inspect saved review sessions
  version      Show version information

This binary is the OpenCodeReview Desktop fixture CLI.
It does not call any model or paid API.
`;
}

function configUsage() {
  return `Configuration management.

Usage:
  ocr config set <key> <value>
  ocr config unset custom_providers.<name>  Delete a custom provider
  ocr config unset mcp_servers.<name>       Delete an MCP server
  ocr config provider                       Interactive provider setup
  ocr config model                          Interactive model selection

Supported keys: ${SUPPORTED_TOP}
Provider fields: api_key, url, protocol, model, models, auth_header, extra_body, extra_headers
MCP server fields: command, args, env, tools, setup
`;
}

appendArgvLog();
process.stderr.write(BANNER_STDERR);

const cmd = argv[0];
const rest = argv.slice(1);

async function main() {
  if (!cmd) {
    process.stdout.write(usage());
    return 0;
  }
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stderr.write("Error: unknown command: help\n");
    return 1;
  }
  if (cmd === "version" || cmd === "--version") {
    process.stdout.write(VERSION + "\n");
    return 0;
  }
  if (cmd === "config") {
    if (rest[0] === "--help" || rest[0] === "-h") {
      process.stderr.write("Error: unknown command: --help\n");
      return 1;
    }
    if (!rest[0]) {
      process.stdout.write(configUsage());
      return 0;
    }
    if (rest[0] === "set") {
      const key = rest[1];
      const value = rest.slice(2).join(" ");
      const v = validateKey(key);
      if (!v.ok) {
        process.stderr.write(v.error);
        return 1;
      }
      const cfg = readConfig();
      if (TOP_SIMPLE.has(key)) cfg[key] = value;
      else setDeep(cfg, key.split("."), value);
      writeConfig(cfg);
      process.stdout.write(`Set ${key} = ${redact(key, value)}\n`);
      return 0;
    }
    if (rest[0] === "unset") {
      const key = rest[1];
      const v = validateKey(key, { unset: true });
      if (!v.ok) {
        process.stderr.write(v.error);
        return 1;
      }
      const cfg = readConfig();
      unsetDeep(cfg, key.split("."));
      writeConfig(cfg);
      process.stdout.write(`Unset ${key}\n`);
      return 0;
    }
    process.stderr.write(`Error: unknown config subcommand: ${rest[0]}\n`);
    return 1;
  }
  if (cmd === "llm") {
    if (rest[0] === "--help" || rest[0] === "-h") {
      process.stderr.write("Error: unknown command: --help\n");
      return 1;
    }
    if (!rest[0]) {
      process.stdout.write(`LLM utility commands.

Usage:
  ocr llm <sub-command>

Sub-commands:
  test         Send a test conversation to the configured LLM model
  providers    List all built-in LLM providers
`);
      return 0;
    }
    if (rest[0] === "providers") {
      process.stdout.write(`
Built-in providers:
  NAME                 PROTOCOL   BASE URL
  ----                 --------   --------
  anthropic            anthropic  https://api.anthropic.com
  openai               openai     https://api.openai.com/v1
  dashscope            openai     https://dashscope.aliyuncs.com/compatible-mode/v1

Use 'ocr config provider' to configure a provider interactively.
`);
      return 0;
    }
    if (rest[0] === "test") {
      process.stdout.write(`Source: fixture
URL: https://example.invalid/v1
Model: fixture-model
Connection test successful
[OCR-FIXTURE-CLI] No network request was made. This is not a real LLM test.
`);
      return 0;
    }
    process.stderr.write(`Error: unknown llm subcommand: ${rest[0]}\n`);
    return 1;
  }
  if (cmd === "review" || cmd === "r" || cmd === "scan" || cmd === "s") {
    const kind = cmd === "scan" || cmd === "s" ? "scan" : "review";
    if (rest.includes("--help") || rest.includes("-h")) {
      process.stdout.write(`${kind} (fixture). Flags include --preview --resume --from --to --commit --path --exclude --timeout --rule --tools --format --repo\n`);
      return 0;
    }
    if (hasFlag("--preview") && hasFlag("--resume")) {
      process.stderr.write("Error: --preview and --resume cannot be used together\n");
      return 1;
    }
    if (hasFlag("--preview")) {
      const from = flagValue("--from");
      const to = flagValue("--to");
      if (from && to && from === "HEAD" && to === "HEAD") {
        process.stdout.write("No files changed.\n");
        writeAbortedPreviewSession(cwd);
        return 0;
      }
      process.stdout.write(renderPreview(kind));
      writeAbortedPreviewSession(cwd);
      return 0;
    }
    return runJsonReview(kind);
  }
  if (cmd === "session" || cmd === "sessions") {
    const sub = rest[0];
    const repoDir = flagValue("--repo") || cwd;
    if (sub === "list" || sub === "ls") {
      const items = listSessions(repoDir);
      if (hasFlag("--json")) process.stdout.write(JSON.stringify(items, null, 2) + "\n");
      else process.stdout.write(items.map((s) => s.session_id).join("\n") + "\n");
      return 0;
    }
    if (sub === "show") {
      const id = rest.filter((a) => a !== "show" && a !== "list" && a !== "ls" && a !== flagValue("--repo") && !String(a).startsWith("--")).at(-1);
      const detail = showSession(repoDir, id);
      if (!detail) return 1;
      process.stdout.write(JSON.stringify(detail, null, 2) + "\n");
      return 0;
    }
    process.stderr.write("Usage: ocr session list|show\n");
    return 0;
  }
  if (cmd === "rules") {
    if (rest[0] === "check") {
      const file = rest[1] || "";
      process.stdout.write(`File: ${file}
Source: fixture
Pattern: **/*
Rule:
  Fixture rule only. Not a real review rule. Not from a model.
`);
      return 0;
    }
    process.stdout.write("rules (fixture): use `rules check <file>`\n");
    return 0;
  }
  process.stderr.write(`Error: unknown command: ${cmd}\n`);
  return 1;
}

const code = await main();
process.exit(code);
