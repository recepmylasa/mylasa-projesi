// src/components/RouteCardMobile.js
// Kart: başlık, km, süre, ⭐ ortalama (N) + şehir/ülke + ilk 3 etiket + "uzakta/yakınında" mesafesi.
import React from "react";
import { km as formatKm } from "../utils/rating";

function totalKm(m) {
  return Math.round((m || 0) / 100) / 10;
}
function fmtDur(ms) {
  const m = Math.round((ms || 0) / 60000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h} sa ${mm} dk` : `${mm} dk`;
}

export default function RouteCardMobile({ route, onClick = () => {} }) {
  if (!route) return null;
  const {
    title,
    totalDistanceM,
    durationMs,
    ratingAvg = 0,
    ratingCount = 0,
    areas = {},
    tags = [],
    distanceKm,
    __distanceM,
  } = route;

  const countryLabel =
    areas?.country ||
    areas?.countryName ||
    areas?.countryCode ||
    areas?.cc ||
    "";
  const locText = [areas?.city, countryLabel].filter(Boolean).join(", ");
  const topTags = (Array.isArray(tags) ? tags : []).slice(0, 3);

  // Mesafe etiketi: varsa __distanceM (metre) öncelikli, yoksa distanceKm
  const hasDistanceM =
    typeof __distanceM === "number" && !Number.isNaN(__distanceM);
  const hasDistanceKm =
    typeof distanceKm === "number" && !Number.isNaN(distanceKm);

  let distanceLabelText = "";
  if (hasDistanceM) {
    const txt = formatKm(__distanceM);
    if (txt) distanceLabelText = `${txt} yakınında`;
  } else if (hasDistanceKm) {
    const txt = formatKm(distanceKm * 1000);
    if (txt) distanceLabelText = `${txt} uzakta`;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" ? onClick() : null)}
      title={title || "Rota"}
      aria-label={title || "Rota"}
      style={{
        border: "1px solid #eee",
        borderRadius: 12,
        padding: "12px 12px",
        background: "#fff",
        boxShadow: "0 2px 8px rgba(0,0,0,.04)",
        display: "grid",
        gap: 6,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          fontWeight: 800,
          fontSize: 16,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title || "Adsız rota"}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "#111",
          fontSize: 13,
          flexWrap: "wrap",
        }}
      >
        <span>{totalKm(totalDistanceM)} km</span>
        <span>•</span>
        <span>{fmtDur(durationMs)}</span>
        <span>•</span>
        <span title={ratingCount ? `${ratingCount} oy` : "Oy yok"}>
          ⭐ {Number(ratingAvg || 0).toFixed(1)} ({ratingCount || 0})
        </span>
        {distanceLabelText && (
          <>
            <span>•</span>
            <span aria-label={`Size olan mesafe: ${distanceLabelText}`}>
              {distanceLabelText}
            </span>
          </>
        )}
      </div>

      {(locText || topTags.length) ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {locText && (
            <span style={{ fontSize: 12, color: "#555" }}>{locText}</span>
          )}
          {topTags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 11,
                color: "#1a73e8",
                background: "rgba(26,115,232,.08)",
                border: "1px solid #dbeafe",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              #{t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
