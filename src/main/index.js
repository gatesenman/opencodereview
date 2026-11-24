import electron from "electron";
import path from "path";
import crypto from "crypto";
import child_process from "child_process";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { validateConfigMutation } from "../shared/configKeys.mjs";
import {
  listBinaryCandidates,
  resolveBinaryPath,
  explainSpawnError,
  describeBinaryStatus
} from "../shared/binary.mjs";
import {
  buildReviewArgs,
  buildScanArgs,
  parseJsonResult,
  parsePreview,
  previewLooksEmpty
} from "../shared/cliArgs.mjs";
import { cancelledError, isCancelError } from "../shared/runErrors.mjs";
import { createRunLock } from "../shared/runLock.mjs";
import { windowBackground, normalizeTheme } from "../shared/themeTokens.mjs";
import { mapSessionToResult, parseJsonl, parseSessionList, resultTitleFromSession } from "../shared/sessionResults.mjs";

function ocrHome() {
  return path.join(os.homedir(), ".opencodereview");
}
function configPath() {
  return path.join(ocrHome(), "config.json");
}
function sessionsRoot() {
  return path.join(ocrHome(), "sessions");
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
  return path.join(sessionsRoot(), encodeRepoPath(repoDir));
}
function settingsPath() {
  return path.join(electron.app.getPath("userData"), "settings.json");
}

let cache = null;
function loadSettings() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    cache = {};
  }
  return cache;
}
function saveSettings(next) {
  cache = { ...loadSettings(), ...next };
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2), "utf8");
  return cache;
}

function currentBinaryCandidates() {
  return listBinaryCandidates({
    platform: process.platform,
    packaged: Boolean(electron.app?.isPackaged),
    appPath: electron.app?.getAppPath?.() || process.cwd(),
    cwd: process.cwd(),
    resourcesPath: process.resourcesPath || "",
    configured: loadSettings().binaryPath
  });
}

function resolveBinary() {
  return resolveBinaryPath(currentBinaryCandidates(), (p) => fs.existsSync(p));
}

function binaryStatus() {
  return describeBinaryStatus(currentBinaryCandidates(), (p) => fs.existsSync(p));
}

function baseEnv() {
  return { ...process.env, OCR_NO_UPDATE: "1" };
}

function killProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    child_process.spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    return;
  }
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function run(args, opts = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = child_process.spawn(resolveBinary(), args, {
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
      const message = explainSpawnError(err, { platform: process.platform });
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
    data = fs.readFileSync(file, "utf8");
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
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const full = path.join(dir, name);
      const m = fs.statSync(full).mtimeMs;
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
  const exact = [
    path.join(dir, `${sessionId}.jsonl`),
    path.join(dir, sessionId)
  ];
  for (const p of exact) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  try {
    const names = fs.readdirSync(dir);
    const match = names.find((n) => n.includes(sessionId) && n.endsWith(".jsonl"));
    if (match) return path.join(dir, match);
  } catch {
    return null;
  }
  return null;
}

async function runStreaming(args, cwd, opts) {
  const started = Date.now();
  let sessionFile = null;
  const emit = (phase, extra = {}) => {
    opts.onProgress({
      runId: opts.runId,
      phase,
      total: opts.total,
      completed: 0,
      reused: 0,
      failed: 0,
      elapsedMs: Date.now() - started,
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
  }, 500);

  try {
    const r = await run(args, { cwd, signal: opts.signal });
    if (r.cancelled || opts.signal?.aborted) {
      emit("cancelled", { message: "Run cancelled" });
      throw cancelledError("Run cancelled");
    }
    if (!r.ok && !r.stdout.trim()) {
      emit("error", { message: r.stderr.trim() });
      throw new Error(r.stderr.trim() || `ocr exited with code ${r.code}`);
    }
    const parsed = parseJsonResult(r.stdout);
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
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

const REPO = "alibaba/open-code-review";
const URL_PATTERN = "https://github.com/alibaba/open-code-review/releases/download/v{version}/opencodereview-{os}-{arch}";
const CHECKSUM_PATTERN = "https://github.com/alibaba/open-code-review/releases/download/v{version}/sha256sum.txt";

function osToken() {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "darwin";
    default:
      return "linux";
  }
}
function archToken() {
  return process.arch === "arm64" ? "arm64" : "amd64";
}
function assetName() {
  const base = `opencodereview-${osToken()}-${archToken()}`;
  return process.platform === "win32" ? `${base}.exe` : base;
}
function fillPattern(pattern, version2) {
  return pattern.replace("{version}", version2).replace("{os}", osToken()).replace("{arch}", archToken());
}
function parseCliVersion(raw) {
  const m = /open-code-review\s+(\S+)/.exec(raw);
  return m ? m[1] : raw.trim();
}
function normalize(v) {
  return v.replace(/^v/, "").trim();
}
function compareSemver(a, b) {
  const pa = normalize(a).split(/[.+-]/).map((n) => parseInt(n, 10));
  const pb = normalize(b).split(/[.+-]/).map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return 0;
    if (x !== y) return x - y;
  }
  return 0;
}

async function checkForUpdates() {
  const currentRaw = await version();
  const currentVersion = parseCliVersion(currentRaw);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "ocr-desktop" }
    });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const data = await res.json();
    const tag = data.tag_name || "";
    const latestVersion = normalize(tag);
    const hasUpdate = currentVersion !== "dev" && latestVersion !== "" && compareSemver(latestVersion, currentVersion) > 0;
    return {
      currentVersion,
      latestVersion,
      hasUpdate,
      downloadUrl: fillPattern(URL_PATTERN, latestVersion),
      checksumUrl: fillPattern(CHECKSUM_PATTERN, latestVersion),
      notes: data.body
    };
  } catch (err) {
    return { currentVersion, hasUpdate: false, error: String(err) };
  }
}

async function fetchChecksum(url, asset) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ocr-desktop" } });
    if (!res.ok) return null;
    const txt = await res.text();
    for (const line of txt.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && parts[1].replace(/^\*/, "").endsWith(asset)) {
        return parts[0].toLowerCase();
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function downloadUpdate(info) {
  if (!info.downloadUrl || !info.latestVersion) {
    return { ok: false, error: "no download URL" };
  }
  try {
    const res = await fetch(info.downloadUrl, { headers: { "User-Agent": "ocr-desktop" } });
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const expected = info.checksumUrl ? await fetchChecksum(info.checksumUrl, assetName()) : null;
    if (expected) {
      const actual = crypto.createHash("sha256").update(buf).digest("hex");
      if (actual !== expected) {
        return { ok: false, error: `checksum mismatch (expected ${expected}, got ${actual})` };
      }
    }
    const binDir = path.join(electron.app.getPath("userData"), "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const target = path.join(binDir, process.platform === "win32" ? "opencodereview.exe" : "opencodereview");
    fs.writeFileSync(target, buf);
    if (process.platform !== "win32") fs.chmodSync(target, 0o755);
    saveSettings({ binaryPath: target });
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

const runLock = createRunLock();

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

async function startKind(kind, e, o, total) {
  const runId = o.runId || crypto.randomUUID();
  const slot = runLock.begin(runId);
  if (slot.cancelled) {
    throw cancelledError("Run cancelled");
  }
  if (slot.busy) {
    throw new Error("A review or scan is already running. Cancel it before starting another.");
  }
  const win = electron.BrowserWindow.fromWebContents(e.sender);
  const args = kind === "scan" ? buildScanArgs(o, { json: true }) : buildReviewArgs(o, { json: true });
  try {
    return await runStreaming(args, o.repoDir, {
      runId,
      total,
      signal: slot.controller.signal,
      onProgress: (ev) => win?.webContents.send("ocr:progress", ev)
    });
  } catch (err) {
    throw serializeIpcError(err);
  } finally {
    runLock.end(runId);
  }
}

function registerIpc() {
  electron.ipcMain.handle("app:version", () => version());
  electron.ipcMain.handle("binary:status", () => binaryStatus());

  electron.ipcMain.handle("config:read", () => {
    const raw = readConfigRaw(configPath());
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  });
  electron.ipcMain.handle("config:set", async (_e, key, value) => {
    const mutation = validateConfigMutation(key, value);
    if (!mutation.ok) throw new Error(mutation.error);
    const r = await run(["config", "set", mutation.key, String(mutation.value)]);
    if (!r.ok) throw new Error((r.stderr || r.stdout).trim() || "config set failed");
    return { ok: true, key: mutation.key };
  });
  electron.ipcMain.handle("config:unset", async (_e, key) => {
    const mutation = validateConfigMutation(key, "", { unset: true });
    if (!mutation.ok) throw new Error(mutation.error);
    const r = await run(["config", "unset", mutation.key]);
    if (!r.ok) throw new Error((r.stderr || r.stdout).trim() || "config unset failed");
    return { ok: true, key: mutation.key };
  });
  electron.ipcMain.handle("llm:providers", async () => {
    const r = await run(["llm", "providers"]);
    return parseProvidersTable(r.stdout);
  });
  electron.ipcMain.handle("llm:test", async () => {
    const r = await run(["llm", "test"]);
    return parseLlmTest(r.stdout, r.stderr, r.ok);
  });
  electron.ipcMain.handle("review:preview", (_e, o) => reviewPreview(o));
  electron.ipcMain.handle("scan:preview", (_e, o) => scanPreview(o));
  electron.ipcMain.handle("review:start", (e, o, total) => startKind("review", e, o, total));
  electron.ipcMain.handle("scan:start", (e, o, total) => startKind("scan", e, o, total));
  electron.ipcMain.handle("run:cancel", (_e, runId) => {
    runLock.cancel(runId);
    return true;
  });
  electron.ipcMain.handle("session:list", async (_e, repoDir) => {
    const r = await run(["session", "list", "--json", "--limit", "0"], { cwd: repoDir });
    if (!r.ok && !r.stdout.trim()) throw new Error((r.stderr || "").trim() || "session list failed");
    return parseSessionList(r.stdout);
  });
  electron.ipcMain.handle("session:show", async (_e, repoDir, id) => {
    const r = await run(["session", "show", "--json", id], { cwd: repoDir });
    if (!r.ok && !r.stdout.trim()) throw new Error((r.stderr || "").trim());
    return JSON.parse(r.stdout);
  });
  electron.ipcMain.handle("session:open", async (_e, repoDir, id) => {
    const r = await run(["session", "show", "--json", id], { cwd: repoDir });
    if (!r.ok && !r.stdout.trim()) throw new Error((r.stderr || "").trim());
    let detail;
    try {
      detail = JSON.parse(r.stdout);
    } catch (err) {
      throw new Error((r.stderr || "").trim() || "could not parse session JSON");
    }
    const jsonlPath = findSessionJsonl(repoDir, id);
    let records = [];
    if (jsonlPath) {
      try {
        records = parseJsonl(fs.readFileSync(jsonlPath, "utf8"));
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
  });
  electron.ipcMain.handle("rules:check", async (_e, repoDir, file) => {
    const r = await run(["rules", "check", file], { cwd: repoDir });
    if (!r.ok && !r.stdout.trim()) throw new Error((r.stderr || "").trim());
    return parseRuleDetail(r.stdout);
  });
  electron.ipcMain.handle("update:check", () => checkForUpdates());
  electron.ipcMain.handle("update:download", (_e, info) => downloadUpdate(info));
  electron.ipcMain.handle("settings:get", () => loadSettings());
  electron.ipcMain.handle("settings:set", (e, next) => {
    const saved = saveSettings(next);
    if (next && next.theme) {
      const win = electron.BrowserWindow.fromWebContents(e.sender);
      win?.setBackgroundColor(windowBackground(normalizeTheme(saved.theme)));
    }
    return saved;
  });
  electron.ipcMain.handle("dialog:openDir", async (e) => {
    const win = electron.BrowserWindow.fromWebContents(e.sender);
    const res = await electron.dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    return res.canceled ? null : res.filePaths[0];
  });
  electron.ipcMain.handle("dialog:openFile", async (e) => {
    const win = electron.BrowserWindow.fromWebContents(e.sender);
    const res = await electron.dialog.showOpenDialog(win, { properties: ["openFile"] });
    return res.canceled ? null : res.filePaths[0];
  });
  electron.ipcMain.handle("shell:openExternal", (_e, url) => electron.shell.openExternal(url));
  electron.ipcMain.handle("shell:openPath", (_e, p) => electron.shell.openPath(p));
}

function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: windowBackground(loadSettings().theme),
    title: "OpenCodeReview",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

electron.app.whenReady().then(() => {
  registerIpc();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
