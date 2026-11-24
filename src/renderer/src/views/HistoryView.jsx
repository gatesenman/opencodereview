import React, { useEffect, useState } from "react";
import { useApp } from "../App.jsx";
import Icon from "../components/Icon.jsx";
import { fmtDuration, shortId } from "../components/CommentCard.jsx";
import { planContinue, isScanMode, parseSessionList, describeSessionRecord } from "../../../shared/sessionResults.mjs";
import { isActivateKey } from "../../../shared/a11y.mjs";

export default function HistoryView() {
  const { repoDir, toast, goResults, setResumeDraft, navigate } = useApp();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState(null);

  const load = async () => {
    if (!repoDir) {
      toast("Choose a repository folder first (bottom-left).", "err");
      return;
    }
    setLoading(true);
    try {
      const raw = await window.ocr.session.list(repoDir);
      setSessions(Array.isArray(raw) ? raw : parseSessionList(JSON.stringify(raw ?? [])));
    } catch (err) {
      toast(String(err?.message || err), "err");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoDir) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoDir]);

  const openResults = async (s) => {
    const id = s.session_id || s.sessionId;
    setOpeningId(id);
    try {
      const opened = await window.ocr.session.open(repoDir, id);
      goResults(opened.result, opened.title || "Session");
      if (opened.result?.aborted || opened.result?.session_status === "aborted") {
        toast("This session was aborted or never completed. It is not a clean review.", "ok");
      } else if (opened.result?.session_status === "incomplete") {
        toast("This session is incomplete (for example a preview). No review results were saved.", "ok");
      } else if (!opened.result?.comments?.length) {
        toast("Opened the session. Full finding text was not in the saved metadata; only counts may be available.", "ok");
      }
    } catch (err) {
      toast(String(err?.message || err), "err");
    } finally {
      setOpeningId(null);
    }
  };

  const continueReview = (s) => {
    const plan = planContinue(s);
    if (plan.blocked) {
      toast(plan.reason, "err");
      return;
    }
    setResumeDraft({
      resume: plan.resume,
      mode: plan.mode,
      from: plan.from,
      to: plan.to,
      commit: plan.commit
    });
    navigate("review");
  };

  return (
    <div>
      <h1 className="page-title">History</h1>
      <p className="page-sub">
        Every review/scan is saved per repository. Open one to inspect findings, or continue a range/commit review
        as a second review (二次审查).
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <span className="muted mono">{repoDir || "no repo selected"}</span>
      </div>
      {sessions.length === 0 ? (
        <div className="empty">No sessions yet for this repository.</div>
      ) : (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Branch / range</th>
                <th>Model</th>
                <th>Files</th>
                <th>Findings</th>
                <th>Duration</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const id = s.session_id || s.sessionId;
                const scan = isScanMode(s.review_mode);
                const plan = planContinue(s);
                const status = describeSessionRecord(s);
                return (
                  <tr
                    key={id}
                    className="click"
                    tabIndex={0}
                    onClick={() => openResults(s)}
                    onKeyDown={(e) => {
                      if (isActivateKey(e.key)) {
                        e.preventDefault();
                        openResults(s);
                      }
                    }}
                  >
                    <td>{status.dateLabel}</td>
                    <td>
                      <span className="pill">{status.label}</span>
                    </td>
                    <td>
                      <span className="ico-text">
                        {s.review_mode}
                        {s.resumed_from ? <Icon name="reuse" size={12} /> : null}
                      </span>
                    </td>
                    <td className="mono">
                      {s.diff_commit
                        ? shortId(s.diff_commit)
                        : s.diff_from
                          ? `${s.diff_from}..${s.diff_to}`
                          : s.git_branch || "—"}
                    </td>
                    <td className="mono muted">{s.model || "—"}</td>
                    <td>
                      <span className="ico-text">
                        {s.completed_files}
                        {s.reused_files ? (
                          <>
                            <Icon name="reuse" size={12} />
                            {s.reused_files}
                          </>
                        ) : null}
                        {s.failed_files ? (
                          <>
                            <Icon name="close" size={12} />
                            {s.failed_files}
                          </>
                        ) : null}
                      </span>
                    </td>
                    <td>{s.total_comments}</td>
                    <td>{fmtDuration(s.duration_ns)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn-sm" disabled={openingId === id} onClick={() => openResults(s)}>
                          {openingId === id ? "Opening…" : "Open"}
                        </button>
                        <button
                          className="btn-sm"
                          disabled={plan.blocked}
                          title={plan.blocked ? plan.reason : scan ? "" : "Resume as a second review"}
                          onClick={() => continueReview(s)}
                        >
                          Continue
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
