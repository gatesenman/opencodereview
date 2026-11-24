/**
 * Shared rules for whether a finished review/scan should be committed to Results.
 * Used by the main process and by the renderer so a late "success" cannot
 * overwrite an explicit user cancel.
 */

function isCancelledExit(r, signal) {
  return Boolean(r?.cancelled || signal?.aborted);
}

function shouldCommitRunResult({ runId, activeRunId, cancelled, cancelledIds } = {}) {
  if (cancelled) return false;
  if (runId && cancelledIds && typeof cancelledIds.has === "function" && cancelledIds.has(runId)) {
    return false;
  }
  if (runId && activeRunId && activeRunId !== runId) return false;
  return true;
}

export { isCancelledExit, shouldCommitRunResult };
