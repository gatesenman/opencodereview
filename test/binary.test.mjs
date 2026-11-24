import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  listBinaryCandidates,
  resolveBinaryPath,
  explainSpawnError,
  describeBinaryStatus,
  cliBinaryName
} from "../src/shared/binary.mjs";

describe("listBinaryCandidates", () => {
  it("prefers a configured path, then resources/bin, then PATH names", () => {
    const list = listBinaryCandidates({
      platform: "win32",
      packaged: true,
      resourcesPath: "C:\\\\app\\\\resources",
      configured: "D:\\\\tools\\\\opencodereview.exe"
    });
    assert.equal(list[0].path, "D:\\\\tools\\\\opencodereview.exe");
    assert.equal(list[0].source, "settings");
    assert.equal(list[1].source, "resources");
    assert.ok(list[1].path.replace(/\\/g, "/").endsWith("resources/bin/opencodereview.exe"));
    assert.equal(list.at(-1).path, "ocr.exe");
    assert.ok(!list.some((c) => c.source.startsWith("dev-")));
  });

  it("includes dev resources/bin slots when unpackaged", () => {
    const list = listBinaryCandidates({
      platform: "linux",
      packaged: false,
      cwd: "/proj",
      appPath: "/proj/out/main"
    });
    const sources = list.map((c) => c.source);
    assert.ok(sources.includes("dev-cwd"));
    assert.equal(
      list.find((c) => c.source === "dev-cwd").path,
      "/proj/resources/bin/opencodereview"
    );
  });
});

describe("resolveBinaryPath / describeBinaryStatus", () => {
  it("picks the first existing candidate and explains ENOENT", () => {
    const list = listBinaryCandidates({
      platform: "linux",
      packaged: false,
      cwd: "/proj",
      configured: "/missing/ocr"
    });
    const exists = (p) => p === "/proj/resources/bin/opencodereview";
    assert.equal(resolveBinaryPath(list, exists), "/proj/resources/bin/opencodereview");
    const status = describeBinaryStatus(list, exists);
    assert.equal(status.ok, true);
    assert.equal(status.source, "dev-cwd");
  });

  it("falls back to the short PATH name when nothing exists on disk", () => {
    const list = listBinaryCandidates({ platform: "linux", packaged: true });
    assert.equal(resolveBinaryPath(list, () => false), "ocr");
    const status = describeBinaryStatus(list, () => false);
    assert.equal(status.ok, false);
    assert.match(status.hint, /not found/i);
  });
});

describe("explainSpawnError", () => {
  it("turns ENOENT into a Settings/PATH hint and leaves other errors alone", () => {
    const win = explainSpawnError({ code: "ENOENT", message: "spawn ocr.exe ENOENT" }, { platform: "win32" });
    assert.match(win, /opencodereview\.exe/);
    assert.match(win, /Settings/);
    assert.equal(explainSpawnError({ message: "permission denied" }), "permission denied");
    assert.equal(cliBinaryName("win32"), "opencodereview.exe");
  });
});
