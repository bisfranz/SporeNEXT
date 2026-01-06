import React from "react";
import "../styles/sporepediasearchbar.css";

export default function SporepediaSearchBar({
  value,
  onChange,
  placeholder,
  rightSlot,
}) {
  return (
    <div className="sporepediasearchbar-root">
      <input
        type="text"
        className="sporepediasearchbar-input"
        placeholder={placeholder || "Search..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {rightSlot}
    </div>
  );
}
