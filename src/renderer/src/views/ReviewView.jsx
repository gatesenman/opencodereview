import React, { useEffect, useState } from "react";
import { useApp } from "../App.jsx";
import Icon from "../components/Icon.jsx";
import { validateRunOptions } from "../../../shared/runOptions.mjs";

export default function ReviewView() {
  const { repoDir, toast, startRun, running, resumeDraft, setResumeDraft } = useApp();
  const resumeSessionId = resumeDraft?.resume;
  const [mode, setMode] = useState(resumeDraft?.mode || "workspace");
  const [from, setFrom] = useState(resumeDraft?.from || "");
  const [to, setTo] = useState(resumeDraft?.to || "");
  const [commit, setCommit] = useState(resumeDraft?.commit || "");
  const [model, setModel] = useState("");
  const [exclude, setExclude] = useState("");
  const [background, setBackground] = useState("");
  const [backgroundFile, setBackgroundFile] = useState("");
  const [concurrency, setConcurrency] = useState("");
  const [timeout, setTimeoutV] = useState("");
  const [maxTools, setMaxTools] = useState("");
  const [maxGitProcs, setMaxGitProcs] = useState("");
  const [rule, setRule] = useState("");
  const [tools, setTools] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!resumeDraft) return;
    if (resumeDraft.mode) setMode(resumeDraft.mode);
    if (resumeDraft.from) setFrom(resumeDraft.from);
    if (resumeDraft.to) setTo(resumeDraft.to);
    if (resumeDraft.commit) setCommit(resumeDraft.commit);
    if (resumeDraft.resume) {
      toast(`Continuing session ${String(resumeDraft.resume).slice(0, 12)} — run to resume`);
    }
  }, [resumeDraft, toast]);

  const buildOpts = () => ({
    repoDir,
    mode,
    from: from.trim() || undefined,
    to: to.trim() || undefined,
    commit: commit.trim() || undefined,
    resume: resumeSessionId,
    model: model.trim() || undefined,
    exclude: exclude.trim() || undefined,
    background: background.trim() || undefined,
    backgroundFile: backgroundFile.trim() || undefined,
    concurrency: concurrency ? Number(concurrency) : undefined,
    timeout: timeout ? Number(timeout) : undefined,
    maxTools: maxTools ? Number(maxTools) : undefined,
    maxGitProcs: maxGitProcs ? Number(maxGitProcs) : undefined,
    rule: rule.trim() || undefined,
    tools: tools.trim() || undefined
  });

  const guard = () => {
    const check = validateRunOptions("review", buildOpts());
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
      const p = await window.ocr.review.preview(buildOpts());
      setPreview(p);
      if (p.reviewable === 0) toast("No reviewable changes found.", "err");
    } catch (err) {
      toast(String(err?.message || err), "err");
    } finally {
      setPreviewing(false);
    }
  };

  const doRun = async () => {
    if (!guard()) return;
    const title = resumeSessionId ? "二次审查 (Resumed review)" : "Review";
    const outcome = await startRun({
      kind: "review",
      opts: buildOpts(),
      total: preview?.reviewable ?? 0,
      title
    });
    if (outcome?.result) setResumeDraft(null);
  };

  return (
    <div>
      <h1 className="page-title">Review changes</h1>
      <p className="page-sub">Review Git changes with AI. Pick what to review, preview the file list, then run.</p>
      {resumeSessionId && (
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="ico-text">
              <Icon name="reuse" size={14} /> Resuming session{" "}
              <span className="mono">{String(resumeSessionId).slice(0, 16)}</span> — already reviewed
              files are reused (二次审查).
            </span>
            <button className="btn-sm" onClick={() => setResumeDraft(null)}>
              Cancel resume
            </button>
          </div>
        </div>
      )}
      <div className="card">
        <h3>What to review</h3>
        <div className="tabs">
          {["workspace", "range", "commit"].map((m) => (
            <button
              type="button"
              key={m}
              className={`tab ${mode === m ? "active" : ""}`}
              onClick={() => setMode(m)}
            >
              {m === "workspace" ? "Working changes" : m === "range" ? "Branch / range" : "Single commit"}
            </button>
          ))}
        </div>
        {mode === "workspace" && (
          <p className="muted">Reviews uncommitted changes in your working tree (staged + unstaged).</p>
        )}
        {mode === "range" && (
          <div className="grid2">
            <div className="field">
              <label>From (--from)</label>
              <input type="text" placeholder="main" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>To (--to)</label>
              <input
                type="text"
                placeholder="feature-branch"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        )}
        {mode === "commit" && (
          <div className="field">
            <label>Commit (--commit)</label>
            <input
              type="text"
              placeholder="abc123"
              value={commit}
              onChange={(e) => setCommit(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="card">
        <h3>Options</h3>
        <div className="grid2">
          <div className="field">
            <label>Model (--model)</label>
            <input
              type="text"
              placeholder="default from config"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Exclude globs (--exclude)</label>
            <input
              type="text"
              placeholder="*.lock,vendor/**"
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Extra context / instructions (--background)</label>
          <textarea
            placeholder="e.g. Focus on concurrency safety and error handling."
            value={background}
            onChange={(e) => setBackground(e.target.value)}
          />
        </div>
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
            <div className="field" style={{ gridColumn: "1 / span 2" }}>
              <label>Background file (--background-file)</label>
              <div className="row">
                <input
                  type="text"
                  value={backgroundFile}
                  onChange={(e) => setBackgroundFile(e.target.value)}
                />
                <button
                  className="btn-sm"
                  onClick={async () => {
                    const f = await window.ocr.dialog.openFile();
                    if (f) setBackgroundFile(f);
                  }}
                >
                  Browse
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="row">
        <button onClick={doPreview} disabled={previewing || running}>
          {previewing ? "Previewing…" : "Preview files"}
        </button>
        <button className="primary" onClick={doRun} disabled={running}>
          {resumeSessionId ? "Resume review" : "Run review"}
        </button>
      </div>
      {preview && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>
            Preview — {preview.reviewable} of {preview.total_files} file(s) will be reviewed{" "}
            <span className="muted">
              (+{preview.insertions} −{preview.deletions})
            </span>
          </h3>
          <table className="tbl">
            <thead>
              <tr>
                <th>Status</th>
                <th>File</th>
                <th>Changes</th>
                <th>Review?</th>
              </tr>
            </thead>
            <tbody>
              {preview.entries.map((e, i) => (
                <tr key={i}>
                  <td className="mono">{e.status}</td>
                  <td className="mono">{e.path}</td>
                  <td className="mono muted">
                    +{e.insertions} −{e.deletions}
                  </td>
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
