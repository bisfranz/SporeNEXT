import React, { useState } from "react";
import "../styles/mainCornerLinks.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";

export default function MainCornerLinks() {
  const [openTooltip, setOpenTooltip] = useState(null);

  const openExternal = (url) => {
    if (
      window.electronAPI &&
      typeof window.electronAPI.openExternal === "function"
    ) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="main-corner-links" aria-label="External links">
      <button
        type="button"
        className="mcl-btn"
        aria-label="Spore NEXT website"
        onClick={() => openExternal("https://bisfranz.github.io/SporeNEXT/")}
        onMouseEnter={() => setOpenTooltip("web")}
        onMouseLeave={() => setOpenTooltip(null)}
        onFocus={() => setOpenTooltip("web")}
        onBlur={() => setOpenTooltip(null)}
      >
        <img
          className="mcl-icon-img"
          src="./assets/website.png"
          alt=""
          aria-hidden="true"
        />
        {openTooltip === "web" && <div className="mcl-tooltip">Spore NEXT</div>}
      </button>

      <button
        type="button"
        className="mcl-btn"
        aria-label="Discord"
        onClick={() => openExternal("https://discord.com/invite/JqZyyugs5a")}
        onMouseEnter={() => setOpenTooltip("discord")}
        onMouseLeave={() => setOpenTooltip(null)}
        onFocus={() => setOpenTooltip("discord")}
        onBlur={() => setOpenTooltip(null)}
      >
        <FontAwesomeIcon icon={faDiscord} />
        {openTooltip === "discord" && (
          <div className="mcl-tooltip">Discord</div>
        )}
      </button>

      <button
        type="button"
        className="mcl-btn"
        aria-label="Donate on Ko-fi"
        onClick={() => openExternal("https://ko-fi.com/franzlabs")}
        onMouseEnter={() => setOpenTooltip("kofi")}
        onMouseLeave={() => setOpenTooltip(null)}
        onFocus={() => setOpenTooltip("kofi")}
        onBlur={() => setOpenTooltip(null)}
      >
        <img
          className="mcl-icon-img"
          src="./assets/donate.png"
          alt=""
          aria-hidden="true"
        />
        {openTooltip === "kofi" && <div className="mcl-tooltip">Donate</div>}
      </button>
    </div>
  );
}
