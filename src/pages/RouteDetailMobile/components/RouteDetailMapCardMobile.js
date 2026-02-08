// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapCardMobile.js
import React, { useMemo } from "react";
import RouteDetailMapPreviewShell from "./RouteDetailMapPreviewShell";

export default function RouteDetailMapCardMobile({
  routeId,
  mapsRetryTick,
  retryMap,
  pathPts,
  stopsForPreview,
  stopsLoaded,
  mapBadgeCount,
  mapAreaLabel,
}) {
  const badgeCount = useMemo(() => {
    const n = Number(mapBadgeCount) || 0;
    return Math.max(0, Math.min(12, Math.floor(n)));
  }, [mapBadgeCount]);

  const areaLabel = useMemo(() => {
    const s = String(mapAreaLabel || "").trim();
    return s ? s : "";
  }, [mapAreaLabel]);

  // ✅ Tek otorite: MapCard yüksekliği (CSS’te de --rd-map-h ile kilitli)
  const cardH = "var(--rd-map-h, 240px)";

  return (
    <div
      className="rd-map-card"
      data-rd-map-card="1"
      style={{
        position: "relative",
        width: "100%",
        display: "block",
        height: cardH,
        minHeight: cardH,
        borderRadius: "var(--rd-map-radius, 20px)",
        overflow: "hidden",
        isolation: "isolate",

        // ✅ Shell’in clamp vb. hiçbir şeye kaçmaması için:
        "--rdmps-h": "100%",
      }}
    >
      <div
        className="rd-map-card__canvas"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          minHeight: "100%",
          overflow: "hidden",
          borderRadius: "inherit",
        }}
      >
        <RouteDetailMapPreviewShell
          key={mapsRetryTick}
          routeId={routeId}
          path={pathPts}
          stops={stopsForPreview || []}
          stopsLoaded={stopsLoaded}
          badgeCount={badgeCount}
          areaLabel={areaLabel}
          onRetry={() => retryMap()}
        />
      </div>
    </div>
  );
}
