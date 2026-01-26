// FILE: src/pages/RouteDetailMobile/components/RouteDetailStickyTabsMobile.js
import React from "react";

export default function RouteDetailStickyTabsMobile({ activeSection, onTabChange, canInteract, tabsBarRef, routeDescText }) {
  return (
    <div className="rd-pills-block">
      <div className="rd-sectionTabsWrap" ref={tabsBarRef}>
        <div className="rd-sectionTabs" role="tablist" aria-label="Rota bölümleri">
          <button
            type="button"
            className={`rd-sectionTabBtn ${activeSection === "stops" ? "is-active" : ""}`}
            aria-selected={activeSection === "stops"}
            onClick={() => onTabChange("stops")}
            disabled={!canInteract}
          >
            Duraklar
          </button>

          <button
            type="button"
            className={`rd-sectionTabBtn ${activeSection === "gallery" ? "is-active" : ""}`}
            aria-selected={activeSection === "gallery"}
            onClick={() => onTabChange("gallery")}
            disabled={!canInteract}
          >
            Galeri
          </button>

          <button
            type="button"
            className={`rd-sectionTabBtn ${activeSection === "comments" ? "is-active" : ""}`}
            aria-selected={activeSection === "comments"}
            onClick={() => onTabChange("comments")}
            disabled={!canInteract}
          >
            Yorumlar
          </button>

          <button
            type="button"
            className={`rd-sectionTabBtn ${activeSection === "gpx" ? "is-active" : ""}`}
            aria-selected={activeSection === "gpx"}
            onClick={() => onTabChange("gpx")}
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
