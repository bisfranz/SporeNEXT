import React, { useState, useRef, useEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import logo from "../../../public/assets/spore-next-logo.png";
import Sidebar from "./Sidebar";
import ModList from "./ModList";
import Faq from "./Faq";
import SettingsPanel from "./SettingsPanel";
import ModProfiles from "./ModProfiles";
import WindowControls from "./WindowControls";
import LaunchButtons from "./LaunchButtons";
import GameFolder from "./GameFolder";
import LoadingScreen from "./LoadingScreen";
import DragBar from "./DragBar";
import MainCornerLinks from "./MainCornerLinks";
import ModApiSetupModal from "./ModApiSetupModal";
import DownloadsPanel from "./DownloadsPanel";
import LauncherUpdater from "./LauncherUpdater";
import SporepediaModal from "./SporepediaModal";
import "../styles/app.css";
import { supabase } from "../lib/supabaseClient";

const MOD_PROGRESS_DEBUG =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  import.meta.env.VITE_MOD_PROGRESS_DEBUG === "1";

const MOD_PROGRESS_STALE_MS = Number(
  (typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_MOD_PROGRESS_STALE_MS
    : undefined) || 45000
);

export default function App() {
  const [currentTab, setCurrentTab] = useState("main");
  const [displayedTab, setDisplayedTab] = useState("main");
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [installingModId, setInstallingModId] = useState(null);
  const [installingModKey, setInstallingModKey] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showModApiSetup, setShowModApiSetup] = useState(false);
  const [selectedMod, setSelectedMod] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [installingProgress, setInstallingProgress] = useState(0);
  const [installingText, setInstallingText] = useState("");
  const [isUninstalling, setIsUninstalling] = useState(false);
  const activeOpModKeyRef = useRef(null);
  const [lastCompletedModKey, setLastCompletedModKey] = useState(null);
  const [lastCompletedAction, setLastCompletedAction] = useState(null);
  const [installedRefreshToken, setInstalledRefreshToken] = useState(0);
  const [installedByKey, setInstalledByKey] = useState({});
  const [renderTick, setRenderTick] = useState(0);
  const installedByKeyRef = useRef({});
  const opTypeByKeyRef = useRef(new Map());
  const installCachePrefetchStartedRef = useRef(false);
  const opStartByKeyRef = useRef(new Map());
  const pendingDoneTimerRef = useRef(null);
  const lastProgressAtRef = useRef(0);
  const lastProgressKeyRef = useRef(null);
  const lastProgressStepRef = useRef(null);
  const [modOpsState, setModOpsState] = useState({ active: null, queued: [] });

  useEffect(() => {
    installedByKeyRef.current = installedByKey || {};
  }, [installedByKey]);

  useEffect(() => {
    if (!window.electronAPI?.isModInstalled) return;

    let cancelled = false;

    const refreshAll = async () => {
      try {
        const snapshot = installedByKeyRef.current || {};
        const keys = Object.keys(snapshot).filter(Boolean);
        if (!keys.length) return;

        const CONCURRENCY = 6;
        for (let i = 0; i < keys.length && !cancelled; i += CONCURRENCY) {
          const chunk = keys.slice(i, i + CONCURRENCY);
          const pairs = await Promise.all(
            chunk.map(async (k) => {
              try {
                const installed = await window.electronAPI.isModInstalled(k);
                return [k, Boolean(installed)];
              } catch {
                return [k, undefined];
              }
            })
          );

          for (const [k, v] of pairs) {
            if (typeof v !== "boolean") continue;
            if ((installedByKeyRef.current || {})[k] !== v) {
              updateInstalledCacheImmediate(k, v);
            }
          }
        }
      } catch {}
    };

    const t = setTimeout(() => {
      if (!cancelled) refreshAll();
    }, 750);

    let prevActiveId = null;
    const unsubscribe = window.electronAPI?.onModOpsChanged
      ? window.electronAPI.onModOpsChanged((state) => {
          try {
            const nextActiveId = state?.active?.id || null;
            const finished = Boolean(prevActiveId && !nextActiveId);
            prevActiveId = nextActiveId;

            if (finished && !cancelled) {
              setTimeout(() => {
                if (!cancelled) refreshAll();
              }, 600);
            }
          } catch {}
        })
      : null;

    return () => {
      cancelled = true;
      clearTimeout(t);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    activeOpModKeyRef.current = installingModKey || null;
  }, [installingModKey]);

  const updateInstalledCache = (modKey, installed) => {
    if (!modKey) return;
    setInstalledByKey((prev) => {
      if (prev?.[modKey] === installed) return prev;
      return { ...prev, [modKey]: installed };
    });
    setRenderTick((t) => t + 1);
  };

  const updateInstalledCacheImmediate = (modKey, installed) => {
    if (!modKey) return;
    try {
      flushSync(() => updateInstalledCache(modKey, installed));
    } catch {
      updateInstalledCache(modKey, installed);
    }
  };

  const refreshInstalledCache = async (modKey) => {
    if (!modKey || !window.electronAPI?.isModInstalled) return;
    try {
      const installed = await window.electronAPI.isModInstalled(modKey);
      updateInstalledCache(modKey, installed);
    } catch {}
  };

  function handleProfileClose(modToRefresh) {
    if (modToRefresh?.mod_key) {
      refreshInstalledCache(modToRefresh.mod_key);
      setLastCompletedModKey(modToRefresh.mod_key);
      setLastCompletedAction("refresh");
      setInstalledRefreshToken((t) => t + 1);
    }
    setSelectedMod(null);
  }

  const nodeRefs = {
    main: useRef(null),
    mods: useRef(null),
    settings: useRef(null),
  };

  useEffect(() => {
    function handleLinkClick(e) {
      const anchor = e.target.closest("a[href]");
      if (
        anchor &&
        anchor.target === "_blank" &&
        anchor.href &&
        window.electronAPI &&
        typeof window.electronAPI.openExternal === "function"
      ) {
        e.preventDefault();
        window.electronAPI.openExternal(anchor.href);
      }
    }
    function handleAuxClick(e) {
      if (e.button === 1) {
        const anchor = e.target.closest("a[href]");
        if (
          anchor &&
          anchor.target === "_blank" &&
          anchor.href &&
          window.electronAPI &&
          typeof window.electronAPI.openExternal === "function"
        ) {
          e.preventDefault();
          window.electronAPI.openExternal(anchor.href);
        }
      }
    }
    document.addEventListener("click", handleLinkClick);
    document.addEventListener("auxclick", handleAuxClick);
    return () => {
      document.removeEventListener("click", handleLinkClick);
      document.removeEventListener("auxclick", handleAuxClick);
    };
  }, []);

  useEffect(() => {
    if (currentTab !== "mods") {
      if (selectedMod && !installingModKey && !installingModId) {
        setSelectedMod(null);
      }
    }
    if (currentTab) setDisplayedTab(currentTab);
  }, [currentTab, selectedMod, installingModKey, installingModId]);

  useEffect(() => {
    let cancelled = false;

    const withTimeout = async (promise, ms) => {
      let t = null;
      try {
        const timeout = new Promise((resolve) => {
          t = setTimeout(() => resolve({ __timeout: true }), ms);
        });
        const res = await Promise.race([promise, timeout]);
        return res;
      } finally {
        if (t) clearTimeout(t);
      }
    };

    const step = (message, progress) => {
      if (cancelled) return;
      setLoadingMessage(message);
      if (typeof progress === "number") setLoadingProgress(progress);
    };

    const tBoot = (key, fallback) => {
      try {
        const t = window.__localeT;
        const v = typeof t === "function" ? t(key) : null;
        if (v && v !== key) return v;
      } catch {}
      return fallback || key;
    };

    async function boot() {
      try {
        document.body.style.overflow = "hidden";
      } catch {}

      const BOOT_TIMEOUT_MS = Number(
        import.meta.env?.VITE_BOOT_TIMEOUT_MS || 12000
      );

      const bootPromise = (async () => {
        try {
          step(tBoot("boot.checking_modapi", "Checking ModAPI..."), 10);
          try {
            if (window.electronAPI?.getModApiStatus) {
              const status = await window.electronAPI.getModApiStatus();
              if (!cancelled) {
                if (status?.existingPath) setShowModApiSetup(false);
                else setShowModApiSetup(true);
              }
            }
          } catch {}

          step(tBoot("boot.loading_queue", "Loading operations queue..."), 25);
          try {
            if (window.electronAPI?.getModOpsState) {
              const s = await window.electronAPI.getModOpsState();
              if (!cancelled && s) setModOpsState(s);
            }
          } catch {}

          step(tBoot("boot.preloading_assets", "Preloading UI assets..."), 40);
          try {
            const img = new Image();
            img.src = logo;
            await img.decode?.();
          } catch {}

          step(tBoot("boot.fetching_mods", "Fetching mods list..."), 55);
          let keys = [];
          try {
            const { data, error } = await supabase
              .from("mods")
              .select("mod_key");
            if (!cancelled && !error && Array.isArray(data)) {
              keys = Array.from(
                new Set(
                  data
                    .map((m) => (m?.mod_key ?? "") + "")
                    .map((k) => k.trim())
                    .filter((k) => k && k.toLowerCase() !== "null")
                )
              );
            }
          } catch {
            keys = [];
          }

          step(
            tBoot("boot.checking_installed_mods", "Checking installed mods..."),
            keys.length ? 65 : 80
          );
          try {
            if (keys.length && window.electronAPI?.isModInstalled) {
              const CONCURRENCY = 6;
              const results = {};
              for (let i = 0; i < keys.length && !cancelled; i += CONCURRENCY) {
                const chunk = keys.slice(i, i + CONCURRENCY);
                const pairs = await Promise.all(
                  chunk.map(async (k) => {
                    try {
                      const installed = await window.electronAPI.isModInstalled(
                        k
                      );
                      return [k, Boolean(installed)];
                    } catch {
                      return [k, false];
                    }
                  })
                );
                for (const [k, v] of pairs) results[k] = v;

                const done = Math.min(i + CONCURRENCY, keys.length);
                const p = 65 + Math.round((done / keys.length) * 30);
                step(
                  tBoot(
                    "boot.checking_installed_mods",
                    "Checking installed mods..."
                  ),
                  p
                );
              }

              if (!cancelled) {
                setInstalledByKey((prev) => {
                  const next = { ...(prev || {}) };
                  for (const [k, v] of Object.entries(results)) {
                    if (typeof next[k] !== "boolean") next[k] = v;
                  }
                  return next;
                });
              }
            }
          } catch {}

          step(tBoot("boot.ready", "Ready"), 100);
          if (!cancelled) setLoading(false);
        } finally {
          try {
            document.body.removeAttribute("style");
          } catch {}
        }
      })();

      const res = await withTimeout(bootPromise, BOOT_TIMEOUT_MS);
      if (cancelled) return;

      if (res && res.__timeout) {
        step(
          tBoot("boot.starting_slow_network", "Starting (network is slow)..."),
          90
        );
        setLoading(false);
        try {
          document.body.removeAttribute("style");
        } catch {}
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function prefetchInstalledCache() {
      if (installCachePrefetchStartedRef.current) return;
      installCachePrefetchStartedRef.current = true;
      try {
        if (!window.electronAPI?.isModInstalled) return;
        const { data, error } = await supabase.from("mods").select("mod_key");
        if (cancelled || error || !Array.isArray(data)) return;
        const keys = Array.from(
          new Set(
            data
              .map((m) => (m?.mod_key ?? "") + "")
              .map((k) => k.trim())
              .filter((k) => k && k.toLowerCase() !== "null")
          )
        );
        if (!keys.length) return;
        const CONCURRENCY = 6;
        const results = {};
        for (let i = 0; i < keys.length && !cancelled; i += CONCURRENCY) {
          const chunk = keys.slice(i, i + CONCURRENCY);
          const pairs = await Promise.all(
            chunk.map(async (k) => {
              try {
                const installed = await window.electronAPI.isModInstalled(k);
                return [k, Boolean(installed)];
              } catch {
                return [k, false];
              }
            })
          );
          for (const [k, v] of pairs) results[k] = v;
        }
        if (cancelled) return;
        setInstalledByKey((prev) => {
          const next = { ...(prev || {}) };
          for (const [k, v] of Object.entries(results)) {
            if (typeof next[k] !== "boolean") next[k] = v;
          }
          return next;
        });
      } catch {}
    }
    prefetchInstalledCache();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (!window.electronAPI?.getModApiStatus) return;
        const status = await window.electronAPI.getModApiStatus();
        if (cancelled) return;
        if (status?.existingPath) {
          setShowModApiSetup(false);
          return;
        }
        setShowModApiSetup(true);
      } catch {}
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = logo;
    const decode = async () => {
      try {
        await img.decode?.();
      } catch {}
    };
    decode();
    return () => {
      cancelled = true;
      void cancelled;
    };
  }, []);

  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    async function init() {
      try {
        if (window.electronAPI?.getModOpsState) {
          const s = await window.electronAPI.getModOpsState();
          if (!cancelled && s) setModOpsState(s);
        }
      } catch {}

      if (window.electronAPI?.onModOpsChanged) {
        unsub = window.electronAPI.onModOpsChanged((s) => {
          setModOpsState(s || { active: null, queued: [] });
        });
      }
    }

    init();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const activeOp = modOpsState?.active || null;
  const activeModKey = activeOp?.modKey || null;
  const activeAction = activeOp?.action || null;
  const activePercent =
    typeof activeOp?.percent === "number" ? activeOp.percent : 0;
  const activeMessage = activeOp?.message || "";

  useEffect(() => {
    setInstallingModKey(activeModKey);
    setIsBusy(Boolean(activeOp));
    setIsUninstalling(activeAction === "uninstall");
    setInstallingProgress(activePercent);
    setInstallingText(activeMessage);
  }, [activeModKey, activeAction, activePercent, activeMessage, activeOp]);

  if (loading) {
    return (
      <LoadingScreen message={loadingMessage} progress={loadingProgress} />
    );
  }

  return (
    <div className="app-root">
      <ModApiSetupModal
        open={showModApiSetup}
        onClose={() => {
          setShowModApiSetup(false);
        }}
      />

      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />
      <div className="app-main">
        <WindowControls />
        <DragBar />
        <div
          className={`panel-bg app-main-content${
            displayedTab === "main" ? " centered" : ""
          }`}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {displayedTab === "downloads" ? (
              <DownloadsPanel t={window.__localeT} />
            ) : displayedTab === "mods" ? (
              <>
                <ModList
                  setCurrentTab={setCurrentTab}
                  installingModId={installingModId}
                  setInstallingModId={setInstallingModId}
                  installingModKey={installingModKey}
                  setInstallingModKey={setInstallingModKey}
                  isBusy={isBusy}
                  setIsBusy={setIsBusy}
                  installingProgress={installingProgress}
                  setInstallingProgress={setInstallingProgress}
                  installingText={installingText}
                  setInstallingText={setInstallingText}
                  isUninstalling={isUninstalling}
                  setIsUninstalling={setIsUninstalling}
                  selectedMod={selectedMod}
                  setSelectedMod={setSelectedMod}
                  setIsValidating={setIsValidating}
                  lastCompletedModKey={lastCompletedModKey}
                  lastCompletedAction={lastCompletedAction}
                  installedRefreshToken={installedRefreshToken}
                  installedByKey={installedByKey}
                  updateInstalledCache={updateInstalledCache}
                  refreshInstalledCache={refreshInstalledCache}
                  __renderTick={renderTick}
                />
                <ModProfiles
                  mod={selectedMod}
                  onClose={handleProfileClose}
                  onGoHome={() => setCurrentTab("main")}
                  isValidating={isValidating}
                  isBusy={isBusy}
                  setIsBusy={setIsBusy}
                  installingModId={installingModId}
                  setInstallingModId={setInstallingModId}
                  installingModKey={installingModKey}
                  setInstallingModKey={setInstallingModKey}
                  installingProgress={installingProgress}
                  installingText={installingText}
                  isUninstalling={isUninstalling}
                  setIsUninstalling={setIsUninstalling}
                  lastCompletedModKey={lastCompletedModKey}
                  lastCompletedAction={lastCompletedAction}
                  installedByKey={installedByKey}
                  updateInstalledCache={updateInstalledCache}
                  refreshInstalledCache={refreshInstalledCache}
                  __renderTick={renderTick}
                />
              </>
            ) : displayedTab === "faq" ? (
              <Faq />
            ) : displayedTab === "settings" ? (
              <SettingsPanel />
            ) : displayedTab === "sporepedia" ? (
              <SporepediaModal
                open
                onClose={() => setCurrentTab("main")}
                onGoHome={() => setCurrentTab("main")}
              />
            ) : (
              <>
                <div
                  className={`app-main-logo-section${
                    displayedTab === "main" ? " is-visible" : " is-hidden"
                  }`}
                  aria-hidden={displayedTab !== "main"}
                >
                  <img
                    src={logo}
                    alt="Spore NEXT Launcher"
                    className="app-main-logo"
                    draggable={false}
                    loading="eager"
                    decoding="async"
                  />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.9rem",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "1.5rem",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <LaunchButtons />
                      <GameFolder />
                    </div>
                    <LauncherUpdater />
                  </div>
                  <MainCornerLinks />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
