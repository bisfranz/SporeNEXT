import React, { useMemo, useRef } from "react";
import "../styles/modinstallbutton.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faDownload,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";

const isValidModKey = (v) =>
  typeof v === "string" && v.trim().length > 0 && v.toLowerCase() !== "null";

export default function ModInstallButton({
  mod,
  installedByKey,
  updateInstalledCache,
  installingModId,
  installingModKey,
  setInstallingModId,
  setInstallingModKey,
  installingProgress,
  installingText,
  isBusy,
  setIsBusy,
  isUninstalling,
  setIsUninstalling,
  t,
  variant = "list",
}) {
  const modKey = mod?.mod_key;
  const canAutoInstall = isValidModKey(modKey);
  const cachedInstalled = canAutoInstall ? installedByKey?.[modKey] : false;
  const installed =
    typeof cachedInstalled === "boolean" ? cachedInstalled : false;

  const clickLockRef = useRef(false);

  const isThisOp = Boolean(
    modKey && installingModKey && installingModKey === modKey
  );

  const disabled = !canAutoInstall || clickLockRef.current;

  const buttonLabel = useMemo(() => {
    if (!canAutoInstall)
      return (
        t?.("modlist-not-supported") ??
        t?.("modlist-action-install") ??
        "Install"
      );

    if (isThisOp) {
      return isUninstalling
        ? t?.("modprofiles-uninstalling") ?? "Uninstalling..."
        : t?.("modprofiles-installing") ?? "Installing...";
    }

    return installed
      ? t?.("modprofiles-action-uninstall") ?? "Uninstall"
      : t?.("modlist-action-install") ?? "Install";
  }, [canAutoInstall, installed, isThisOp, isUninstalling, t]);

  const icon = useMemo(() => {
    if (isThisOp) return faSpinner;
    if (installed) return faTrashCan;
    return faDownload;
  }, [isThisOp, installed]);

  const className =
    "mod-install-btn" +
    (installed && !isThisOp ? " danger" : "") +
    (variant === "list" ? " compact" : "");

  const onClick = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (disabled) return;
    if (!mod || !canAutoInstall) return;

    if (clickLockRef.current) return;
    clickLockRef.current = true;

    try {
      const doUninstall = Boolean(installed);
      const modTitle = mod?.title || "";

      setInstallingModKey(modKey);
      setIsUninstalling(doUninstall);

      if (doUninstall) {
        await window.electronAPI.uninstallMod(modKey, modTitle);
      } else {
        await window.electronAPI.installMod(
          modKey,
          mod?.download_url || mod?.downloadUrl,
          modTitle
        );
      }

      try {
        const realInstalled = await window.electronAPI.isModInstalled(modKey);
        updateInstalledCache?.(modKey, Boolean(realInstalled));
      } catch {}
    } finally {
      clickLockRef.current = false;
    }
  };

  return (
    <button className={className} onClick={onClick} disabled={disabled}>
      <span className="mod-install-btn__content">
        <FontAwesomeIcon icon={icon} spin={isThisOp} />
        <span className="mod-install-btn__label">{buttonLabel}</span>
      </span>
    </button>
  );
}
