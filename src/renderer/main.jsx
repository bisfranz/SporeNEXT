import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";
import { LocaleProvider } from "./hooks/useLocale";
import { AuthProvider } from "./hooks/useAuth";
import { LikesProvider } from "./hooks/useLikesStore";

const MOD_IPC_LOGS =
  String(import.meta.env?.VITE_MOD_IPC_LOGS || "").trim() === "1";

if (MOD_IPC_LOGS && window.electronAPI?.onModLog) {
  try {
    window.electronAPI.onModLog((payload) => {
      try {
        const level = payload?.level || "info";
        const prefix = `[mod-log][${payload?.source || "?"}][${
          payload?.modKey || "?"
        }]`;
        const msg = payload?.message || "";
        const data = payload?.data;

        const fn =
          level === "error"
            ? console.error
            : level === "warn"
            ? console.warn
            : console.log;

        if (data != null) fn(prefix, msg, data);
        else fn(prefix, msg);
      } catch {}
    });
  } catch {}
}

const root = createRoot(document.getElementById("root"));
root.render(
  <LocaleProvider>
    <AuthProvider>
      <LikesProvider>
        <App />
      </LikesProvider>
    </AuthProvider>
  </LocaleProvider>
);
