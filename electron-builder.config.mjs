import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const officialWinCli =
  process.env.OCR_WIN_CLI ||
  "/workspace/opencodereview-e2e/official-cli/v1.7.9/opencodereview-windows-amd64.exe";

/** electron-builder config for a per-user NSIS installer. Not a signed/stable release. */
export default {
  appId: "com.opencodereview.desktop",
  productName: "OpenCodeReview",
  copyright: "Copyright © OpenCodeReview Desktop contributors. Bundled official CLI is from alibaba/open-code-review under its license.",
  artifactName: "${productName}-Setup-${version}-${os}-${arch}.${ext}",
  directories: {
    output: process.env.OCR_DIST_OUT || path.join(__dirname, "release-build"),
    buildResources: path.join(__dirname, "build-resources")
  },
  files: ["out/**", "package.json", "LICENSE", "THIRD_PARTY.md"],
  extraResources: [
    {
      from: officialWinCli,
      to: "bin/opencodereview.exe"
    }
  ],
  extraMetadata: {
    name: "open-code-review-desktop",
    main: "./out/main/index.js"
  },
  asar: true,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    signtoolOptions: {
      publisherName: "OpenCodeReview"
    },
    verifyUpdateCodeSignature: false
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "OpenCodeReview",
    runAfterFinish: false,
    deleteAppDataOnUninstall: false,
    include: undefined,
    license: "LICENSE",
    artifactName: "OpenCodeReview-Setup-${version}-win-x64.exe"
  }
};
