import React from "react";
import "../styles/modlistpages.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";

export default function ModListPages({
  currentPage,
  totalPages,
  onPageChange,
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const goPrev = () => {
    if (!canGoPrev) return;
    onPageChange(currentPage - 1);
  };

  const goNext = () => {
    if (!canGoNext) return;
    onPageChange(currentPage + 1);
  };

  return (
    <div className="modlist-pages" aria-label="Pagination">
      <button
        type="button"
        className="modlist-page-btn modlist-page-arrow"
        onClick={goPrev}
        disabled={!canGoPrev}
        aria-label="Previous page"
        title="Previous"
      >
        <FontAwesomeIcon icon={faChevronLeft} />
      </button>

      {pages.map((page) => (
        <button
          key={page}
          type="button"
          className={
            "modlist-page-btn" + (page === currentPage ? " active" : "")
          }
          onClick={() => onPageChange(page)}
        >
          {page}
        </button>
      ))}

      <button
        type="button"
        className="modlist-page-btn modlist-page-arrow"
        onClick={goNext}
        disabled={!canGoNext}
        aria-label="Next page"
        title="Next"
      >
        <FontAwesomeIcon icon={faChevronRight} />
      </button>
    </div>
  );
}
