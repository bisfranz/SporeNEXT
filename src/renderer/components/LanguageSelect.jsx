import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/languageselect.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faChevronDown,
  faGlobe,
} from "@fortawesome/free-solid-svg-icons";
import ReactCountryFlag from "react-country-flag";
import { useLocale } from "../hooks/useLocale";

export default function LanguageSelect({
  value,
  onChange,
  options,
  preloadFlags = true,
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selected = useMemo(() => {
    return (options || []).find((o) => o.value === value) || (options || [])[0];
  }, [options, value]);

  const flagsToPreload = useMemo(() => {
    return (options || []).map((o) => o?.countryCode).filter(Boolean);
  }, [options]);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const choose = (next) => {
    if (!next) return;
    onChange?.(next.value);
    setOpen(false);
  };

  const renderFlag = (opt) => {
    if (opt?.countryCode) {
      return (
        <ReactCountryFlag
          countryCode={opt.countryCode}
          svg
          className="langselect-flag-svg"
          aria-label={opt.countryCode}
        />
      );
    }

    return <FontAwesomeIcon icon={faGlobe} />;
  };

  return (
    <div className="langselect" ref={rootRef}>
      {preloadFlags ? (
        <div className="langselect-preload" aria-hidden="true">
          {(flagsToPreload || []).map((cc) => (
            <ReactCountryFlag
              key={cc}
              countryCode={cc}
              svg
              className="langselect-flag-svg"
              aria-label={cc}
            />
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className={"langselect-control" + (open ? " open" : "")}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="langselect-left">
          <span className="langselect-flag" aria-hidden="true">
            {renderFlag(selected)}
          </span>
          <span className="langselect-label">
            <span className="langselect-primary">{selected?.label}</span>
            {selected?.secondary ? (
              <span className="langselect-secondary">{selected.secondary}</span>
            ) : null}
          </span>
        </span>

        <span className="langselect-right" aria-hidden="true">
          <FontAwesomeIcon
            icon={faChevronDown}
            className="langselect-chevron"
          />
        </span>
      </button>

      {open ? (
        <div
          className="langselect-menu"
          role="listbox"
          aria-label={t("settingspanel-language-title")}
        >
          {(options || []).map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                className={"langselect-item" + (isSelected ? " selected" : "")}
                onClick={() => choose(opt)}
                role="option"
                aria-selected={isSelected}
              >
                <span className="langselect-item-left">
                  <span className="langselect-flag" aria-hidden="true">
                    {renderFlag(opt)}
                  </span>
                  <span className="langselect-item-label">{opt.label}</span>
                </span>

                <span className="langselect-item-right">
                  {opt.secondary ? (
                    <span className="langselect-item-secondary">
                      {opt.secondary}
                    </span>
                  ) : null}
                  {isSelected ? (
                    <span className="langselect-item-check" aria-hidden="true">
                      <FontAwesomeIcon icon={faCheck} />
                    </span>
                  ) : (
                    <span
                      className="langselect-item-check placeholder"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
