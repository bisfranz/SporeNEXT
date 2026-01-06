import React, { useEffect, useMemo, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import "../styles/modapisetupmodal.css";

export default function ModApiSetupModal({ open, onClose }) {
  const { t } = useLocale();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const hasLegacy = !!status?.existingPath;
  const suggestedPath = status?.existingPath || status?.programDataKitPath;

  const title = useMemo(() => {
    if (hasLegacy) return t("modapi-modal-title-found");
    return t("modapi-modal-title-install");
  }, [hasLegacy, t]);

  const sporeNextEmblemSrc = `${
    import.meta.env.BASE_URL
  }assets/spore-next-emblem.png`;
  const sporeModApiIconSrc = `${
    import.meta.env.BASE_URL
  }assets/SporeModAPI.png`;

  async function refresh() {
    if (!window.electronAPI?.getModApiStatus) return;
    setError(null);
    try {
      const s = await window.electronAPI.getModApiStatus();
      setStatus(s);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open]);

  async function ensureKit() {
    const MIN_MS = 5000;

    setBusy(true);
    setProgress(0);
    setError(null);

    const startedAt = Date.now();
    let raf = 0;
    let done = false;

    const tick = () => {
      const elapsed = Date.now() - startedAt;

      const t01 = Math.min(1, elapsed / MIN_MS);
      const eased = 1 - Math.pow(1 - t01, 3);
      const target = done ? 100 : Math.min(95, Math.round(eased * 95));

      setProgress((p) => (p >= target ? p : target));

      if (!done || elapsed < MIN_MS) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);

    try {
      await window.electronAPI.ensureModApiKit();
      done = true;

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
      }

      setProgress(100);
      await refresh();

      const updated = await window.electronAPI.getModApiStatus();
      if (updated?.programDataKitPath || updated?.existingPath) {
        setTimeout(() => onClose?.(), 250);
      }
    } catch (e) {
      done = true;
      setError(e?.message || String(e));
      setProgress(0);
    } finally {
      if (raf) cancelAnimationFrame(raf);
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modapi-modal-overlay" role="dialog" aria-modal="true">
      <div className="modapi-modal">
        <div className="modapi-modal-header">
          <div className="modapi-modal-title">
            {!hasLegacy ? (
              <img
                className="modapi-title-icon"
                src={sporeNextEmblemSrc}
                alt=""
                aria-hidden="true"
              />
            ) : null}
            <h2>{title}</h2>
          </div>
        </div>

        <div className="modapi-modal-body">
          <p className="modapi-modal-text">
            {hasLegacy
              ? t("modapi-modal-found-desc")
              : t("modapi-modal-install-desc")}
          </p>

          {suggestedPath ? (
            <div className="modapi-path">
              <div className="modapi-path-label">{t("modapi-path")}</div>
              <div className="modapi-path-value" title={suggestedPath}>
                {suggestedPath}
              </div>
              {status?.existingPath ? (
                <div className="modapi-path-hint">
                  {t("modapi-source-pathinfo")}
                </div>
              ) : (
                <div className="modapi-path-hint">
                  {t("modapi-source-programdata")}
                </div>
              )}
            </div>
          ) : null}

          {busy ? (
            <div className="modapi-progress">
              <div className="modapi-progress-top">
                <div className="modapi-progress-label">
                  {t("modapi-installing")}
                </div>
                <div className="modapi-progress-value">{progress}%</div>
              </div>
              <div className="modapi-progress-bar" aria-hidden="true">
                <div
                  className="modapi-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {error ? <div className="modapi-error">{error}</div> : null}
        </div>

        <div className="modapi-modal-actions">
          <button
            className="modapi-btn primary modapi-install-btn"
            onClick={ensureKit}
            disabled={busy}
          >
            <img
              className="modapi-btn-icon"
              src={sporeModApiIconSrc}
              alt=""
              aria-hidden="true"
            />
            <span className="modapi-btn-text">{t("modapi-install-kit")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
