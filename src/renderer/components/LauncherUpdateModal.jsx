import React from "react";
import "../styles/launcherupdatemodal.css";
import { useLocale } from "../hooks/useLocale";

export default function LauncherUpdateModal({
  version,
  onConfirm,
  onCancel,
  isBusy,
}) {
  const { t } = useLocale();

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      onCancel?.();
    }
  };

  return (
    <div className="launcherupdatemodal-backdrop" onKeyDown={onKeyDown}>
      <div
        className="launcherupdatemodal-modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="launcherupdatemodal-top">
          <img
            className="launcherupdatemodal-icon"
            src="assets/optimization.png"
            alt=""
            aria-hidden="true"
          />
          <div className="launcherupdatemodal-title">
            {t("launcherupdate-modal-title") || "Launcher update available"}
          </div>
        </div>

        <div className="launcherupdatemodal-desc">
          {t("launcherupdate-modal-desc") ||
            "A new version of the launcher is available."}
        </div>

        {version ? (
          <div className="launcherupdatemodal-details">
            {(t("launcherupdate-modal-version") || "Version") + ": "}
            {String(version)}
          </div>
        ) : null}

        <div className="launcherupdatemodal-details">
          {t("launcherupdate-modal-restart") ||
            "If you continue, the launcher will download the update and restart to apply it."}
        </div>

        <div className="launcherupdatemodal-actions">
          <button
            className="launcherupdatemodal-btn"
            onClick={onCancel}
            disabled={Boolean(isBusy)}
          >
            {t("launcherupdate-modal-cancel") || "Not now"}
          </button>
          <button
            className="launcherupdatemodal-btn launcherupdatemodal-btn-danger"
            onClick={onConfirm}
            disabled={Boolean(isBusy)}
            title={
              isBusy
                ? t("launcherupdate-modal-working") || "Working..."
                : undefined
            }
          >
            {t("launcherupdate-modal-confirm") || "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
