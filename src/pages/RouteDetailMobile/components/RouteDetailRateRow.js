// src/pages/RouteDetailMobile/components/RouteDetailRateRow.js
import React from "react";
import StarRatingV2 from "../../../components/StarRatingV2/StarRatingV2";

export default function RouteDetailRateRow({ canRateRoute, onRouteRate }) {
  return (
    <div className="route-detail-rate-row">
      <div className="route-detail-rate-label">Puanla:</div>
      <StarRatingV2 onRated={(v) => onRouteRate(v)} size={32} disabled={!canRateRoute} />
    </div>
  );
}
