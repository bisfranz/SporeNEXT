import React from "react";
import "../styles/deleteconfirmmodal.css";
import { useLocale } from "../hooks/useLocale";

export default function DeleteConfirmModal({
  title,
  desc,
  onConfirm,
  onCancel,
  confirmDisabled,
}) {
  const { t } = useLocale();

  return (
    <div
      className="deleteconfirmmodal-backdrop"
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="deleteconfirmmodal-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="deleteconfirmmodal-top">
          <img
            className="deleteconfirmmodal-icon"
            src="assets/spore-next-emblem.png"
            alt=""
            aria-hidden="true"
          />
          <div className="deleteconfirmmodal-title">
            {title || t("common.confirm")}
          </div>
        </div>

        {desc ? <div className="deleteconfirmmodal-desc">{desc}</div> : null}

        <div className="deleteconfirmmodal-actions">
          <button className="deleteconfirmmodal-btn" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            className="deleteconfirmmodal-btn deleteconfirmmodal-btn-danger"
            onClick={onConfirm}
            disabled={Boolean(confirmDisabled)}
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
