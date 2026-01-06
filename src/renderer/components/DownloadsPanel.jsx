import React, { useEffect, useMemo, useState, useRef } from "react";
import "../styles/downloadspanel.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";

export default function DownloadsPanel({ t }) {
  const [state, setState] = useState({ active: null, queued: [] });

  const [displayPercent, setDisplayPercent] = useState(() => {
    try {
      const v = Number(
        sessionStorage.getItem("downloadsPanel.displayPercent") || 0
      );
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  });
  const displayPercentRef = useRef(0);

  const [fakePercent, setFakePercent] = useState(() => {
    try {
      const v = Number(
        sessionStorage.getItem("downloadsPanel.fakePercent") || 0
      );
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  });
  const fakePercentRef = useRef(0);

  useEffect(() => {
    displayPercentRef.current = displayPercent;
    try {
      sessionStorage.setItem(
        "downloadsPanel.displayPercent",
        String(Math.max(0, Math.min(100, Number(displayPercent || 0))))
      );
    } catch {}
  }, [displayPercent]);

  useEffect(() => {
    fakePercentRef.current = fakePercent;
    try {
      sessionStorage.setItem(
        "downloadsPanel.fakePercent",
        String(Math.max(0, Math.min(100, Number(fakePercent || 0))))
      );
    } catch {}
  }, [fakePercent]);

  useEffect(() => {
    const activeId = state?.active?.id || null;
    const hasActive = Boolean(activeId);

    if (!hasActive) {
      if (fakePercentRef.current !== 0) setFakePercent(0);
      return;
    }

    let raf = 0;
    let cancelled = false;

    const MAX_FAKE = 92;

    const tick = () => {
      if (cancelled) return;

      const real = Number(state?.active?.percent || 0);
      const currentFake = Number(fakePercentRef.current || 0);

      if (real > 0) {
        const next = Math.min(MAX_FAKE, Math.max(currentFake, real));
        if (Math.abs(next - currentFake) >= 0.01) setFakePercent(next);
        if (Math.abs(next - currentFake) < 0.01) return;
        raf = requestAnimationFrame(tick);
        return;
      }

      const remaining = MAX_FAKE - currentFake;
      if (remaining > 0.01) {
        const step = Math.max(0.22, remaining * 0.0105);
        const next = Math.min(MAX_FAKE, currentFake + step);
        if (Math.abs(next - currentFake) >= 0.01) {
          setFakePercent(next);
          raf = requestAnimationFrame(tick);
          return;
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [state?.active?.id, state?.active?.percent]);

  useEffect(() => {
    const activeId = state?.active?.id || null;
    const hasActive = Boolean(activeId);

    const real = Number(state?.active?.percent || 0);
    const target = hasActive
      ? Math.max(fakePercentRef.current || 0, Math.max(0, Math.min(100, real)))
      : 0;

    const current0 = Number(displayPercentRef.current || 0);
    if (Math.abs(target - current0) < 0.01) {
      if (!hasActive && current0 !== 0) setDisplayPercent(0);
      return;
    }

    let raf = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      const hasActiveNow = Boolean(state?.active);
      const realNow = Number(state?.active?.percent || 0);

      const targetNow = hasActiveNow
        ? Math.max(
            fakePercentRef.current || 0,
            Math.max(0, Math.min(100, realNow))
          )
        : 0;

      const current = Number(displayPercentRef.current || 0);

      const clampedTarget = Math.max(
        current,
        Math.max(0, Math.min(100, targetNow))
      );

      const delta = clampedTarget - current;
      let next = current;
      if (delta > 0.01) {
        const step = Math.max(0.9, delta * 0.32);
        next = Math.min(clampedTarget, current + step);
      } else {
        next = clampedTarget;
      }

      if (Math.abs(next - current) >= 0.01) {
        setDisplayPercent(next);
        raf = requestAnimationFrame(tick);
        return;
      }

      if (!hasActiveNow && current !== 0) setDisplayPercent(0);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [state?.active?.id, state?.active?.percent, fakePercent]);

  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    async function init() {
      try {
        if (window.electronAPI?.getModOpsState) {
          const s = await window.electronAPI.getModOpsState();
          if (!cancelled && s) setState(s);
        }
      } catch {}

      if (window.electronAPI?.onModOpsChanged) {
        unsub = window.electronAPI.onModOpsChanged((s) => {
          setState(s || { active: null, queued: [] });
        });
      }
    }

    init();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const items = useMemo(() => {
    const out = [];
    if (state?.active) out.push({ ...state.active, _kind: "active" });
    for (const q of state?.queued || []) out.push({ ...q, _kind: "queued" });
    return out;
  }, [state]);

  if (!items.length) {
    return (
      <div className="downloads-panel">
        <div className="downloads-panel__title">
          <FontAwesomeIcon icon={faDownload} style={{ marginRight: 8 }} />
          {t?.("sidebar-downloads") ?? "Downloads"}
        </div>
        <div className="downloads-panel__empty">
          {t?.("downloads-empty") ?? "No hay instalaciones en progreso."}
        </div>
      </div>
    );
  }

  return (
    <div className="downloads-panel">
      <div className="downloads-panel__title">
        <FontAwesomeIcon icon={faDownload} style={{ marginRight: 8 }} />
        {t?.("sidebar-downloads") ?? "Downloads"}
      </div>

      <div
        className="downloads-panel__scroll"
        role="region"
        aria-label="Downloads"
      >
        <div className="downloads-panel__list">
          {items.map((it) => {
            const label =
              it.action === "uninstall"
                ? t?.("modprofiles-uninstalling") ?? "Uninstalling..."
                : t?.("modprofiles-installing") ?? "Installing...";

            const percentForUi =
              it._kind === "active" ? displayPercent : Number(it.percent || 0);

            const displayName =
              (it.modTitle && String(it.modTitle).trim()) || it.modKey;

            return (
              <div
                className="downloads-panel__item"
                key={`${it._kind}-${it.id}`}
              >
                <div className="downloads-panel__row">
                  <div className="downloads-panel__name">
                    <div className="downloads-panel__modkey">{displayName}</div>
                    <div className="downloads-panel__status">
                      {it._kind === "queued"
                        ? t?.("downloads-queued") ?? "Queued"
                        : label}
                    </div>
                  </div>

                  <div className="downloads-panel__right">
                    {it._kind === "active" ? (
                      <div className="downloads-panel__percent">
                        {Math.round(Math.max(0, Math.min(100, percentForUi)))}%
                      </div>
                    ) : (
                      <button
                        className="downloads-panel__cancel"
                        type="button"
                        onClick={() => window.electronAPI?.cancelModOp?.(it.id)}
                      >
                        {t?.("downloads-cancel") ?? "Cancel"}
                      </button>
                    )}
                  </div>
                </div>

                {it._kind === "active" ? (
                  <div className="downloads-panel__bar">
                    <div
                      className="downloads-panel__barFill"
                      style={{
                        width: `${Math.max(0, Math.min(100, percentForUi))}%`,
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
