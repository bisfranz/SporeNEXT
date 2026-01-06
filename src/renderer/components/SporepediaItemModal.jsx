import React, { useMemo, useState } from "react";
import "../styles/sporepediaitemmodal.css";
import "../styles/modinstallbutton.css";
import { useLocale } from "../hooks/useLocale";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { SPOREPEDIA_FILTERS } from "./SporepediaFiltersBar";
import DeleteConfirmModal from "./DeleteConfirmModal";

export default function SporepediaItemModal({
  item,
  onClose,
  onGoHome,
  onDeleted,
}) {
  const { t } = useLocale();
  const { user, loading: authLoading } = useAuth() || {};
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  if (!item) return null;

  const sporepediaId = item?.sporepedia_id;
  const ownerUserId = item?.user_id;
  const imagePath = String(item?.image_path || "");

  const title = item?.title || "";
  const description = item?.description || "";
  const imageUrl = item?.image_url || "";
  const authorRaw = String(item?.author || "").trim();
  const authorUi = authorRaw.replace(/#\d+$/, "");

  const canDelete =
    !authLoading &&
    Boolean(user?.id) &&
    Boolean(ownerUserId) &&
    user.id === ownerUserId;

  const storagePath = useMemo(() => {
    if (imagePath) return imagePath;

    try {
      const u = new URL(imageUrl);
      const parts = u.pathname.split("/storage/v1/object/public/");
      if (parts.length < 2) return "";
      const after = parts[1] || "";
      const bucketPrefix = "SPORE%20NEXT%20Sporepedia/";
      const decoded = after.startsWith(bucketPrefix)
        ? decodeURIComponent(after.slice(bucketPrefix.length))
        : decodeURIComponent(after);
      return decoded.startsWith("SPORE NEXT Sporepedia/")
        ? decoded.slice("SPORE NEXT Sporepedia/".length)
        : decoded;
    } catch {
      return "";
    }
  }, [imageUrl, imagePath]);

  const myDiscordUsername = useMemo(() => {
    const u = user || {};
    const meta = u?.user_metadata || {};
    const identities = Array.isArray(u.identities) ? u.identities : [];
    const discordIdentity = identities.find((i) => i?.provider === "discord");
    const idMeta = discordIdentity?.identity_data || {};

    return (
      (typeof idMeta?.preferred_username === "string" &&
        idMeta.preferred_username) ||
      (typeof idMeta?.username === "string" && idMeta.username) ||
      (typeof meta?.preferred_username === "string" &&
        meta.preferred_username) ||
      (typeof meta?.user_name === "string" && meta.user_name) ||
      (typeof meta?.name === "string" && meta.name) ||
      ""
    ).trim();
  }, [user]);

  const categories = Array.isArray(item?.categories) ? item.categories : [];
  const categoryFilters = (SPOREPEDIA_FILTERS || []).filter(
    (f) => f.key !== "ALL" && categories.includes(f.key)
  );

  const downloadImage = async (e) => {
    e?.stopPropagation?.();
    e?.currentTarget?.blur?.();

    if (!imageUrl) return;

    const suggested = title || "sporepedia-image";

    try {
      if (window.electronAPI?.downloadSporepediaImage) {
        await window.electronAPI.downloadSporepediaImage(imageUrl, suggested);
        return;
      }

      const a = document.createElement("a");
      a.href = imageUrl;
      a.download = `${suggested}.png`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {}
  };

  const deleteCreation = async () => {
    if (!canDelete || deleteBusy) return;
    setDeleteError("");

    if (!sporepediaId) {
      setDeleteError("Missing sporepedia id");
      return;
    }

    setDeleteBusy(true);
    try {
      if (storagePath) {
        const { error: storageErr } = await supabase.storage
          .from("SPORE NEXT Sporepedia")
          .remove([storagePath]);
        if (storageErr) throw storageErr;
      }

      let del = supabase
        .from("sporepedia")
        .delete()
        .eq("sporepedia_id", sporepediaId);
      if (user?.id) del = del.eq("user_id", user.id);
      const { error: deleteErr } = await del;
      if (deleteErr) throw deleteErr;

      setShowDeleteConfirm(false);
      onDeleted?.();
      onClose?.();
    } catch (e) {
      setDeleteError(e?.message || String(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="sporepediaitem-backdrop" onMouseDown={() => onClose?.()}>
      {showDeleteConfirm ? (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        >
          <DeleteConfirmModal
            title={t("common.delete")}
            desc={deleteError || t("common.confirm")}
            onCancel={() => {
              if (deleteBusy) return;
              setDeleteError("");
              setShowDeleteConfirm(false);
            }}
            onConfirm={deleteCreation}
            confirmDisabled={deleteBusy}
          />
        </div>
      ) : null}

      <div
        className="sporepediaitem-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sporepediaitem-content">
          <div className="modprofiles-breadcrumbs">
            <span
              className="modprofiles-breadcrumb-link"
              onClick={() => (onGoHome ? onGoHome() : onClose?.())}
            >
              Spore NEXT
            </span>
            <span className="modprofiles-breadcrumb-separator">/</span>
            <span
              className="modprofiles-breadcrumb-link"
              onClick={() => onClose?.()}
            >
              Sporepedia
            </span>
            <span className="modprofiles-breadcrumb-separator">/</span>
            <span className="modprofiles-breadcrumb-current">{title}</span>
          </div>

          <div className="sporepediaitem-header">
            <div className="sporepediaitem-header-flex">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title}
                  className="sporepediaitem-header-img"
                  draggable={false}
                />
              ) : (
                <div className="sporepediaitem-header-img sporepediaitem-header-img--placeholder" />
              )}

              <div className="sporepediaitem-header-texts">
                <h2 className="sporepediaitem-title" title={title}>
                  {title}
                </h2>
                {authorUi ? (
                  <div className="sporepediaitem-author" title={authorUi}>
                    <FontAwesomeIcon
                      icon={faDiscord}
                      className="sporepediaitem-authorIcon"
                      fixedWidth
                    />
                    {t("sporepedia.byAuthor", { author: authorUi })}
                  </div>
                ) : null}

                <div className="sporepediaitem-actions">
                  <button
                    type="button"
                    className="mod-install-btn compact"
                    onClick={downloadImage}
                  >
                    <span className="mod-install-btn__content">
                      <FontAwesomeIcon icon={faDownload} />
                      <span className="mod-install-btn__label">
                        {t("sporepedia.actions.download")}
                      </span>
                    </span>
                  </button>

                  {canDelete ? (
                    <button
                      type="button"
                      className="sporepediaitem-deleteBtn"
                      title={t("common.delete")}
                      aria-label={t("common.delete")}
                      onClick={(e) => {
                        e?.stopPropagation?.();
                        setShowDeleteConfirm(true);
                      }}
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="sporepediaitem-sections-wrapper">
            {categoryFilters.length ? (
              <div className="sporepediaitem-section">
                <div className="sporepediaitem-section-title">
                  {t("sporepedia.upload.fields.categories")}
                </div>
                <ul className="sporepediaitem-details">
                  <li>
                    <div className="sporepediaitem-details-icons" role="list">
                      {categoryFilters.map((f) => (
                        <span
                          key={f.key}
                          className="sporepediaitem-details-iconWrap"
                          title={t(f.altKey)}
                        >
                          {f.icon ? (
                            <img
                              src={f.icon}
                              alt={t(f.altKey)}
                              className="sporepediaitem-details-icon"
                              draggable={false}
                            />
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </li>
                </ul>
              </div>
            ) : null}

            <div className="sporepediaitem-section">
              <div className="sporepediaitem-section-title">
                {t("sporepedia.upload.fields.description")}
              </div>
              <div className="sporepediaitem-description">{description}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
