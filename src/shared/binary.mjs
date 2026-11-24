import path from "node:path";

function pathApi(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function cliBinaryName(platform) {
  return platform === "win32" ? "opencodereview.exe" : "opencodereview";
}

function shortBinaryName(platform) {
  return platform === "win32" ? "ocr.exe" : "ocr";
}

function listBinaryCandidates({
  platform = "linux",
  packaged = false,
  appPath = "",
  cwd = "",
  resourcesPath = "",
  configured = ""
} = {}) {
  const join = pathApi(platform).join;
  const binName = cliBinaryName(platform);
  const out = [];
  const add = (p, source) => {
    if (p) out.push({ path: p, source });
  };
  if (configured) add(configured, "settings");
  if (resourcesPath) add(join(resourcesPath, "bin", binName), "resources");
  if (!packaged) {
    if (cwd) add(join(cwd, "resources", "bin", binName), "dev-cwd");
    if (appPath) {
      add(join(appPath, "resources", "bin", binName), "dev-app");
      add(join(appPath, "..", "resources", "bin", binName), "dev-app-parent");
      add(join(appPath, "..", "dist", binName), "dev-dist");
      add(join(appPath, "..", "..", "dist", binName), "dev-dist-up");
    }
  }
  add(binName, "path-fullname");
  add(shortBinaryName(platform), "path-short");
  return out;
}

function isPathLookup(source) {
  return source === "path-fullname" || source === "path-short";
}

function pickExistingBinary(candidates, existsFn) {
  for (const c of candidates) {
    if (isPathLookup(c.source)) continue;
    try {
      if (existsFn(c.path)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function resolveBinaryPath(candidates, existsFn) {
  const found = pickExistingBinary(candidates, existsFn);
  if (found) return found.path;
  const fallback = candidates.find((c) => c.source === "path-short") || candidates.at(-1);
  return fallback?.path || "ocr";
}

function explainSpawnError(err, { platform = "linux" } = {}) {
  const code = err?.code || "";
  const msg = String(err?.message || err || "");
  if (code === "ENOENT" || /ENOENT/i.test(msg) || /not found/i.test(msg)) {
    const exe = cliBinaryName(platform);
    if (platform === "win32") {
      return `OpenCodeReview CLI was not found (${exe}). In Settings, set the path to the official opencodereview.exe, or add it to PATH. This source tree does not ship the CLI.`;
    }
    return `OpenCodeReview CLI was not found (${exe} / ocr). Set the binary path in Settings, place it in resources/bin/, or add it to PATH. This source tree does not ship the CLI.`;
  }
  return msg || "Failed to start the OpenCodeReview CLI.";
}

function describeBinaryStatus(candidates, existsFn) {
  const found = pickExistingBinary(candidates, existsFn);
  if (found) {
    return { ok: true, found: true, path: found.path, source: found.source };
  }
  const fallback = resolveBinaryPath(candidates, existsFn);
  return {
    ok: false,
    found: false,
    path: fallback,
    source: "path",
    hint: explainSpawnError({ code: "ENOENT" }, { platform: fallback.endsWith(".exe") ? "win32" : "linux" })
  };
}

export {
  cliBinaryName,
  shortBinaryName,
  listBinaryCandidates,
  pickExistingBinary,
  resolveBinaryPath,
  explainSpawnError,
  describeBinaryStatus,
  isPathLookup
};
