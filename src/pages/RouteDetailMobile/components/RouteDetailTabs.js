// src/pages/RouteDetailMobile/components/RouteDetailTabs.js
import React from "react";

export default function RouteDetailTabs({ tab, onTabChange, commentsCount }) {
  const keys = ["stops", "gallery", "report", "comments"];

  return (
    <div className="route-detail-tabs">
      {keys.map((key) => {
        let label;
        if (key === "stops") label = "Duraklar";
        else if (key === "gallery") label = "Galeri";
        else if (key === "report") label = "Rapor";
        else if (key === "comments")
          label = commentsCount && commentsCount > 0 ? `Yorumlar (${commentsCount})` : "Yorumlar";

        return (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={"route-detail-tab-button" + (tab === key ? " route-detail-tab-button--active" : "")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
