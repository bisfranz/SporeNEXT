import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import "../styles/gamefolder.css";
import { useLocale } from "../hooks/useLocale";

export default function GameFolder() {
    const { t } = useLocale();

    const handleOpenFolder = async () => {
        if (window.electronAPI?.getSporeInstallPath && window.electronAPI?.openExternal) {
            let path = await window.electronAPI.getSporeInstallPath();
            if (path) {
                if (path.endsWith("DataEP1") || path.endsWith("DataEP1\\")) {
                    path = path.replace(/DataEP1[\\\/]?$/, "");
                }
                window.electronAPI.openExternal(`file://${path}`);
            }
        }
    };

    return (
        <button
            className="gamefolder-btn"
            title={t("gamefolder-open")}
            onClick={handleOpenFolder}
        >
            <FontAwesomeIcon icon={faFolderOpen} className="gamefolder-icon" />
        </button>
    );
}