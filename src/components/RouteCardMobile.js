// src/components/RouteCardMobile.js
// Kart: başlık, km, süre, ⭐ ortalama (N) + şehir/ülke + ilk 3 etiket + "uzakta/yakınında" mesafesi.
// ADIM 33: seçili kart için .route-card-mobile / .route-card-mobile--selected class’ları ile stil.
// DIM 34: başlık içi arama eşleşmesi vurgusu (.route-card-title-mark).

import React, { memo } from "react";
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

// DIM 34: Başlık vurgulama parçalama fonksiyonu (case-insensitive, basit split)
function getHighlightedParts(text, query) {
  const source = (text || "").toString();
  const q = (query || "").toString().trim();
  if (!q) {
    return [{ text: source, match: false }];
  }
  const lower = source.toLowerCase();
  const needle = q.toLowerCase();

  const parts = [];
  let index = 0;
  while (index < lower.length) {
    const found = lower.indexOf(needle, index);
    if (found === -1) {
      if (index < source.length) {
        parts.push({ text: source.slice(index), match: false });
      }
      break;
    }
    if (found > index) {
      parts.push({
        text: source.slice(index, found),
        match: false,
      });
    }
    parts.push({
      text: source.slice(found, found + q.length),
      match: true,
    });
    index = found + q.length;
  }

  if (!parts.length) {
    return [{ text: source, match: false }];
  }
  return parts;
}

function RouteCardMobileInner({
  route,
  onClick = () => {},
  selected = false,
  highlightQuery = "",
}) {
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

  const rawTitle = title || "Adsız rota";
  const label = rawTitle;
  const titleParts = getHighlightedParts(rawTitle, highlightQuery);

  return (
    <div
      className={
        "route-card-mobile" +
        (selected ? " route-card-mobile--selected" : "")
      }
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" ? onClick() : null)}
      title={label}
      aria-label={label}
      aria-pressed={selected ? "true" : "false"}
      style={{
        borderRadius: 12,
        padding: "12px 12px",
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
        {titleParts.map((part, idx) =>
          part.match ? (
            <span key={idx} className="route-card-title-mark">
              {part.text}
            </span>
          ) : (
            <span key={idx}>{part.text}</span>
          )
        )}
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

// EMİR 13: RouteCardMobile memo — props değişmedikçe yeniden render etme.
function areEqual(prevProps, nextProps) {
  const p = prevProps;
  const n = nextProps;

  if (p.selected !== n.selected) return false;
  if (p.highlightQuery !== n.highlightQuery) return false;

  const pr = p.route || {};
  const nr = n.route || {};

  // Anahtar alanlar (ID + ekranda gösterilen temel metrikler)
  const scalarKeys = [
    "id",
    "title",
    "totalDistanceM",
    "durationMs",
    "ratingAvg",
    "ratingCount",
    "distanceKm",
    "__distanceM",
  ];

  for (let i = 0; i < scalarKeys.length; i++) {
    const key = scalarKeys[i];
    if (pr[key] !== nr[key]) {
      return false;
    }
  }

  const pa = pr.areas || {};
  const na = nr.areas || {};
  const areaKeys = ["city", "country", "countryName", "countryCode", "cc"];

  for (let i = 0; i < areaKeys.length; i++) {
    const key = areaKeys[i];
    if (pa[key] !== na[key]) {
      return false;
    }
  }

  const pTags = Array.isArray(pr.tags) ? pr.tags : [];
  const nTags = Array.isArray(n.route?.tags) ? n.route.tags : [];
  if (pTags.length !== nTags.length) return false;
  for (let i = 0; i < pTags.length; i++) {
    if (pTags[i] !== nTags[i]) return false;
  }

  return true;
}

export default memo(RouteCardMobileInner, areEqual);
