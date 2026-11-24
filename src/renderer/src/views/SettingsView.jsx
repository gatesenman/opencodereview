import React, { useEffect, useState } from "react";
import { useApp } from "../App.jsx";
import { applyTheme } from "../theme.js";
import {
  languageConfigValue,
  languageSelectValue,
  validateConfigMutation,
  configLooksSaved
} from "../../../shared/configKeys.mjs";

const PROVIDER_FIELDS = ["api_key", "url", "protocol", "model", "auth_header"];
const LLM_FIELDS = ["url", "auth_token", "auth_header", "model", "use_anthropic"];

export default function SettingsView() {
  const { toast } = useApp();
  const [cfg, setCfg] = useState({});
  const [providers, setProviders] = useState([]);
  const [settings, setSettings] = useState({});
  const [tab, setTab] = useState("provider");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const reload = async () => {
    const [c, p, s] = await Promise.all([
      window.ocr.config.read(),
      window.ocr.llm.providers().catch(() => []),
      window.ocr.settings.get()
    ]);
    setCfg(c);
    setProviders(p);
    setSettings(s);
  };

  useEffect(() => {
    void reload();
  }, []);

  const setKey = async (key, value) => {
    const mutation = validateConfigMutation(key, value);
    if (!mutation.ok) {
      toast(mutation.error, "err");
      return false;
    }
    setBusy(true);
    try {
      await window.ocr.config.set(mutation.key, mutation.value);
      const latest = await window.ocr.config.read();
      const check = configLooksSaved(latest, mutation.key, mutation.value);
      await reload();
      if (!check.ok) {
        toast(
          `Wrote ${mutation.key}, but it was not found when re-reading ~/.opencodereview/config.json.`,
          "err"
        );
        return false;
      }
      toast(`Saved ${mutation.key}`);
      return true;
    } catch (err) {
      toast(String(err?.message || err), "err");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setKeys = async (pairs) => {
    for (const [key, value] of pairs) {
      const ok = await setKey(key, value);
      if (ok === false) return false;
    }
    return true;
  };

  const unsetKey = async (key) => {
    setBusy(true);
    try {
      await window.ocr.config.unset(key);
      toast(`Removed ${key}`);
      await reload();
    } catch (err) {
      toast(String(err?.message || err), "err");
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      setTestResult(await window.ocr.llm.test());
    } catch (err) {
      toast(String(err?.message || err), "err");
    } finally {
      setBusy(false);
    }
  };

  const saveApp = async (next) => {
    const s = await window.ocr.settings.set(next);
    setSettings(s);
    if (next.theme) applyTheme(next.theme);
    toast("App settings saved");
  };

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        Configure the LLM provider, MCP servers, telemetry and app preferences. Changes are written to{" "}
        <span className="mono">~/.opencodereview/config.json</span> via the CLI.
      </p>
      <div className="tabs">
        {[
          ["provider", "Provider & model"],
          ["advanced", "Custom / advanced"],
          ["mcp", "MCP servers"],
          ["telemetry", "Telemetry & language"],
          ["app", "App"]
        ].map(([k, label]) => (
          <button type="button" key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "provider" && (
        <ProviderTab cfg={cfg} providers={providers} busy={busy} onSet={setKey} onSetMany={setKeys} onTest={runTest} testResult={testResult} />
      )}
      {tab === "advanced" && <AdvancedTab cfg={cfg} busy={busy} onSet={setKey} onUnset={unsetKey} />}
      {tab === "mcp" && <McpTab cfg={cfg} busy={busy} onUnset={unsetKey} onSet={setKey} onSetMany={setKeys} />}
      {tab === "telemetry" && <TelemetryTab cfg={cfg} busy={busy} onSet={setKey} onSetMany={setKeys} />}
      {tab === "app" && <AppTab settings={settings} onSave={saveApp} />}
    </div>
  );
}

function ProviderTab({ cfg, providers, busy, onSet, onSetMany, onTest, testResult }) {
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  useEffect(() => {
    setProvider(cfg.provider || "");
    setModel(cfg.model || "");
  }, [cfg]);

  return (
    <>
      <div className="card">
        <h3>Active provider</h3>
        <div className="grid2">
          <div className="field">
            <label>Provider (config provider)</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">— choose —</option>
              {providers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.protocol})
                </option>
              ))}
            </select>
            <span className="hint">{providers.find((p) => p.name === provider)?.base_url || "Pick your LLM vendor."}</span>
          </div>
          <div className="field">
            <label>Model (config model)</label>
            <input
              type="text"
              placeholder="e.g. claude-sonnet-4 / qwen-max"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
        </div>
        <div className="row">
          <button
            className="primary"
            disabled={busy || !provider}
            onClick={() => {
              const pairs = [["provider", provider]];
              if (model.trim()) pairs.push(["model", model.trim()]);
              onSetMany(pairs);
            }}
          >
            Save provider & model
          </button>
        </div>
      </div>
      <div className="card">
        <h3>API key</h3>
        <div className="field">
          <input
            type="password"
            placeholder="stored via ocr config set providers.<name>.api_key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <button
          className="primary"
          disabled={busy || !provider || !apiKey}
          onClick={() => {
            onSet(`providers.${provider}.api_key`, apiKey);
            setApiKey("");
          }}
        >
          Save API key
        </button>
      </div>
      <div className="card">
        <h3>Test connection (llm test)</h3>
        <button disabled={busy} onClick={onTest}>
          {busy ? "Testing…" : "Run llm test"}
        </button>
        {testResult && (
          <pre className="code" style={{ marginTop: 12, padding: 12 }}>
            {testResult.ok
              ? [testResult.source, testResult.url, testResult.model, testResult.content].filter(Boolean).join("\n")
              : testResult.error}
          </pre>
        )}
      </div>
    </>
  );
}

function AdvancedTab({ cfg, busy, onSet, onUnset }) {
  const [cpName, setCpName] = useState("");
  const [cpField, setCpField] = useState("api_key");
  const [cpValue, setCpValue] = useState("");
  const [llmField, setLlmField] = useState("url");
  const [llmValue, setLlmValue] = useState("");
  const customProviders = Object.keys(cfg.custom_providers || {});
  return (
    <>
      <div className="card">
        <h3>Custom providers (config set custom_providers.*)</h3>
        <p className="muted">Add an OpenAI/Anthropic-compatible endpoint not in the built-in list.</p>
        <div className="grid2">
          <div className="field">
            <label>Provider name</label>
            <input type="text" placeholder="my-proxy" value={cpName} onChange={(e) => setCpName(e.target.value)} />
          </div>
          <div className="field">
            <label>Field</label>
            <select value={cpField} onChange={(e) => setCpField(e.target.value)}>
              {PROVIDER_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Value</label>
          <input type={cpField === "api_key" ? "password" : "text"} value={cpValue} onChange={(e) => setCpValue(e.target.value)} />
        </div>
        <div className="row">
          <button
            className="primary"
            disabled={busy || !cpName || !cpValue}
            onClick={() => {
              onSet(`custom_providers.${cpName}.${cpField}`, cpValue);
              setCpValue("");
            }}
          >
            Save field
          </button>
        </div>
        {customProviders.length > 0 && (
          <table className="tbl" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Custom provider</th>
                <th>Protocol</th>
                <th>URL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {customProviders.map((name) => (
                <tr key={name}>
                  <td className="mono">{name}</td>
                  <td>{cfg.custom_providers?.[name]?.protocol || "—"}</td>
                  <td className="mono muted">{cfg.custom_providers?.[name]?.url || "—"}</td>
                  <td>
                    <button className="btn-sm danger" onClick={() => onUnset(`custom_providers.${name}`)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3>Legacy direct LLM endpoint (config set llm.*)</h3>
        <p className="muted">Overrides provider selection with an explicit endpoint. Leave empty unless you need it.</p>
        <div className="grid2">
          <div className="field">
            <label>Field</label>
            <select value={llmField} onChange={(e) => setLlmField(e.target.value)}>
              {LLM_FIELDS.map((f) => (
                <option key={f} value={f}>
                  llm.{f}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Value</label>
            <input
              type={llmField === "auth_token" ? "password" : "text"}
              value={llmValue}
              onChange={(e) => setLlmValue(e.target.value)}
            />
          </div>
        </div>
        <div className="row">
          <button
            className="primary"
            disabled={busy || !llmValue}
            onClick={() => {
              onSet(`llm.${llmField}`, llmValue);
              setLlmValue("");
            }}
          >
            Save
          </button>
          <button className="danger" disabled={busy} onClick={() => onUnset(`llm.${llmField}`)}>
            Unset llm.{llmField}
          </button>
        </div>
      </div>
    </>
  );
}

function McpTab({ cfg, busy, onSet, onUnset, onSetMany }) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const servers = Object.keys(cfg.mcp_servers || {});
  return (
    <div className="card">
      <h3>MCP servers (config set mcp_servers.*)</h3>
      <p className="muted">Register Model Context Protocol tool servers the reviewer can call.</p>
      <div className="grid2">
        <div className="field">
          <label>Server name</label>
          <input type="text" placeholder="filesystem" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Command</label>
          <input type="text" placeholder="npx" value={command} onChange={(e) => setCommand(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Args (comma separated)</label>
        <input
          type="text"
          placeholder="-y,@modelcontextprotocol/server-filesystem,/path"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
        />
      </div>
      <div className="row">
        <button
          className="primary"
          disabled={busy || !name || !command}
          onClick={() => {
            const pairs = [[`mcp_servers.${name}.command`, command]];
            if (args.trim()) pairs.push([`mcp_servers.${name}.args`, args]);
            onSetMany(pairs);
            setName("");
            setCommand("");
            setArgs("");
          }}
        >
          Save server
        </button>
      </div>
      {servers.length > 0 && (
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Server</th>
              <th>Command</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s}>
                <td className="mono">{s}</td>
                <td className="mono muted">{cfg.mcp_servers?.[s]?.command || "—"}</td>
                <td>
                  <button className="btn-sm danger" onClick={() => onUnset(`mcp_servers.${s}`)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TelemetryTab({ cfg, busy, onSet, onSetMany }) {
  const [language, setLanguage] = useState("");
  const [exporter, setExporter] = useState("");
  const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    setLanguage(languageSelectValue(cfg.language || ""));
    setExporter(cfg.telemetry?.exporter || "");
    setEndpoint(cfg.telemetry?.otlp_endpoint || "");
  }, [cfg]);
  return (
    <>
      <div className="card">
        <h3>Language (config set language)</h3>
        <div className="row">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="">default (auto)</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
          <button
            className="primary"
            disabled={busy}
            onClick={() => onSet("language", languageConfigValue(language || "en"))}
          >
            Save
          </button>
        </div>
        <p className="hint">Saved as CLI values English / Chinese.</p>
      </div>
      <div className="card">
        <h3>Telemetry (config set telemetry.*)</h3>
        <div className="row">
          <span>Currently: {cfg.telemetry?.enabled ? "enabled" : "disabled"}</span>
          <button
            disabled={busy}
            onClick={() => onSet("telemetry.enabled", cfg.telemetry?.enabled ? "false" : "true")}
          >
            {cfg.telemetry?.enabled ? "Disable" : "Enable"}
          </button>
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Exporter (telemetry.exporter)</label>
            <input type="text" value={exporter} onChange={(e) => setExporter(e.target.value)} />
          </div>
          <div className="field">
            <label>OTLP endpoint (telemetry.otlp_endpoint)</label>
            <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </div>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            const pairs = [];
            if (exporter.trim()) pairs.push(["telemetry.exporter", exporter.trim()]);
            if (endpoint.trim()) pairs.push(["telemetry.otlp_endpoint", endpoint.trim()]);
            if (!pairs.length) return;
            onSetMany(pairs);
          }}
        >
          Save telemetry
        </button>
      </div>
    </>
  );
}

function AppTab({ settings, onSave }) {
  const [binaryPath, setBinaryPath] = useState(settings.binaryPath || "");
  const [binaryInfo, setBinaryInfo] = useState(null);
  useEffect(() => {
    setBinaryPath(settings.binaryPath || "");
  }, [settings]);
  const checkBinary = async () => {
    try {
      setBinaryInfo(await window.ocr.binaryStatus());
    } catch (err) {
      setBinaryInfo({ ok: false, hint: String(err?.message || err) });
    }
  };
  useEffect(() => {
    void checkBinary();
  }, [settings.binaryPath]);
  return (
    <div className="card">
      <h3>Application preferences</h3>
      <div className="field">
        <label>ocr binary path (leave empty to use bundled / PATH)</label>
        <div className="row">
          <input type="text" value={binaryPath} onChange={(e) => setBinaryPath(e.target.value)} />
          <button
            className="btn-sm"
            onClick={async () => {
              const f = await window.ocr.dialog.openFile();
              if (f) setBinaryPath(f);
            }}
          >
            Browse
          </button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn-sm" onClick={checkBinary}>
            Check CLI path
          </button>
          {binaryInfo && (
            <span className={binaryInfo.ok ? "muted" : "hint"}>
              {binaryInfo.ok
                ? `Found: ${binaryInfo.path} (${binaryInfo.source})`
                : binaryInfo.hint || `Not found on disk; will try PATH as ${binaryInfo.path}`}
            </span>
          )}
        </div>
      </div>
      <div className="field">
        <label>Theme</label>
        <select
          value={settings.theme || "dark"}
          onChange={(e) => onSave({ theme: e.target.value })}
          style={{ maxWidth: 240 }}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
      <button
        className="primary"
        onClick={() => onSave({ binaryPath: binaryPath.trim() || undefined })}
      >
        Save preferences
      </button>
    </div>
  );
}
