import React from "react";
import "../styles/galaxyresetmodal.css";
import { useLocale } from "../hooks/useLocale";

export default function GalaxyResetModal({
  variant = "confirm",
  title,
  message,
  details,
  confirmText,
  cancelText,
  closeText,
  onConfirm,
  onCancel,
  onClose,
  isBusy,
}) {
  const { t } = useLocale();

  const resolvedTitle =
    title ||
    (variant === "confirm"
      ? t("galaxyreset-modal-title")
      : variant === "success"
      ? t("galaxyreset-modal-success-title")
      : t("galaxyreset-modal-error-title"));

  const resolvedConfirmText =
    confirmText || t("galaxyreset-modal-confirm") || "Confirm";
  const resolvedCancelText =
    cancelText || t("galaxyreset-modal-cancel") || "Cancel";
  const resolvedCloseText =
    closeText || t("galaxyreset-modal-close") || "Close";

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      if (variant === "confirm") onCancel?.();
      else onClose?.();
    }
  };

  return (
    <div className="galaxyresetmodal-backdrop" onKeyDown={onKeyDown}>
      <div className="galaxyresetmodal-modal" role="dialog" aria-modal="true">
        <div className="galaxyresetmodal-top">
          <img
            className="galaxyresetmodal-icon"
            src="assets/galaxyreset.png"
            alt=""
            aria-hidden="true"
          />
          <div className="galaxyresetmodal-title">{resolvedTitle}</div>
        </div>

        {message ? (
          <div className="galaxyresetmodal-desc">{message}</div>
        ) : null}
        {details ? (
          <div className="galaxyresetmodal-details">{details}</div>
        ) : null}

        <div className="galaxyresetmodal-actions">
          {variant === "confirm" ? (
            <>
              <button
                className="galaxyresetmodal-btn"
                onClick={onCancel}
                disabled={Boolean(isBusy)}
              >
                {resolvedCancelText}
              </button>
              <button
                className="galaxyresetmodal-btn galaxyresetmodal-btn-danger"
                onClick={onConfirm}
                disabled={Boolean(isBusy)}
                title={
                  isBusy
                    ? t("galaxyreset-modal-working") || "Working..."
                    : undefined
                }
              >
                {resolvedConfirmText}
              </button>
            </>
          ) : (
            <button className="galaxyresetmodal-btn" onClick={onClose}>
              {resolvedCloseText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
