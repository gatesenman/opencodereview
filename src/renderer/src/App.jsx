import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Icon from "./components/Icon.jsx";
import ProgressOverlay from "./components/ProgressOverlay.jsx";
import ReviewView from "./views/ReviewView.jsx";
import ScanView from "./views/ScanView.jsx";
import ResultsView from "./views/ResultsView.jsx";
import HistoryView from "./views/HistoryView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import RulesView from "./views/RulesView.jsx";
import AboutView from "./views/AboutView.jsx";
import { applyTheme } from "./theme.js";
import { isCancelError, classifyRunError } from "../../shared/runErrors.mjs";
import { shouldCommitRunResult } from "../../shared/runOutcome.mjs";
import { isCancelKey } from "../../shared/a11y.mjs";

const Ctx = createContext(null);
export function useApp() {
  return useContext(Ctx);
}

const NAV = [
  { key: "review", label: "Review", icon: "review" },
  { key: "scan", label: "Scan", icon: "scan" },
  { key: "results", label: "Results", icon: "results" },
  { key: "history", label: "History", icon: "history" },
  { key: "rules", label: "Rules", icon: "rules" },
  { key: "settings", label: "Settings", icon: "settings" },
  { key: "about", label: "About & Update", icon: "about" }
];

export default function App() {
  const [view, setView] = useState("review");
  const [repoDir, setRepoDirState] = useState("");
  const [result, setResult] = useState(null);
  const [resultTitle, setResultTitle] = useState("");
  const [resumeDraft, setResumeDraft] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [runKind, setRunKind] = useState("review");
  const runRef = useRef({ cancelled: false, runId: null });
  const cancelledIds = useRef(new Set());
  const toastTimer = useRef(null);

  useEffect(() => {
    window.ocr.settings.get().then((s) => applyTheme(s.theme === "light" ? "light" : "dark"));
  }, []);

  const toast = useCallback((msg, kind = "ok") => {
    setToastMsg({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (kind !== "err") {
      toastTimer.current = setTimeout(() => setToastMsg(null), 4200);
    }
  }, []);

  const setRepoDir = useCallback((d) => {
    setRepoDirState(d);
    try {
      localStorage.setItem("ocr.repoDir", d);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ocr.repoDir");
      if (saved) setRepoDirState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const off = window.ocr.onProgress((e) => {
      if (e?.runId && cancelledIds.current.has(e.runId) && e.phase === "done") {
        return;
      }
      if (!runRef.current.runId || e.runId === runRef.current.runId) {
        setProgress(e);
        if (e.runId) runRef.current.runId = e.runId;
      }
    });
    return off;
  }, []);

  const goResults = useCallback((r, title) => {
    setResult(r);
    setResultTitle(title);
    setView("results");
  }, []);

  const startRun = useCallback(
    async ({ kind, opts, total, title }) => {
      if (runRef.current.runId && running) {
        toast("A review or scan is already running. Cancel it first.", "err");
        return { error: new Error("already running") };
      }
      const runId = crypto.randomUUID();
      cancelledIds.current.delete(runId);
      runRef.current = { cancelled: false, runId };
      setRunKind(kind);
      setRunning(true);
      setProgress({
        runId,
        phase: "starting",
        total: total || 0,
        completed: 0,
        reused: 0,
        failed: 0,
        elapsedMs: 0
      });
      try {
        const fn = kind === "scan" ? window.ocr.scan.start : window.ocr.review.start;
        const next = await fn({ ...opts, runId }, total);
        if (
          !shouldCommitRunResult({
            runId,
            activeRunId: runRef.current.runId,
            cancelled: runRef.current.cancelled,
            cancelledIds: cancelledIds.current
          })
        ) {
          toast("Cancelled.");
          return { cancelled: true };
        }
        goResults(next, title);
        toast(`${kind === "scan" ? "Scan" : "Review"} complete: ${next.comments?.length ?? 0} finding(s).`);
        return { result: next };
      } catch (err) {
        if (
          isCancelError(err) ||
          runRef.current.cancelled ||
          cancelledIds.current.has(runId)
        ) {
          toast("Cancelled.");
          return { cancelled: true };
        }
        const classified = classifyRunError(err);
        toast(classified.message, "err");
        return { error: err, kind: classified.kind };
      } finally {
        if (runRef.current.runId === runId) {
          setRunning(false);
          runRef.current.runId = null;
        }
      }
    },
    [goResults, running, toast]
  );

  const cancelRun = useCallback(() => {
    const id = runRef.current.runId || progress?.runId;
    runRef.current.cancelled = true;
    if (id) cancelledIds.current.add(id);
    if (id) window.ocr.cancelRun(id);
  }, [progress]);

  useEffect(() => {
    if (!running) return undefined;
    const onKey = (e) => {
      if (isCancelKey(e.key)) {
        e.preventDefault();
        cancelRun();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, cancelRun]);

  const ctx = {
    repoDir,
    setRepoDir,
    toast,
    goResults,
    navigate: setView,
    resumeDraft,
    setResumeDraft,
    startRun,
    cancelRun,
    running,
    progress
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <span className="dot" />
            OpenCodeReview
          </div>
          {NAV.map((n) => (
            <button
              type="button"
              key={n.key}
              className={`nav-item ${view === n.key ? "active" : ""}`}
              aria-current={view === n.key ? "page" : undefined}
              onClick={() => setView(n.key)}
            >
              <span className="ico">
                <Icon name={n.icon} size={17} />
              </span>
              {n.label}
            </button>
          ))}
          <div className="spacer" />
          <RepoPicker />
        </aside>
        <main className="main">
          {view === "review" && <ReviewView />}
          {view === "scan" && <ScanView />}
          {view === "results" && <ResultsView result={result} title={resultTitle} />}
          {view === "history" && <HistoryView />}
          {view === "rules" && <RulesView />}
          {view === "settings" && <SettingsView />}
          {view === "about" && <AboutView />}
        </main>
      </div>
      {running && (
        <ProgressOverlay
          progress={progress}
          onCancel={cancelRun}
          label={runKind === "scan" ? "Scanning your code" : "Reviewing your code"}
        />
      )}
      {toastMsg && (
        <div className={`toast ${toastMsg.kind === "err" ? "err" : ""}`}>
          <div className="toast-msg">{toastMsg.msg}</div>
          <div className="toast-actions">
            {toastMsg.kind === "err" && (
              <button
                className="btn-sm"
                onClick={() => navigator.clipboard.writeText(String(toastMsg.msg)).catch(() => {})}
              >
                Copy
              </button>
            )}
            <button className="btn-sm" onClick={() => setToastMsg(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

function RepoPicker() {
  const { repoDir, setRepoDir } = useApp();
  const pick = async () => {
    const d = await window.ocr.dialog.openDir();
    if (d) setRepoDir(d);
  };
  return (
    <div className="repo-chip">
      <div style={{ marginBottom: 6 }}>
        <b>Repository</b>
      </div>
      <div style={{ marginBottom: 8 }}>{repoDir || "No folder selected"}</div>
      <button className="btn-sm" style={{ width: "100%" }} onClick={pick}>
        Choose folder…
      </button>
    </div>
  );
}
