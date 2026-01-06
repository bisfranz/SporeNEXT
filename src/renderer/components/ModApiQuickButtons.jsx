import React, { useState, useRef } from "react";
import installerIcon from "../../../public/assets/SporeModAPI-Installer.png";
import uninstallerIcon from "../../../public/assets/SporeModAPI-Uninstaller.png";

export default function ModApiQuickButtons({ disabled }) {
  const [running, setRunning] = useState(null);
  const lockRef = useRef({ installer: false, uninstaller: false });

  const withLock = async (kind, fn) => {
    if (disabled) return;
    if (lockRef.current[kind]) return;
    lockRef.current[kind] = true;
    setRunning(kind);
    try {
      await fn();
    } finally {
      setTimeout(() => {
        lockRef.current[kind] = false;
        setRunning((prev) => (prev === kind ? null : prev));
      }, 1200);
    }
  };

  const runInstaller = async () => {
    await withLock("installer", async () => {
      await window.electronAPI?.runSporeModApiEasyInstaller?.();
    });
  };

  const runUninstaller = async () => {
    await withLock("uninstaller", async () => {
      await window.electronAPI?.runSporeModApiEasyUninstaller?.();
    });
  };

  const isInstallerDisabled = disabled || running === "installer";
  const isUninstallerDisabled = disabled || running === "uninstaller";

  return (
    <>
      <button
        type="button"
        className="galaxyreset-root"
        onClick={runInstaller}
        disabled={isInstallerDisabled}
        title="Spore ModAPI Installer"
        aria-label="Spore ModAPI Installer"
      >
        <img
          src={installerIcon}
          alt=""
          aria-hidden="true"
          className="galaxyreset-icon"
        />
      </button>

      <button
        type="button"
        className="galaxyreset-root"
        onClick={runUninstaller}
        disabled={isUninstallerDisabled}
        title="Spore ModAPI Uninstaller"
        aria-label="Spore ModAPI Uninstaller"
        style={{ marginLeft: "-0.6rem" }}
      >
        <img
          src={uninstallerIcon}
          alt=""
          aria-hidden="true"
          className="galaxyreset-icon"
        />
      </button>
    </>
  );
}
