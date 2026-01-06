const { contextBridge, ipcRenderer } = require("electron");

const MOD_IPC_LOGS = String(process.env.MOD_IPC_LOGS || "").trim() === "1";

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),
  getSporeInstallPath: () => ipcRenderer.invoke("get-spore-install-path"),
  installMod: (modKey, downloadUrl, modTitle) =>
    ipcRenderer.invoke("install-mod", modKey, downloadUrl, modTitle),
  uninstallMod: (modKey, modTitle) =>
    ipcRenderer.invoke("uninstall-mod", modKey, modTitle),
  onModInstallProgress: (callback) => {
    const listener = (event, modId, progress) => callback(modId, progress);
    ipcRenderer.on("mod-install-progress", listener);
    return () => ipcRenderer.removeListener("mod-install-progress", listener);
  },
  isModInstalled: (modKey) => ipcRenderer.invoke("is-mod-installed", modKey),
  getModApiStatus: () => ipcRenderer.invoke("modapi-get-status"),
  ensureModApiKit: () => ipcRenderer.invoke("modapi-ensure-kit"),
  runSporeModApiLauncher: () => ipcRenderer.invoke("modapi-launcher-run"),
  runSporeModApiEasyInstaller: () =>
    ipcRenderer.invoke("modapi-easy-installer-run"),
  runSporeModApiEasyUninstaller: () =>
    ipcRenderer.invoke("modapi-easy-uninstaller-run"),
  galaxyReset: () => ipcRenderer.invoke("galaxy-reset"),
  onModOpsChanged: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on("mod-ops-changed", listener);
    return () => ipcRenderer.removeListener("mod-ops-changed", listener);
  },
  getModOpsState: () => ipcRenderer.invoke("mod-ops-get-state"),
  cancelModOp: (id) => ipcRenderer.invoke("mod-ops-cancel", id),

  onModLog: (callback) => {
    if (!MOD_IPC_LOGS) return () => {};
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on("mod-log", listener);
    return () => ipcRenderer.removeListener("mod-log", listener);
  },

  getUpdateState: () => ipcRenderer.invoke("app-update:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("app-update:check"),
  downloadUpdate: () => ipcRenderer.invoke("app-update:download"),
  installUpdate: () => ipcRenderer.invoke("app-update:install"),
  onUpdateState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on("app-update:state", listener);
    return () => ipcRenderer.removeListener("app-update:state", listener);
  },

  authDiscordStart: () => ipcRenderer.invoke("auth:discord:start"),
  authDiscordBegin: () => ipcRenderer.invoke("auth:discord:begin"),
  authOauthWait: () => ipcRenderer.invoke("auth:oauth:wait"),
  authOauthCancel: () => ipcRenderer.invoke("auth:oauth:cancel"),
  authOpenExternal: (url) => ipcRenderer.invoke("auth:open-external", url),

  downloadSporepediaImage: (imageUrl, suggestedName) =>
    ipcRenderer.invoke("sporepedia:download-image", imageUrl, suggestedName),
});
