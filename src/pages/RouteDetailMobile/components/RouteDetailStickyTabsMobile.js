// FILE: src/pages/RouteDetailMobile/components/RouteDetailStickyTabsMobile.js
import React from "react";

export default function RouteDetailStickyTabsMobile({
  activeTab,
  onTabChange,
  canInteract,
  tabsBarRef,
  routeDescText,
}) {
  const safeActive = activeTab || "stops";

  const go = (key) => {
    if (!canInteract) return;
    if (typeof onTabChange === "function") onTabChange(key);
  };

  return (
    <div className="rd-pills-block">
      <div className="rd-sectionTabsWrap" ref={tabsBarRef}>
        <div className="rd-sectionTabs" role="tablist" aria-label="Rota bölümleri">
          <button
            type="button"
            role="tab"
            className={`rd-sectionTabBtn ${safeActive === "stops" ? "is-active" : ""}`}
            aria-selected={safeActive === "stops"}
            onClick={() => go("stops")}
            disabled={!canInteract}
          >
            Duraklar
          </button>

          <button
            type="button"
            role="tab"
            className={`rd-sectionTabBtn ${safeActive === "gallery" ? "is-active" : ""}`}
            aria-selected={safeActive === "gallery"}
            onClick={() => go("gallery")}
            disabled={!canInteract}
          >
            Galeri
          </button>

          <button
            type="button"
            role="tab"
            className={`rd-sectionTabBtn ${safeActive === "comments" ? "is-active" : ""}`}
            aria-selected={safeActive === "comments"}
            onClick={() => go("comments")}
            disabled={!canInteract}
          >
            Yorumlar
          </button>

          <button
            type="button"
            role="tab"
            className={`rd-sectionTabBtn ${safeActive === "gpx" ? "is-active" : ""}`}
            aria-selected={safeActive === "gpx"}
            onClick={() => go("gpx")}
            disabled={!canInteract}
          >
            GPX
          </button>
        </div>
      </div>

      {routeDescText ? <div className="rd-route-desc">{routeDescText}</div> : null}
    </div>
  );
}
