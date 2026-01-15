// FILE: src/pages/RouteDetailMobile/components/RouteDetailHeaderMobile.js
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
  theme = "dark",
  onToggleTheme = () => {},
}) {
  const nextLabel = theme === "dark" ? "Açık" : "Koyu";
  const nextIcon = theme === "dark" ? "☀️" : "🌙";

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

        <button
          type="button"
          className="route-detail-pill-btn route-detail-pill-btn--theme"
          onClick={onToggleTheme}
          aria-label="Temayı değiştir"
          aria-pressed={theme === "light"}
          title="Temayı değiştir"
        >
          <span className="route-detail-pill-btn__icon" aria-hidden="true">
            {nextIcon}
          </span>
          {nextLabel}
        </button>

        <button type="button" className="route-detail-close-icon" onClick={onClose} title="Kapat">
          ✕
        </button>
      </div>
    </div>
  );
}
