import React from "react";
import "../styles/filtersbar.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import optimizationIcon from "../../../public/assets/optimization.png";
import graphicsIcon from "../../../public/assets/graphics.png";
import overhaulIcon from "../../../public/assets/overhaul.png";
import { useLocale } from "../hooks/useLocale";

const FILTERS = [
  {
    key: "ALL",
    label: (t) => (
      <FontAwesomeIcon
        icon={faAsterisk}
        style={{ fontSize: "1.1rem" }}
        className="filtersbar-asterisk"
        title={t("filtersbar-all")}
      />
    ),
    altKey: "filtersbar-all",
  },
  {
    key: "OPTIMIZATION",
    icon: optimizationIcon,
    altKey: "filtersbar-optimization",
  },
  { key: "GRAPHICS", icon: graphicsIcon, altKey: "filtersbar-graphics" },
  { key: "OVERHAUL", icon: overhaulIcon, altKey: "filtersbar-overhaul" },
];

export default function FiltersBar({ selected, onSelect }) {
  const { t } = useLocale();
  return (
    <div className="filtersbar-root">
      {FILTERS.map((filter) => (
        <button
          key={filter.key}
          className={
            "filtersbar-btn" + (selected === filter.key ? " selected" : "")
          }
          onClick={() => onSelect(filter.key)}
          title={t(filter.altKey)}
        >
          {filter.icon ? (
            <img
              src={filter.icon}
              alt={t(filter.altKey)}
              className="filtersbar-icon"
            />
          ) : (
            filter.label(t)
          )}
        </button>
      ))}
    </div>
  );
}
