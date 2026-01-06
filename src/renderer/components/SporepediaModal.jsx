import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/sporepediamodal.css";
import { supabase } from "../lib/supabaseClient";
import SporepediaSearchBar from "./SporepediaSearchBar";
import SporepediaFiltersBar from "./SporepediaFiltersBar";
import SporepediaUploadButton from "./SporepediaUploadButton";
import SporepediaUploadModal from "./SporepediaUploadModal";
import { useLocale } from "../hooks/useLocale";
import { useAuth } from "../hooks/useAuth";
import loadingImg from "../../../public/assets/loading.png";
import SporepediaItemModal from "./SporepediaItemModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import ModListPages from "./ModListPages";

export default function SporepediaModal({ onGoHome }) {
  const { t } = useLocale();
  const { user, loading: authLoading } = useAuth() || {};
  const isLoggedIn = Boolean(user) && !authLoading;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState(() => new Set());
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const loadedKeysRef = useRef(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const ITEMS_PER_PAGE = 24;

  const toggleFilter = (key) => {
    if (!key) return;

    if (key === "ALL") {
      setSelectedFilters(new Set());
      return;
    }

    setSelectedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedFilters]);

  useEffect(() => {
    let cancelled = false;

    async function fetchSporepedia() {
      setLoading(true);
      setError("");

      try {
        const q = (search || "").trim();
        const filters = Array.from(selectedFilters || []);

        let query = supabase
          .from("sporepedia")
          .select(
            "sporepedia_id, user_id, title, description, image_url, image_path, categories, author"
          )
          .order("title", { ascending: true });

        if (q) {
          query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`);
        }

        if (filters.length > 0) {
          query = query.overlaps("categories", filters);
        }

        const { data, error: supaError } = await query;

        if (cancelled) return;

        if (supaError) {
          setError(supaError.message || String(supaError));
          setItems([]);
        } else {
          setItems(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSporepedia();
    return () => {
      cancelled = true;
    };
  }, [search, selectedFilters, refreshTick]);

  const filteredItems = useMemo(() => {
    return items;
  }, [items]);

  const totalPages = useMemo(() => {
    const total = Array.isArray(filteredItems) ? filteredItems.length : 0;
    return Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  }, [filteredItems]);

  const safeCurrentPage = useMemo(() => {
    return Math.min(Math.max(currentPage, 1), totalPages);
  }, [currentPage, totalPages]);

  const pageItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return (filteredItems || []).slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, safeCurrentPage]);

  useEffect(() => {
    loadedKeysRef.current = new Set();
    setImagesLoaded(0);
  }, [pageItems]);

  const expectedImages = useMemo(() => {
    return (pageItems || []).filter((it) => Boolean(it?.image_url)).length;
  }, [pageItems]);

  const allImagesReady = expectedImages === 0 || imagesLoaded >= expectedImages;

  useEffect(() => {
    if (loading) return;
    if (expectedImages === 0) return;
    const t = setTimeout(() => {
      try {
        const imgs = document.querySelectorAll(
          ".sporepedia-grid img.sporepedia-card__image"
        );
        let completeCount = 0;
        imgs.forEach((img) => {
          if (img.complete) completeCount += 1;
        });
        if (completeCount > 0) {
          setImagesLoaded((prev) =>
            prev < completeCount ? completeCount : prev
          );
        }
      } catch {}
    }, 80);
    return () => clearTimeout(t);
  }, [loading, expectedImages, pageItems.length]);

  const markImageDone = (key) => {
    if (!key) return;
    if (loadedKeysRef.current.has(key)) return;
    loadedKeysRef.current.add(key);
    setImagesLoaded((n) => n + 1);
  };

  const content = useMemo(() => {
    const showLoadingOverlay = Boolean(loading || (!error && !allImagesReady));

    if (error) {
      return (
        <div className="sporepedia-state sporepedia-state--error">{error}</div>
      );
    }

    if (!filteredItems.length && !loading) {
      return <div className="sporepedia-state">{t("sporepedia.empty")}</div>;
    }

    return (
      <>
        {showLoadingOverlay && (
          <div className="sporepedia-loading-overlay">
            <img
              src={loadingImg}
              className="sporepedia-loading-img"
              alt={t("common.loading")}
              draggable={false}
            />
          </div>
        )}

        <div
          className="sporepedia-grid"
          style={{ opacity: showLoadingOverlay ? 0.35 : 1 }}
        >
          {pageItems.map((it, idx) => {
            const imgKey = it?.image_url
              ? `${safeCurrentPage}:${idx}:${it.image_url}`
              : "";
            const authorUi = String(it?.author || "").replace(/#\d+$/, "");

            return (
              <div
                className="sporepedia-card"
                key={`${it?.title || "item"}-${safeCurrentPage}-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedItem(it)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedItem(it);
                  }
                }}
              >
                <div className="sporepedia-card__header">
                  <div
                    className="sporepedia-card__title"
                    title={it?.title || ""}
                  >
                    {it?.title || ""}
                  </div>
                  <div className="sporepedia-card__author" title={authorUi}>
                    {authorUi ? (
                      <>
                        <FontAwesomeIcon
                          icon={faDiscord}
                          className="sporepedia-card__authorIcon"
                          fixedWidth
                        />
                        {t("sporepedia.byAuthor", { author: authorUi })}
                      </>
                    ) : (
                      ""
                    )}
                  </div>
                </div>

                <div className="sporepedia-card__imageWrap">
                  {it?.image_url ? (
                    <img
                      className="sporepedia-card__image"
                      src={it.image_url}
                      alt={it?.title || ""}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onLoad={() => markImageDone(imgKey)}
                      onError={() => markImageDone(imgKey)}
                    />
                  ) : (
                    <div className="sporepedia-card__imagePlaceholder" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sporepedia-pages">
          <ModListPages
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </>
    );
  }, [
    pageItems,
    safeCurrentPage,
    totalPages,
    filteredItems.length,
    loading,
    error,
    allImagesReady,
    t,
  ]);

  return (
    <div className="sporepedia-panel-root">
      {selectedItem ? (
        <SporepediaItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onGoHome={onGoHome}
          onDeleted={() => {
            setSelectedItem(null);
            setRefreshTick((n) => n + 1);
          }}
        />
      ) : null}

      {showUpload && isLoggedIn ? (
        <SporepediaUploadModal
          user={user}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            setRefreshTick((n) => n + 1);
          }}
        />
      ) : null}

      <SporepediaSearchBar
        value={search}
        onChange={setSearch}
        rightSlot={
          <div className="sporepedia-rightslot">
            <SporepediaFiltersBar
              selected={selectedFilters}
              onToggle={toggleFilter}
            />
            <SporepediaUploadButton
              disabled={!isLoggedIn}
              onClick={() => {
                if (!isLoggedIn) return;
                setShowUpload(true);
              }}
            />
          </div>
        }
      />
      <div className="sporepedia-panel-card">
        <div className="sporepedia-content">{content}</div>
      </div>
    </div>
  );
}
