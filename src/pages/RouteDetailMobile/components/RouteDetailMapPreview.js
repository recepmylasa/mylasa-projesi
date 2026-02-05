// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapPreview.js
import React from "react";

export default function RouteDetailMapPreview({ mapDivRef }) {
  // Map div her zaman parent’ı full kaplayacak (absolute fill)
  return (
    <div
      ref={mapDivRef}
      className="rdmps-map"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
      }}
    />
  );
}
