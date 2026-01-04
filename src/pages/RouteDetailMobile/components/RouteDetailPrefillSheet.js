// src/pages/RouteDetailMobile/components/RouteDetailPrefillSheet.js
import React from "react";

export default function RouteDetailPrefillSheet({
  title,
  audienceKey,
  audienceLabel,
  ratingAvgLabel,
  metaLine,
  onClose,
}) {
  return (
    <div className="route-detail-backdrop" onClick={onClose}>
      <div className="route-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="route-detail-grab" />
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
            <button type="button" className="route-detail-close-icon" onClick={onClose} title="Kapat">
              ✕
            </button>
          </div>
        </div>

        <div className="route-detail-body">
          <div className="route-detail-tabpanel">
            <div style={{ fontSize: 14, padding: "8px 4px" }}>Rota yükleniyor…</div>
          </div>
        </div>

        <div className="route-detail-footer">
          <button type="button" className="route-detail-close-btn" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
