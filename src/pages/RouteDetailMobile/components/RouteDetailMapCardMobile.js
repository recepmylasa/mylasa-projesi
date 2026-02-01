// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapCardMobile.js
import React from "react";
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
  return (
    <div className="route-detail-map rd-map-card">
      {/* ✅ FIX: map container ölçüsü garanti (fitBounds kaçırmasın) */}
      <div
        className="rd-map-card__canvas"
        style={{
          position: "relative",
          width: "100%",
          minHeight: 220,
          height: 220,
          overflow: "hidden",
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
      </div>

      {mapBadgeCount > 0 && (
        <div className="rd-map-card__badges" aria-hidden="true">
          {Array.from({ length: mapBadgeCount }).map((_, i) => (
            <span key={i} className="rd-map-badge">
              {i + 1}
            </span>
          ))}
        </div>
      )}

      {mapAreaLabel ? <div className="rd-map-card__label">{mapAreaLabel}</div> : null}
    </div>
  );
}
