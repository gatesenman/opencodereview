import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "out" || name === "dist") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("source hygiene", () => {
  it("keeps the package private and free of obvious credentials", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(pkg.private, true);
    const raw = JSON.stringify(pkg);
    assert.doesNotMatch(raw, /sk-[A-Za-z0-9]{8,}/);
    assert.doesNotMatch(raw, /BEGIN (RSA |OPENSSH )?PRIVATE/);
  });

  it("ignores secrets, build output, and CLI binaries", () => {
    const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    for (const line of ["node_modules/", "out/", ".env", ".opencodereview/", "resources/bin/*"]) {
      assert.match(gi, new RegExp(line.replace(/[.*/]/g, (c) => `\\${c}`)));
    }
  });

  it("does not ship env files, user config, or CLI binaries in source", () => {
    const files = walk(root).map((f) => path.relative(root, f));
    const bannedName = /(^|\/)\.env($|\.)|(^|\/)config\.json$|\.exe$|(^|\/)opencodereview$/i;
    const hits = files.filter((f) => bannedName.test(f) && f !== "resources/bin/README.md");
    assert.deepEqual(hits, []);
    const textRoots = files.filter((f) => /\.(js|mjs|jsx|md|json|css|html)$/.test(f) && !f.startsWith("package-lock"));
    for (const rel of textRoots) {
      const text = fs.readFileSync(path.join(root, rel), "utf8");
      assert.doesNotMatch(text, /BEGIN (RSA |OPENSSH )?PRIVATE KEY/);
      // allow the word api_key as a field name; forbid obvious live tokens
      assert.doesNotMatch(text, /sk-(live|prod|test)-[A-Za-z0-9]{8,}/);
    }
  });
});
