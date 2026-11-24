import React, { useEffect, useState } from "react";
import { useApp } from "../App.jsx";

export default function AboutView() {
  const { toast } = useApp();
  const [cliVersion, setCliVersion] = useState("");
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    window.ocr.version().then(setCliVersion).catch(() => setCliVersion("(unavailable)"));
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const next = await window.ocr.update.check();
      setInfo(next);
      if (next.error) toast(next.error, "err");
      else if (next.hasUpdate) toast(`Update available: ${next.latestVersion}`);
      else toast("CLI is up to date");
    } catch (err) {
      toast(String(err?.message || err), "err");
    } finally {
      setChecking(false);
    }
  };

  const download = async () => {
    if (!info) return;
    setDownloading(true);
    try {
      const res = await window.ocr.update.download(info);
      if (!res.ok) toast(res.error || "download failed", "err");
      else {
        toast(`CLI updated at ${res.path}`);
        setCliVersion(await window.ocr.version());
      }
    } catch (err) {
      toast(String(err?.message || err), "err");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">About & Update</h1>
      <p className="page-sub">OpenCodeReview desktop — a friendly GUI around the ocr CLI.</p>
      <div className="card">
        <h3>Version</h3>
        <div className="field">
          <label>Desktop</label>
          <div>0.2.0</div>
        </div>
        <div className="field">
          <label>Bundled / configured CLI</label>
          <div className="mono">{cliVersion || "…"}</div>
        </div>
        <div className="row">
          <button className="primary" onClick={check} disabled={checking}>
            {checking ? "Checking…" : "Check for updates"}
          </button>
          <a onClick={() => window.ocr.openExternal("https://github.com/alibaba/open-code-review/releases")}>
            View releases
          </a>
        </div>
        {info?.hasUpdate && (
          <div style={{ marginTop: 16 }}>
            <p className="muted">
              Downloads the platform binary from GitHub releases and verifies its SHA-256 checksum before replacing
              the bundled CLI.
            </p>
            <button className="primary" onClick={download} disabled={downloading}>
              {downloading ? "Downloading & verifying…" : `Download ${info.latestVersion}`}
            </button>
          </div>
        )}
        {info?.notes && (
          <div className="field" style={{ marginTop: 16 }}>
            <label>Release notes</label>
            <pre className="code" style={{ padding: 12, whiteSpace: "pre-wrap" }}>
              {info.notes}
            </pre>
          </div>
        )}
      </div>
      <div className="card">
        <h3>Documentation</h3>
        <div>
          <a onClick={() => window.ocr.openExternal("https://alibaba.github.io/open-code-review")}>
            alibaba.github.io/open-code-review
          </a>
        </div>
        <div style={{ marginTop: 8 }}>
          <a onClick={() => window.ocr.openExternal("https://github.com/alibaba/open-code-review")}>Repository</a>
        </div>
      </div>
    </div>
  );
}
