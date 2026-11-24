import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cancelledError, isCancelError, errorMessage } from "../src/shared/runErrors.mjs";

describe("isCancelError", () => {
  it("detects the dedicated cancel error", () => {
    assert.equal(isCancelError(cancelledError()), true);
  });

  it("detects AbortError and cancelled messages", () => {
    const a = new Error("The operation was aborted");
    a.name = "AbortError";
    assert.equal(isCancelError(a), true);
    assert.equal(isCancelError(new Error("Run cancelled")), true);
    assert.equal(isCancelError(new Error("preview failed")), false);
  });

  it("formats messages", () => {
    assert.equal(errorMessage(new Error("boom")), "boom");
    assert.equal(errorMessage("x"), "x");
  });
});

import { redactSecrets, classifyRunError, formatElapsedSeconds } from "../src/shared/runErrors.mjs";

describe("redactSecrets and classifyRunError", () => {
  it("strips api keys and tokens from error text", () => {
    const out = redactSecrets("api_key=sk-abcdefghijklmnopqrstuvwxyz and password: hunter2");
    assert.match(out, /api_key=\*\*\*/);
    assert.match(out, /password=\*\*\*/);
    assert.equal(out.includes("hunter2"), false);
    assert.equal(out.includes("sk-abcdefghijklmnopqrstuvwxyz"), false);
    assert.equal(redactSecrets("token sk-abcdefghijklmnopqrstuvwxyz leaked"), "token sk-*** leaked");
  });

  it("classifies cancel, missing CLI, and parse failures", () => {
    assert.equal(classifyRunError({ code: "OCR_CANCELLED", message: "Run cancelled" }).kind, "cancelled");
    const missing = classifyRunError(new Error("spawn ocr ENOENT"));
    assert.equal(missing.kind, "missing-cli");
    assert.match(missing.message, /Settings/);
    const parse = classifyRunError(new Error("could not parse review result JSON"));
    assert.equal(parse.kind, "parse");
  });
});

describe("formatElapsedSeconds", () => {
  it("formats ms and guards NaN", () => {
    assert.equal(formatElapsedSeconds(0), "0s");
    assert.equal(formatElapsedSeconds(1500), "2s");
    assert.equal(formatElapsedSeconds(125000), "2m 5s");
    assert.equal(formatElapsedSeconds(undefined), "0s");
    assert.equal(formatElapsedSeconds(Number.NaN), "0s");
  });
});
