import React, { useMemo, useState } from "react";
import "../styles/discordauthbutton.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { useLocale } from "../hooks/useLocale";
import LogoutConfirmModal from "./LogoutConfirmModal";

function parseTokensFromUrl(fullUrl) {
  if (!fullUrl) return null;
  try {
    const u = new URL(fullUrl);
    const hash = String(u.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return null;
    return { access_token, refresh_token };
  } catch {
    return null;
  }
}

function firstDefined(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

export default function DiscordAuthButton() {
  const { t } = useLocale();
  const { user, loading } = useAuth() || {};
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const label = useMemo(() => {
    if (loading) return t("auth.loading");
    if (user) return t("auth.logout");
    return t("auth.login");
  }, [user, loading, t]);

  const subtitle = useMemo(() => {
    if (!user) return t("auth.provider.discord");
    const meta = user?.user_metadata || {};
    return meta?.full_name || meta?.name || user?.email || t("auth.loggedIn");
  }, [user, t]);

  const avatarUrl = useMemo(() => {
    const meta = user?.user_metadata || {};
    return firstDefined(
      meta.avatar_url,
      meta.picture,
      meta.picture_url,
      meta.avatar
    );
  }, [user]);

  const doLogout = async () => {
    setBusy(true);
    setErrorMsg("");

    const clearLocalSession = async () => {
      try {
        const ls = globalThis?.localStorage;
        if (ls?.removeItem) {
          ls.removeItem("sb-lvllnqfjxguqxajnhdot-auth-token");
          for (let i = ls.length - 1; i >= 0; i--) {
            const k = ls.key(i);
            if (k && k.startsWith("sb-lvllnqfjxguqxajnhdot-")) ls.removeItem(k);
          }
        }
      } catch {}

      try {
        await supabase.auth.setSession({ access_token: "", refresh_token: "" });
      } catch {}
    };

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });

      if (error) {
        const status = error?.status ?? error?.code;
        const msg = String(error?.message || "").toLowerCase();

        if (status === 403) {
          await clearLocalSession();
          return;
        }

        if (
          msg.includes("auth session missing") ||
          msg.includes("session missing")
        ) {
          await clearLocalSession();
          return;
        }

        throw error;
      }

      await clearLocalSession();
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onClick = async () => {
    if (busy || loading) return;

    setErrorMsg("");

    if (user) {
      setShowLogoutConfirm(true);
      return;
    }

    setBusy(true);
    try {
      const begin = await window?.electronAPI?.authDiscordBegin?.();
      if (!begin?.ok)
        throw new Error(begin?.error || t("auth.errors.startFailed"));
      const redirectTo = begin?.redirectTo;
      if (!redirectTo) throw new Error(t("auth.errors.missingRedirect"));

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;

      const url = data?.url;
      if (!url) throw new Error(t("auth.errors.missingOAuthUrl"));

      const openRes = await window?.electronAPI?.authOpenExternal?.(url);
      if (openRes && openRes.ok === false)
        throw new Error(openRes.error || t("auth.errors.openBrowserFailed"));

      const cbPromise = window?.electronAPI?.authOauthWait?.();
      if (!cbPromise) throw new Error(t("auth.errors.waitNotAvailable"));

      const UNLOCK_UI_AFTER_MS = 800;
      setTimeout(() => {
        try {
          setBusy(false);
        } catch {}
      }, UNLOCK_UI_AFTER_MS);

      const cb = await cbPromise;
      if (!cb?.ok)
        throw new Error(cb?.error || t("auth.errors.callbackFailed"));

      const fullUrl = cb?.url;
      const tokens = parseTokensFromUrl(fullUrl);
      if (!tokens) throw new Error(t("auth.errors.missingTokens"));

      const { error: setSessionError } = await supabase.auth.setSession(tokens);
      if (setSessionError) throw setSessionError;
    } catch (e) {
      const msg = e?.message || String(e);
      setErrorMsg(msg);
      setBusy(false);
    }
  };

  return (
    <>
      {showLogoutConfirm ? (
        <LogoutConfirmModal
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={async () => {
            setShowLogoutConfirm(false);
            await doLogout();
          }}
        />
      ) : null}

      <button
        type="button"
        className="discordauth-btn"
        onClick={onClick}
        disabled={busy || loading}
        title={user ? t("auth.logout") : t("auth.loginWithDiscord")}
      >
        {user && avatarUrl ? (
          <img
            className="discordauth-avatar"
            src={avatarUrl}
            alt="Discord avatar"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={(e) => {
              try {
                e.currentTarget.style.display = "none";
              } catch {}
            }}
          />
        ) : (
          <FontAwesomeIcon icon={faDiscord} className="discordauth-icon" />
        )}

        <span className="discordauth-texts">
          <span className="discordauth-title">{label}</span>
          <span className="discordauth-subtitle">{subtitle}</span>
        </span>
      </button>
      {errorMsg ? <div className="discordauth-error">{errorMsg}</div> : null}
    </>
  );
}
