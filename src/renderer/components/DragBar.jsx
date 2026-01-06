import React from "react";

export default function DragBar() {
  return (
    <div
      style={{
        width: "calc(100% - 140px)",
        height: "50px",
        position: "absolute",
        top: 0,
        left: 0,
        WebkitAppRegion: "drag",
        zIndex: 998,
      }}
    />
  );
}
