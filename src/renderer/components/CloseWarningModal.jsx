import React from "react";
import "../styles/closewarningmodal.css";
import { useLocale } from "../hooks/useLocale";

export default function CloseWarningModal({ onConfirm, onCancel }) {
  const { t } = useLocale();
  return (
    <div className="closewarningmodal-backdrop">
      <div className="closewarningmodal-modal" role="dialog" aria-modal="true">
        <div className="closewarningmodal-top">
          <img
            className="closewarningmodal-icon"
            src="assets/spore-next-emblem.png"
            alt=""
            aria-hidden="true"
          />
          <div className="closewarningmodal-title">
            {t("closeWarning.title")}
          </div>
        </div>

        <div className="closewarningmodal-desc">{t("closeWarning.desc")}</div>
        <div className="closewarningmodal-actions">
          <button className="closewarningmodal-btn" onClick={onCancel}>
            {t("closeWarning.cancel")}
          </button>
          <button
            className="closewarningmodal-btn closewarningmodal-btn-danger"
            onClick={onConfirm}
          >
            {t("closeWarning.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
