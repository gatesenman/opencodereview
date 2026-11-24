# Bundled CLI slot

Place an official `opencodereview` (Windows: `opencodereview.exe`) binary here for unpackaged development. The desktop app looks at `resources/bin/` first when it is not packaged, then at Settings → CLI path, then at `PATH`.

Download a release from https://github.com/alibaba/open-code-review/releases — do not copy a user-uploaded exe into this tree, and do not commit the binary or any `config.json` / API keys.
