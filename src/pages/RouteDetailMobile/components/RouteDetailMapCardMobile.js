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

  const label = useMemo(() => {
    const s = String(mapAreaLabel || "").trim();
    return s ? s : "";
  }, [mapAreaLabel]);

  return (
    <div className="route-detail-map rd-map-card" data-rd-map-card="1">
      {/* ✅ TEK OTORİTE: dış kart yükseklik verir, canvas absolute fill */}
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
          onRetry={() => retryMap()}
        />

        {/* ✅ overlay'ler canvas içinde kalsın (layout bozmasın) */}
        {badgeCount > 0 && (
          <div className="rd-map-card__badges" aria-hidden="true">
            {Array.from({ length: badgeCount }).map((_, i) => (
              <span key={i} className="rd-map-badge">
                {i + 1}
              </span>
            ))}
          </div>
        )}

        {!!label && <div className="rd-map-card__label">{label}</div>}
      </div>
    </div>
  );
}
