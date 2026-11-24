import React from "react";
import Icon from "./Icon.jsx";
import { formatElapsedSeconds } from "../../../shared/runErrors.mjs";

const PHASE_TEXT = {
  starting: "Starting",
  preview: "Analyzing changes",
  reviewing: "Working through files",
  summarizing: "Summarizing",
  done: "Finishing up",
  cancelled: "Cancelling",
  error: "Error"
};

export default function ProgressOverlay({ progress, onCancel, label }) {
  const total = progress?.total ?? 0;
  const done = (progress?.completed ?? 0) + (progress?.reused ?? 0) + (progress?.failed ?? 0);
  const determinate = total > 0;
  const pct = determinate ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const elapsedLabel = formatElapsedSeconds(progress?.elapsedMs);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={label}>
      <div className="overlay-card">
        <div className="spinner" />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div className="muted">
          {PHASE_TEXT[progress?.phase ?? "starting"] ?? "Working"}
          <span className="dots" />
        </div>
        <div className="progress-track">
          <div
            className={`progress-fill ${determinate ? "" : "progress-indeterminate"}`}
            style={determinate ? { width: `${pct}%` } : undefined}
          />
        </div>
        <div className="row" style={{ justifyContent: "center", gap: 18, marginTop: 6 }}>
          <span className="muted">{determinate ? `${done} / ${total} files` : `${done} files`}</span>
          {(progress?.reused ?? 0) > 0 && (
            <span className="muted ico-text">
              <Icon name="reuse" size={13} /> {progress?.reused} reused
            </span>
          )}
          {(progress?.failed ?? 0) > 0 && (
            <span className="ico-text" style={{ color: "var(--red)" }}>
              <Icon name="close" size={13} /> {progress?.failed} failed
            </span>
          )}
          <span className="muted">{elapsedLabel}</span>
        </div>
        {progress?.currentFile && (
          <div className="mono muted" style={{ marginTop: 12, fontSize: 12, wordBreak: "break-all" }}>
            {progress.currentFile}
          </div>
        )}
        {onCancel && (
          <button className="danger" style={{ marginTop: 20 }} onClick={onCancel} autoFocus>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
