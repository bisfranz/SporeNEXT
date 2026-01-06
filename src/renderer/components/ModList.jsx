import React, { useState, useEffect, useMemo, useRef } from "react";
import "../styles/modlist.css";
import ModSearchBar from "./ModSearchBar";
import FiltersBar from "./FiltersBar";
import {
  faThumbsUp,
  faDownload,
  faTrashCan,
  faSpinner,
  faTag,
  faUser,
  faWeightHanging,
  faFolderOpen,
  faBarsProgress,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { supabase } from "../lib/supabaseClient";
import loadingImg from "../../../public/assets/loading.png";
import { useLocale } from "../hooks/useLocale";
import ModListPages from "./ModListPages";
import "../styles/modlistpages.css";
import "../styles/galaxyreset.css";
import galaxyResetImg from "../../../public/assets/galaxyreset.png";
import GalaxyResetModal from "./GalaxyResetModal";
import ModInstallButton from "./ModInstallButton";
import ModApiQuickButtons from "./ModApiQuickButtons";
import { useAuth } from "../hooks/useAuth";
import { useLikesStore } from "../hooks/useLikesStore";

const SUPPORTED_MODS = ["60fps", "4gbpatch"];
const isValidModKey = (v) =>
  typeof v === "string" && v.trim().length > 0 && v.toLowerCase() !== "null";
const isAutoInstallMod = (mod) => isValidModKey(mod?.mod_key);

export default function ModList({
  setCurrentTab,
  installingModId,
  setInstallingModId,
  installingModKey,
  setInstallingModKey,
  isBusy,
  setIsBusy,
  installingProgress,
  setInstallingProgress,
  installingText,
  setInstallingText,
  isUninstalling,
  setIsUninstalling,
  selectedMod,
  setSelectedMod,
  setIsValidating,
  lastCompletedModKey,
  lastCompletedAction,
  installedRefreshToken,
  installedByKey,
  updateInstalledCache,
  refreshInstalledCache,
  __renderTick,
}) {
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("ALL");
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t, locale } = useLocale();
  const { user } = useAuth() || {};
  const userId = user?.id || null;

  const [isValidating, setLocalIsValidating] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isGalaxyResetting, setIsGalaxyResetting] = useState(false);
  const [galaxyResetModal, setGalaxyResetModal] = useState({
    open: false,
    variant: "confirm",
    message: "",
    details: "",
  });

  const [endorsementSort, setEndorsementSort] = useState(null);
  const [likedByMe, setLikedByMe] = useState(() => new Set());
  const [likeBusy, setLikeBusy] = useState(() => new Set());

  const likesStore = useLikesStore();

  useEffect(() => {
    if (!likesStore) return;
    setLikedByMe(new Set(likesStore.likedByMe || []));
  }, [likesStore?.likedByMe]);

  const MODS_PER_PAGE = 10;
  const filteredMods = useMemo(() => {
    const s = (search || "").toLowerCase().trim();

    const base = (mods || [])
      .filter((m) => {
        if (!s) return true;
        return (
          (m.title || "").toLowerCase().includes(s) ||
          (m.file || "").toLowerCase().includes(s) ||
          (m.author || "").toLowerCase().includes(s)
        );
      })
      .filter((m) => {
        if (!selectedFilter || selectedFilter === "ALL") return true;

        const canonicalTag = (m.tags_en || m.tags || "")
          .toString()
          .toUpperCase();
        return canonicalTag === selectedFilter;
      });

    if (endorsementSort === "desc" || endorsementSort === "asc") {
      const dir = endorsementSort === "desc" ? -1 : 1;
      return base.slice().sort((a, b) => {
        const al = Number(a?.likes ?? 0);
        const bl = Number(b?.likes ?? 0);
        if (al !== bl) return (al - bl) * dir;
        return (a?.title || "").localeCompare(
          b?.title || "",
          locale || undefined,
          {
            sensitivity: "base",
            numeric: true,
          }
        );
      });
    }

    return base.slice().sort((a, b) => {
      return (a?.title || "").localeCompare(
        b?.title || "",
        locale || undefined,
        {
          sensitivity: "base",
          numeric: true,
        }
      );
    });
  }, [mods, search, selectedFilter, locale, endorsementSort]);

  useEffect(() => {
    setCurrentPage(1);
  }, [endorsementSort]);

  const totalPages = Math.ceil(filteredMods.length / MODS_PER_PAGE);
  const pagedMods = filteredMods.slice(
    (currentPage - 1) * MODS_PER_PAGE,
    currentPage * MODS_PER_PAGE
  );

  const listRef = useRef(null);

  const scrollListToTop = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = 0;
  };

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [filteredMods.length, totalPages]);

  useEffect(() => {
    if (!selectedMod) scrollListToTop();
  }, [selectedMod]);

  useEffect(() => {
    scrollListToTop();
  }, [currentPage]);

  useEffect(() => {
    scrollListToTop();
  }, [search, selectedFilter]);

  useEffect(() => {
    setIsValidating(isValidating);
  }, [isValidating, setIsValidating]);

  const loadLikeCounts = async (modIds) => {
    const ids = (modIds || []).filter(Boolean);
    if (ids.length === 0) return {};

    try {
      const { data, error } = await supabase.rpc("get_mod_like_counts", {
        mod_ids: ids,
      });

      if (!error && Array.isArray(data)) {
        const map = {};
        for (const row of data) {
          const k = row?.mod_id;
          if (!k) continue;
          map[k] = Number(row?.likes ?? row?.likes_count ?? 0);
        }
        return map;
      }
    } catch {}

    const { data: likesData } = await supabase
      .from("mod_likes")
      .select("mod_id")
      .in("mod_id", ids);

    const likesCount = {};
    if (likesData) {
      likesData.forEach((like) => {
        likesCount[like.mod_id] = (likesCount[like.mod_id] || 0) + 1;
      });
    }
    return likesCount;
  };

  useEffect(() => {
    async function fetchMods() {
      setLoading(true);
      const { data: modsData, error: modsError } = await supabase
        .from("mods")
        .select("*");

      const likeCounts = await loadLikeCounts(
        (modsData || []).map((m) => m?.id)
      );

      if (!modsError && modsData) {
        const modsWithLikes = modsData.map((mod) => {
          const validKey = isValidModKey(mod.mod_key);
          const cached = validKey ? installedByKey?.[mod.mod_key] : undefined;
          return {
            ...mod,
            likes: likeCounts[mod.id] || 0,
            installed: validKey
              ? typeof cached === "boolean"
                ? cached
                : null
              : false,
          };
        });

        if (likesStore) {
          for (const mod of modsWithLikes) {
            likesStore.setCount(mod.id, Number(mod.likes || 0), {
              version: Date.now(),
            });
          }
        }

        setMods(modsWithLikes);
      }

      setLoading(false);
      setLocalIsValidating(false);
    }

    fetchMods();
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadMyLikes() {
      if (!userId) {
        if (alive) setLikedByMe(new Set());
        if (likesStore) likesStore.setMyLikes([]);
        return;
      }
      const { data, error } = await supabase
        .from("mod_likes")
        .select("mod_id")
        .eq("user_id", userId);

      if (!alive) return;
      if (error) {
        setLikedByMe(new Set());
        if (likesStore) likesStore.setMyLikes([]);
        return;
      }

      const ids = (data || []).map((r) => r.mod_id).filter(Boolean);
      const s = new Set(ids);
      setLikedByMe(s);
      if (likesStore) likesStore.setMyLikes(ids);
    }

    loadMyLikes();
    return () => {
      alive = false;
    };
  }, [userId]);

  const toggleLike = async (modId) => {
    if (!modId) return;
    if (!userId) return;

    setLikeBusy((prev) => {
      const next = new Set(prev);
      next.add(modId);
      return next;
    });

    const alreadyLiked = likedByMe.has(modId);

    setLikedByMe((prev) => {
      const next = new Set(prev);
      if (alreadyLiked) next.delete(modId);
      else next.add(modId);
      return next;
    });
    if (likesStore) likesStore.setLikeStatus(modId, !alreadyLiked);

    setMods((prev) =>
      (prev || []).map((m) =>
        m.id === modId
          ? {
              ...m,
              likes: Math.max(
                0,
                Number(m.likes || 0) + (alreadyLiked ? -1 : 1)
              ),
            }
          : m
      )
    );
    if (likesStore) likesStore.applyLikeDelta(modId, alreadyLiked ? -1 : 1);

    try {
      if (alreadyLiked) {
        const { error } = await supabase
          .from("mod_likes")
          .delete()
          .eq("mod_id", modId)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("mod_likes")
          .insert({ mod_id: modId, user_id: userId });

        if (error) {
          const pgCode = error?.code;
          if (pgCode !== "23505") throw error;
        }
      }

      const map = await loadLikeCounts([modId]);
      if (map && typeof map[modId] === "number") {
        const nextCount = map[modId];
        setMods((prev) =>
          (prev || []).map((m) =>
            m.id === modId
              ? {
                  ...m,
                  likes: nextCount,
                }
              : m
          )
        );
        if (likesStore)
          likesStore.setCount(modId, nextCount, { version: Date.now() });
      }
    } catch {
      setLikedByMe((prev) => {
        const next = new Set(prev);
        if (alreadyLiked) next.add(modId);
        else next.delete(modId);
        return next;
      });
      if (likesStore) likesStore.setLikeStatus(modId, alreadyLiked);

      setMods((prev) =>
        (prev || []).map((m) =>
          m.id === modId
            ? {
                ...m,
                likes: Math.max(
                  0,
                  Number(m.likes || 0) + (alreadyLiked ? 1 : -1)
                ),
              }
            : m
        )
      );
      if (likesStore) likesStore.applyLikeDelta(modId, alreadyLiked ? 1 : -1);
    } finally {
      setLikeBusy((prev) => {
        const next = new Set(prev);
        next.delete(modId);
        return next;
      });
    }
  };

  const openGalaxyResetConfirm = () => {
    setGalaxyResetModal({
      open: true,
      variant: "confirm",
      message:
        t("galaxyreset-confirm") ||
        "Esto reiniciará tu galaxia de Spore haciendo un backup de %AppData%\\Roaming\\Spore\\Games.",
      details:
        t("galaxyreset-confirm-details") ||
        "Se renombrará la carpeta Games a Games.backup (o Games.backup1, Games.backup2, etc.).",
    });
  };

  const runGalaxyReset = async () => {
    if (isGalaxyResetting || isBusy || installingModId || installingModKey)
      return;

    setIsGalaxyResetting(true);
    try {
      const res = await window.electronAPI.galaxyReset();
      if (res?.ok) {
        setGalaxyResetModal({
          open: true,
          variant: "success",
          message: t("galaxyreset-success") || "Galaxy reset completado.",
          details: res?.to ? String(res.to) : "",
        });
      } else {
        const code = res?.code;
        const isMissingGames = code === "GAMES_FOLDER_NOT_FOUND";
        const isMissingSpore = code === "SPORE_FOLDER_NOT_FOUND";

        const localizedMessage = isMissingGames
          ? t("galaxyreset-missing-games") ||
            "Para reiniciar la galaxia, debes iniciar Spore al menos una vez para que se vuelva a generar otra carpeta."
          : isMissingSpore
          ? t("galaxyreset-missing-spore") ||
            "Carpeta de Spore no encontrada en %AppData%\\Roaming."
          : t("galaxyreset-error") || "Galaxy reset falló.";

        const localizedDetails = isMissingGames
          ? (t("galaxyreset-error-details-games") ||
              "No se encontró la carpeta Games en:") +
            "\n" +
            (res?.path || "")
          : isMissingSpore
          ? (t("galaxyreset-error-details-spore") ||
              "No se encontró la carpeta Spore en:") +
            "\n" +
            (res?.path || "")
          : res?.message || "";

        setGalaxyResetModal({
          open: true,
          variant: "error",
          message: localizedMessage,
          details: localizedDetails,
        });
      }
    } catch (e) {
      setGalaxyResetModal({
        open: true,
        variant: "error",
        message: t("galaxyreset-error") || "Galaxy reset falló.",
        details: String(e?.message || e),
      });
    } finally {
      setIsGalaxyResetting(false);
    }
  };

  const handleGalaxyReset = () => {
    if (isGalaxyResetting || isBusy || installingModId || installingModKey)
      return;
    openGalaxyResetConfirm();
  };

  return (
    <div>
      {galaxyResetModal.open && (
        <GalaxyResetModal
          variant={galaxyResetModal.variant}
          message={galaxyResetModal.message}
          details={galaxyResetModal.details}
          isBusy={isGalaxyResetting}
          onCancel={() =>
            setGalaxyResetModal((prev) => ({ ...prev, open: false }))
          }
          onClose={() =>
            setGalaxyResetModal((prev) => ({ ...prev, open: false }))
          }
          onConfirm={async () => {
            await runGalaxyReset();
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1.2rem",
          marginBottom: "1.2rem",
        }}
      >
        <ModSearchBar value={search} onChange={setSearch} />

        <FiltersBar selected={selectedFilter} onSelect={setSelectedFilter} />

        <button
          type="button"
          className="galaxyreset-root"
          onClick={handleGalaxyReset}
          disabled={isGalaxyResetting || isBusy}
          title={t("galaxyreset-title")}
        >
          <img
            src={galaxyResetImg}
            alt={t("galaxyreset-alt") || "Galaxy Reset"}
            className="galaxyreset-icon"
          />
          <span className="galaxyreset-text">
            {t("galaxyreset-label") || "Galaxy Reset"}
          </span>
        </button>

        <ModApiQuickButtons disabled={isGalaxyResetting || isBusy} />
      </div>

      <div className="modlist-table" ref={listRef}>
        <div className="modlist-header">
          <div className="modlist-header-cell">
            <FontAwesomeIcon
              icon={faFolderOpen}
              className="modlist-header-icon"
            />
            {t("modlist-header-name")}
          </div>
          <div className="modlist-header-cell">
            <FontAwesomeIcon
              icon={faBarsProgress}
              className="modlist-header-icon"
            />
            {t("modlist-header-action")}
          </div>
          <div className="modlist-header-cell">
            <FontAwesomeIcon
              icon={faWeightHanging}
              className="modlist-header-icon"
            />
            {t("modlist-header-size")}
          </div>
          <div
            className="modlist-header-cell modlist-header-cell--clickable"
            role="button"
            tabIndex={0}
            aria-label={
              (t("modlist-header-endorsements") || "Endorsements") +
              ". " +
              (t("modlist-sort-endorsements") || "Click to sort")
            }
            title={
              endorsementSort === "desc"
                ? t("modlist-sort-endorsements-desc") ||
                  "Sorted by endorsements (high → low). Click to sort low → high."
                : endorsementSort === "asc"
                ? t("modlist-sort-endorsements-asc") ||
                  "Sorted by endorsements (low → high). Click to reset sorting."
                : t("modlist-sort-endorsements") ||
                  "Click to sort by endorsements."
            }
            onClick={() => {
              setEndorsementSort((prev) =>
                prev === null ? "desc" : prev === "desc" ? "asc" : null
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setEndorsementSort((prev) =>
                  prev === null ? "desc" : prev === "desc" ? "asc" : null
                );
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <FontAwesomeIcon
              icon={faThumbsUp}
              className="modlist-header-icon"
            />
            {t("modlist-header-endorsements")}
            <span
              aria-hidden="true"
              style={{
                marginLeft: 2,
                opacity: endorsementSort ? 0.95 : 0.6,
                fontSize: "0.95em",
              }}
            >
              {endorsementSort === "desc"
                ? "▼"
                : endorsementSort === "asc"
                ? "▲"
                : "⇅"}
            </span>
          </div>
          <div className="modlist-header-cell">
            <FontAwesomeIcon icon={faUser} className="modlist-header-icon" />
            {t("modlist-header-author")}
          </div>
          <div className="modlist-header-cell">
            <FontAwesomeIcon icon={faTag} className="modlist-header-icon" />
            {t("modlist-header-category")}
          </div>
        </div>

        {loading && mods.length === 0 && (
          <div className="modlist-loading-overlay" aria-hidden="true">
            <img
              src={loadingImg}
              alt={t("modlist-loading-alt")}
              className="modlist-loading-img"
            />
          </div>
        )}

        {!loading && filteredMods.length === 0 && (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "#b7e0ff",
              fontSize: "1.1rem",
            }}
          >
            {t("modlist-no-mods-found")}
          </div>
        )}
        {pagedMods.map((mod) => {
          const canLike = Boolean(userId);
          const liked = likedByMe.has(mod.id);
          const busyLike = likeBusy.has(mod.id);

          const likesCount = likesStore
            ? likesStore.getCount(mod.id, mod.likes)
            : mod.likes;

          const categoryLabel =
            locale === "es"
              ? mod.tags_es || mod.tags_en || mod.tags
              : mod.tags_en || mod.tags_es || mod.tags;

          return (
            <div
              className="modlist-row"
              key={mod.mod_key || mod.id}
              style={{ cursor: "pointer" }}
              onClick={() => setSelectedMod(mod)}
            >
              <div className="modlist-namecell">
                <img src={mod.image} alt={mod.tags} className="modlist-icon" />
                <div>
                  <div className="modlist-name">{mod.title}</div>
                  <div className="modlist-file">{mod.file}</div>
                </div>
              </div>

              <div>
                <ModInstallButton
                  mod={mod}
                  installedByKey={installedByKey}
                  updateInstalledCache={updateInstalledCache}
                  installingModId={installingModId}
                  installingModKey={installingModKey}
                  setInstallingModId={setInstallingModId}
                  setInstallingModKey={setInstallingModKey}
                  installingProgress={installingProgress}
                  installingText={installingText}
                  isBusy={isBusy}
                  setIsBusy={setIsBusy}
                  isUninstalling={isUninstalling}
                  setIsUninstalling={setIsUninstalling}
                  t={t}
                  variant="list"
                />
              </div>

              <div>
                <span className="modlist-size">{mod.size}</span>
              </div>
              <div>
                <span
                  className={
                    "modlist-endorsements" +
                    (liked ? " modlist-endorsements--liked" : "") +
                    (!canLike ? " modlist-endorsements--disabled" : "")
                  }
                  role={canLike ? "button" : undefined}
                  tabIndex={canLike ? 0 : -1}
                  title={
                    canLike
                      ? liked
                        ? t("likes.unlike")
                        : t("likes.like")
                      : t("likes.loginRequired")
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canLike || busyLike) return;
                    toggleLike(mod.id);
                  }}
                  onKeyDown={(e) => {
                    if (!canLike || busyLike) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleLike(mod.id);
                    }
                  }}
                  aria-disabled={!canLike || busyLike}
                >
                  <FontAwesomeIcon
                    icon={faThumbsUp}
                    style={{
                      marginRight: "6px",
                      color: liked ? "#b7a6d7" : "#7e5ab8",
                      opacity: busyLike ? 0.55 : 1,
                    }}
                  />
                  {likesCount}
                </span>
              </div>

              <div>
                <span className="modlist-author">{mod.author}</span>
              </div>
              <div>
                <span className="modlist-category">{categoryLabel}</span>
              </div>
            </div>
          );
        })}
      </div>

      <ModListPages
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
