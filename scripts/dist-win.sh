#!/usr/bin/env bash
# Cross-build a per-user Windows NSIS installer (x64) from Linux.
# Bundles the official OpenCodeReview CLI v1.7.9 for Windows after sha256 verify.
# Does not bundle the fixture/mock CLI. Does not run any Windows exe.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="${OCR_CLI_DIR:-/workspace/opencodereview-e2e/official-cli/v1.7.9}"
CLI_NAME="opencodereview-windows-amd64.exe"
CLI_PATH="${OCR_WIN_CLI:-$CLI_DIR/$CLI_NAME}"
EXPECT_SHA="81a0c09f914fa592eed904e87711c0b13e343dae3fa316212c32f62fedd1c320"
OUT="${OCR_DIST_OUT:-/dev/shm/ocr-win-out}"

if [[ ! -f "$CLI_PATH" ]]; then
  echo "Official Windows CLI missing: $CLI_PATH" >&2
  exit 1
fi
actual="$(sha256sum "$CLI_PATH" | awk '{print $1}')"
if [[ "$actual" != "$EXPECT_SHA" ]]; then
  echo "Official Windows CLI checksum mismatch: $actual" >&2
  exit 1
fi
if grep -q "OCR-FIXTURE-CLI" "$CLI_PATH" 2>/dev/null; then
  echo "Refusing to pack a fixture/mock CLI" >&2
  exit 1
fi
if [[ "$(basename "$CLI_PATH")" == *fixture* ]]; then
  echo "Refusing to pack a fixture-named binary" >&2
  exit 1
fi

export OCR_WIN_CLI="$CLI_PATH"
export OCR_DIST_OUT="$OUT"
export CSC_IDENTITY_AUTO_DISCOVERY=false
export ELECTRON_CACHE="${ELECTRON_CACHE:-/dev/shm/ocr-electron-cache}"
export ELECTRON_BUILDER_CACHE="${ELECTRON_BUILDER_CACHE:-/tmp/ocr-eb-cache}"
mkdir -p "$OUT" "$ELECTRON_CACHE" "$ELECTRON_BUILDER_CACHE"

cd "$ROOT"
npx electron-vite build
npx electron-builder --win nsis --x64 --config electron-builder.config.mjs --publish never
echo "Windows pack finished. Output: $OUT"
ls -lh "$OUT"
