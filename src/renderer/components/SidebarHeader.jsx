import React from "react";
import logo from "../../../public/assets/spore-next-emblem.png";

export default function SidebarHeader() {
  const [appVersion, setAppVersion] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await window?.electronAPI?.getAppVersion?.();
        if (alive && typeof v === "string") setAppVersion(v);
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.7rem",
        padding: "0.5rem 1rem 1.2rem 1rem",
        borderBottom: "1px solid #2224",
        marginBottom: "0.5rem",
      }}
    >
      <img
        src={logo}
        alt="Spore NEXT"
        style={{ width: 32, height: 32, filter: "drop-shadow(0 0 2px #000a)" }}
      />
      <div>
        <div
          style={{
            fontWeight: "bold",
            fontSize: "1.1rem",
            lineHeight: 1,
            color: "#fff",
          }}
        >
          Spore NEXT
          <br />
          <span style={{ fontWeight: 400 }}>Launcher</span>
          <span
            style={{
              fontSize: "0.85rem",
              color: "#ccc",
              marginLeft: 6,
              verticalAlign: "middle",
            }}
          >
            {appVersion ? `v${appVersion}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
