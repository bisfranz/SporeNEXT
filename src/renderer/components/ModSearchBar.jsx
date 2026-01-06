import React from "react";
import "../styles/modsearchbar.css";
import { useLocale } from "../hooks/useLocale";

export default function ModSearchBar({ value, onChange }) {
    const { t } = useLocale();
    return (
        <div className="modsearchbar-root">
            <input
                type="text"
                className="modsearchbar-input"
                placeholder={t("modsearchbar-placeholder")}
                value={value}
                onChange={e => onChange(e.target.value)}
            />
        </div>
    );
}