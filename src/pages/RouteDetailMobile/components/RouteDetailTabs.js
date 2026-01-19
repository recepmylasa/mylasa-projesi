// FILE: src/pages/RouteDetailMobile/components/RouteDetailTabs.js
import React from "react";

export default function RouteDetailTabs({ tab, onTabChange, commentsCount, onGpx }) {
  const pills = [
    { key: "stops", label: "Duraklar", onClick: () => onTabChange("stops") },
    { key: "gallery", label: "Galeri", onClick: () => onTabChange("gallery") },
    {
      key: "comments",
      label:
        commentsCount && commentsCount > 0
          ? `Yorumlar ${commentsCount}`
          : "Yorumlar",
      onClick: () => onTabChange("comments"),
    },
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
            {p.label}
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
        GPX
      </button>
    </div>
  );
}
