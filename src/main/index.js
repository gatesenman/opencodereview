import electron from "electron";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  listBinaryCandidates,
  resolveBinaryPath,
  describeBinaryStatus
} from "../shared/binary.mjs";
import { windowBackground, normalizeTheme } from "../shared/themeTokens.mjs";
import { createOcrRuntime } from "./ocrService.mjs";

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

const runtime = createOcrRuntime({
  resolveBinary: () => resolveBinary()
});

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
  const currentRaw = await runtime.version();
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

function registerIpc() {
  electron.ipcMain.handle("app:version", () => runtime.version());
  electron.ipcMain.handle("binary:status", () => binaryStatus());

  electron.ipcMain.handle("config:read", () => runtime.readConfig());
  electron.ipcMain.handle("config:set", async (_e, key, value) => runtime.setConfig(key, value));
  electron.ipcMain.handle("config:unset", async (_e, key) => runtime.unsetConfig(key));
  electron.ipcMain.handle("llm:providers", async () => runtime.listProviders());
  electron.ipcMain.handle("llm:test", async () => runtime.testLlm());
  electron.ipcMain.handle("review:preview", (_e, o) => runtime.reviewPreview(o));
  electron.ipcMain.handle("scan:preview", (_e, o) => runtime.scanPreview(o));
  electron.ipcMain.handle("review:start", (e, o, total) => {
    const win = electron.BrowserWindow.fromWebContents(e.sender);
    return runtime.startKind("review", o, total, {
      onProgress: (ev) => win?.webContents.send("ocr:progress", ev)
    });
  });
  electron.ipcMain.handle("scan:start", (e, o, total) => {
    const win = electron.BrowserWindow.fromWebContents(e.sender);
    return runtime.startKind("scan", o, total, {
      onProgress: (ev) => win?.webContents.send("ocr:progress", ev)
    });
  });
  const onCancel = (_e, runId) => runtime.cancel(runId);
  electron.ipcMain.on("run:cancel", onCancel);
  electron.ipcMain.handle("run:cancel", (_e, runId) => {
    onCancel(_e, runId);
    return true;
  });
  electron.ipcMain.handle("session:list", async (_e, repoDir) => runtime.listSessions(repoDir));
  electron.ipcMain.handle("session:show", async (_e, repoDir, id) => runtime.showSession(repoDir, id));
  electron.ipcMain.handle("session:open", async (_e, repoDir, id) => runtime.openSession(repoDir, id));
  electron.ipcMain.handle("rules:check", async (_e, repoDir, file) => runtime.checkRules(repoDir, file));
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
