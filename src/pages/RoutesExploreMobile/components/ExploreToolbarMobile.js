// src/pages/RoutesExploreMobile/components/ExploreToolbarMobile.jsx
// Hepsi / Takip segmenti + "Sırala" butonu.
// Login / toast mantığı container’da kalacak; bu bileşen yalnızca UI + callback tetikler.

import React from "react";

function ExploreToolbarMobile({
  audience,
  onSelectAll,
  onSelectFollowing,
  onOpenFilter,
}) {
  return (
    <header
      className="routes-toolbar"
      role="region"
      aria-label="Rotalar araç çubuğu"
    >
      <div className="routes-toolbar-title">Rotalar</div>
      <div className="routes-toolbar-segment">
        <div className="routes-segment" aria-label="Kapsam">
          <button
            type="button"
            className={
              "routes-segment-btn" +
              (audience === "all" ? " routes-segment-btn--active" : "")
            }
            onClick={onSelectAll}
            aria-pressed={audience === "all"}
          >
            Hepsi
          </button>
          <button
            type="button"
            className={
              "routes-segment-btn" +
              (audience === "following"
                ? " routes-segment-btn--active"
                : "")
            }
            onClick={onSelectFollowing}
            aria-pressed={audience === "following"}
          >
            Takip
          </button>
        </div>
      </div>
      <button
        type="button"
        className="routes-filter-btn"
        onClick={onOpenFilter}
      >
        Sırala
      </button>
    </header>
  );
}

export default ExploreToolbarMobile;
