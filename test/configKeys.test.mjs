import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalConfigKey,
  canonicalField,
  languageConfigValue,
  languageSelectValue,
  validateConfigMutation,
  configLooksSaved
} from "../src/shared/configKeys.mjs";

describe("canonicalConfigKey", () => {
  it("keeps already-canonical keys", () => {
    assert.equal(canonicalConfigKey("provider"), "provider");
    assert.equal(canonicalConfigKey("model"), "model");
    assert.equal(canonicalConfigKey("language"), "language");
    assert.equal(canonicalConfigKey("providers.openai.api_key"), "providers.openai.api_key");
    assert.equal(canonicalConfigKey("custom_providers.gw.url"), "custom_providers.gw.url");
    assert.equal(canonicalConfigKey("mcp_servers.fs.command"), "mcp_servers.fs.command");
    assert.equal(canonicalConfigKey("llm.auth_token"), "llm.auth_token");
    assert.equal(canonicalConfigKey("telemetry.otlp_endpoint"), "telemetry.otlp_endpoint");
    assert.equal(canonicalConfigKey("telemetry.enabled"), "telemetry.enabled");
  });

  it("rewrites legacy desktop keys from the 0.1.0 package", () => {
    assert.equal(canonicalConfigKey("providers.openai.apikey"), "providers.openai.api_key");
    assert.equal(canonicalConfigKey("customproviders.gw.apikey"), "custom_providers.gw.api_key");
    assert.equal(canonicalConfigKey("customproviders.gw.authheader"), "custom_providers.gw.auth_header");
    assert.equal(canonicalConfigKey("customproviders.gw"), "custom_providers.gw");
    assert.equal(canonicalConfigKey("mcpservers.fs.command"), "mcp_servers.fs.command");
    assert.equal(canonicalConfigKey("mcpservers.fs.args"), "mcp_servers.fs.args");
    assert.equal(canonicalConfigKey("llm.authtoken"), "llm.auth_token");
    assert.equal(canonicalConfigKey("llm.authheader"), "llm.auth_header");
    assert.equal(canonicalConfigKey("llm.useanthropic"), "llm.use_anthropic");
    assert.equal(canonicalConfigKey("telemetry.otlpendpoint"), "telemetry.otlp_endpoint");
  });

  it("canonicalField maps aliases", () => {
    assert.equal(canonicalField("apikey"), "api_key");
    assert.equal(canonicalField("api_key"), "api_key");
  });
});

describe("languageConfigValue", () => {
  it("maps UI short codes to CLI example values", () => {
    assert.equal(languageConfigValue("en"), "English");
    assert.equal(languageConfigValue("English"), "English");
    assert.equal(languageConfigValue("zh"), "Chinese");
    assert.equal(languageConfigValue("中文"), "Chinese");
    assert.equal(languageConfigValue(""), "");
  });

  it("round-trips into the settings select", () => {
    assert.equal(languageSelectValue("English"), "en");
    assert.equal(languageSelectValue("Chinese"), "zh");
    assert.equal(languageSelectValue("en"), "en");
    assert.equal(languageSelectValue(""), "");
  });
});

describe("validateConfigMutation", () => {
  it("rejects empty keys and empty values, and canonicalizes typo keys", () => {
    assert.equal(validateConfigMutation("", "x").ok, false);
    assert.equal(validateConfigMutation("provider", "  ").ok, false);
    const m = validateConfigMutation("llm.authtoken", "tok");
    assert.equal(m.ok, true);
    assert.equal(m.key, "llm.auth_token");
    assert.equal(m.value, "tok");
  });

  it("maps language UI values before they are sent to the CLI", () => {
    const m = validateConfigMutation("language", "zh");
    assert.equal(m.key, "language");
    assert.equal(m.value, "Chinese");
  });

  it("unset only needs a canonical key", () => {
    const m = validateConfigMutation("customproviders.gw", "", { unset: true });
    assert.equal(m.ok, true);
    assert.equal(m.key, "custom_providers.gw");
  });
});

describe("configLooksSaved", () => {
  it("finds nested keys after a reload and treats secrets as present when set or redacted", () => {
    const cfg = {
      provider: "openai",
      language: "English",
      providers: { openai: { api_key: "****" } },
      telemetry: { otlp_endpoint: "https://otlp.example" }
    };
    assert.equal(configLooksSaved(cfg, "provider", "openai").ok, true);
    assert.equal(configLooksSaved(cfg, "language", "English").ok, true);
    assert.equal(configLooksSaved(cfg, "providers.openai.api_key", "sk-unused-in-compare").ok, true);
    assert.equal(configLooksSaved(cfg, "telemetry.otlp_endpoint", "https://otlp.example").ok, true);
    assert.equal(configLooksSaved(cfg, "model", "x").ok, false);
    assert.equal(configLooksSaved(cfg, "telemetry.otlp_endpoint", "https://other").reason, "mismatch");
  });
});
