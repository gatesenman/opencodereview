# OpenCodeReview Desktop 0.2.12

Cross-platform Electron GUI around the official `ocr` / `opencodereview` CLI. This tree is **reconstructed maintainable source** (main / preload / renderer) taken from a Windows 0.1.0 distribution (`app.asar`), then patched so the main loop matches the CLI. It is an independent wrapper, not part of the official [alibaba/open-code-review](https://github.com/alibaba/open-code-review) repository.

The original dark sidebar + card look is kept (`#0f1115`, `#171a21`, accent `#4f8cff` → `#7b5cff`, 220px sidebar). A Light theme is implemented as `body.light` token overrides only — same layout.

## Requirements

- Node.js 18+
- An official `ocr` / `opencodereview` CLI binary. This source tree does **not** ship that executable. Provide it via `PATH`, Settings → CLI path, or (for unpackaged dev) `resources/bin/opencodereview` (Windows: `opencodereview.exe`). Download a release from [alibaba/open-code-review](https://github.com/alibaba/open-code-review/releases). Do not copy a user-uploaded exe into the tree.

## Scripts

```bash
npm install
npm test          # unit / contract tests (no Electron window, no CLI, no model)
npm run build     # compile main, preload, and renderer into out/
npm run dev       # electron-vite development (needs a local Electron + official CLI)
```

`electron` and `esbuild` run postinstall scripts to fetch platform binaries. If `npm install` skips them, approve and rebuild those packages (for example `npm rebuild electron esbuild`).

See [PACKAGING.md](PACKAGING.md) for Windows installer notes, `extraResources` for the official CLI, and what must never go into a source zip or installer (keys, user config, uploaded exes). This repository has no release pipeline in-tree, and no Windows installer is produced from these Linux checks.

A change log for 0.2.1–0.2.12 is in [ITERATION_LOG.md](ITERATION_LOG.md).

## What 0.2.x fixes (relative to the 0.1.0 package)

- Settings writes CLI-canonical keys (`providers.*.api_key`, `custom_providers.*`, `mcp_servers.*`, `llm.auth_token`, `telemetry.otlp_endpoint`). The main process also rewrites typo keys from the 0.1.0 package if they are ever sent.
- Timeout is labeled and passed as **minutes**, matching `ocr review --help`. The numeric value is not converted.
- Preview never sends `--resume` together with `--preview`.
- History **Open** loads findings into the Results page (from `session show` plus the session `.jsonl` when comments are stored there). **Continue** only works for range/commit reviews and prefills `--from` / `--to` / `--commit`. Workspace and scan sessions are blocked with an explanation (the CLI does not support those resumes).
- A single app-level run lock, a run id created in the UI before start, Cancel that does not treat abort as a failure toast or jump to Results, overlay that stays if you switch pages, and a pending-cancel latch so Cancel clicked before the main process registers the run still aborts it.
- Persistent error toasts with Copy / Close; cancel vs failure are distinct.
- Light theme actually changes colors, applies immediately, and is restored on load.
- Language select still shows `en` / `zh` in the UI, but saves `English` / `Chinese` as in CLI examples (live CLI acceptance is not verified on this box).
- The Rules page is an inspector only; it does not silently attach `--rule` / `--tools` to the next run. Review and Scan advanced options can pass those flags.

## Tests vs what is still unverified

Passing `npm test` or `npm run build` is **not** a completed Windows end-to-end run, and must not be treated as one.

On this Linux box, `npm test` and `npm run build` have been run successfully:

- 67 unit/contract tests (argument building, config key rewriting, language mapping, preview parsing, session-to-results mapping, cancel-error detection, single-run / pending-cancel lock, and related contracts). These tests do not open an Electron window or talk to a live CLI or model.
- `electron-vite build` emitted `out/main/index.js` (shared modules inlined), `out/preload/index.js`, and the renderer assets.

Still needs a human pass on a real Windows machine with an official CLI, a real repository, and an LLM:

- `ocr config set` against a live CLI (especially `language English` / `Chinese`, and that typo keys are rejected by the CLI only after canonicalization)
- `session show` + jsonl actually containing full comment bodies
- Scan progress events using `review_item_*` types
- Cancel killing the Windows process tree (`taskkill /T`)
- End-to-end review / scan against a live model
- Packaged path resolution for `resources/bin/opencodereview.exe`
- Light theme contrast on a real display

## License

Apache-2.0, matching the original desktop package.
