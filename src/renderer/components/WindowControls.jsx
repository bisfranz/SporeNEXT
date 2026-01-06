import React, { useState } from "react";
import "../styles/windowcontrols.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWindowMinimize, faWindowMaximize, faTimes } from "@fortawesome/free-solid-svg-icons";
import CloseWarningModal from "./CloseWarningModal";
import { useLocale } from "../hooks/useLocale";

export default function WindowControls() {
    const [showWarning, setShowWarning] = useState(false);
    const { t } = useLocale();

    const handleMinimize = () => window.electronAPI?.minimize();
    const handleMaximize = () => window.electronAPI?.maximize();
    const handleClose = () => setShowWarning(true);

    const confirmClose = () => window.electronAPI?.close();
    const cancelClose = () => setShowWarning(false);

    return (
        <>
            <div className="window-controls">
                <button onClick={handleMinimize} className="window-controls-button" title={t("windowcontrols-minimize")}>
                    <FontAwesomeIcon icon={faWindowMinimize} />
                </button>
                <button onClick={handleMaximize} className="window-controls-button" title={t("windowcontrols-maximize")}>
                    <FontAwesomeIcon icon={faWindowMaximize} />
                </button>
                <button onClick={handleClose} className="window-controls-close" title={t("windowcontrols-close")}>
                    <FontAwesomeIcon icon={faTimes} />
                </button>
            </div>
            {showWarning && (
                <CloseWarningModal onConfirm={confirmClose} onCancel={cancelClose} />
            )}
        </>
    );
}