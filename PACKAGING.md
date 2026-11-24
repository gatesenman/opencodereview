# Packaging OpenCodeReview Desktop

This tree is maintainable source for the Electron shell. It does **not** include the official `ocr` / `opencodereview` CLI, user config, or API keys.

## Develop and test (Linux, macOS, or Windows)

```bash
npm install
npm test
npm run build
npm run dev
```

If `npm install` skips `electron` / `esbuild` postinstall scripts, approve and rebuild those packages so Electron's platform binary is present.

Point the app at an official CLI:

1. Settings → App → ocr binary path, or
2. Place `opencodereview` (`opencodereview.exe` on Windows) in `resources/bin/`, or
3. Put `ocr` / `opencodereview` on `PATH`.

Download the CLI from https://github.com/alibaba/open-code-review/releases. Do not copy a user-uploaded exe into this repository.

## Windows installer notes (not run in this Linux workspace)

Packaging should be done **on Windows** (or a Windows CI image). A typical `electron-builder` layout:

- `appId` such as `com.opencodereview.desktop`
- `files`: `out/**`, `package.json`, `resources/bin/README.md` — never `node_modules` source maps you do not need, never `~/.opencodereview`, never `.env`
- `extraResources`: `resources/bin/opencodereview.exe` → `bin/opencodereview.exe` (the main process looks at `process.resourcesPath/bin/`)
- Do not embed `config.json`, API keys, or session jsonl in the installer
- Code signing and SmartScreen are the packager's responsibility; this repo has no release pipeline

This Linux box does not produce a Windows `.exe` installer and does not execute uploaded Windows binaries.

## Source zip hygiene

A source archive must exclude:

- `node_modules/`, `out/`, `dist/`
- `.env`, `.env.*`, `*.log`
- `.opencodereview/` and any `config.json` with secrets
- `resources/bin/opencodereview`, `resources/bin/opencodereview.exe`, and other CLI binaries

`npm test` includes a hygiene check for those rules in the working tree.
