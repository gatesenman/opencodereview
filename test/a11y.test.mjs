import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isActivateKey, isCancelKey } from "../src/shared/a11y.mjs";

describe("keyboard helpers", () => {
  it("treats Enter and Space as activate, Escape as cancel", () => {
    assert.equal(isActivateKey("Enter"), true);
    assert.equal(isActivateKey(" "), true);
    assert.equal(isActivateKey("Tab"), false);
    assert.equal(isCancelKey("Escape"), true);
    assert.equal(isCancelKey("Enter"), false);
  });
});
