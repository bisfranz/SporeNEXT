const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const { getSporeInstallPath } = require("./gameRegistry");
const modsConfig = require("./modsConfig");
const { Worker } = require("worker_threads");
const {
  getLegacyPathInfoFile,
  getExistingModApiInstallPath,
  resolveModApiBasePath,
  ensureModApiKitInstalled,
  getModApiLauncherExePath,
} = require("./sporeModApi");
const { spawn } = require("child_process");
const { galaxyReset } = require("./galaxyReset");
const { isModInstalled } = require("./modInstaller");
const { createModOpQueue } = require("./modOpQueue");
const { autoUpdater } = require("electron-updater");
const { startOauthLoopbackServer } = require("./oauthLoopback");
const fs = require("fs");
const https = require("https");
const http = require("http");

const MOD_WORKER_TIMEOUT_MS = Number(
  process.env.MOD_WORKER_TIMEOUT_MS || 15 * 60 * 1000
);
const MOD_WORKER_DEBUG =
  String(process.env.MOD_WORKER_DEBUG || "").trim() === "1";
const MOD_QUEUE_DEBUG =
  String(process.env.MOD_QUEUE_DEBUG || "").trim() === "1";
const MOD_IPC_LOGS = String(process.env.MOD_IPC_LOGS || "").trim() === "1";

let modQueue = null;

let updateState = {
  status: "idle",
  downloadPercent: 0,
  version: null,
  releaseName: null,
  releaseNotes: null,
  error: null,
};

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  sendToAll("app-update:state", updateState);
}

function initAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    setUpdateState({ status: "checking", error: null, downloadPercent: 0 });
  });

  autoUpdater.on("update-available", (info) => {
    setUpdateState({
      status: "available",
      version: info?.version || null,
      releaseName: info?.releaseName || null,
      releaseNotes: info?.releaseNotes || null,
      error: null,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    setUpdateState({
      status: "not-available",
      version: info?.version || null,
      releaseName: info?.releaseName || null,
      error: null,
    });
  });

  autoUpdater.on("download-progress", (p) => {
    const percent = typeof p?.percent === "number" ? p.percent : 0;
    setUpdateState({ status: "downloading", downloadPercent: percent });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setUpdateState({
      status: "downloaded",
      downloadPercent: 100,
      version: info?.version || info?.version || null,
      releaseName: info?.releaseName || null,
      releaseNotes: info?.releaseNotes || null,
      error: null,
    });
  });

  autoUpdater.on("error", (err) => {
    setUpdateState({ status: "error", error: err?.message || String(err) });
  });
}

function scheduleUpdateCheck() {
  if (!app.isPackaged) return;

  try {
    autoUpdater.checkForUpdates().catch(() => {});
  } catch {}
}

function sendToAll(channel, ...args) {
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents?.send(channel, ...args);
      } catch {}
    }
  } catch {}
}

function broadcastModLog(payload) {
  try {
    if (!MOD_IPC_LOGS) return;
    sendToAll("mod-log", payload);
  } catch {}
}

app.setName("Spore NEXT Launcher");
app.setPath("userData", path.join(app.getPath("appData"), app.getName()));

function runModWorker(type, modId, downloadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const isLegacy = modId === "4gbpatch" || modId === "60fps";
    const config = isLegacy ? modsConfig[modId] : null;

    if (isLegacy && !config) return reject(new Error("Mod config not found"));

    const worker = new Worker(path.join(__dirname, "modInstallerWorker.js"));

    let settled = false;
    const startedAt = Date.now();
    let timeout = null;

    const safeTerminate = () => {
      try {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      } catch {}
      try {
        worker.removeAllListeners("message");
        worker.removeAllListeners("error");
        worker.removeAllListeners("exit");
      } catch {}
      try {
        worker.terminate();
      } catch {}
    };

    const settleReject = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
      safeTerminate();
    };

    const settleResolve = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
      safeTerminate();
    };

    timeout = setTimeout(() => {
      const elapsed = Date.now() - startedAt;
      const err = new Error(
        `MOD_WORKER_TIMEOUT: ${type}(${modId}) exceeded ${MOD_WORKER_TIMEOUT_MS}ms (elapsed ${elapsed}ms)`
      );
      err.code = "MOD_WORKER_TIMEOUT";
      if (MOD_WORKER_DEBUG) {
        console.error("[main] mod worker timeout", {
          type,
          modId,
          elapsed,
          timeoutMs: MOD_WORKER_TIMEOUT_MS,
        });
      }
      settleReject(err);
    }, MOD_WORKER_TIMEOUT_MS);

    if (MOD_WORKER_DEBUG) {
      console.log("[main] mod worker start", {
        type,
        modId,
        timeoutMs: MOD_WORKER_TIMEOUT_MS,
      });
    }

    worker.postMessage({
      type,
      payload: {
        ...(config || {}),
        downloadUrl: downloadUrl || config?.downloadUrl,
        modKey: modId,
      },
    });

    worker.on("message", (msg) => {
      if (msg.type === "progress") {
        if (MOD_WORKER_DEBUG) {
          console.log("[main] mod worker progress", {
            type,
            modId,
            modKey: msg.modKey || modId,
            step: msg.progress?.step,
            percent: msg.progress?.percent,
          });
        }
        if (onProgress)
          onProgress({ progress: msg.progress, modKey: msg.modKey || modId });
      } else if (msg.type === "done") {
        if (MOD_WORKER_DEBUG) {
          console.log("[main] mod worker done", {
            type,
            modId,
            elapsed: Date.now() - startedAt,
          });
        }
        settleResolve(msg.result);
      } else if (msg.type === "error") {
        if (MOD_WORKER_DEBUG) {
          console.error("[main] mod worker error message", {
            type,
            modId,
            error: msg.error,
            code: msg.code,
          });
        }
        const err = new Error(msg.error);
        if (msg.code) err.code = msg.code;
        settleReject(err);
      } else if (msg.type === "log") {
        if (!MOD_IPC_LOGS) return;
        broadcastModLog({
          source: "worker",
          opType: type,
          modKey: msg?.data?.modKey || msg?.modKey || modId,
          level: msg?.level || "info",
          message: msg?.message || "",
          data: msg?.data ?? null,
          at: msg?.at || Date.now(),
        });
      }
    });

    worker.on("error", (err) => {
      if (MOD_WORKER_DEBUG) {
        console.error("[main] mod worker error event", {
          type,
          modId,
          error: err?.message,
        });
      }
      settleReject(err);
    });

    worker.on("exit", (code) => {
      if (settled) return;
      if (MOD_WORKER_DEBUG) {
        console.log("[main] mod worker exit", {
          type,
          modId,
          code,
          elapsed: Date.now() - startedAt,
        });
      }
      if (typeof code === "number" && code !== 0) {
        settleReject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

function downloadToFile(url, outPath) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const client = u.protocol === "https:" ? https : http;

      const request = client.get(
        url,
        {
          headers: {
            "User-Agent": "Spore NEXT Launcher",
          },
        },
        (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            return resolve(downloadToFile(res.headers.location, outPath));
          }

          if (res.statusCode !== 200) {
            res.resume();
            return reject(
              new Error(`DOWNLOAD_FAILED: HTTP ${res.statusCode || "?"}`)
            );
          }

          const file = fs.createWriteStream(outPath);
          file.on("finish", () => file.close(() => resolve({ outPath })));
          file.on("error", (err) => {
            try {
              file.close(() => {
                try {
                  fs.unlinkSync(outPath);
                } catch {}
                reject(err);
              });
            } catch {
              reject(err);
            }
          });

          res.pipe(file);
        }
      );

      request.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

function sanitizeFilename(name) {
  return String(name || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function createWindow() {
  const isPackaged = app.isPackaged;

  const win = new BrowserWindow({
    width: 1360,
    height: 768,
    minWidth: 1360,
    minHeight: 768,
    frame: false,
    resizable: false,
    maximizable: true,
    transparent: false,
    backgroundColor: "#111722",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      devTools: !isPackaged,
    },
  });

  if (isPackaged) {
    try {
      win.webContents.on("before-input-event", (event, input) => {
        const key = String(input?.key || "").toLowerCase();
        const ctrlOrCmd = Boolean(input?.control || input?.meta);
        const shift = Boolean(input?.shift);

        const isF11 = key === "f11";
        const isF12 = key === "f12";
        const isCtrlShiftI = ctrlOrCmd && shift && key === "i";
        const isCtrlShiftJ = ctrlOrCmd && shift && key === "j";

        if (isF11 || isF12 || isCtrlShiftI || isCtrlShiftJ) {
          event.preventDefault();
        }
      });
    } catch {}
  }

  if (!modQueue) {
    modQueue = createModOpQueue({ sendToAll });
  }

  ipcMain.handle("app-update:get-state", async () => {
    return updateState;
  });

  ipcMain.handle("app-update:check", async () => {
    if (!app.isPackaged) {
      setUpdateState({
        status: "error",
        error: "Updates only available in packaged builds.",
      });
      return updateState;
    }
    try {
      await autoUpdater.checkForUpdates();
      return updateState;
    } catch (e) {
      setUpdateState({ status: "error", error: e?.message || String(e) });
      return updateState;
    }
  });

  ipcMain.handle("app-update:download", async () => {
    if (!app.isPackaged) {
      setUpdateState({
        status: "error",
        error: "Updates only available in packaged builds.",
      });
      return updateState;
    }
    try {
      await autoUpdater.downloadUpdate();
      return updateState;
    } catch (e) {
      setUpdateState({ status: "error", error: e?.message || String(e) });
      return updateState;
    }
  });

  ipcMain.handle("app-update:install", async () => {
    if (!app.isPackaged) {
      setUpdateState({
        status: "error",
        error: "Updates only available in packaged builds.",
      });
      return { ok: false };
    }

    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch {}
    }, 250);
    return { ok: true };
  });

  ipcMain.on("window-minimize", () => win.minimize());
  ipcMain.on("window-maximize", () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.on("window-close", () => win.close());

  ipcMain.on("open-external", (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle("app:getVersion", () => {
    return app.getVersion();
  });

  ipcMain.handle("get-spore-install-path", () => {
    return getSporeInstallPath();
  });

  ipcMain.handle("install-mod", async (event, modId, downloadUrl, modTitle) => {
    if (!modQueue) modQueue = createModOpQueue({ sendToAll });

    const { promise } = modQueue.enqueue({
      modKey: modId,
      modTitle,
      action: "install",
      run: async ({ onProgress }) => {
        if (MOD_QUEUE_DEBUG)
          console.log("[main][queue] start install", { modId });
        return await runModWorker(
          "install",
          modId,
          downloadUrl,
          ({ progress, modKey }) => {
            event.sender.send("mod-install-progress", modKey, progress);

            onProgress({
              percent: progress?.percent ?? 0,
              message: progress?.message ?? "",
            });
          }
        );
      },
    });

    try {
      return await promise;
    } catch (e) {
      if (
        e?.code === "MOD_OP_CANCELLED" ||
        String(e?.message || "") === "MOD_OP_CANCELLED"
      ) {
        if (MOD_QUEUE_DEBUG)
          console.log("[main][queue] install cancelled (queue)", { modId });
        return { cancelled: true };
      }
      if (
        String(e?.message || "") === "INSTALL_CANCELLED" ||
        e?.code === "INSTALL_CANCELLED"
      ) {
        if (MOD_QUEUE_DEBUG)
          console.log("[main][queue] install cancelled", { modId });
        return { cancelled: true };
      }
      throw e;
    }
  });

  ipcMain.handle("uninstall-mod", async (event, modId, modTitle) => {
    if (!modQueue) modQueue = createModOpQueue({ sendToAll });

    const { promise } = modQueue.enqueue({
      modKey: modId,
      modTitle,
      action: "uninstall",
      run: async ({ onProgress }) => {
        if (MOD_QUEUE_DEBUG)
          console.log("[main][queue] start uninstall", { modId });
        return await runModWorker(
          "uninstall",
          modId,
          null,
          ({ progress, modKey }) => {
            event.sender.send("mod-install-progress", modKey, progress);
            onProgress({
              percent: progress?.percent ?? 0,
              message: progress?.message ?? "",
            });
          }
        );
      },
    });

    return promise;
  });

  ipcMain.handle("is-mod-installed", async (event, modId) => {
    try {
      const isLegacy = modId === "4gbpatch" || modId === "60fps";
      const config = isLegacy ? modsConfig?.[modId] : null;
      return await isModInstalled({
        ...(config || {}),
        modKey: modId,
      });
    } catch (e) {
      if (MOD_WORKER_DEBUG) {
        console.error("[main] is-mod-installed error", {
          modId,
          error: e?.message,
        });
      }
      return false;
    }
  });

  ipcMain.handle("modapi-get-status", async () => {
    const legacyFile = getLegacyPathInfoFile();
    const existingPath = getExistingModApiInstallPath();

    const programData =
      process.env.ProgramData || path.join("C:\\", "ProgramData");
    const programDataKitPath = path.join(
      programData,
      "SPORE ModAPI Launcher Kit"
    );

    return {
      legacyFile,
      existingPath,
      programDataKitPath,
      programDataKitAction: null,
    };
  });

  ipcMain.handle("modapi-ensure-kit", async () => {
    const resolved = resolveModApiBasePath();
    return resolved;
  });

  function runExe(exePath, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(exePath, args, {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", reject);
      child.unref();
      resolve(true);
    });
  }

  ipcMain.handle("modapi-easy-installer-run", async () => {
    const ensured = ensureModApiKitInstalled();
    const exePath = path.join(ensured.path, "Spore ModAPI Easy Installer.exe");
    if (!exePath) throw new Error("Installer path not resolved");

    return new Promise((resolve, reject) => {
      const child = spawn("explorer.exe", [exePath], {
        windowsHide: true,
        stdio: "ignore",
        detached: true,
      });
      child.on("error", reject);
      child.unref();
      resolve(true);
    });
  });

  ipcMain.handle("modapi-easy-uninstaller-run", async () => {
    const ensured = ensureModApiKitInstalled();
    const exePath = path.join(
      ensured.path,
      "Spore ModAPI Easy Uninstaller.exe"
    );
    if (!exePath) throw new Error("Uninstaller path not resolved");

    return new Promise((resolve, reject) => {
      const child = spawn("explorer.exe", [exePath], {
        windowsHide: true,
        stdio: "ignore",
        detached: true,
      });
      child.on("error", reject);
      child.unref();
      resolve(true);
    });
  });

  ipcMain.handle("modapi-launcher-run", async () => {
    const exe = getModApiLauncherExePath();
    if (!exe)
      throw new Error(
        "Spore ModAPI Launcher path not found (path.info missing/invalid)."
      );

    return new Promise((resolve, reject) => {
      const child = spawn("explorer.exe", [exe], {
        windowsHide: true,
        stdio: "ignore",
        detached: true,
      });
      child.on("error", reject);
      child.unref();
      resolve(true);
    });
  });

  ipcMain.handle("galaxy-reset", async () => {
    return await galaxyReset();
  });

  ipcMain.handle("mod-ops-get-state", async () => {
    if (!modQueue) modQueue = createModOpQueue({ sendToAll });
    return modQueue.getState();
  });

  ipcMain.handle("mod-ops-cancel", async (event, id) => {
    if (!modQueue) modQueue = createModOpQueue({ sendToAll });
    return { ok: modQueue.cancelQueuedById(Number(id)) };
  });

  ipcMain.handle(
    "sporepedia:download-image",
    async (event, imageUrl, suggestedName) => {
      if (!imageUrl) return { cancelled: true };

      const win = BrowserWindow.fromWebContents(event.sender);

      const base =
        sanitizeFilename(suggestedName || "sporepedia-image") ||
        "sporepedia-image";
      const defaultPath = `${base}.png`;

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: "Save image",
        defaultPath,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });

      if (canceled || !filePath) return { cancelled: true };

      await downloadToFile(imageUrl, filePath);
      return { cancelled: false, filePath };
    }
  );

  // --- OAuth loopback singleton state ---
  const OAUTH_LOOPBACK_PORT = 54321;
  const OAUTH_TIMEOUT_MS = 2 * 60 * 1000;
  let oauthServer = null;
  let oauthWaitPromise = null;

  function cleanupOauthServer() {
    try {
      oauthWaitPromise = null;
    } catch {}
    try {
      if (oauthServer) oauthServer.close();
    } catch {}
    oauthServer = null;
  }

  async function ensureOauthServer() {
    if (oauthServer) return oauthServer;
    try {
      oauthServer = await startOauthLoopbackServer({
        port: OAUTH_LOOPBACK_PORT,
        timeoutMs: OAUTH_TIMEOUT_MS,
      });
      return oauthServer;
    } catch (e) {
      cleanupOauthServer();

      const code = e?.code;
      if (code === "EADDRINUSE") {
        const err = new Error(
          `OAUTH_PORT_IN_USE: ${OAUTH_LOOPBACK_PORT} (close other instances and retry)`
        );
        err.code = "OAUTH_PORT_IN_USE";
        throw err;
      }
      throw e;
    }
  }

  try {
    win.on("closed", () => cleanupOauthServer());
  } catch {}

  ipcMain.handle("auth:discord:begin", async () => {
    await ensureOauthServer();
    const redirectTo = `http://127.0.0.1:${OAUTH_LOOPBACK_PORT}/auth/callback`;
    return { ok: true, redirectTo };
  });

  ipcMain.handle("auth:oauth:wait", async () => {
    const srv = await ensureOauthServer();

    if (!oauthWaitPromise) {
      oauthWaitPromise = srv
        .wait()
        .catch((e) => {
          if (e?.message === "OAUTH_TIMEOUT" || e?.code === "OAUTH_TIMEOUT") {
            const err = new Error("OAUTH_TIMEOUT");
            err.code = "OAUTH_TIMEOUT";
            throw err;
          }
          throw e;
        })
        .finally(() => {
          cleanupOauthServer();
        });
    }

    return await oauthWaitPromise;
  });

  ipcMain.handle("auth:oauth:cancel", async () => {
    try {
      cleanupOauthServer();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle("auth:open-external", async (_event, url) => {
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  if (process.env.NODE_ENV === "development") {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

app.whenReady().then(() => {
  initAutoUpdater();
  scheduleUpdateCheck();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
