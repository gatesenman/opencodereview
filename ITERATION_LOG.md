# Iteration log

All work is on this Linux box. Unit/contract tests run here. Real Windows GUI and live-LLM runs are **not** claimed as verified.

## 0.2.1 — Round 1: config write / read-back loop

- **What:** Added `validateConfigMutation`, `configLooksSaved`, and `isSecretConfigKey`. Settings no longer silently ignores empty saves; typo keys and `language` (`en`/`zh` → `English`/`Chinese`) are canonicalized before `ocr config set`. Multi-field saves (provider+model, MCP command+args, telemetry) run sequentially instead of racing two `config set` calls. After a successful write, the UI re-reads `config.json` and warns if the key is missing. Secret fields are treated as saved when present or redacted; raw secret values are never put in toasts.
- **Why:** Empty clicks looked like no-ops, concurrent sets could clobber each other, and a typo key could "succeed" in the UI while the file still used snake_case reads.
- **Verified:** `npm test` (see below). Not verified: a live `ocr config set` against a real CLI / `~/.opencodereview/config.json` on Windows.

## 0.2.2 — Round 2: CLI missing / path diagnosis

- **What:** Extracted `listBinaryCandidates` / `resolveBinaryPath` / `explainSpawnError` / `describeBinaryStatus`. Main process uses the same candidate order (Settings path, packaged `resources/bin`, unpackaged `resources/bin` + `dist`, then PATH names). Spawn `ENOENT` becomes a Settings/PATH hint instead of a raw `spawn ocr ENOENT`. Settings → App has a "Check CLI path" status (exists-on-disk only; it does not execute any CLI, including uploaded exes).
- **Why:** A missing CLI used to fail the whole configure → review loop with an unhelpful spawn error, and path logic lived only in main so it could not be tested.
- **Verified:** `npm test`. Not verified: locating a real Windows `opencodereview.exe` after packaging, or `taskkill` of a running CLI.

## 0.2.3 — Round 3: run option validation, timeout, --rule/--tools

- **What:** Added `validateRunOptions` used by Review and Scan before preview/run. Timeout, concurrency, and similar flags must be integers ≥ 1 (minutes for timeout; empty still means CLI default 10). Resume + workspace is rejected in the UI, not only after a CLI error. Advanced options now expose `--rule` and `--tools` on both Review and Scan (Rules page remains inspect-only).
- **Why:** `timeout: 0` or `concurrency: NaN` could be forwarded as flags; a user could switch a continued session to workspace and hit a CLI refusal; rule/tools were implemented in argv builders but missing from the forms.
- **Verified:** `npm test`. Not verified: a live CLI accepting `--rule` / `--tools` or enforcing timeout minutes on Windows.

## 0.2.4 — Round 4: scan path lists and preview parsing

- **What:** `normalizeScanPaths` trims comma/semicolon/newline lists before `--path`. `parsePreview` accepts "Will scan", "Excluded from scan", a plain "Preview: N file(s)" line without +/- counts, and badge rows that appear before a section header; it back-fills totals from parsed entries. `previewLooksEmpty` no longer requires the word "Preview:".
- **Why:** Scan previews and messy path input (spaces, multiple lines) could yield empty tables or a missing `--path` value, breaking the preview → run step.
- **Verified:** `npm test` with review and scan fixtures. Not verified: exact current official CLI preview wording on Windows.

## 0.2.5 — Round 5: session list parsing and Continue constraints

- **What:** `parseSessionList` accepts a raw array, `{sessions|data|items|results}`, or JSON buried in CLI logs, and always returns an array (wired into `session:list` and History). `planContinue` now blocks missing session id, range without `--from/--to`, and commit without a hash. Comments opened from History are deduplicated by path/line/severity/text.
- **Why:** A wrapped or slightly messy `session list --json` would crash History (`sessions.map`). Continue could land on Review with empty from/to and then fail at the CLI. Duplicate comments made Results look inflated.
- **Verified:** `npm test`. Not verified: real `session list/show` payloads from a live CLI on Windows.

## 0.2.6 — Round 6: result JSON and session mapping robustness

- **What:** `parseJsonResult` now walks brace-matched JSON objects in mixed stdout (strings/escapes included) and prefers the last object that looks like a review result, so a `{` in a log line cannot swallow the payload. `mapSessionToResult` accepts a JSON string, camelCase duration/id/mode fields, and string warnings (normalized to `{file,message}` for the Results view).
- **Why:** A naive first-`{` to last-`}` slice broke when the CLI printed extra braces; History/Results could show 0 files or throw when opening slightly different session shapes.
- **Verified:** `npm test`. Not verified: every official `review --format json` / `session show` variant from a live Windows CLI.

## 0.2.7 — Round 7: run error classes, secret redaction, progress time

- **What:** `classifyRunError` distinguishes cancel vs missing CLI vs parse vs generic, and `redactSecrets` strips api_key/token-like values from toasts. The App failure toast uses the classifier. Progress overlay elapsed time no longer shows `NaNs`; longer runs show `Nm Ns`. Phase copy is generic ("Starting" / "Working through files") so Scan is not labeled as a review.
- **Why:** A missing binary or a parse error looked like a generic failure; elapsed `undefined/1000` was `NaN`; secret material could theoretically appear in CLI stderr toasts.
- **Verified:** `npm test`. Not verified: real Windows spawn failures or that every vendor CLI stderr shape is classified correctly.

## 0.2.8 — Round 8: Results filters, empty states, fix prompts

- **What:** Moved grouping, sorting/filtering, result empty-state copy, and fix-prompt builders into `resultsModel`. Results uses them so History-opened sessions with file counts but no stored comment text show a counts-only explanation instead of "your code looks clean." Filters/sort are unit-tested. String warnings without a file path no longer render as `: message`.
- **Why:** Opening an older session could look like a successful clean review when the finding bodies were simply absent; filter logic lived only in the view.
- **Verified:** `npm test`. Not verified: a real History session whose jsonl truly lacks comment bodies on Windows.

## 0.2.9 — Round 9: keyboard access for primary actions

- **What:** Sidebar nav, Settings/Review/Results tabs, and Results severity/category pills are real buttons with `:focus-visible` rings. History rows can be opened with Enter/Space. Escape cancels an in-flight run. The progress overlay is a modal dialog and focuses Cancel. In-page `<a onClick>` controls (empty Results links, Show advanced, model reasoning) are buttons. Look of the dark sidebar + cards is unchanged aside from focus outlines.
- **Why:** Those controls were mouse-only, which blocked completing configure → review → results from the keyboard.
- **Verified:** `npm test` for key helpers; markup compiled later with `npm run build`. Not verified: actual keyboard feel on a Windows desktop session.

## 0.2.10 — Round 10: Light/Dark contrast and window chrome

- **What:** Shared `themeTokens` drive both the renderer and the Electron window background, so switching theme also updates the window chrome (not only `body.light`). Light theme no longer uses white text on the pale active-sidebar chip (that was unreadable). Danger-button borders and a few hljs diff/comment tokens were adjusted for light backgrounds. Dark palette and layout are unchanged.
- **Why:** Light was selectable but the active nav and window letterbox stayed dark-theme colored, which hurt the configure/results screens.
- **Verified:** `npm test` for token helpers. Not verified: contrast on a real Windows display or title-bar integration.

## 0.2.11 — Round 11: packaging docs and source hygiene checks

- **What:** Added `PACKAGING.md` (dev/test commands, how to attach the official CLI, Windows `electron-builder` / `extraResources` notes, and a hard exclusion list for secrets and binaries). README now points at it. `sourceHygiene` tests assert `private: true`, `.gitignore` coverage, and that the source tree has no `.env`, user `config.json`, `.exe`, or live-looking tokens.
- **Why:** Rebuilds and hand-offs were missing an explicit "do not ship keys or the uploaded exe" contract, which matters more than adding a release pipeline here.
- **Verified:** `npm test` hygiene checks on this tree. Not verified: an actual Windows installer or `electron-builder` run (not executed on this Linux box).

## 0.2.12 — Round 12: end-to-end main-flow contract

- **What:** Added `flowContract` tests that stitch the real helpers for the main loop: typo key + language save/read-back, run validation (including resume-vs-workspace), preview argv without `--resume`, timeout minutes, single-run lock and pending cancel, JSON result parse, History list/open (including jsonl comments), Continue prefill, scan path lists, missing-CLI error class, and counts-only History state. Final version is 0.2.12. Also re-ran `npm run build` after all 12 rounds.
- **Why:** Individual units can pass while the configure → review → results → history chain still has a mismatch; this is the closest verification this Linux box can do without a Windows GUI or a live model.
- **Verified:** `npm test` and `npm run build`. Still not verified: a real Windows desktop session, `taskkill /T`, live `ocr config set`, or a review against an LLM.


## 0.2.13 — Cancel vs completion, aborted History sessions, Windows pre-release prep

- **What:** Hardened cancel so a user Cancel cannot be overwritten by a later successful CLI exit: the main process treats an aborted signal as cancelled even if the child already printed JSON, escalates SIGTERM with SIGKILL, and the renderer keeps a per-run cancel latch (`shouldCommitRunResult`) and always toasts "Cancelled." instead of jumping to Results. History no longer formats official Go zero-time (`0001-01-01T00:00:00Z`) as `1/1/1`; aborted/incomplete sessions show a Status badge and Results copy that does not say the code is clean. Isolated GUI fixture delay is 18s so cancel can be verified with a clear window. Added unit and integration regression tests (including an 18s cancel window and pending-cancel-before-start). Version is 0.2.13.
- **Why:** GUI acceptance with the 4s fixture saw Cancel lose to "Review complete" and Results; official `review --preview` writes aborted empty sessions whose zero date and empty state looked like a clean review.
- **Verified:** `npm test` / `npm run test:all` and `npm run build` on Linux. The 4s GUI cancel failure is not claimed to have a single proven root cause (tool click delay and an app completion race are both consistent with the argv log). Not verified: a real Windows desktop install, signed NSIS, or a live official-CLI cancel on Windows.
