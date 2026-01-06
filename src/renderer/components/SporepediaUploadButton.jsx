import React from "react";
import "../styles/sporepediauploadbutton.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { useLocale } from "../hooks/useLocale";

export default function SporepediaUploadButton({ onClick, disabled }) {
  const { t } = useLocale();

  return (
    <button
      type="button"
      className="sporepediauploadbutton-root"
      onClick={onClick}
      disabled={Boolean(disabled)}
      title={t("sporepedia.upload")}
    >
      <FontAwesomeIcon
        icon={faUpload}
        className="sporepediauploadbutton-icon"
      />
      <span className="sporepediauploadbutton-label">
        {t("sporepedia.upload")}
      </span>
    </button>
  );
}
