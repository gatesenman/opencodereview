/** Canonical ocr config keys and aliases used by older desktop builds. */

const FIELD_ALIASES = {
  apikey: "api_key",
  api_key: "api_key",
  authheader: "auth_header",
  auth_header: "auth_header",
  authtoken: "auth_token",
  auth_token: "auth_token",
  useanthropic: "use_anthropic",
  use_anthropic: "use_anthropic",
  extrabody: "extra_body",
  extra_body: "extra_body",
  extraheaders: "extra_headers",
  extra_headers: "extra_headers",
  otlpendpoint: "otlp_endpoint",
  otlp_endpoint: "otlp_endpoint",
  contentlogging: "content_logging",
  content_logging: "content_logging"
};

function canonicalField(field) {
  if (field == null) return field;
  const raw = String(field);
  const lower = raw.toLowerCase();
  return FIELD_ALIASES[lower] || raw;
}

/**
 * Normalize a config key sent to `ocr config set|unset`.
 * Unknown keys are returned unchanged (CLI will reject them).
 */
function canonicalConfigKey(key) {
  if (key == null) return key;
  const raw = String(key).trim();
  if (!raw) return raw;

  const lower = raw.toLowerCase().replace(/_/g, "");

  if (lower === "provider" || lower === "model" || lower === "language") {
    return lower === "provider" ? "provider" : lower === "model" ? "model" : "language";
  }

  const dotted = raw.split(".");
  if (dotted.length === 1) return raw;

  const head = dotted[0].toLowerCase().replace(/_/g, "");
  const rest = dotted.slice(1);

  if (head === "customproviders") {
    if (rest.length === 1) return `custom_providers.${rest[0]}`;
    const name = rest[0];
    const field = canonicalField(rest.slice(1).join("."));
    return `custom_providers.${name}.${field}`;
  }
  if (head === "mcpservers") {
    if (rest.length === 1) return `mcp_servers.${rest[0]}`;
    const name = rest[0];
    const field = canonicalField(rest.slice(1).join("."));
    return `mcp_servers.${name}.${field}`;
  }
  if (head === "providers") {
    if (rest.length === 1) return `providers.${rest[0]}`;
    const name = rest[0];
    const field = canonicalField(rest.slice(1).join("."));
    return `providers.${name}.${field}`;
  }
  if (head === "llm") {
    const field = canonicalField(rest.join("."));
    return `llm.${field}`;
  }
  if (head === "telemetry") {
    const field = canonicalField(rest.join("."));
    return `telemetry.${field}`;
  }
  return raw;
}

/** Map UI language picks to values used in CLI examples (`English`). */
function languageConfigValue(uiValue) {
  const v = String(uiValue || "").trim();
  if (!v) return "";
  const lower = v.toLowerCase();
  if (lower === "en" || lower === "eng" || lower === "english") return "English";
  if (lower === "zh" || lower === "zh-cn" || lower === "cn" || lower === "chinese" || lower === "中文") {
    return "Chinese";
  }
  return v;
}

function languageSelectValue(configValue) {
  const v = String(configValue || "").trim();
  if (!v) return "";
  const lower = v.toLowerCase();
  if (lower === "en" || lower === "eng" || lower === "english") return "en";
  if (lower === "zh" || lower === "zh-cn" || lower === "cn" || lower === "chinese" || v === "中文") {
    return "zh";
  }
  return v;
}

const SECRET_FIELD = /^(api_key|auth_token|token|password|secret|auth_header)$/i;

function isSecretConfigKey(key) {
  const canon = canonicalConfigKey(key || "") || "";
  const last = canon.split(".").pop() || "";
  return SECRET_FIELD.test(last);
}

function isRedactedValue(value) {
  if (value == null) return false;
  const s = String(value).trim();
  return s.length >= 2 && /^\*+$|^x+$|^•+$|^\[?(redacted|hidden|set)\]?$/i.test(s);
}

function getConfigValue(cfg, key) {
  if (!cfg || typeof cfg !== "object") return undefined;
  const canon = canonicalConfigKey(key);
  if (!canon) return undefined;
  let cur = cfg;
  for (const part of canon.split(".")) {
    if (cur == null || typeof cur !== "object" || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * After `config set` + reload, confirm the key is present.
 * Secret values are treated as saved when the field exists or is redacted;
 * their raw value is never compared in a way that would need to be logged.
 */
function configLooksSaved(cfg, key, sentValue) {
  const got = getConfigValue(cfg, key);
  if (got === undefined || got === null || got === "") {
    return { ok: false, reason: "missing" };
  }
  if (isSecretConfigKey(key) || isRedactedValue(got)) {
    return { ok: true, redacted: true };
  }
  if (sentValue != null && String(got) !== String(sentValue) && typeof got !== "object") {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, redacted: false };
}

function validateConfigMutation(key, value, { unset = false } = {}) {
  const canon = canonicalConfigKey(String(key ?? "").trim());
  if (!canon) return { ok: false, error: "Config key is required." };
  if (unset) return { ok: true, key: canon };
  if (value == null || String(value).trim() === "") {
    return { ok: false, error: "Enter a value to save." };
  }
  let next = value;
  if (canon === "language") next = languageConfigValue(value);
  else if (typeof next === "string") next = next; // keep as-is; CLI owns parsing
  return { ok: true, key: canon, value: next };
}

export {
  FIELD_ALIASES,
  canonicalField,
  canonicalConfigKey,
  languageConfigValue,
  languageSelectValue,
  isSecretConfigKey,
  isRedactedValue,
  getConfigValue,
  configLooksSaved,
  validateConfigMutation
};
