const DEFAULT_TIMEOUT_MS = Number(
  process.env.MOD_OP_TIMEOUT_MS || 10 * 60 * 1000
);
const MOD_QUEUE_DEBUG =
  String(process.env.MOD_QUEUE_DEBUG || "").trim() === "1";

const MOD_QUEUE_PROGRESS_DEBUG =
  String(process.env.MOD_QUEUE_PROGRESS_DEBUG || "").trim() === "1";

const MOD_QUEUE_EMIT_THROTTLE_MS = Number(
  process.env.MOD_QUEUE_EMIT_THROTTLE_MS || 100
);

function safeString(v) {
  try {
    return String(v ?? "");
  } catch {
    return "";
  }
}

function createModOpQueue({ sendToAll = () => {} } = {}) {
  let nextId = 1;
  const queue = [];
  let active = null;
  let lastEmitAt = 0;
  let emitTimer = null;
  let pendingEmit = false;

  function emitNow() {
    try {
      pendingEmit = false;
      lastEmitAt = Date.now();
      sendToAll("mod-ops-changed", snapshot());
    } catch {}
  }

  function emit({ immediate = false } = {}) {
    if (immediate || MOD_QUEUE_EMIT_THROTTLE_MS <= 0) {
      if (emitTimer) {
        clearTimeout(emitTimer);
        emitTimer = null;
      }
      return emitNow();
    }

    const now = Date.now();
    const delta = now - lastEmitAt;

    if (delta >= MOD_QUEUE_EMIT_THROTTLE_MS) {
      if (emitTimer) {
        clearTimeout(emitTimer);
        emitTimer = null;
      }
      return emitNow();
    }

    pendingEmit = true;
    if (!emitTimer) {
      emitTimer = setTimeout(() => {
        emitTimer = null;
        if (pendingEmit) emitNow();
      }, Math.max(0, MOD_QUEUE_EMIT_THROTTLE_MS - delta));
    }
  }

  function snapshot() {
    return {
      active: active
        ? {
            id: active.id,
            modKey: active.modKey,
            modTitle: active.modTitle ?? "",
            action: active.action,
            status: active.status,
            createdAt: active.createdAt,
            startedAt: active.startedAt,
            percent: active.percent ?? 0,
            message: active.message ?? "",
          }
        : null,
      queued: queue.map((op) => ({
        id: op.id,
        modKey: op.modKey,
        modTitle: op.modTitle ?? "",
        action: op.action,
        status: op.status,
        createdAt: op.createdAt,
      })),
    };
  }

  async function drain() {
    if (active) return;
    if (!queue.length) return;

    const op = queue.shift();
    active = op;
    active.status = "running";
    active.startedAt = Date.now();
    if (MOD_QUEUE_DEBUG) {
      console.log("[modOpQueue] start", {
        id: op.id,
        action: op.action,
        modKey: op.modKey,
        queuedMs: active.startedAt - op.createdAt,
      });
    }
    emit({ immediate: true });

    const timeoutMs = Number(op.timeoutMs || DEFAULT_TIMEOUT_MS);
    let timeout = null;

    const finish = (err, result) => {
      if (!active || active.id !== op.id) return;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }

      const elapsedMs = Date.now() - (active.startedAt || Date.now());
      if (MOD_QUEUE_DEBUG) {
        console.log("[modOpQueue] finish", {
          id: op.id,
          action: op.action,
          modKey: op.modKey,
          ok: !err,
          elapsedMs,
          error: err ? safeString(err?.message || err) : null,
          code: err?.code,
        });
      }

      const resolved = {
        ok: !err,
        error: err ? safeString(err?.message || err) : null,
        result: err ? null : result,
      };

      const resolve = op._resolve;
      const reject = op._reject;

      active = null;
      emit({ immediate: true });

      setImmediate(() => drain());

      if (err)
        reject(
          Object.assign(new Error(resolved.error || "MOD_OP_FAILED"), {
            code: err?.code,
          })
        );
      else resolve(result);
    };

    timeout = setTimeout(() => {
      const err = Object.assign(
        new Error(
          `MOD_OP_TIMEOUT: ${op.action}(${op.modKey}) exceeded ${timeoutMs}ms`
        ),
        {
          code: "MOD_OP_TIMEOUT",
        }
      );
      if (MOD_QUEUE_DEBUG) {
        console.error("[modOpQueue] timeout", {
          id: op.id,
          action: op.action,
          modKey: op.modKey,
          timeoutMs,
        });
      }
      try {
        op._abort?.(err);
      } catch {}
      finish(err);
    }, timeoutMs);

    try {
      const result = await op.run({
        onProgress(p) {
          if (!active || active.id !== op.id) return;
          if (p && typeof p === "object") {
            active.percent =
              typeof p.percent === "number" ? p.percent : active.percent;
            active.message = safeString(p.message || "");
          }
          if (MOD_QUEUE_PROGRESS_DEBUG && typeof active.percent === "number") {
            console.log("[modOpQueue] progress", {
              id: op.id,
              modKey: op.modKey,
              percent: active.percent,
              message: active.message,
            });
          }
          emit();
        },
      });
      finish(null, result);
    } catch (err) {
      finish(err);
    }
  }

  function enqueue({ modKey, modTitle, action, run, timeoutMs, abort }) {
    const id = nextId++;

    const op = {
      id,
      modKey: safeString(modKey).trim(),
      modTitle: safeString(modTitle).trim(),
      action: action === "uninstall" ? "uninstall" : "install",
      status: "queued",
      createdAt: Date.now(),
      startedAt: null,
      percent: 0,
      message: "",
      timeoutMs,
      run,
      _abort: abort,
      _resolve: null,
      _reject: null,
    };

    const p = new Promise((resolve, reject) => {
      op._resolve = resolve;
      op._reject = reject;
    });

    queue.push(op);
    if (MOD_QUEUE_DEBUG) {
      console.log("[modOpQueue] enqueue", {
        id,
        action: op.action,
        modKey: op.modKey,
        queueLen: queue.length,
      });
    }
    emit({ immediate: true });
    setImmediate(() => drain());
    return { id, promise: p };
  }

  function getState() {
    return snapshot();
  }

  function cancelQueuedById(id) {
    const idx = queue.findIndex((q) => q.id === id);
    if (idx === -1) return false;
    const [op] = queue.splice(idx, 1);
    try {
      op._reject(
        Object.assign(new Error("MOD_OP_CANCELLED"), {
          code: "MOD_OP_CANCELLED",
        })
      );
    } catch {}
    emit({ immediate: true });
    return true;
  }

  return {
    enqueue,
    getState,
    cancelQueuedById,
  };
}

module.exports = {
  createModOpQueue,
};
