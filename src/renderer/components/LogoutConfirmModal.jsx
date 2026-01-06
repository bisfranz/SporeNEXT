import React from "react";
import "../styles/logoutconfirmmodal.css";
import { useLocale } from "../hooks/useLocale";

export default function LogoutConfirmModal({ onConfirm, onCancel }) {
  const { t } = useLocale();

  return (
    <div className="logoutconfirm-backdrop">
      <div className="logoutconfirm-modal" role="dialog" aria-modal="true">
        <div className="logoutconfirm-top">
          <img
            className="logoutconfirm-icon"
            src="assets/spore-next-emblem.png"
            alt=""
            aria-hidden="true"
          />
          <div className="logoutconfirm-title">
            {t("auth.logoutConfirm.title")}
          </div>
        </div>

        <div className="logoutconfirm-desc">{t("auth.logoutConfirm.desc")}</div>

        <div className="logoutconfirm-actions">
          <button className="logoutconfirm-btn" onClick={onCancel}>
            {t("auth.logoutConfirm.cancel")}
          </button>
          <button
            className="logoutconfirm-btn logoutconfirm-btn-danger"
            onClick={onConfirm}
          >
            {t("auth.logoutConfirm.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
