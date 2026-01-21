// FILE: src/pages/RouteDetailMobile/components/RouteDetailTabs.js
import React, { useMemo } from "react";

export default function RouteDetailTabs({ tab, onTabChange, commentsCount, onGpx }) {
  const commentsBadge = useMemo(() => {
    const n = typeof commentsCount === "number" ? commentsCount : Number(commentsCount) || 0;
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n > 99) return "99+";
    return String(n);
  }, [commentsCount]);

  const pills = [
    { key: "stops", label: "Duraklar", onClick: () => onTabChange("stops") },
    { key: "gallery", label: "Galeri", onClick: () => onTabChange("gallery") },
    { key: "comments", label: "Yorumlar", badge: commentsBadge, onClick: () => onTabChange("comments") },
  ];

  return (
    <div className="route-detail-tabs rd-pill-row" role="tablist" aria-label="Rota sekmeleri">
      {pills.map((p) => {
        const isActive = tab === p.key;

        return (
          <button
            key={p.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              p.onClick();
            }}
            className={"route-detail-tab-button rd-pill" + (isActive ? " is-active" : "")}
            role="tab"
            aria-selected={isActive}
          >
            <span className="rd-pill__label">{p.label}</span>
            {p.badge ? (
              <span className="rd-pill__badge" aria-label={`${p.badge} yorum`}>
                {p.badge}
              </span>
            ) : null}
          </button>
        );
      })}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (typeof onGpx === "function") onGpx();
        }}
        className="route-detail-tab-button rd-pill rd-pill--gpx"
        aria-label="GPX indir"
        title="GPX indir"
      >
        <span className="rd-pill__label">GPX</span>
      </button>
    </div>
  );
}
