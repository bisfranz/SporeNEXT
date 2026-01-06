const { parentPort } = require("worker_threads");
const { installMod, uninstallMod, isModInstalled } = require("./modInstaller");

const MOD_IPC_LOGS = String(process.env.MOD_IPC_LOGS || "").trim() === "1";

function postLog(level, message, data) {
  try {
    if (!MOD_IPC_LOGS) return;
    parentPort.postMessage({
      type: "log",
      level: level || "info",
      message: String(message || ""),
      data: data ?? null,
      at: Date.now(),
    });
  } catch {}
}

parentPort.on("message", async (msg) => {
  const modKey = msg?.payload?.modKey;
  try {
    postLog("info", "worker:received", { msgType: msg?.type, modKey });

    if (msg.type === "install") {
      let sawDoneStep = false;
      await installMod(msg.payload, (progress) => {
        if (progress?.step === "done") sawDoneStep = true;
        parentPort.postMessage({
          type: "progress",
          progress,
          modKey: msg.payload?.modKey,
        });
      });
      if (!sawDoneStep) {
        parentPort.postMessage({
          type: "progress",
          progress: {
            step: "done",
            percent: 100,
            message: "modprofiles-install-complete",
          },
          modKey: msg.payload?.modKey,
        });
      }
      parentPort.postMessage({
        type: "done",
        result: true,
        modKey: msg.payload?.modKey,
      });
      postLog("info", "worker:install:done", { modKey: msg.payload?.modKey });
    } else if (msg.type === "uninstall") {
      parentPort.postMessage({
        type: "progress",
        progress: {
          step: "uninstalling",
          percent: 0,
          message: "modprofiles-uninstalling",
        },
        modKey: msg.payload?.modKey,
      });
      await uninstallMod(msg.payload, (progress) => {
        parentPort.postMessage({
          type: "progress",
          progress,
          modKey: msg.payload?.modKey,
        });
      });
      parentPort.postMessage({
        type: "progress",
        progress: {
          step: "done",
          percent: 100,
          message: "modprofiles-uninstall-complete",
        },
        modKey: msg.payload?.modKey,
      });
      parentPort.postMessage({
        type: "done",
        result: true,
        modKey: msg.payload?.modKey,
      });
      postLog("info", "worker:uninstall:done", { modKey: msg.payload?.modKey });
    } else if (msg.type === "isInstalled") {
      const installed = await isModInstalled(msg.payload);
      parentPort.postMessage({
        type: "done",
        result: installed,
        modKey: msg.payload?.modKey,
      });
    } else {
      parentPort.postMessage({
        type: "error",
        error: `Unknown worker message type: ${msg?.type}`,
        modKey,
      });
      postLog("warn", "worker:unknown_message_type", {
        msgType: msg?.type,
        modKey,
      });
    }
  } catch (err) {
    const message = String(err?.message || err || "");
    const code = err?.code;
    parentPort.postMessage({
      type: "error",
      error: message,
      code,
      modKey: msg.payload?.modKey,
    });
    postLog("error", "worker:error", {
      modKey: msg.payload?.modKey,
      message,
      code,
      stack: String(err?.stack || ""),
    });
  }
});
