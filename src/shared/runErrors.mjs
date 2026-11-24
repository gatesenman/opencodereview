const CANCEL_CODE = "OCR_CANCELLED";

function cancelledError(message = "Run cancelled") {
  const err = new Error(message);
  err.code = CANCEL_CODE;
  err.name = "CancelledError";
  return err;
}

function isCancelError(err) {
  if (!err) return false;
  if (err.code === CANCEL_CODE || err.code === "ABORT_ERR") return true;
  if (err.name === "AbortError" || err.name === "CancelledError") return true;
  const msg = String(err.message || err || "").toLowerCase();
  return (
    msg.includes("ocr_cancelled") ||
    /\b(cancelled|canceled|aborted)\b/.test(msg)
  );
}

function errorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return String(err.message || err);
}

function redactSecrets(text) {
  return String(text ?? "")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-***")
    .replace(/\b(api[_-]?key|auth[_-]?token|password|secret)\s*[:=]\s*(["']?)[^\s"']+\2/gi, "$1=***");
}

function classifyRunError(err, extra = {}) {
  if (extra.cancelled || isCancelError(err)) {
    return { kind: "cancelled", message: "Cancelled." };
  }
  const raw = redactSecrets([errorMessage(err), extra.stderr, extra.stdout].filter(Boolean).join("\n"));
  if (/CLI was not found|spawn .*ENOENT|ENOENT|not found \((?:ocr|opencodereview)/i.test(raw)) {
    return {
      kind: "missing-cli",
      message:
        extra.hint ||
        "OpenCodeReview CLI was not found. Set the binary path in Settings, place it in resources/bin/, or add it to PATH."
    };
  }
  if (/could not parse|unexpected end|not valid json/i.test(raw)) {
    return { kind: "parse", message: raw.trim() || "Could not parse the CLI result." };
  }
  return { kind: "error", message: raw.trim() || "Unknown error" };
}

function formatElapsedSeconds(elapsedMs) {
  const n = Number(elapsedMs);
  if (!Number.isFinite(n) || n < 0) return "0s";
  const s = Math.round(n / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatErrorMessage(err, extra) {
  return classifyRunError(err, extra).message;
}

export {
  CANCEL_CODE,
  cancelledError,
  isCancelError,
  errorMessage,
  redactSecrets,
  classifyRunError,
  formatElapsedSeconds,
  formatErrorMessage
};
