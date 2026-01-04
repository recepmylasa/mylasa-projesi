// src/pages/RouteDetailMobile/components/RouteDetailHeaderMobile.js
import React from "react";

export default function RouteDetailHeaderMobile({
  title,
  audienceKey,
  audienceLabel,
  ratingAvgLabel,
  metaLine,
  onShare,
  onOpenVisualShare,
  onExportGpx,
  onClose,
}) {
  return (
    <div className="route-detail-header">
      <div className="route-detail-header-top">
        <div className="route-detail-header-main">
          <div className="route-detail-title" title={title || "Rota"}>
            {title || "Rota"}
          </div>
          {audienceLabel && (
            <span className={"route-detail-chip" + (audienceKey ? ` route-detail-chip--${audienceKey}` : "")}>
              {audienceLabel}
            </span>
          )}
        </div>
        <div className="route-detail-header-rating">{ratingAvgLabel}</div>
      </div>

      {metaLine && <div className="route-detail-meta">{metaLine}</div>}

      <div className="route-detail-header-actions">
        <button type="button" className="route-detail-pill-btn" onClick={onShare}>
          Paylaş
        </button>
        <button type="button" className="route-detail-pill-btn" onClick={onOpenVisualShare}>
          Görsel Paylaş
        </button>
        <button type="button" className="route-detail-pill-btn" onClick={onExportGpx}>
          GPX
        </button>
        <button type="button" className="route-detail-close-icon" onClick={onClose} title="Kapat">
          ✕
        </button>
      </div>
    </div>
  );
}
