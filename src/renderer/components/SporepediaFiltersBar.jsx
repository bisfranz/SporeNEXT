import React from "react";
import "../styles/sporepediafiltersbar.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { useLocale } from "../hooks/useLocale";
import iconGA from "../../../public/assets/sporega.png";
import iconCC from "../../../public/assets/icon_creepyandcute.png";
import iconCreature from "../../../public/assets/icon_creature.png";
import iconVLand from "../../../public/assets/icon_vland.png";
import iconVAir from "../../../public/assets/icon_vair.png";
import iconVSea from "../../../public/assets/icon_vsea.png";
import iconBuilding from "../../../public/assets/icon_building.png";
import iconDarkInjection from "../../../public/assets/icon_darkinjection.png";

const FILTERS = [
  {
    key: "ALL",
    altKey: "sporepedia.filters.all",
    label: (t) => (
      <FontAwesomeIcon
        icon={faAsterisk}
        className="sporepediafiltersbar-asterisk"
        title={t("sporepedia.filters.all")}
      />
    ),
  },
  {
    key: "GA",
    altKey: "sporepedia.filters.ga",
    icon: iconGA,
  },
  {
    key: "CC",
    altKey: "sporepedia.filters.cc",
    icon: iconCC,
  },
  {
    key: "DARKINJECTION",
    altKey: "sporepedia.filters.darkinjection",
    icon: iconDarkInjection,
  },
  {
    key: "CREATURE",
    altKey: "sporepedia.filters.creature",
    icon: iconCreature,
  },
  {
    key: "V_LAND",
    altKey: "sporepedia.filters.vehicle_land",
    icon: iconVLand,
  },
  {
    key: "V_AIR",
    altKey: "sporepedia.filters.vehicle_air",
    icon: iconVAir,
  },
  {
    key: "V_SEA",
    altKey: "sporepedia.filters.vehicle_sea",
    icon: iconVSea,
  },
  {
    key: "BUILDING",
    altKey: "sporepedia.filters.building",
    icon: iconBuilding,
  },
];

export default function SporepediaFiltersBar({ selected, onToggle }) {
  const { t } = useLocale();
  const isAllSelected = !selected || selected.size === 0;

  return (
    <div className="sporepediafiltersbar-root">
      {FILTERS.map((f) => {
        const isSelected =
          f.key === "ALL" ? isAllSelected : selected?.has?.(f.key);

        return (
          <button
            key={f.key}
            type="button"
            className={
              "sporepediafiltersbar-btn" + (isSelected ? " selected" : "")
            }
            onClick={() => {
              if (f.key === "ALL") onToggle?.("ALL");
              else onToggle?.(f.key);
            }}
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
  );
}

export { FILTERS as SPOREPEDIA_FILTERS };
