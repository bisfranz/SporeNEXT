import React from "react";
import "../styles/settingspanel.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGlobe,
  faTriangleExclamation,
  faGear,
} from "@fortawesome/free-solid-svg-icons";
import { useLocale } from "../hooks/useLocale";
import LanguageSelect from "./LanguageSelect";

export default function SettingsPanel() {
  const { locale, setLocale, t } = useLocale();

  const languageOptions = [
    {
      value: "en",
      countryCode: "US",
      label: t("settingspanel-language-en"),
      secondary: "English, US",
    },
    {
      value: "es",
      countryCode: "ES",
      label: t("settingspanel-language-es"),
      secondary: "Español",
    },
  ];

  return (
    <div className="settingspanel-root">
      <div className="settingspanel-card">
        <div className="settingspanel-card-header">
          <FontAwesomeIcon icon={faGlobe} className="settingspanel-card-icon" />
          <div className="settingspanel-language-header">
            <span className="settingspanel-card-title">
              {t("settingspanel-language-title")}
            </span>
            <span className="settingspanel-language-subtitle">
              {t("settingspanel-language-subtitle")}
            </span>
          </div>
        </div>
        <div className="settingspanel-card-body">
          <LanguageSelect
            value={locale}
            onChange={setLocale}
            options={languageOptions}
          />
        </div>
      </div>
      <div className="settingspanel-card">
        <div className="settingspanel-card-header">
          <FontAwesomeIcon
            icon={faTriangleExclamation}
            className="settingspanel-card-icon"
          />
          <span className="settingspanel-card-title">
            {t("settingspanel-disclaimer-title")}
          </span>
        </div>
        <div className="settingspanel-card-body settingspanel-disclaimer">
          <p
            dangerouslySetInnerHTML={{
              __html: t("settingspanel-disclaimer-1"),
            }}
          />
          <p>{t("settingspanel-disclaimer-2")}</p>
          <p
            dangerouslySetInnerHTML={{
              __html: t("settingspanel-disclaimer-3"),
            }}
          />
        </div>
      </div>
    </div>
  );
}
