import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { windowBackground, normalizeTheme, THEME_BACKGROUNDS } from "../src/shared/themeTokens.mjs";

describe("theme tokens", () => {
  it("maps light/dark window chrome and defaults unknown values to dark", () => {
    assert.equal(normalizeTheme("light"), "light");
    assert.equal(normalizeTheme("DARK"), "dark");
    assert.equal(normalizeTheme(""), "dark");
    assert.equal(windowBackground("light"), THEME_BACKGROUNDS.light);
    assert.equal(windowBackground("dark"), "#0f1115");
    assert.equal(windowBackground(undefined), "#0f1115");
    assert.notEqual(windowBackground("light"), windowBackground("dark"));
  });
});
