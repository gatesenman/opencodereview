import path from "path";
import crypto from "crypto";
import child_process from "child_process";
import fs from "fs";
import os from "os";
import { validateConfigMutation } from "../shared/configKeys.mjs";
import { explainSpawnError } from "../shared/binary.mjs";
import {
  buildReviewArgs,
  buildScanArgs,
  parseJsonResult,
  parsePreview,
  previewLooksEmpty
} from "../shared/cliArgs.mjs";
import { cancelledError, isCancelError } from "../shared/runErrors.mjs";
import { isCancelledExit } from "../shared/runOutcome.mjs";
import { createRunLock } from "../shared/runLock.mjs";
import { mapSessionToResult, parseJsonl, parseSessionList, resultTitleFromSession } from "../shared/sessionResults.mjs";

/**
 * Main-process OCR runtime, split out so Node integration tests can
 * exercise spawn → config/session/review paths without importing Electron.
 */
export function createOcrRuntime(deps = {}) {
  const fsMod = deps.fs ?? fs;
  const pathMod = deps.path ?? path;
  const spawnFn = deps.spawn ?? child_process.spawn;
  const platform = deps.platform ?? process.platform;
  const envBase = deps.env ?? process.env;
  const homedir = deps.homedir ?? (() => os.homedir());
  const resolveBinary = deps.resolveBinary ?? (() => "ocr");
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const runLock = deps.runLock ?? createRunLock();
  const now = deps.now ?? (() => Date.now());

  function ocrHome() {
    return pathMod.join(homedir(), ".opencodereview");
  }
  function configPath() {
    return pathMod.join(ocrHome(), "config.json");
  }
  function sessionsRoot() {
    return pathMod.join(ocrHome(), "sessions");
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
  function sessionsDirForRepo(repoDir) {
    return pathMod.join(sessionsRoot(), encodeRepoPath(repoDir));
  }

  function baseEnv() {
    return { ...envBase, OCR_NO_UPDATE: "1" };
  }

  function killProcessTree(child) {
    if (!child?.pid) return;
    if (platform === "win32") {
      spawnFn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
      return;
    }
    const pid = child.pid;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
    const killer = setTimeout(() => {
      try {
        if (child.exitCode == null && child.signalCode == null) {
          process.kill(pid, "SIGKILL");
        }
      } catch {
        /* already gone */
      }
    }, 400);
    if (typeof killer.unref === "function") killer.unref();
    child.once("close", () => clearTimeout(killer));
  }

  function run(args, opts = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const child = spawnFn(resolveBinary(), args, {
        cwd: opts.cwd,
        env: opts.env ?? baseEnv(),
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => {
        const s = d.toString();
        stdout += s;
        opts.onStdout?.(s);
      });
      child.stderr?.on("data", (d) => {
        const s = d.toString();
        stderr += s;
        opts.onStderr?.(s);
      });

      const onAbort = () => {
        killProcessTree(child);
      };
      if (opts.signal) {
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener("abort", onAbort, { once: true });
      }

      child.on("error", (err) => {
        if (opts.signal?.aborted) {
          finish({ ok: false, cancelled: true, code: null, stdout, stderr });
          return;
        }
        const message = explainSpawnError(err, { platform });
        finish({ ok: false, code: null, stdout, stderr: stderr ? `${stderr}\n${message}` : message });
      });
      child.on("close", (code) => {
        if (opts.signal?.aborted) {
          finish({ ok: false, cancelled: true, code, stdout, stderr });
          return;
        }
        finish({ ok: code === 0, code, stdout, stderr });
      });
    });
  }

  async function version() {
    const r = await run(["version"]);
    return (r.stdout || r.stderr).trim();
  }

  async function reviewPreview(o) {
    const args = buildReviewArgs(o, { preview: true });
    const r = await run(args, { cwd: o.repoDir });
    if (!r.ok && previewLooksEmpty(r.stdout)) {
      throw new Error(r.stderr.trim() || "preview failed");
    }
    return parsePreview(r.stdout);
  }

  async function scanPreview(o) {
    const args = buildScanArgs(o, { preview: true });
    const r = await run(args, { cwd: o.repoDir });
    if (!r.ok && previewLooksEmpty(r.stdout)) {
      throw new Error(r.stderr.trim() || "scan preview failed");
    }
    return parsePreview(r.stdout);
  }

  function countSessionProgress(file) {
    const p = { completed: 0, reused: 0, failed: 0 };
    let data = "";
    try {
      data = fsMod.readFileSync(file, "utf8");
    } catch {
      return p;
    }
    for (const line of data.split("\n")) {
      if (!line.trim()) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      const f = rec.filePath || rec.newPath || rec.file_path || rec.new_path;
      switch (rec.type) {
        case "review_item_done":
          p.completed++;
          if (f) p.currentFile = f;
          break;
        case "review_item_reused":
          p.reused++;
          if (f) p.currentFile = f;
          break;
        case "review_item_failed":
          p.failed++;
          if (f) p.currentFile = f;
          break;
      }
    }
    return p;
  }

  function newestSessionFile(repoDir, since) {
    const dir = sessionsDirForRepo(repoDir);
    let best = null;
    let bestMtime = since - 1;
    try {
      for (const name of fsMod.readdirSync(dir)) {
        if (!name.endsWith(".jsonl")) continue;
        const full = pathMod.join(dir, name);
        const m = fsMod.statSync(full).mtimeMs;
        if (m >= since && m > bestMtime) {
          bestMtime = m;
          best = full;
        }
      }
    } catch {
      return null;
    }
    return best;
  }

  function findSessionJsonl(repoDir, sessionId) {
    if (!sessionId) return null;
    const dir = sessionsDirForRepo(repoDir);
    const exact = [pathMod.join(dir, `${sessionId}.jsonl`), pathMod.join(dir, sessionId)];
    for (const p of exact) {
      if (fsMod.existsSync(p) && fsMod.statSync(p).isFile()) return p;
    }
    try {
      const names = fsMod.readdirSync(dir);
      const match = names.find((n) => n.includes(sessionId) && n.endsWith(".jsonl"));
      if (match) return pathMod.join(dir, match);
    } catch {
      return null;
    }
    return null;
  }

  async function runStreaming(args, cwd, opts) {
    const started = now();
    let sessionFile = null;
    const emit = (phase, extra = {}) => {
      opts.onProgress({
        runId: opts.runId,
        phase,
        total: opts.total,
        completed: 0,
        reused: 0,
        failed: 0,
        elapsedMs: now() - started,
        ...extra
      });
    };
    emit("starting");
    const poll = setInterval(() => {
      if (opts.signal?.aborted) return;
      if (!sessionFile) sessionFile = newestSessionFile(cwd, started - 2000);
      if (!sessionFile) {
        emit("reviewing");
        return;
      }
      const p = countSessionProgress(sessionFile);
      emit("reviewing", {
        completed: p.completed,
        reused: p.reused,
        failed: p.failed,
        currentFile: p.currentFile
      });
    }, deps.progressIntervalMs ?? 500);

    try {
      const r = await run(args, { cwd, signal: opts.signal });
      // Prefer an explicit cancel over a successful parse. A late CLI exit 0
      // must not be shown as a completed review if the user already cancelled.
      if (isCancelledExit(r, opts.signal)) {
        emit("cancelled", { message: "Run cancelled" });
        throw cancelledError("Run cancelled");
      }
      if (!r.ok && !r.stdout.trim()) {
        emit("error", { message: r.stderr.trim() });
        throw new Error(r.stderr.trim() || `ocr exited with code ${r.code}`);
      }
      const parsed = parseJsonResult(r.stdout);
      if (isCancelledExit(r, opts.signal)) {
        emit("cancelled", { message: "Run cancelled" });
        throw cancelledError("Run cancelled");
      }
      if (!parsed) {
        emit("error", { message: r.stderr.trim() || "could not parse result" });
        throw new Error(r.stderr.trim() || "could not parse review result JSON");
      }
      emit("done", {
        completed: parsed.summary?.files_reviewed ?? 0,
        message: parsed.message
      });
      return parsed;
    } finally {
      clearInterval(poll);
    }
  }

  function readConfigRaw(p) {
    try {
      return fsMod.readFileSync(p, "utf8");
    } catch {
      return null;
    }
  }

  function parseProvidersTable(text) {
    const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
    const out = [];
    for (const line of clean.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || /^NAME\b/.test(t) || /^-+/.test(t)) continue;
      const cols = t.split(/\s{2,}/);
      if (cols.length >= 3 && /^https?:\/\//.test(cols[2])) {
        out.push({ name: cols[0], protocol: cols[1], base_url: cols[2] });
      }
    }
    return out;
  }

  function parseLlmTest(stdout, stderr, ok) {
    if (!ok) return { ok: false, error: (stderr || stdout).trim() };
    const result = { ok: true };
    const contentLines = [];
    for (const line of stdout.split(/\r?\n/)) {
      const src = /^Source:\s*(.*)$/.exec(line);
      const url = /^URL:\s*(.*)$/.exec(line);
      const model = /^Model:\s*(.*)$/.exec(line);
      if (src) result.source = src[1].trim();
      else if (url) result.url = url[1].trim();
      else if (model) result.model = model[1].trim();
      else if (/Connection test successful/.test(line)) continue;
      else if (line.trim()) contentLines.push(line);
    }
    result.content = contentLines.join("\n").trim();
    return result;
  }

  function parseRuleDetail(stdout) {
    const clean = stdout.replace(/\x1b\[[0-9;]*m/g, "");
    const lines = clean.split(/\r?\n/);
    const detail = { file: "", source: "", pattern: "", rule: "" };
    const ruleLines = [];
    let inRule = false;
    for (const line of lines) {
      if (/^File:\s*/.test(line)) detail.file = line.replace(/^File:\s*/, "").trim();
      else if (/^Source:\s*/.test(line)) detail.source = line.replace(/^Source:\s*/, "").trim();
      else if (/^Pattern:\s*/.test(line)) detail.pattern = line.replace(/^Pattern:\s*/, "").trim();
      else if (/^Rule:\s*$/.test(line)) inRule = true;
      else if (/^─+$/.test(line)) continue;
      else if (inRule) ruleLines.push(line);
    }
    detail.rule = ruleLines.join("\n").trim();
    return detail;
  }

  function serializeIpcError(err) {
    if (isCancelError(err)) {
      const e = new Error(err.message || "Run cancelled");
      e.code = "OCR_CANCELLED";
      return e;
    }
    return err;
  }

  async function startKind(kind, o, total, hooks = {}) {
    const runId = o.runId || randomUUID();
    const slot = runLock.begin(runId);
    if (slot.cancelled) {
      throw cancelledError("Run cancelled");
    }
    if (slot.busy) {
      throw new Error("A review or scan is already running. Cancel it before starting another.");
    }
    const args = kind === "scan" ? buildScanArgs(o, { json: true }) : buildReviewArgs(o, { json: true });
    try {
      return await runStreaming(args, o.repoDir, {
        runId,
        total,
        signal: slot.controller.signal,
        onProgress: (ev) => hooks.onProgress?.(ev)
      });
    } catch (err) {
      throw serializeIpcError(err);
    } finally {
      runLock.end(runId);
    }
  }

  function readConfig() {
    const raw = readConfigRaw(configPath());
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async function setConfig(key, value) {
    const mutation = validateConfigMutation(key, value);
    if (!mutation.ok) throw new Error(mutation.error);
    const r = await run(["config", "set", mutation.key, String(mutation.value)]);
    if (!r.ok) throw new Error((r.stderr || r.stdout).trim() || "config set failed");
    return { ok: true, key: mutation.key };
  }

  async function unsetConfig(key) {
    const mutation = validateConfigMutation(key, "", { unset: true });
    if (!mutation.ok) throw new Error(mutation.error);
    const r = await run(["config", "unset", mutation.key]);
    if (!r.ok) throw new Error((r.stderr || r.stdout).trim() || "config unset failed");
    return { ok: true, key: mutation.key };
  }

  async function listProviders() {
    const r = await run(["llm", "providers"]);
    return parseProvidersTable(r.stdout);
  }

  async function testLlm() {
    const r = await run(["llm", "test"]);
    return parseLlmTest(r.stdout, r.stderr, r.ok);
  }

  async function listSessions(repoDir) {
    const r = await run(["session", "list", "--json", "--limit", "0"], { cwd: repoDir });
    if (!r.ok && !r.stdout.trim()) throw new Error((r.stderr || "").trim() || "session list failed");
    return parseSessionList(r.stdout);
  }

  async function showSession(repoDir, id) {
    const r = await run(["session", "show", "--json", id], { cwd: repoDir });
    if (!r.ok && !r.stdout.trim()) throw new Error((r.stderr || "").trim());
    return JSON.parse(r.stdout);
  }

  async function openSession(repoDir, id) {
    const r = await run(["session", "show", "--json", id], { cwd: repoDir });
    if (!r.ok && !r.stdout.trim()) throw new Error((r.stderr || "").trim());
    let detail;
    try {
      detail = JSON.parse(r.stdout);
    } catch {
      throw new Error((r.stderr || "").trim() || "could not parse session JSON");
    }
    const jsonlPath = findSessionJsonl(repoDir, id);
    let records = [];
    if (jsonlPath) {
      try {
        records = parseJsonl(fsMod.readFileSync(jsonlPath, "utf8"));
      } catch {
        records = [];
      }
    }
    const result = mapSessionToResult(detail, records);
    return {
      detail,
      result,
      title: resultTitleFromSession(detail),
      sourceFile: jsonlPath
    };
  }

  async function checkRules(repoDir, file) {
    const r = await run(["rules", "check", file], { cwd: repoDir });
    if (!r.ok && !r.stdout.trim()) throw new Error((r.stderr || "").trim());
    return parseRuleDetail(r.stdout);
  }

  function cancel(runId) {
    runLock.cancel(runId);
    return true;
  }

  return {
    run,
    version,
    reviewPreview,
    scanPreview,
    startKind,
    cancel,
    readConfig,
    setConfig,
    unsetConfig,
    listProviders,
    testLlm,
    listSessions,
    showSession,
    openSession,
    checkRules,
    parseProvidersTable,
    parseLlmTest,
    parseRuleDetail,
    encodeRepoPath,
    configPath,
    sessionsDirForRepo,
    findSessionJsonl,
    runLock,
    serializeIpcError
  };
}
