import React, { useMemo, useRef, useState } from "react";
import "../styles/sporepediauploadmodal.css";
import { useLocale } from "../hooks/useLocale";
import { supabase } from "../lib/supabaseClient";
import { SPOREPEDIA_FILTERS } from "./SporepediaFiltersBar";

const MAX_PNG_BYTES = 2 * 1024 * 1024;

export default function SporepediaUploadModal({ onClose, onUploaded, user }) {
  const { t } = useLocale();
  const fileInputRef = useRef(null);

  const discordUsername = useMemo(() => {
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

  const discordUsernameUi = useMemo(() => {
    return (discordUsername || "").replace(/#\d+$/, "");
  }, [discordUsername]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategories, setSelectedCategories] = useState(() => new Set());
  const [imageFile, setImageFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const categories = useMemo(() => {
    return Array.from(selectedCategories || []);
  }, [selectedCategories]);

  const canSubmit =
    Boolean(discordUsername) &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    categories.length > 0 &&
    Boolean(imageFile) &&
    !submitting;

  const pickFile = () => fileInputRef.current?.click?.();

  const onFileChange = (e) => {
    setError("");
    const f = e?.target?.files?.[0];
    if (!f) {
      setImageFile(null);
      return;
    }

    const isPng =
      f.type === "image/png" ||
      String(f.name || "")
        .toLowerCase()
        .endsWith(".png");

    if (!isPng) {
      setImageFile(null);
      setError(t("sporepedia.upload.errors.pngOnly"));
      return;
    }

    if (f.size > MAX_PNG_BYTES) {
      setImageFile(null);
      setError(t("sporepedia.upload.errors.tooLarge", { mb: "2" }));
      return;
    }

    setImageFile(f);
  };

  const toggleCategory = (key) => {
    if (!key || key === "ALL") return;
    setSelectedCategories((prev) => {
      const next = new Set(prev || []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const upload = async () => {
    setError("");

    if (!discordUsername) {
      setError(t("sporepedia.upload.errors.loginRequired"));
      return;
    }

    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const safeTitle = title.trim().replaceAll(/[\\/:*?"<>|]/g, "-");
      const id =
        typeof crypto !== "undefined" && crypto?.randomUUID
          ? crypto.randomUUID()
          : String(Date.now());
      const filePath = `sporepedia/${safeTitle}-${id}.png`;

      const { data: uploadRes, error: uploadErr } = await supabase.storage
        .from("SPORE NEXT Sporepedia")
        .upload(filePath, imageFile, {
          upsert: false,
          contentType: "image/png",
        });

      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage
        .from("SPORE NEXT Sporepedia")
        .getPublicUrl(uploadRes.path);

      const image_url = publicUrlData?.publicUrl || "";

      const payload = {
        sporepedia_id: id,
        user_id: user?.id || null,
        title: title.trim(),
        author: discordUsername,
        description: description.trim(),
        categories,
        image_url,
        image_path: uploadRes.path,
      };

      const { error: insertErr } = await supabase
        .from("sporepedia")
        .insert(payload);
      if (insertErr) throw insertErr;

      setDone(true);
      onUploaded?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sporepediaupload-backdrop" onMouseDown={onClose}>
      <div
        className="sporepediaupload-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sporepediaupload-top">
          <img
            className="sporepediaupload-icon"
            src="assets/spore-next-emblem.png"
            alt=""
            aria-hidden="true"
          />
          <div className="sporepediaupload-title">
            {t("sporepedia.upload.title")}
          </div>
        </div>

        <div className="sporepediaupload-body">
          <div className="sporepediaupload-grid">
            <label className="sporepediaupload-field">
              <div className="sporepediaupload-label">
                {t("sporepedia.upload.fields.name")}
              </div>
              <input
                className="sporepediaupload-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("sporepedia.upload.placeholders.name")}
                maxLength={120}
              />
            </label>

            <label className="sporepediaupload-field">
              <div className="sporepediaupload-label">
                {t("sporepedia.upload.fields.author")}
              </div>
              <input
                className="sporepediaupload-input sporepediaupload-input--readonly"
                value={
                  discordUsernameUi || t("sporepedia.upload.authorUnknown")
                }
                readOnly
                disabled
              />
              <div className="sporepediaupload-help">
                {t("sporepedia.upload.help.author")}
              </div>
            </label>

            <label className="sporepediaupload-field sporepediaupload-field--full">
              <div className="sporepediaupload-label">
                {t("sporepedia.upload.fields.description")}
              </div>
              <textarea
                className="sporepediaupload-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("sporepedia.upload.placeholders.description")}
                rows={5}
                maxLength={1000}
              />
            </label>

            <div className="sporepediaupload-field sporepediaupload-field--full">
              <div className="sporepediaupload-label">
                {t("sporepedia.upload.fields.categories")}
              </div>

              {/* Categories selection buttons */}
              <div className="sporepediafiltersbar-root sporepediaupload-categories">
                {SPOREPEDIA_FILTERS.filter((f) => f.key !== "ALL").map((f) => {
                  const isSelected = selectedCategories?.has?.(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      className={
                        "sporepediafiltersbar-btn" +
                        (isSelected ? " selected" : "")
                      }
                      onClick={() => toggleCategory(f.key)}
                      title={t(f.altKey)}
                      aria-pressed={Boolean(isSelected)}
                    >
                      {f.icon ? (
                        <img
                          src={f.icon}
                          alt={t(f.altKey)}
                          className="sporepediafiltersbar-icon"
                          draggable={false}
                        />
                      ) : (
                        f.label(t)
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="sporepediaupload-divider" />

          <div className="sporepediaupload-image">
            <div className="sporepediaupload-label">
              {t("sporepedia.upload.fields.image")}
            </div>
            <div className="sporepediaupload-imageRow">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,.png"
                className="sporepediaupload-fileInput"
                onChange={onFileChange}
              />
              <button
                type="button"
                className="sporepediaupload-btn"
                onClick={pickFile}
                disabled={submitting}
              >
                {t("sporepedia.upload.actions.chooseImage")}
              </button>
              <div
                className="sporepediaupload-fileName"
                title={imageFile?.name || ""}
              >
                {imageFile?.name || t("sporepedia.upload.noImage")}
              </div>
            </div>
          </div>

          {error && <div className="sporepediaupload-error">{error}</div>}
          {done && (
            <div className="sporepediaupload-success">
              {t("sporepedia.upload.success")}
            </div>
          )}
        </div>

        <div className="sporepediaupload-actions">
          <button
            className="sporepediaupload-btn"
            onClick={onClose}
            disabled={submitting}
          >
            {t("common.cancel")}
          </button>
          <button
            className="sporepediaupload-btn sporepediaupload-btn-primary"
            onClick={upload}
            disabled={!canSubmit}
          >
            {submitting
              ? t("common.loading")
              : t("sporepedia.upload.actions.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
