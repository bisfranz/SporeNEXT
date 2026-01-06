import React from "react";
import emblem from "../../../public/assets/spore-next-emblem.png";
import "../styles/loadingscreen.css";

export default function LoadingScreen({ message, progress }) {
  const pct =
    typeof progress === "number" && isFinite(progress)
      ? Math.max(0, Math.min(100, Math.round(progress)))
      : null;

  return (
    <div className="loading-screen-root">
      <div className="loading-screen-content">
        <img
          src={emblem}
          alt="Spore NEXT Emblem"
          className="loading-screen-emblem"
        />

        {message ? (
          <div className="loading-screen-message">{message}</div>
        ) : null}

        {pct != null ? (
          <div
            className="loading-screen-progress"
            aria-label={`Loading ${pct}%`}
          >
            <div className="loading-screen-progress-bar" aria-hidden="true">
              <div
                className="loading-screen-progress-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="loading-screen-progress-text">{pct}%</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
