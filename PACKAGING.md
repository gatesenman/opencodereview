# Packaging OpenCodeReview Desktop

This tree is maintainable source for the Electron shell. It does **not** commit the official `ocr` / `opencodereview` CLI, user config, or API keys. The Windows installer (built separately) may bundle a verified official CLI at pack time.

## Develop and test (Linux, macOS, or Windows)

```bash
npm install
npm test          # unit/contract tests
npm run test:all  # unit + integration (fixture CLI only)
npm run build
npm run dev
```

If `npm install` skips `electron` / `esbuild` postinstall scripts, approve and rebuild those packages so Electron's platform binary is present.

Point a dev build at an official CLI:

1. Settings → App → ocr binary path, or
2. Place `opencodereview` (`opencodereview.exe` on Windows) in `resources/bin/`, or
3. Put `ocr` / `opencodereview` on `PATH`.

Download the CLI from https://github.com/alibaba/open-code-review/releases. Do not copy a user-uploaded exe into this repository. Never ship the test fixture CLI (`test/fixtures/ocr-fixture-cli.mjs`) inside an installer.

## Windows installer (NSIS, x64, per-user)

`scripts/dist-win.sh` uses `electron-builder` to cross-build a per-user NSIS Setup.exe from Linux (or Windows). It:

- verifies the official Windows CLI v1.7.9 sha256 (`81a0c09f914fa592eed904e87711c0b13e343dae3fa316212c32f62fedd1c320`) before packing
- copies that official `opencodereview-windows-amd64.exe` to `resources/bin/opencodereview.exe` inside the packaged app only (the exe is gitignored and is not part of the source tree)
- does not embed `config.json`, API keys, session jsonl, or the fixture/mock CLI
- uses `oneClick=false`, `perMachine=false`, `runAfterFinish=false`, and does not configure a logon autostart
- produces an **unsigned** installer (SmartScreen may warn)

Environment:

- `OCR_WIN_CLI` — path to the verified official Windows CLI
- `OCR_DIST_OUT` — output directory (do not treat `dist/` / `release-build/` as the only lasting copy)
- `ELECTRON_BUILDER_CACHE` — must be on a filesystem that allows executing binaries (`/tmp` is fine; `/dev/shm` on this box is `noexec`)
- `CSC_IDENTITY_AUTO_DISCOVERY=false` — skip signing when no certificate is present

A successful Linux cross-build is **not** a Windows install acceptance test. The installer must still be installed and tried on a real Windows machine.

## Source zip hygiene

A source archive must exclude:

- `node_modules/`, `out/`, `dist/`, `release-build/`
- `.env`, `.env.*`, `*.log`
- `.opencodereview/` and any `config.json` with secrets
- `resources/bin/opencodereview`, `resources/bin/opencodereview.exe`, and other CLI binaries

`npm test` includes a hygiene check for those rules in the working tree.
