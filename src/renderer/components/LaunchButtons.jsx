import React, { useState } from "react";
import sporeIcon from "../../../public/assets/spore.png";
import sporeGAIcon from "../../../public/assets/sporega.png";
import "../styles/launchbuttons.css";
import { useLocale } from "../hooks/useLocale";

export default function LaunchButtons() {
  const { t } = useLocale();
  const [error, setError] = useState(null);

  const handleLaunchModApi = async () => {
    setError(null);
    try {
      if (!window.electronAPI?.runSporeModApiLauncher) {
        throw new Error("Launcher API not available");
      }
      await window.electronAPI.runSporeModApiLauncher();
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div className="launchbuttons-root">
      <button className="launchbuttons-btn" onClick={handleLaunchModApi}>
        <img src={sporeGAIcon} alt="Spore GA" className="launchbuttons-img" />
        {t("launchbuttons-launch-ga")}
      </button>
      {error ? <div className="launchbuttons-error">{error}</div> : null}
    </div>
  );
}
