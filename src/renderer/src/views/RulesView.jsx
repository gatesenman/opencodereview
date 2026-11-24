import React, { useState } from "react";
import { useApp } from "../App.jsx";

export default function RulesView() {
  const { repoDir, toast } = useApp();
  const [file, setFile] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    if (!repoDir) {
      toast("Choose a repository folder first (bottom-left).", "err");
      return;
    }
    if (!file.trim()) {
      toast("Enter a file path relative to the repo.", "err");
      return;
    }
    setBusy(true);
    try {
      setDetail(await window.ocr.rules.check(repoDir, file.trim()));
    } catch (err) {
      toast(String(err?.message || err), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Rules inspector</h1>
      <p className="page-sub">
        Inspect which rule would apply to a given file (<span className="mono">ocr rules check</span>). This page
        does not change the next Review or Scan run — to pass <span className="mono">--rule</span> or{" "}
        <span className="mono">--tools</span>, use the advanced options on those pages. Project rules still come
        from <span className="mono">.opencodereview/rule.json</span> or the built-in defaults.
      </p>
      <div className="card">
        <div className="field">
          <label>File path (relative to repo)</label>
          <div className="row">
            <input
              type="text"
              placeholder="internal/agent/agent.go"
              value={file}
              onChange={(e) => setFile(e.target.value)}
            />
            <button
              className="btn-sm"
              onClick={async () => {
                const f = await window.ocr.dialog.openFile();
                if (f) setFile(f);
              }}
            >
              Browse
            </button>
            <button className="primary" onClick={check} disabled={busy}>
              {busy ? "Checking…" : "Check rule"}
            </button>
          </div>
        </div>
      </div>
      {detail && (
        <div className="card">
          <div className="field">
            <label>File</label>
            <div className="mono">{detail.file}</div>
          </div>
          <div className="field">
            <label>Source</label>
            <div>{detail.source}</div>
          </div>
          <div className="field">
            <label>Matched pattern</label>
            <div className="mono">{detail.pattern}</div>
          </div>
          <div className="field">
            <label>Effective rule</label>
            <pre className="code" style={{ padding: 12, whiteSpace: "pre-wrap" }}>
              {detail.rule}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
