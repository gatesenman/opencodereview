import React, { useState } from "react";
import { useApp } from "../App.jsx";
import Icon from "../components/Icon.jsx";
import { validateRunOptions } from "../../../shared/runOptions.mjs";

export default function ScanView() {
  const { repoDir, toast, startRun, running } = useApp();
  const [paths, setPaths] = useState("");
  const [exclude, setExclude] = useState("");
  const [model, setModel] = useState("");
  const [background, setBackground] = useState("");
  const [batch, setBatch] = useState("");
  const [maxTokensBudget, setMaxTokensBudget] = useState("");
  const [concurrency, setConcurrency] = useState("");
  const [timeout, setTimeoutV] = useState("");
  const [maxTools, setMaxTools] = useState("");
  const [maxGitProcs, setMaxGitProcs] = useState("");
  const [rule, setRule] = useState("");
  const [tools, setTools] = useState("");
  const [noPlan, setNoPlan] = useState(false);
  const [noDedup, setNoDedup] = useState(false);
  const [noSummary, setNoSummary] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const buildOpts = () => ({
    repoDir,
    paths: paths.trim() || undefined,
    exclude: exclude.trim() || undefined,
    model: model.trim() || undefined,
    background: background.trim() || undefined,
    batch: batch || undefined,
    maxTokensBudget: maxTokensBudget ? Number(maxTokensBudget) : undefined,
    concurrency: concurrency ? Number(concurrency) : undefined,
    timeout: timeout ? Number(timeout) : undefined,
    maxTools: maxTools ? Number(maxTools) : undefined,
    maxGitProcs: maxGitProcs ? Number(maxGitProcs) : undefined,
    noPlan,
    noDedup,
    noSummary,
    rule: rule.trim() || undefined,
    tools: tools.trim() || undefined
  });

  const guard = () => {
    const check = validateRunOptions("scan", buildOpts());
    if (!check.ok) {
      toast(check.errors[0], "err");
      return false;
    }
    return true;
  };

  const doPreview = async () => {
    if (!guard()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      setPreview(await window.ocr.scan.preview(buildOpts()));
    } catch (err) {
      toast(String(err?.message || err), "err");
    } finally {
      setPreviewing(false);
    }
  };

  const doRun = async () => {
    if (!guard()) return;
    await startRun({
      kind: "scan",
      opts: buildOpts(),
      total: preview?.reviewable ?? 0,
      title: "Scan"
    });
  };

  return (
    <div>
      <h1 className="page-title">Scan code</h1>
      <p className="page-sub">
        Full-file review without a diff — scan the whole repo, a directory, or specific files.
      </p>
      <div className="card">
        <h3>Scope</h3>
        <div className="field">
          <label>Paths (--path) — comma separated; empty = whole repo</label>
          <input
            type="text"
            placeholder="internal/agent, cmd/"
            value={paths}
            onChange={(e) => setPaths(e.target.value)}
          />
        </div>
        <div className="grid2">
          <div className="field">
            <label>Exclude globs (--exclude)</label>
            <input
              type="text"
              placeholder="*_test.go,vendor/**"
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Model (--model)</label>
            <input
              type="text"
              placeholder="default from config"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Extra context (--background)</label>
          <textarea value={background} onChange={(e) => setBackground(e.target.value)} />
        </div>
      </div>
      <div className="card">
        <h3>Scan strategy</h3>
        <div className="grid2">
          <div className="field">
            <label>Batching (--batch)</label>
            <select value={batch} onChange={(e) => setBatch(e.target.value)}>
              <option value="">default</option>
              <option value="none">none</option>
              <option value="by-language">by-language</option>
              <option value="by-directory">by-directory</option>
            </select>
          </div>
          <div className="field">
            <label>Max token budget (--max-tokens-budget)</label>
            <input
              type="number"
              value={maxTokensBudget}
              onChange={(e) => setMaxTokensBudget(e.target.value)}
            />
          </div>
        </div>
        <label className="checkline">
          <input type="checkbox" checked={noPlan} onChange={(e) => setNoPlan(e.target.checked)} />
          Skip plan task (--no-plan)
        </label>
        <label className="checkline">
          <input type="checkbox" checked={noDedup} onChange={(e) => setNoDedup(e.target.checked)} />
          Skip dedup (--no-dedup)
        </label>
        <label className="checkline">
          <input type="checkbox" checked={noSummary} onChange={(e) => setNoSummary(e.target.checked)} />
          Skip project summary (--no-summary)
        </label>
        <button type="button" className="btn-sm" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? "▾ Hide" : "▸ Show"} advanced
        </button>
        {showAdvanced && (
          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Concurrency (--concurrency)</label>
              <input type="number" value={concurrency} onChange={(e) => setConcurrency(e.target.value)} />
            </div>
            <div className="field">
              <label>Task timeout minutes (--timeout)</label>
              <input type="number" min="1" value={timeout} onChange={(e) => setTimeoutV(e.target.value)} />
              <span className="hint">CLI default is 10 minutes if left empty. This is minutes, not seconds.</span>
            </div>
            <div className="field">
              <label>Max tools (--max-tools)</label>
              <input type="number" value={maxTools} onChange={(e) => setMaxTools(e.target.value)} />
            </div>
            <div className="field">
              <label>Max git procs (--max-git-procs)</label>
              <input type="number" value={maxGitProcs} onChange={(e) => setMaxGitProcs(e.target.value)} />
            </div>
            <div className="field">
              <label>Rule file (--rule)</label>
              <div className="row">
                <input type="text" value={rule} onChange={(e) => setRule(e.target.value)} placeholder="optional rule.json" />
                <button
                  className="btn-sm"
                  onClick={async () => {
                    const f = await window.ocr.dialog.openFile();
                    if (f) setRule(f);
                  }}
                >
                  Browse
                </button>
              </div>
            </div>
            <div className="field">
              <label>Tools (--tools)</label>
              <input type="text" value={tools} onChange={(e) => setTools(e.target.value)} placeholder="optional, comma-separated" />
            </div>
          </div>
        )}
      </div>
      <div className="row">
        <button onClick={doPreview} disabled={previewing || running}>
          {previewing ? "Previewing…" : "Preview files"}
        </button>
        <button className="primary" onClick={doRun} disabled={running}>
          Run scan
        </button>
      </div>
      {preview && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>
            Preview — {preview.reviewable} of {preview.total_files} file(s) will be scanned
          </h3>
          <table className="tbl">
            <thead>
              <tr>
                <th>File</th>
                <th>Scan?</th>
              </tr>
            </thead>
            <tbody>
              {preview.entries.map((e, i) => (
                <tr key={i}>
                  <td className="mono">{e.path}</td>
                  <td>
                    {e.will_review ? (
                      <Icon name="check" size={14} />
                    ) : (
                      <span className="muted">{e.exclude_reason || "no"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
