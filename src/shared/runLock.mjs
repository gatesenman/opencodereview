/** Single-run lock with pending-cancel so an early Cancel still aborts a late start. */

function createRunLock() {
  let activeRunId = null;
  const controllers = new Map();
  const pendingCancel = new Set();

  function begin(runId) {
    if (!runId) return { ok: false, error: "runId required" };
    if (pendingCancel.has(runId)) {
      pendingCancel.delete(runId);
      return { ok: false, cancelled: true };
    }
    if (activeRunId) {
      return { ok: false, busy: true, activeRunId };
    }
    const controller = new AbortController();
    controllers.set(runId, controller);
    activeRunId = runId;
    return { ok: true, controller, runId };
  }

  function cancel(runId) {
    if (!runId) return false;
    const rec = controllers.get(runId);
    if (rec) {
      rec.abort();
      return true;
    }
    pendingCancel.add(runId);
    return true;
  }

  function end(runId) {
    if (!runId) return;
    controllers.delete(runId);
    pendingCancel.delete(runId);
    if (activeRunId === runId) activeRunId = null;
  }

  function isActive(runId) {
    return Boolean(runId) && activeRunId === runId;
  }

  return {
    begin,
    cancel,
    end,
    isActive,
    getActiveId: () => activeRunId
  };
}

export { createRunLock };
