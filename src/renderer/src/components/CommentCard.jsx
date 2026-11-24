import React, { useMemo, useState } from "react";
import hljs from "highlight.js";
import Icon from "./Icon.jsx";

import {
  SEVERITY_ORDER as SHARED_SEVERITY_ORDER,
  SEVERITIES as SHARED_SEVERITIES,
  groupByFile as sharedGroupByFile,
  buildFixPrompt as sharedBuildFixPrompt,
  buildMasterPrompt as sharedBuildMasterPrompt
} from "../../../shared/resultsModel.mjs";

export const SEVERITY_ORDER = SHARED_SEVERITY_ORDER;
export const SEVERITIES = SHARED_SEVERITIES;
export const CATEGORIES = [
  "bug",
  "security",
  "performance",
  "maintainability",
  "test",
  "style",
  "documentation",
  "other"
];

export function sevClass(sev) {
  switch ((sev || "").toLowerCase()) {
    case "critical":
      return "badge sev-critical";
    case "high":
      return "badge sev-high";
    case "medium":
      return "badge sev-medium";
    case "low":
      return "badge sev-low";
    default:
      return "badge sev-none";
  }
}

export function catIcon(cat) {
  switch ((cat || "").toLowerCase()) {
    case "bug":
      return "bug";
    case "security":
      return "security";
    case "performance":
      return "performance";
    case "maintainability":
      return "maintainability";
    case "test":
      return "test";
    case "style":
      return "style";
    case "documentation":
      return "documentation";
    default:
      return "dot";
  }
}

export const groupByFile = sharedGroupByFile;

export function fmtDuration(ns) {
  if (!ns) return "—";
  const s = ns / 1e9;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

export function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function shortId(id) {
  if (!id) return "—";
  return id.length > 12 ? id.slice(0, 12) : id;
}

function langFromPath(path) {
  const ext = path?.split(".").pop()?.toLowerCase();
  const map = {
    go: "go",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    java: "java",
    rb: "ruby",
    rs: "rust",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cs: "csharp",
    php: "php",
    kt: "kotlin",
    swift: "swift",
    scala: "scala",
    sh: "bash",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    sql: "sql"
  };
  return ext ? map[ext] : undefined;
}

function highlight(code, lang) {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }
}

export function DiffView({ existing, suggestion, path }) {
  const lang = langFromPath(path);
  const rendered = useMemo(() => {
    const del = (existing || "").replace(/\n$/, "").split("\n");
    const add = (suggestion || "").replace(/\n$/, "").split("\n");
    return { del: existing ? del : [], add: suggestion ? add : [] };
  }, [existing, suggestion]);
  if (!existing && !suggestion) return null;
  return (
    <div className="diff">
      {rendered.del.map((line, i) => (
        <span
          key={`d${i}`}
          className="line del"
          dangerouslySetInnerHTML={{ __html: "- " + highlight(line, lang) }}
        />
      ))}
      {rendered.add.map((line, i) => (
        <span
          key={`a${i}`}
          className="line add"
          dangerouslySetInnerHTML={{ __html: "+ " + highlight(line, lang) }}
        />
      ))}
    </div>
  );
}

export const buildFixPrompt = sharedBuildFixPrompt;

export const buildMasterPrompt = sharedBuildMasterPrompt;

async function copy(text) {
  await navigator.clipboard.writeText(text);
}

export function CommentCard({ c }) {
  const [showThinking, setShowThinking] = useState(false);
  return (
    <div className="comment">
      <div className="comment-head">
        <span className={sevClass(c.severity)}>{c.severity || "n/a"}</span>
        <span className="pill">
          <Icon name={catIcon(c.category)} size={13} /> {c.category || "other"}
        </span>
        <span className="comment-loc">
          {c.path}:{c.start_line}
          {c.end_line !== c.start_line ? `-${c.end_line}` : ""}
        </span>
      </div>
      <div className="comment-body">
        <p>{c.content}</p>
        <DiffView existing={c.existing_code} suggestion={c.suggestion_code} path={c.path} />
        {c.thinking && (
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn-sm" onClick={() => setShowThinking((v) => !v)}>
              {showThinking ? "Hide" : "Show"} model reasoning
            </button>
            {showThinking && (
              <pre className="code" style={{ padding: 12, background: "var(--bg)" }}>
                {c.thinking}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function FixPromptPanel({ comments, onToast }) {
  const byFile = useMemo(() => groupByFile(comments), [comments]);
  const files = Object.keys(byFile);
  const [selected, setSelected] = useState("__all__");
  const text =
    selected === "__all__" ? buildMasterPrompt(comments) : buildFixPrompt(selected, byFile[selected] || []);
  const doCopy = async () => {
    try {
      await copy(text);
      onToast("Prompt copied to clipboard");
    } catch {
      onToast("Copy failed", "err");
    }
  };
  if (comments.length === 0) return <div className="empty">No findings — nothing to fix.</div>;
  return (
    <div>
      <p className="muted">
        Paste the prompt below into your coding agent (Claude Code, Cursor, Codex…) to have it repair these findings.
      </p>
      <div className="field" style={{ maxWidth: 480 }}>
        <label>Prompt scope</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="__all__">
            Master prompt — fix all critical/high findings ({comments.length} total)
          </option>
          {files.map((f) => (
            <option key={f} value={f}>
              {f} ({byFile[f].length})
            </option>
          ))}
        </select>
      </div>
      <div className="copy-block">
        <button className="primary btn-sm copy-btn" onClick={doCopy}>
          Copy
        </button>
        <pre>{text}</pre>
      </div>
    </div>
  );
}
