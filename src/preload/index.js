"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  version: () => ipcRenderer.invoke("app:version"),
  binaryStatus: () => ipcRenderer.invoke("binary:status"),
  config: {
    read: () => ipcRenderer.invoke("config:read"),
    set: (key, value) => ipcRenderer.invoke("config:set", key, value),
    unset: (key) => ipcRenderer.invoke("config:unset", key)
  },
  llm: {
    providers: () => ipcRenderer.invoke("llm:providers"),
    test: () => ipcRenderer.invoke("llm:test")
  },
  review: {
    preview: (o) => ipcRenderer.invoke("review:preview", o),
    start: (o, total) => ipcRenderer.invoke("review:start", o, total)
  },
  scan: {
    preview: (o) => ipcRenderer.invoke("scan:preview", o),
    start: (o, total) => ipcRenderer.invoke("scan:start", o, total)
  },
  cancelRun: (runId) => {
    ipcRenderer.send("run:cancel", runId);
    return ipcRenderer.invoke("run:cancel", runId);
  },
  session: {
    list: (repoDir) => ipcRenderer.invoke("session:list", repoDir),
    show: (repoDir, id) => ipcRenderer.invoke("session:show", repoDir, id),
    open: (repoDir, id) => ipcRenderer.invoke("session:open", repoDir, id)
  },
  rules: {
    check: (repoDir, file) => ipcRenderer.invoke("rules:check", repoDir, file)
  },
  update: {
    check: () => ipcRenderer.invoke("update:check"),
    download: (info) => ipcRenderer.invoke("update:download", info)
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (next) => ipcRenderer.invoke("settings:set", next)
  },
  dialog: {
    openDir: () => ipcRenderer.invoke("dialog:openDir"),
    openFile: () => ipcRenderer.invoke("dialog:openFile")
  },
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openPath: (p) => ipcRenderer.invoke("shell:openPath", p),
  onProgress: (cb) => {
    const handler = (_evt, data) => cb(data);
    ipcRenderer.on("ocr:progress", handler);
    return () => ipcRenderer.removeListener("ocr:progress", handler);
  }
};

contextBridge.exposeInMainWorld("ocr", api);
