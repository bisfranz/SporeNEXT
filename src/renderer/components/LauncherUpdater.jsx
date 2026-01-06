import React, { useEffect, useMemo, useState } from "react";
import "../styles/launcherupdater.css";
import { useLocale } from "../hooks/useLocale";
import LauncherUpdateModal from "./LauncherUpdateModal";

function formatPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

export default function LauncherUpdater() {
  const { t } = useLocale();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const visible = useMemo(() => {
    const s = state?.status;
    return (
      s === "available" ||
      s === "downloading" ||
      s === "downloaded" ||
      s === "error"
    );
  }, [state]);

  useEffect(() => {
    let unsub = null;

    (async () => {
      try {
        const initial = await window.electronAPI?.getUpdateState?.();
        if (initial) setState(initial);
      } catch {}

      try {
        unsub = window.electronAPI?.onUpdateState?.((s) => setState(s));
      } catch {}
    })();

    return () => {
      try {
        if (typeof unsub === "function") unsub();
      } catch {}
    };
  }, []);

  const label = useMemo(() => {
    const s = state?.status;
    const targetVersion = state?.version;

    if (s === "available") {
      const base =
        t("update-available") ||
        t("launcherupdate-available") ||
        "Update available";

      return targetVersion ? `${base} v${String(targetVersion)}` : base;
    }

    if (s === "downloading")
      return (
        (t("update-downloading") ||
          t("launcherupdate-downloading") ||
          "Downloading update") + ` (${formatPercent(state?.downloadPercent)})`
      );
    if (s === "downloaded")
      return (
        t("update-downloaded") ||
        t("launcherupdate-downloaded") ||
        "Update ready to install"
      );
    if (s === "error")
      return t("update-error") || t("launcherupdate-error") || "Update error";
    return null;
  }, [state, t]);

  const buttonText = useMemo(() => {
    const s = state?.status;
    if (s === "available")
      return t("update-download") || t("launcherupdate-download") || "Download";
    if (s === "downloading")
      return (
        t("update-downloading") ||
        t("launcherupdate-downloading") ||
        "Downloading..."
      );
    if (s === "downloaded")
      return (
        t("update-install") ||
        t("launcherupdate-install") ||
        "Install & restart"
      );
    if (s === "error")
      return t("update-retry") || t("launcherupdate-retry") || "Retry";
    return null;
  }, [state, t]);

  const onClick = async () => {
    if (!window.electronAPI) return;

    const s = state?.status;

    if (s === "available" || s === "downloaded") {
      setShowConfirm(true);
      return;
    }

    setBusy(true);
    try {
      if (s === "error") {
        await window.electronAPI.checkForUpdates?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const onConfirmUpdate = async () => {
    const s = state?.status;
    setBusy(true);
    try {
      if (s === "available") {
        await window.electronAPI.downloadUpdate?.();
      } else if (s === "downloaded") {
        await window.electronAPI.installUpdate?.();
      }
    } finally {
      setBusy(false);
      setShowConfirm(false);
    }
  };

  const onCancelUpdate = () => {
    if (busy) return;
    setShowConfirm(false);
  };

  if (!visible) return null;

  return (
    <>
      {showConfirm ? (
        <LauncherUpdateModal
          version={state?.version}
          onConfirm={onConfirmUpdate}
          onCancel={onCancelUpdate}
          isBusy={busy}
        />
      ) : null}

      <div className="launcherupdater-root">
        <div className="launcherupdater-status">
          <div className="launcherupdater-title">{label}</div>
          {state?.version ? (
            <div className="launcherupdater-subtitle">
              {t("update-version") || "Versión"}: {String(state.version)}
            </div>
          ) : null}
          {state?.status === "error" && state?.error ? (
            <div className="launcherupdater-error">{String(state.error)}</div>
          ) : null}
        </div>

        <button
          className="launcherupdater-btn"
          onClick={onClick}
          disabled={busy || state?.status === "downloading"}
        >
          {buttonText}
        </button>
      </div>
    </>
  );
}
