import React, { useMemo, useState } from "react";
import { marked } from "marked";
import { useApp } from "../App.jsx";
import Icon from "../components/Icon.jsx";
import {
  CATEGORIES,
  SEVERITIES,
  CommentCard,
  FixPromptPanel,
  groupByFile
} from "../components/CommentCard.jsx";
import { filterAndSortComments, describeResultState } from "../../../shared/resultsModel.mjs";

export default function ResultsView({ result, title }) {
  const { toast, navigate } = useApp();
  const [tab, setTab] = useState("findings");
  const [sevFilter, setSevFilter] = useState(new Set());
  const [catFilter, setCatFilter] = useState(new Set());
  const [sort, setSort] = useState("severity");
  const comments = result?.comments ?? [];
  const filtered = useMemo(
    () => filterAndSortComments(comments, { severities: sevFilter, categories: catFilter, sort }),
    [comments, sevFilter, catFilter, sort]
  );
  const state = describeResultState(result);
  const grouped = useMemo(() => groupByFile(filtered), [filtered]);
  const counts = useMemo(() => {
    const m = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const c of comments) {
      const s = (c.severity || "").toLowerCase();
      if (s in m) m[s]++;
    }
    return m;
  }, [comments]);

  if (!result) {
    return (
      <div>
        <h1 className="page-title">Results</h1>
        <div className="empty">
          No results yet. Run a <button type="button" className="btn-sm" onClick={() => navigate("review")}>review</button> or{" "}
          <button type="button" className="btn-sm" onClick={() => navigate("scan")}>scan</button>, or open one from{" "}
          <button type="button" className="btn-sm" onClick={() => navigate("history")}>history</button>.
        </div>
      </div>
    );
  }

  const toggle = (set, setFn, v) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setFn(next);
  };
  const summaryHtml = result.project_summary ? marked.parse(result.project_summary) : "";

  return (
    <div>
      <h1 className="page-title">{title} results</h1>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="stat">
          <span className="n">{result.summary?.files_reviewed ?? 0}</span>
          <span className="l">files</span>
        </div>
        <div className="stat">
          <span className="n">{comments.length}</span>
          <span className="l">findings</span>
        </div>
        <div className="stat">
          <span className="n" style={{ color: "var(--crit)" }}>
            {counts.critical}
          </span>
          <span className="l">critical</span>
        </div>
        <div className="stat">
          <span className="n" style={{ color: "var(--red)" }}>
            {counts.high}
          </span>
          <span className="l">high</span>
        </div>
        <div className="stat">
          <span className="n">{result.summary?.total_tokens ?? 0}</span>
          <span className="l">tokens</span>
        </div>
        <div className="stat">
          <span className="n">{result.summary?.elapsed ?? "—"}</span>
          <span className="l">elapsed</span>
        </div>
      </div>
      <div className="tabs">
        <button type="button" className={`tab ${tab === "findings" ? "active" : ""}`} onClick={() => setTab("findings")}>
          Findings ({comments.length})
        </button>
        <button type="button" className={`tab ${tab === "fix" ? "active" : ""}`} onClick={() => setTab("fix")}>
          Fix prompts
        </button>
        {result.project_summary && (
          <button type="button" className={`tab ${tab === "summary" ? "active" : ""}`} onClick={() => setTab("summary")}>
            Project summary
          </button>
        )}
      </div>
      {tab === "findings" && (
        <>
          <div className="card">
            <div className="row" style={{ gap: 8 }}>
              <span className="muted">Severity:</span>
              {SEVERITIES.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`pill ${sevFilter.has(s) ? "" : "muted"}`}
                  style={{ borderColor: sevFilter.has(s) ? "var(--accent)" : undefined }}
                  onClick={() => toggle(sevFilter, setSevFilter, s)}
                  aria-pressed={sevFilter.has(s)}
                >
                  {s}
                </button>
              ))}
              <span className="muted" style={{ marginLeft: 12 }}>
                Sort:
              </span>
              <select style={{ width: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="severity">by severity</option>
                <option value="file">by file</option>
              </select>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <span className="muted">Category:</span>
              {CATEGORIES.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`pill ${catFilter.has(s) ? "" : "muted"}`}
                  style={{ borderColor: catFilter.has(s) ? "var(--accent)" : undefined }}
                  onClick={() => toggle(catFilter, setCatFilter, s)}
                  aria-pressed={catFilter.has(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {result.warnings?.map((w, i) => (
            <div key={i} className="card ico-text" style={{ borderColor: "var(--yellow)" }}>
              <Icon name="warning" size={14} /> {w.file ? `${w.file}: ` : ""}{w.message}
            </div>
          ))}
          {filtered.length === 0 ? (
            <div className="empty">
              {comments.length === 0 ? state.message : "No findings match the filters."}
            </div>
          ) : sort === "file" ? (
            Object.entries(grouped).map(([file, cs]) => (
              <div key={file} style={{ marginBottom: 20 }}>
                <h3 className="mono" style={{ margin: "0 0 10px" }}>
                  {file} <span className="muted">({cs.length})</span>
                </h3>
                {cs.map((c, i) => (
                  <CommentCard key={i} c={c} />
                ))}
              </div>
            ))
          ) : (
            filtered.map((c, i) => <CommentCard key={i} c={c} />)
          )}
        </>
      )}
      {tab === "fix" && (
        <div className="card">
          <h3>修护提示词 — Repair prompts for your coding agent</h3>
          <FixPromptPanel comments={comments} onToast={toast} />
        </div>
      )}
      {tab === "summary" && (
        <div className="card">
          <div dangerouslySetInnerHTML={{ __html: summaryHtml }} />
        </div>
      )}
    </div>
  );
}
